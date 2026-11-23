import {
  CHECKOUT_FIELD_MESSAGES,
  CHECKOUT_NOTICES,
} from "@/content/public/checkout";
import {
  CHECKOUT_FIELDS,
  type CheckoutActionResult,
  type CheckoutField,
  type CheckoutFieldError,
  type CheckoutFieldErrors,
  type CheckoutLaunch,
  type CheckoutReturnResult,
} from "@/lib/schemas/checkout";
import { isOrderPath } from "@/lib/schemas/payments";

/**
 * What the checkout page does with each answer of its server actions, and the sentence each state shows — S1.6
 * (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). Framework-free, so the mapping is unit-tested; the
 * React side (./checkout-form.tsx) only carries the steps out.
 *
 * - `submitStep` reads an answer to a pay press — and each answer of the short wait that follows `in_progress`, and
 *   (S1.7) the answer to the question the page asks before it opens a payment window again.
 * - `resumeStep` reads the answer to the one question a freshly loaded page asks about a key found in storage. It is
 *   quieter on purpose: a key that leads nowhere is dropped without a word, and a control that could not be reached
 *   says nothing (the customer has not asked for anything yet).
 * - No step treats a browser callback as proof, and none empties the bag.
 *
 * **S1.7.** The server may now answer that a payment for the order is known (`confirming`), that the order is
 * confirmed (`confirmed`) or that it could not find out (`uncertain`). None of the three offers a payment. The
 * first two carry the path of the order's own page once the server may give it: the page then leaves for it
 * (`order`) — the only navigation any step asks for, and only to a path of exactly that shape. `settleReturn` is
 * the verification of what Razorpay's window reported: it answers that same path, or nothing.
 */

/** How long the page waits before asking again after `in_progress`, and how many times it asks. */
export const RESUME_POLL_MS = 2000;
export const RESUME_POLL_LIMIT = 5;

export type CheckoutNotice =
  | {
      readonly id:
        | "checkDetails"
        | "itemUnavailable"
        | "bagChanged"
        | "challengeNeeded"
        | "challengeUnavailable"
        | "challengeFailed"
        | "throttled"
        | "unavailable"
        | "startFailed"
        | "startUnknown"
        | "paymentFailed"
        | "held"
        | "expired"
        | "scriptUnavailable"
        | "uncertain";
    }
  | {
      readonly id: "waiting" | "dismissed" | "unverified" | "confirming";
      readonly orderNumber: string;
    };

export type CheckoutStep =
  /** A linked, pending, unexpired order: it now holds the page. */
  | { readonly do: "launch"; readonly launch: CheckoutLaunch }
  /** S1.7: the order has a page the server may give: the checkout's part is over — go to it. */
  | { readonly do: "order"; readonly path: string }
  /** Sales are not open here: the page becomes the closed panel (NS-04). */
  | { readonly do: "close" }
  /** The server refused fields: shown as the form's own errors. */
  | { readonly do: "fields"; readonly errors: CheckoutFieldErrors }
  /** Another request is starting this payment: ask again shortly. */
  | { readonly do: "poll" }
  | {
      readonly do: "notice";
      readonly notice: CheckoutNotice;
      /** Forget the attempt (slot, hold and stored key): the next pay press is a new order. */
      readonly forget: boolean;
      /** Check the bag against the catalogue again. */
      readonly recheckBag: boolean;
      /** The order is not payable from this page: no pay button. */
      readonly block: boolean;
    }
  /** Resume only: say nothing; `dropStored` removes the stored key that led nowhere. */
  | { readonly do: "nothing"; readonly dropStored: boolean };

function notice(
  id: Exclude<
    CheckoutNotice["id"],
    "waiting" | "dismissed" | "unverified" | "confirming"
  >,
  options: { forget?: boolean; recheckBag?: boolean; block?: boolean } = {},
): CheckoutStep {
  return {
    do: "notice",
    notice: { id },
    forget: options.forget ?? false,
    recheckBag: options.recheckBag ?? false,
    block: options.block ?? false,
  };
}

/**
 * S1.7 — the three answers that offer no payment. With the order's page: go to it. Without it (no verified
 * signature stands on record yet, or the link cannot be derived here): a payment that is known says so and takes
 * the pay button away; a confirmed order is simply not payable from this page; `uncertain` takes the button away
 * until the page is loaded again. `quiet` is the load-time question, where a not-payable order is a line only.
 */
function withoutPayment(
  result: Extract<
    CheckoutActionResult,
    { status: "confirming" | "confirmed" | "uncertain" }
  >,
  quiet: boolean,
): CheckoutStep {
  if (result.status === "uncertain")
    return notice("uncertain", { block: true });
  if (isOrderPath(result.order_path))
    return { do: "order", path: result.order_path };
  if (result.status === "confirmed") return notice("held", { block: !quiet });
  return {
    do: "notice",
    notice: { id: "confirming", orderNumber: result.order_number },
    forget: false,
    recheckBag: false,
    block: true,
  };
}

/** The step for an answer to a pay press, or to the wait after `in_progress`. */
export function submitStep(result: CheckoutActionResult): CheckoutStep {
  switch (result.status) {
    case "launch":
      return { do: "launch", launch: result.launch };
    case "closed":
      return { do: "close" };
    case "invalid":
      return Object.keys(result.fields).length > 0
        ? { do: "fields", errors: result.fields }
        : notice("unavailable");
    case "bag_changed":
      return notice("bagChanged", { recheckBag: true });
    case "challenge_failed":
      return notice("challengeFailed");
    case "throttled":
      return notice("throttled");
    case "unavailable":
      return notice("unavailable");
    case "in_progress":
      return { do: "poll" };
    case "start_failed":
      return notice("startFailed", { forget: true });
    case "start_unknown":
      return notice("startUnknown", { forget: true });
    case "expired":
      return notice("expired", { forget: true });
    case "held":
      return notice("held", { block: true });
    case "not_found":
      return notice("unavailable", { forget: true });
    case "confirming":
    case "confirmed":
    case "uncertain":
      return withoutPayment(result, false);
  }
}

/** The step for the answer about a key read from storage when the page loads. */
export function resumeStep(result: CheckoutActionResult): CheckoutStep {
  switch (result.status) {
    case "launch":
      return { do: "launch", launch: result.launch };
    case "closed":
      return { do: "close" };
    case "in_progress":
      return { do: "poll" };
    case "not_found":
    case "start_failed":
    case "start_unknown":
      return { do: "nothing", dropStored: true };
    case "expired":
      return notice("expired", { forget: true });
    // The line only: the customer has not asked to pay for that order on this page, so the form stays usable — a
    // pay press is a new attempt with a new key, never that order.
    case "held":
      return notice("held");
    case "invalid":
    case "bag_changed":
    case "challenge_failed":
      return { do: "nothing", dropStored: false };
    // S1.7: where the stored attempt stands could not be found out — its order may have been paid for. No new
    // payment is offered from this page until it can be (a reload asks again).
    case "throttled":
    case "unavailable":
      return UNCERTAIN_STEP;
    case "confirming":
    case "confirmed":
    case "uncertain":
      return withoutPayment(result, true);
  }
}

/** "Temporarily unavailable": an action that threw, or the wait after `in_progress` running out during a pay press. */
export const UNAVAILABLE_STEP: CheckoutStep = notice("unavailable");

/**
 * S1.7 — "could not be checked": an answer about an order whose payment may already have been made could not be
 * had. No pay button until the page is loaded again; the attempt is kept.
 */
export const UNCERTAIN_STEP: CheckoutStep = notice("uncertain", {
  block: true,
});

/**
 * S1.7 — the step for an answer about an order whose payment window has been opened on this page. "Temporarily
 * unavailable … Nothing was charged" is not this page's to say once a window may have taken a payment: an answer
 * that could not be had — the action unavailable or thrown, the wait run out, the attempt no longer found — is
 * "could not be checked", and the attempt is kept. Every other step is carried out as it is.
 */
export function afterWindowStep(step: CheckoutStep): CheckoutStep {
  return step.do === "notice" && step.notice.id === "unavailable"
    ? UNCERTAIN_STEP
    : step;
}

/** The step when Razorpay's checkout script is not on the page: nothing is submitted. */
export const SCRIPT_UNAVAILABLE_STEP: CheckoutStep =
  notice("scriptUnavailable");

/** One question to a checkout action. */
export type CheckoutAsk = () => Promise<CheckoutActionResult>;

const pauseFor = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * A pay press, to its settled step: the submission's answer and — after `in_progress` — the same attempt asked
 * about again every two seconds, at most five times, then "temporarily unavailable". Exactly one submission is
 * made. Never throws: an action that throws is "temporarily unavailable". Never returns `poll`.
 */
export async function settleSubmit(
  submit: CheckoutAsk,
  resume: CheckoutAsk,
  pause: (milliseconds: number) => Promise<void> = pauseFor,
): Promise<CheckoutStep> {
  let step: CheckoutStep;
  try {
    step = submitStep(await submit());
  } catch {
    return UNAVAILABLE_STEP;
  }
  for (let asked = 0; step.do === "poll"; asked += 1) {
    if (asked === RESUME_POLL_LIMIT) return UNAVAILABLE_STEP;
    await pause(RESUME_POLL_MS);
    try {
      step = submitStep(await resume());
    } catch {
      return UNAVAILABLE_STEP;
    }
  }
  return step;
}

/**
 * The question a freshly loaded page asks about a stored key, to its settled step — or null only when `cancelled()`
 * turned true (the page was left). The first question and, after `in_progress`, at most five more, two seconds
 * apart. S1.7: an action that threw, or a wait that ran out, is "could not be checked" — the stored attempt's order
 * may have been paid for, so the page offers no new payment until it is loaded again. Never throws and never
 * returns `poll`.
 */
export async function settleResume(
  resume: CheckoutAsk,
  cancelled: () => boolean = () => false,
  pause: (milliseconds: number) => Promise<void> = pauseFor,
): Promise<CheckoutStep | null> {
  for (let asked = 0; asked <= RESUME_POLL_LIMIT; asked += 1) {
    if (asked > 0) await pause(RESUME_POLL_MS);
    if (cancelled()) return null;
    let step: CheckoutStep;
    try {
      step = resumeStep(await resume());
    } catch {
      return cancelled() ? null : UNCERTAIN_STEP;
    }
    if (cancelled()) return null;
    if (step.do !== "poll") return step;
  }
  return UNCERTAIN_STEP;
}

/** How often the page asks again when the verification of a report could not be reached, and how long it waits. */
export const RETURN_RETRY_LIMIT = 2;
export const RETURN_RETRY_MS = 2000;

/** One question to the verified-return action. */
export type ReturnAsk = () => Promise<CheckoutReturnResult>;

/**
 * S1.7 — what Razorpay's window reported, verified by the server: the path of the order's page, or null. The
 * verification is asked once; only when it could not be reached (`unavailable`, or it threw) is it asked again —
 * at most twice more, two seconds apart. `rejected` and `throttled` are final: null. A path that is not exactly
 * an order's page is null too. Never throws, and null changes nothing on the page: the payment stays "not
 * confirmed yet" (NS-05), which is what a report that could not be verified is.
 */
export async function settleReturn(
  ask: ReturnAsk,
  cancelled: () => boolean = () => false,
  pause: (milliseconds: number) => Promise<void> = pauseFor,
): Promise<string | null> {
  for (let asked = 0; asked <= RETURN_RETRY_LIMIT; asked += 1) {
    if (asked > 0) await pause(RETURN_RETRY_MS);
    if (cancelled()) return null;
    let result: CheckoutReturnResult;
    try {
      result = await ask();
    } catch {
      continue;
    }
    if (result.status === "verified")
      return isOrderPath(result.order_path) ? result.order_path : null;
    if (result.status !== "unavailable") return null;
  }
  return null;
}

/** True for a notice that reports no problem: a waiting window, a closed window, a payment not yet confirmed. */
export function isNeutralNotice(shown: CheckoutNotice): boolean {
  return (
    shown.id === "waiting" ||
    shown.id === "dismissed" ||
    shown.id === "unverified" ||
    shown.id === "confirming"
  );
}

/** The sentence of a notice. `held` ends with a link, so its text is the three parts joined. */
export function noticeText(shown: CheckoutNotice): string {
  switch (shown.id) {
    case "checkDetails":
      return CHECKOUT_FIELD_MESSAGES.status;
    case "waiting":
      return CHECKOUT_NOTICES.waiting(shown.orderNumber);
    case "dismissed":
      return CHECKOUT_NOTICES.dismissed(shown.orderNumber);
    case "unverified":
      return CHECKOUT_NOTICES.unverified(shown.orderNumber);
    case "confirming":
      return CHECKOUT_NOTICES.confirming(shown.orderNumber);
    case "held":
      return `${CHECKOUT_NOTICES.held.before}${CHECKOUT_NOTICES.held.link.label}${CHECKOUT_NOTICES.held.after}`;
    default:
      return CHECKOUT_NOTICES[shown.id];
  }
}

/**
 * The message under a refused field: the prototype's own (prototype/shared/commerce-r9.js:17) — an email, a mobile
 * number or a PIN code of the wrong shape names its rule; an empty required field, and any other refusal, asks to
 * complete the field; an entry that is too long says so.
 */
export function fieldMessage(
  field: CheckoutField,
  error: CheckoutFieldError,
): string {
  if (error === "too_long") return CHECKOUT_FIELD_MESSAGES.tooLong;
  if (error === "invalid") {
    if (field === "email") return CHECKOUT_FIELD_MESSAGES.email;
    if (field === "phone") return CHECKOUT_FIELD_MESSAGES.phone;
    if (field === "pin") return CHECKOUT_FIELD_MESSAGES.pin;
  }
  return CHECKOUT_FIELD_MESSAGES.required;
}

/** The first refused field in the form's order, or null. */
export function firstRefusedField(
  errors: CheckoutFieldErrors,
): CheckoutField | null {
  return CHECKOUT_FIELDS.find((field) => errors[field] !== undefined) ?? null;
}
