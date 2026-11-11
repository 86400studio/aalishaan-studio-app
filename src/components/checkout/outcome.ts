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
} from "@/lib/schemas/checkout";

/**
 * What the checkout page does with each answer of its two server actions, and the sentence each state shows — S1.6
 * (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). Framework-free, so the mapping is unit-tested; the
 * React side (./checkout-form.tsx) only carries the steps out.
 *
 * - `submitStep` reads an answer to a pay press — and each answer of the short wait that follows `in_progress`.
 * - `resumeStep` reads the answer to the one question a freshly loaded page asks about a key found in storage. It is
 *   quieter on purpose: a key that leads nowhere is dropped without a word, and a control that could not be reached
 *   says nothing (the customer has not asked for anything yet).
 * - No step treats a browser callback as proof, and none empties the bag or navigates.
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
        | "scriptUnavailable";
    }
  | {
      readonly id: "waiting" | "dismissed" | "unverified";
      readonly orderNumber: string;
    };

export type CheckoutStep =
  /** A linked, pending, unexpired order: it now holds the page. */
  | { readonly do: "launch"; readonly launch: CheckoutLaunch }
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
  id: Exclude<CheckoutNotice["id"], "waiting" | "dismissed" | "unverified">,
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
    case "throttled":
    case "unavailable":
      return { do: "nothing", dropStored: false };
  }
}

/** "Temporarily unavailable": an action that threw, or the wait after `in_progress` running out during a pay press. */
export const UNAVAILABLE_STEP: CheckoutStep = notice("unavailable");

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
 * The question a freshly loaded page asks about a stored key, to its settled step — or null when there is nothing
 * to say: the action threw, the wait after `in_progress` ran out (the first question and at most five more, two
 * seconds apart), or `cancelled()` turned true (the page was left). Never throws and never returns `poll`.
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
      return null;
    }
    if (cancelled()) return null;
    if (step.do !== "poll") return step;
  }
  return null;
}

/** True for a notice that reports no problem: a waiting window, a closed window, an unverified payment. */
export function isNeutralNotice(shown: CheckoutNotice): boolean {
  return (
    shown.id === "waiting" ||
    shown.id === "dismissed" ||
    shown.id === "unverified"
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
