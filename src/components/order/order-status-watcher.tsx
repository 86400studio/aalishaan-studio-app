"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ORDER_CONFIRMING } from "@/content/public/order";
import type {
  OrderPageState,
  OrderStatusAnswer,
} from "@/lib/schemas/order-confirmation";

import { runOrderPoll } from "./status-poll";

/**
 * The order page's watcher — S1.7. Rendered only while the page shows "confirming". It asks the server where the
 * order stands (./status-poll.ts: bounded, growing intervals, never backwards) and, when the state has changed,
 * asks the framework for the page again — so what the customer then sees is the server's own render of what the
 * database holds, never something this component made up. It stops when the state is settled, when the page is
 * left, and when its questions run out; then it says so (NS-45) and asks nothing more.
 *
 * It holds nothing but the state it was rendered with, stores nothing, and starts no payment.
 */
export function OrderStatusWatcher({
  token,
  initial,
  ask,
}: {
  /** The page's own token — the capability the status question is asked with. */
  token: string;
  initial: OrderPageState;
  ask: (token: string, askProvider: boolean) => Promise<OrderStatusAnswer>;
}) {
  const router = useRouter();
  const [waitedOut, setWaitedOut] = useState(false);
  const kind = initial.state;
  const reason = "reason" in initial ? initial.reason : null;

  useEffect(() => {
    let left = false;
    void runOrderPoll({
      initial:
        kind === "confirmed"
          ? { state: "confirmed" }
          : kind === "confirming"
            ? {
                state: "confirming",
                reason: reason === "review" ? "review" : "payment",
              }
            : {
                state: "failed",
                reason: reason === "retry" ? "retry" : "closed",
              },
      ask: (askProvider) => ask(token, askProvider),
      // The server renders the page again: the new state arrives as this component's own props.
      onState: () => router.refresh(),
      cancelled: () => left,
    }).then((end) => {
      if (!left && end === "exhausted") setWaitedOut(true);
    });
    return () => {
      left = true;
    };
  }, [ask, kind, reason, router, token]);

  // A live region that is in the page from the start, so that the line is announced when it appears.
  return (
    <p className="flow-fine order-waiting" role="status" aria-live="polite">
      {waitedOut ? ORDER_CONFIRMING.stillWaiting : null}
    </p>
  );
}
