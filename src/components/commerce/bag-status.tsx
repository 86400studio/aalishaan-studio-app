"use client";

import { useRef } from "react";

import { BAG_STATUS } from "@/content/public/cart";

/**
 * The bag's status line, shared by the drawer and the cart — S1.5: one polite live region holding the sentences of
 * ./bag-lines.ts `bagStatusMessages` (the check pending or failed, rows removed because the catalogue no longer holds
 * them, the memory-only disclosure of prototype/shared/bag.js:15, a corrupt saved bag cleared), and, after a failed
 * check, the "Try again" button — outside the live region, so the region announces sentences only. The cart's
 * region is the prototype's `#bag-status` (prototype/pages/cart/index.html:30); the drawer's is bag.js:15's
 * `<p role="status">`. "Try again" first moves the focus to the status line (`tabIndex={-1}`, always mounted), because the
 * button itself unmounts as the check restarts — the focus never falls to <body> (WCAG 2.4.3).
 */
export function BagStatus({
  id,
  className,
  messages,
  failed,
  onRetry,
}: {
  id?: string;
  className?: string;
  messages: readonly string[];
  failed: boolean;
  onRetry: () => void;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  return (
    <>
      <p
        ref={statusRef}
        id={id}
        className={className}
        role="status"
        aria-live="polite"
        tabIndex={-1}
      >
        {messages.join(" ")}
      </p>
      {failed ? (
        <p className="bag-retry">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              statusRef.current?.focus();
              onRetry();
            }}
          >
            {BAG_STATUS.retry}
          </button>
        </p>
      ) : null}
    </>
  );
}
