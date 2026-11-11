"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  resumeCheckoutAction,
  submitCheckoutAction,
} from "@/app/(public)/checkout/actions";
import { subtotalText } from "@/components/commerce/bag-lines";
import { BagStatus } from "@/components/commerce/bag-status";
import { useBagLines } from "@/components/commerce/use-bag-lines";
import {
  CHECKOUT_CLOSED,
  CHECKOUT_FIELD_COPY,
  CHECKOUT_NOTICES,
  CHECKOUT_PAGE,
  CHECKOUT_PAY,
  CHECKOUT_PAYMENT_CHOICES,
  CHECKOUT_TEST_MODE,
} from "@/content/public/checkout";
import { sanitisePinInput } from "@/lib/bag";
import { formatRupees, paiseToJson } from "@/lib/money";
import type { BagValidationResult } from "@/lib/schemas/bag";
import {
  canonicalCheckoutPayload,
  CHECKOUT_FIELDS,
  CHECKOUT_PAYMENT_METHODS,
  EMPTY_CHECKOUT_FIELDS,
  normaliseCheckoutFields,
  type CheckoutActionResult,
  type CheckoutField,
  type CheckoutFieldErrors,
  type CheckoutFieldValues,
  type CheckoutLaunch,
  type CheckoutPaymentMethod,
  type CheckoutResume,
  type CheckoutSubmission,
  type NormalisedCheckoutFields,
} from "@/lib/schemas/checkout";

import {
  attemptKeys,
  holdExpired,
  millisecondsToDeadline,
  type CheckoutHold,
  type CheckoutPrefill,
} from "./attempt-key";
import { CheckoutRow } from "./checkout-row";
import { formMemory } from "./form-memory";
import {
  fieldMessage,
  firstRefusedField,
  isNeutralNotice,
  noticeText,
  SCRIPT_UNAVAILABLE_STEP,
  settleResume,
  settleSubmit,
  UNAVAILABLE_STEP,
  type CheckoutNotice,
  type CheckoutStep,
} from "./outcome";
import { loadRazorpayCheckout, openPaymentWindow } from "./razorpay";
import { TurnstileWidget, type TurnstileHandle } from "./turnstile-widget";

/**
 * The checkout page's body — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3; prototype/pages/checkout/
 * index.html:30–40 for the markup, prototype/shared/commerce-r9.js:15–22 for the form's behaviour; neither is
 * imported). The page is a convenience over the two server actions (src/app/(public)/checkout/actions.ts), which
 * enforce everything themselves — the sales gate, the strict parse, the rate limit, the security check, the
 * recomputed total and the one provider call. Nothing here is a protection, and nothing here is proof of a payment.
 *
 * **Closed** (the server's configuration, or a `closed` answer): the heading and the closed panel (NS-04). No form,
 * no provider script, no action call.
 *
 * **Open:**
 * - The bag is the shell's one bag, checked against the catalogue while the page is shown (`POST /api/bag`). The
 *   summary's rows are read-only; the total sent as `shown_total_paise` is the checked subtotal, and the pay button
 *   stays disabled until that check has answered for the bag as it is and every item can be bought. An empty bag
 *   shows the empty panel instead of the form.
 * - The eight fields are checked with the server's own normalisation before sending (src/lib/schemas/checkout.ts);
 *   a refused field shows the prototype's message, is marked invalid and takes the focus. What is typed is kept in
 *   memory for the page's life (./form-memory.ts) and never written to storage.
 * - The security check (./turnstile-widget.tsx) gives one token per submission; it is reset after every one.
 * - The attempt key (./attempt-key.ts): the same bag and details reuse the key (a double press or a retry is the
 *   same submission); anything changed is a new key. A key read from storage only ever asks where an attempt
 *   stands — once, when the page loads.
 * - Razorpay's window (./razorpay.ts) opens only with a `launch` the server answered. From then on that order holds
 *   the page: the fields are read-only and the button re-opens the same window — never a new submission — until
 *   the page is reloaded or the order's deadline passes. The window's callbacks call no server action, write
 *   nothing to storage, never empty the bag and never navigate: a reported payment shows the unverified state
 *   (NS-05), a closed window and a failed payment show their lines.
 * - One status line (`#checkout-status`) carries every outcome; the focus moves to it, or to the first refused
 *   field. No animation is added.
 */

export type CheckoutActions = {
  submit: (input: CheckoutSubmission) => Promise<CheckoutActionResult>;
  resume: (input: CheckoutResume) => Promise<CheckoutActionResult>;
};

const SERVER_ACTIONS: CheckoutActions = {
  submit: submitCheckoutAction,
  resume: resumeCheckoutAction,
};

export type CheckoutProps = (
  | { open: true; turnstileSiteKey: string }
  | { open: false; turnstileSiteKey?: undefined }
) & {
  /** Injectable for tests; the page's two server actions otherwise. */
  actions?: CheckoutActions;
};

export function Checkout({
  open,
  turnstileSiteKey,
  actions = SERVER_ACTIONS,
}: CheckoutProps) {
  const [closedByServer, setClosedByServer] = useState(false);
  const close = useCallback(() => setClosedByServer(true), []);
  if (!open || closedByServer)
    return <ClosedCheckout takeFocus={closedByServer} />;
  return (
    <OpenCheckout
      siteKey={turnstileSiteKey}
      actions={actions}
      onClosed={close}
    />
  );
}

/** NS-04: sales are not open here. `takeFocus` when the page became this panel in answer to a press. */
function ClosedCheckout({ takeFocus }: { takeFocus: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus]);
  return (
    <>
      <header className="checkout-heading">
        <h1>{CHECKOUT_PAGE.heading}</h1>
      </header>
      <section id="checkout-closed" className="flow-panel">
        <h2 ref={heading} tabIndex={-1}>
          {CHECKOUT_CLOSED.heading}
        </h2>
        <p>{CHECKOUT_CLOSED.body}</p>
        <Link
          className="button button--primary"
          href={CHECKOUT_CLOSED.action.href}
          prefetch={false}
        >
          {CHECKOUT_CLOSED.action.label}
        </Link>
      </section>
    </>
  );
}

/** The frozen form's attributes, by field (prototype/pages/checkout/index.html:31–39). */
const FIELD_ATTRIBUTES: Readonly<
  Record<
    CheckoutField,
    {
      type: "text" | "email" | "tel";
      autoComplete: string;
      required: boolean;
      inputMode?: "tel" | "numeric";
      maxLength?: number;
      pattern?: string;
    }
  >
> = {
  name: { type: "text", autoComplete: "shipping name", required: true },
  email: { type: "email", autoComplete: "shipping email", required: true },
  phone: {
    type: "tel",
    autoComplete: "shipping tel",
    required: true,
    inputMode: "tel",
  },
  pin: {
    type: "text",
    autoComplete: "shipping postal-code",
    required: true,
    inputMode: "numeric",
    maxLength: 6,
    pattern: "[1-9][0-9]{5}",
  },
  address: {
    type: "text",
    autoComplete: "shipping address-line1",
    required: true,
  },
  address2: {
    type: "text",
    autoComplete: "shipping address-line2",
    required: false,
  },
  city: {
    type: "text",
    autoComplete: "shipping address-level2",
    required: true,
  },
  state: {
    type: "text",
    autoComplete: "shipping address-level1",
    required: true,
  },
};

/** True for one of the eight field names — a guard for a name read from the DOM. */
function isCheckoutField(value: string): value is CheckoutField {
  return (CHECKOUT_FIELDS as readonly string[]).includes(value);
}

/** True for one of the four payment methods — a guard for a value read from the DOM. */
function isPaymentMethod(value: string): value is CheckoutPaymentMethod {
  return (CHECKOUT_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** The payment method a form starts with: the first choice, as the frozen page checks it. */
const DEFAULT_PAYMENT_METHOD: CheckoutPaymentMethod =
  CHECKOUT_PAYMENT_METHODS[0];

const STATUS_ID = "checkout-status";
const BAG_STATUS_ID = "checkout-bag-status";

/** The longest delay a browser timer holds (2^31 − 1 ms); a deadline further away is not timed. */
const MAX_TIMER_MS = 2147483647;

/** The stored amount of the held order, for display: `formatRupees` of exact paise, or nothing if unreadable. */
function launchAmountText(launch: CheckoutLaunch): string {
  return /^(?:0|[1-9][0-9]{0,11})$/.test(launch.amount_paise)
    ? formatRupees(BigInt(launch.amount_paise))
    : "";
}

/** The notice a page starts with when an order already holds it (a return within the same page session). */
function noticeOfHold(held: CheckoutHold | null): CheckoutNotice | null {
  if (held === null) return null;
  return {
    id: held.reported ? "unverified" : "waiting",
    orderNumber: held.launch.order_number,
  };
}

/**
 * One pay press, to its settled step: Checkout.js must be on the page before anything is sent (an order that
 * cannot be opened is not started); then the one submission, with the attempt key of this bag and these details;
 * `afterSubmit` runs once the submission has answered or thrown (the security token is spent either way).
 */
async function startPayment({
  actions,
  answer,
  fields,
  values,
  payment,
  token,
  afterSubmit,
}: {
  actions: CheckoutActions;
  answer: BagValidationResult;
  fields: NormalisedCheckoutFields;
  values: CheckoutFieldValues;
  payment: CheckoutPaymentMethod;
  token: string;
  afterSubmit: () => void;
}): Promise<CheckoutStep> {
  try {
    await loadRazorpayCheckout();
  } catch {
    return SCRIPT_UNAVAILABLE_STEP;
  }
  const items = answer.items.map((item) => ({
    variant_code: item.variant_code,
    quantity: item.quantity,
  }));
  const key = attemptKeys.keyFor(canonicalCheckoutPayload(items, fields));
  return settleSubmit(
    async () => {
      try {
        return await actions.submit({
          attempt_key: key,
          items,
          shown_total_paise: paiseToJson(answer.subtotal_paise),
          fields: values,
          payment_method: payment,
          turnstile_token: token,
        });
      } finally {
        afterSubmit();
      }
    },
    () => actions.resume({ attempt_key: key }),
  );
}

function OpenCheckout({
  siteKey,
  actions,
  onClosed,
}: {
  siteKey: string;
  actions: CheckoutActions;
  onClosed: () => void;
}) {
  const {
    snapshot,
    validation,
    lines,
    answer,
    messages,
    failed,
    retry,
    demandValidation,
    dismissRemovedNotice,
  } = useBagLines(false);

  // The bag is checked for as long as the page is shown. A `bag_changed` answer asks again: releasing the page's
  // demand and asking anew is the controller's "fresh ask", which drops the answer it holds for this revision
  // (src/lib/bag/validation.ts `demand`) — its `retry()` alone keeps an answer that already stands.
  const [bagCheck, setBagCheck] = useState(0);
  useEffect(() => demandValidation(), [demandValidation, bagCheck]);
  useEffect(() => () => dismissRemovedNotice(), [dismissRemovedNotice]);

  const [values, setValues] = useState<CheckoutFieldValues>(() => ({
    ...EMPTY_CHECKOUT_FIELDS,
    ...formMemory.get().fields,
  }));
  const [payment, setPayment] = useState<CheckoutPaymentMethod>(
    () => formMemory.get().payment ?? DEFAULT_PAYMENT_METHOD,
  );
  const [errors, setErrors] = useState<CheckoutFieldErrors>({});
  const [hold, setHold] = useState<CheckoutHold | null>(() =>
    attemptKeys.held(),
  );
  const [notice, setNotice] = useState<CheckoutNotice | null>(() =>
    noticeOfHold(attemptKeys.held()),
  );
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [challengeDown, setChallengeDown] = useState(false);
  const [scriptDown, setScriptDown] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const form = useRef<HTMLFormElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const pressing = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // An outcome moves the focus to the status line once it shows the outcome's sentence.
  useEffect(() => {
    if (focusRequest > 0) status.current?.focus();
  }, [focusRequest]);

  const announce = useCallback((next: CheckoutNotice) => {
    setNotice(next);
    setFocusRequest((count) => count + 1);
  }, []);

  // Checkout.js, once, on an open checkout page only.
  useEffect(() => {
    let left = false;
    loadRazorpayCheckout().catch(() => {
      if (!left) setScriptDown(true);
    });
    return () => {
      left = true;
    };
  }, []);

  // A key found in storage asks once where its attempt stands — unless this page session already has an attempt
  // of its own. The key is used for nothing else; a launch it yields holds the page but opens no window by itself.
  useEffect(() => {
    if (attemptKeys.held() !== null || attemptKeys.slot() !== null) return;
    const key = attemptKeys.storedKey();
    if (key === null) return;
    let left = false;
    void settleResume(
      () => actions.resume({ attempt_key: key }),
      () => left,
    ).then((step) => {
      // Nothing to say — or the customer has pressed pay meanwhile: that submission's answer decides, not this one.
      if (step === null || left) return;
      if (attemptKeys.slot() !== null || attemptKeys.held() !== null) return;
      switch (step.do) {
        case "launch":
          // The server judged the deadline by the database's clock: its answer stands, and the page times what
          // remains from this moment (never `expires_at` against the device's clock).
          attemptKeys.hold(step.launch, null, Date.now());
          setToken(null);
          setHold(attemptKeys.held());
          setNotice({
            id: "waiting",
            orderNumber: step.launch.order_number,
          });
          return;
        case "close":
          onClosed();
          return;
        case "notice":
          if (step.forget) attemptKeys.forget();
          if (step.block) setBlocked(true);
          setNotice(step.notice);
          return;
        case "nothing":
          if (step.dropStored) attemptKeys.dropStored(key);
          return;
        default:
          return;
      }
    });
    return () => {
      left = true;
    };
  }, [actions, onClosed]);

  // The hold ends when the order's deadline passes — never because a browser callback fired. An order Razorpay
  // reported complete to this page is not released at all: the page keeps the unverified state and offers no
  // payment until it is reloaded, when the server says where the order stands.
  useEffect(() => {
    if (hold === null || hold.reported) return;
    const remaining = millisecondsToDeadline(hold, Date.now());
    if (remaining > MAX_TIMER_MS) return;
    const timer = setTimeout(() => {
      attemptKeys.forget();
      setHold(null);
      setNotice({ id: "expired" });
    }, remaining);
    return () => clearTimeout(timer);
  }, [hold]);

  const unavailableItem =
    answer !== null && answer.items.some((item) => !item.available);
  const payable =
    answer !== null && answer.items.length > 0 && !unavailableItem;
  const locked = hold !== null || busy || blocked;
  const reported = hold?.reported ?? false;

  /** A condition that stands until it is put right, shown when no outcome is. */
  const standing: CheckoutNotice | null = scriptDown
    ? { id: "scriptUnavailable" }
    : hold !== null || blocked
      ? null
      : challengeDown
        ? { id: "challengeUnavailable" }
        : unavailableItem
          ? { id: "itemUnavailable" }
          : null;
  const shown = notice ?? standing;

  const onField = (event: ChangeEvent<HTMLInputElement>) => {
    const { name } = event.target;
    if (!isCheckoutField(name)) return;
    const value =
      name === "pin"
        ? sanitisePinInput(event.target.value)
        : event.target.value;
    formMemory.setField(name, value);
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (current[name] === undefined) return current;
      const next: CheckoutFieldErrors = {};
      for (const field of CHECKOUT_FIELDS)
        if (field !== name && current[field] !== undefined)
          next[field] = current[field];
      return next;
    });
    setNotice(null);
  };

  const onPayment = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    if (!isPaymentMethod(value)) return;
    formMemory.setPayment(value);
    setPayment(value);
  };

  /** Shows refused fields the prototype's way: the messages, the first refused field focused, the status line. */
  const refuse = (refused: CheckoutFieldErrors) => {
    setErrors(refused);
    setNotice({ id: "checkDetails" });
    const first = firstRefusedField(refused);
    const input =
      first === null ? null : form.current?.elements.namedItem(first);
    if (input instanceof HTMLInputElement) input.focus();
    else setFocusRequest((count) => count + 1);
  };

  /** Releases the hold once the order's deadline has passed. */
  const releaseExpired = () => {
    attemptKeys.forget();
    setHold(null);
    announce({ id: "expired" });
  };

  /** Opens Razorpay's window for the order that holds the page — with the launch the server answered, as it is. */
  const openWindow = (target: CheckoutHold) => {
    if (holdExpired(target, Date.now())) {
      releaseExpired();
      return;
    }
    const orderNumber = target.launch.order_number;
    const opened = openPaymentWindow(target.launch, target.prefill, {
      // Razorpay's report to the browser is not proof: nothing is sent, stored, emptied or navigated.
      onReported: () => {
        attemptKeys.markReported();
        setHold(attemptKeys.held());
        if (attemptKeys.held() === null) setBlocked(true);
        announce({ id: "unverified", orderNumber });
      },
      onFailed: () => {
        if (attemptKeys.held()?.reported) return;
        setNotice({ id: "paymentFailed" });
      },
      onDismissed: () => {
        if (attemptKeys.held()?.reported) return;
        announce({ id: "dismissed", orderNumber });
      },
    });
    if (opened) setNotice(null);
    else {
      setScriptDown(true);
      announce({ id: "scriptUnavailable" });
    }
  };

  const carryOut = (step: CheckoutStep, prefill: CheckoutPrefill) => {
    switch (step.do) {
      case "launch": {
        // A launch is the server's verdict that the order is payable now; the page does not second-guess it with
        // the device's clock (a wrong clock would otherwise discard it and the next press would be a new order).
        attemptKeys.hold(step.launch, prefill, Date.now());
        const held = attemptKeys.held();
        setHold(held);
        // A page that was left while the answer travelled opens nothing: the hold waits for the return.
        if (held !== null && mounted.current) openWindow(held);
        return;
      }
      case "close":
        onClosed();
        return;
      case "fields":
        refuse(step.errors);
        return;
      case "notice":
        if (step.forget) {
          attemptKeys.forget();
          setHold(null);
        }
        if (step.recheckBag) setBagCheck((count) => count + 1);
        if (step.block) setBlocked(true);
        if (step.notice.id === "scriptUnavailable") setScriptDown(true);
        announce(step.notice);
        return;
      default:
        return;
    }
  };

  const pay = async (
    fields: NormalisedCheckoutFields,
    bagAnswer: BagValidationResult,
    challenge: string,
  ) => {
    pressing.current = true;
    setBusy(true);
    setNotice(null);
    const prefill: CheckoutPrefill = {
      name: fields.name,
      email: fields.email,
      contact: fields.phone,
      method: payment,
    };
    let step: CheckoutStep;
    try {
      step = await startPayment({
        actions,
        answer: bagAnswer,
        fields,
        values,
        payment,
        token: challenge,
        // A token is single-use: whatever the answer, it is dropped and a fresh one asked for.
        afterSubmit: () => {
          setToken(null);
          turnstile.current?.reset();
        },
      });
    } catch {
      step = UNAVAILABLE_STEP;
    }
    pressing.current = false;
    setBusy(false);
    carryOut(step, prefill);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pressing.current || blocked || reported) return;
    if (hold !== null) {
      openWindow(hold);
      return;
    }
    if (answer === null || !payable || scriptDown) return;
    const checked = normaliseCheckoutFields(values);
    if (!checked.ok) {
      refuse(checked.errors);
      return;
    }
    if (token === null) {
      announce({
        id: challengeDown ? "challengeUnavailable" : "challengeNeeded",
      });
      return;
    }
    void pay(checked.fields, answer, token);
  };

  const { contact, payment: paymentCopy, summary, empty } = CHECKOUT_PAGE;
  const bagEmpty =
    snapshot.hydrated && snapshot.rows.length === 0 && !locked && !reported;

  return (
    <>
      <header className="checkout-heading">
        <h1>{CHECKOUT_PAGE.heading}</h1>
        <p>{CHECKOUT_PAGE.sub}</p>
        <p className="flow-fine">{CHECKOUT_TEST_MODE.disclosure}</p>
      </header>
      {bagEmpty ? (
        <section id="checkout-empty" className="flow-panel">
          <h2>{empty.heading}</h2>
          <Link
            className="button button--primary"
            href={empty.action.href}
            prefetch={false}
          >
            {empty.action.label}
          </Link>
        </section>
      ) : (
        <form id="checkout-form" ref={form} noValidate onSubmit={onSubmit}>
          <div className="flow-layout">
            <div className="checkout-fields-panel">
              <section className="flow-panel">
                <div className="flow-section-title">
                  <h2>{contact.heading}</h2>
                </div>
                <div className="flow-fields">
                  {CHECKOUT_FIELDS.map((field) => {
                    const copy = CHECKOUT_FIELD_COPY[field];
                    const attributes = FIELD_ATTRIBUTES[field];
                    const error = errors[field];
                    return (
                      <label key={field}>
                        {copy.label}
                        <input
                          name={field}
                          type={attributes.type}
                          required={attributes.required}
                          autoComplete={attributes.autoComplete}
                          inputMode={attributes.inputMode}
                          maxLength={attributes.maxLength}
                          pattern={attributes.pattern}
                          placeholder={copy.placeholder}
                          aria-describedby={`error-${field}`}
                          aria-invalid={error === undefined ? undefined : true}
                          value={values[field]}
                          onChange={onField}
                          readOnly={locked}
                        />
                        <span id={`error-${field}`} className="field-error">
                          {error === undefined
                            ? null
                            : fieldMessage(field, error)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="flow-fine">{contact.fine}</p>
              </section>
              <section className="flow-panel payment-panel">
                <h2>{paymentCopy.heading}</h2>
                <fieldset className="payment-choices">
                  <legend className="visually-hidden">
                    {paymentCopy.legend}
                  </legend>
                  {CHECKOUT_PAYMENT_CHOICES.map((choice) => (
                    <label key={choice.value}>
                      <input
                        type="radio"
                        name="payment"
                        value={choice.value}
                        checked={payment === choice.value}
                        onChange={onPayment}
                        disabled={locked}
                      />
                      <span>
                        <strong>{choice.title}</strong>
                        <small>{choice.note}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="flow-fine">{paymentCopy.note}</p>
              </section>
            </div>
            <aside className="flow-panel flow-summary">
              <h2>{summary.heading}</h2>
              <Link
                className="text-link"
                href={summary.editBag.href}
                prefetch={false}
              >
                {summary.editBag.label}
              </Link>
              <div id="checkout-items">
                {lines.map((line) => (
                  <CheckoutRow key={line.code} line={line} />
                ))}
              </div>
              <BagStatus
                id={BAG_STATUS_ID}
                className="flow-fine"
                messages={messages}
                failed={failed}
                onRetry={retry}
              />
              <dl className="flow-totals">
                <div>
                  <dt>{summary.subtotal}</dt>
                  <dd data-subtotal="">{subtotalText(snapshot, validation)}</dd>
                </div>
                <div>
                  <dt>{summary.shipping}</dt>
                  <dd>{summary.shippingValue}</dd>
                </div>
                <div className="checkout-test-total">
                  <dt>{CHECKOUT_TEST_MODE.totalLabel}</dt>
                  <dd data-test-total="">
                    {hold === null
                      ? subtotalText(snapshot, validation)
                      : launchAmountText(hold.launch)}
                  </dd>
                </div>
              </dl>
              <p className="flow-fine">{summary.fine}</p>
              <p className="flow-fine">{CHECKOUT_TEST_MODE.totalNote}</p>
              <p className="flow-fine">
                <Link href={summary.terms.href} prefetch={false}>
                  {summary.terms.label}
                </Link>
                {summary.policySeparator}
                <Link href={summary.returns.href} prefetch={false}>
                  {summary.returns.label}
                </Link>
              </p>
              {hold !== null || blocked || reported ? null : (
                <TurnstileWidget
                  ref={turnstile}
                  siteKey={siteKey}
                  onToken={setToken}
                  onUnavailable={() => setChallengeDown(true)}
                />
              )}
              <p
                ref={status}
                id={STATUS_ID}
                className={
                  shown !== null && isNeutralNotice(shown)
                    ? "checkout-notice"
                    : "field-error"
                }
                role="status"
                aria-live="polite"
                tabIndex={-1}
              >
                {shown === null ? null : shown.id === "held" ? (
                  <>
                    {CHECKOUT_NOTICES.held.before}
                    <Link
                      href={CHECKOUT_NOTICES.held.link.href}
                      prefetch={false}
                    >
                      {CHECKOUT_NOTICES.held.link.label}
                    </Link>
                    {CHECKOUT_NOTICES.held.after}
                  </>
                ) : (
                  noticeText(shown)
                )}
              </p>
              {blocked || reported ? null : (
                <button
                  type="submit"
                  className="button button--primary"
                  data-checkout-next=""
                  aria-describedby={`${STATUS_ID} ${BAG_STATUS_ID}`}
                  disabled={
                    busy ||
                    scriptDown ||
                    (hold === null && (!payable || challengeDown))
                  }
                >
                  {busy
                    ? CHECKOUT_PAY.busy
                    : hold === null
                      ? CHECKOUT_PAY.label
                      : CHECKOUT_PAY.resume}
                </button>
              )}
              <p className="flow-fine">{summary.craft}</p>
              <Link
                className="text-link"
                href={summary.help.href}
                prefetch={false}
              >
                {summary.help.label}
              </Link>
            </aside>
          </div>
        </form>
      )}
    </>
  );
}
