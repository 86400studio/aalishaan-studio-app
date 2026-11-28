import {
  isSettledOrderState,
  mergeOrderPageState,
  type OrderPageState,
  type OrderStatusAnswer,
} from "@/lib/schemas/order-confirmation";

/**
 * The order page's status poll — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order page").
 * Framework-free, so its rules are unit-tested; the React side is ./order-status-watcher.tsx.
 *
 * While the page shows "confirming", it asks the server where the order stands — a bounded number of times, at
 * growing intervals, and it stops for good as soon as the state is settled, the page is left or the questions run
 * out (about seven minutes). A question reads; it never pays, confirms or changes the order.
 *
 * - **Never backwards.** Answers can arrive late or out of order. `confirmed` is final on the page: an answer that
 *   says less never replaces it (`mergeOrderPageState`).
 * - **The provider is asked sparingly.** A few of the questions also ask the server to check with the payment
 *   provider (D-68) — the first one about twenty-five seconds in, so that a webhook that is merely on its way is
 *   never mistaken for a lost one.
 * - A question that fails, or an answer that is not a state, changes nothing and is asked again at the next step.
 *   "No such order" ends the poll: the page it sits on is no longer the order's.
 */

/** The wait before each question, in order: 5 × 3 s, 6 × 5 s, 6 × 10 s, 10 × 30 s — 27 questions in 6 min 45 s. */
export const ORDER_POLL_DELAYS_MS: readonly number[] = [
  ...Array<number>(5).fill(3000),
  ...Array<number>(6).fill(5000),
  ...Array<number>(6).fill(10000),
  ...Array<number>(10).fill(30000),
];

/** The questions (by index) that also ask the provider: at about 25 s, 65 s, 2 min 15 s, 4 min 15 s and the last. */
export const ORDER_PROVIDER_QUESTIONS: ReadonlySet<number> = new Set([
  6, 12, 17, 21, 26,
]);

export type OrderPollEnd = "settled" | "exhausted" | "cancelled" | "gone";

export type OrderPollOptions = {
  /** The state the page shows when the poll starts. */
  initial: OrderPageState;
  /** One status question; `askProvider` marks the few that also check with the payment provider. */
  ask: (askProvider: boolean) => Promise<OrderStatusAnswer>;
  /** Told each time the state the page should show has changed. */
  onState: (state: OrderPageState) => void;
  /** True once the page was left: the poll stops without another question. */
  cancelled: () => boolean;
  pause?: (milliseconds: number) => Promise<void>;
  delays?: readonly number[];
  providerQuestions?: ReadonlySet<number>;
};

const pauseFor = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const sameState = (a: OrderPageState, b: OrderPageState): boolean =>
  a.state === b.state &&
  ("reason" in a ? a.reason : null) === ("reason" in b ? b.reason : null);

/** Runs the poll to its end. Never throws. */
export async function runOrderPoll({
  initial,
  ask,
  onState,
  cancelled,
  pause = pauseFor,
  delays = ORDER_POLL_DELAYS_MS,
  providerQuestions = ORDER_PROVIDER_QUESTIONS,
}: OrderPollOptions): Promise<OrderPollEnd> {
  let shown = initial;
  if (isSettledOrderState(shown)) return "settled";
  for (let index = 0; index < delays.length; index += 1) {
    await pause(delays[index]);
    if (cancelled()) return "cancelled";
    let answer: OrderStatusAnswer;
    try {
      answer = await ask(providerQuestions.has(index));
    } catch {
      continue;
    }
    if (cancelled()) return "cancelled";
    if (answer.status === "not_found") return "gone";
    if (answer.status !== "ok") continue;
    const next = mergeOrderPageState(shown, answer.state);
    if (!sameState(next, shown)) {
      shown = next;
      onState(shown);
    }
    if (isSettledOrderState(shown)) return "settled";
  }
  return "exhausted";
}
