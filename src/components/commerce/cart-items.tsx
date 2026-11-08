"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";

import { CART_PAGE } from "@/content/public/cart";

import type { BagLine } from "./bag-lines";
import { BagRowView } from "./bag-row";
import { BagStatus } from "./bag-status";
import { useBagLines } from "./use-bag-lines";

/**
 * The cart page's rows and status — S1.5 (prototype/pages/cart/index.html:30 `#cart-page-items` and `#bag-status`,
 * rendered by prototype/shared/bag.js:16–17; never imported). The page asks for validation for as long as it is
 * shown. The prototype's "Add a sample artwork" button and its E10 intake states are not ported.
 *
 * - Rows are the editable commerce rows (./bag-row.tsx). An empty hydrated bag shows "Your bag is empty." with
 *   "Explore artworks"; before hydration (the server render, and no JavaScript) the list is empty — the page's
 *   no-JavaScript line says why — and never a false empty bag.
 * - Focus follows bag.js:17 — a quantity change keeps the row and so its field's focus; a finish change gives the row
 *   a new code, or merges it into the row of that finish, and the focus goes to that row's Frame select;
 *   after Remove, the next row's Remove (the previous row's for the last row), or the empty state's heading when the
 *   bag is empty. Never the prototype's sample button.
 * - The removal notice is dismissed when the page is left.
 */

/** A focus target for the render that shows the bag after `revision` (the change the request was made for). */
type FocusRequest = {
  code: string | null;
  control: "remove" | "frame";
  revision: number;
};

export function CartItems() {
  const {
    snapshot,
    lines,
    messages,
    failed,
    setQuantity,
    changeFinish,
    remove,
    retry,
    dismissRemovedNotice,
  } = useBagLines();
  const list = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<FocusRequest | null>(null);

  useEffect(() => () => dismissRemovedNotice(), [dismissRemovedNotice]);

  // After each render: honour a pending focus request once the bag has changed (see the header). A request the
  // change did not lead to (a target no longer drawn) is dropped, never kept for a later render.
  const { revision } = snapshot;
  useLayoutEffect(() => {
    const request = focusRequest.current;
    const container = list.current;
    if (!request || !container || revision <= request.revision) return;
    focusRequest.current = null;
    const target =
      request.code === null
        ? container.querySelector<HTMLElement>("[data-empty-heading]")
        : container.querySelector<HTMLElement>(
            `[data-code="${request.code}"] [data-control="${request.control}"]`,
          );
    target?.focus();
  }, [revision]);

  const empty = snapshot.hydrated && snapshot.rows.length === 0;

  const onRemove = (line: BagLine) => {
    const index = lines.findIndex((candidate) => candidate.code === line.code);
    const next = lines[index + 1] ?? lines[index - 1] ?? null;
    focusRequest.current = {
      code: next?.code ?? null,
      control: "remove",
      revision: snapshot.revision,
    };
    remove(line.code);
  };

  return (
    <>
      <div id="cart-page-items" ref={list}>
        {empty ? (
          <>
            <h2 tabIndex={-1} data-empty-heading="">
              {CART_PAGE.empty.heading}
            </h2>
            <p>{CART_PAGE.empty.body}</p>
            <Link
              className="text-link"
              href={CART_PAGE.empty.action.href}
              prefetch={false}
            >
              {CART_PAGE.empty.action.label}
            </Link>
          </>
        ) : (
          lines.map((line) => (
            <BagRowView
              key={line.code}
              line={line}
              editable
              onRemove={onRemove}
              onQuantity={(row, quantity) => setQuantity(row.code, quantity)}
              onFinish={(row, finish) => {
                focusRequest.current = {
                  code: `${row.slug}:${finish}`,
                  control: "frame",
                  revision: snapshot.revision,
                };
                changeFinish(row.code, finish);
              }}
            />
          ))
        )}
      </div>
      <BagStatus
        id="bag-status"
        className="flow-fine"
        messages={messages}
        failed={failed}
        onRetry={retry}
      />
    </>
  );
}
