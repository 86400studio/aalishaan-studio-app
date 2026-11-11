"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { loadScriptOnce } from "./load-script";
import type { TurnstileApi } from "./provider-globals";

/**
 * The checkout's security check — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3: Turnstile on every
 * submission, fail closed). Cloudflare Turnstile's script is loaded once, with explicit rendering, and only by an
 * open checkout page that mounts this widget. The widget is rendered with the public site key and the action
 * `checkout`; the server checks every token itself (src/lib/server/checkout/), so nothing here is a protection — it
 * only obtains the token the server will ask for.
 *
 * - `onToken` receives each new token, and null when the token expires or the widget reports an error: the page
 *   keeps the latest one only.
 * - A token is single-use. The page calls `reset()` (the handle) after every submission and drops its token.
 * - `onUnavailable` is called when the script cannot load or the widget cannot render: the page then says so and
 *   keeps the pay button disabled.
 * - Narrow columns (under 300 px) get the compact widget; wider ones the flexible one. No animation is added here.
 */

export const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The action the server expects on a checkout token. */
export const TURNSTILE_ACTION = "checkout";

/** Below this width the normal widget (300 px) would overflow its column. */
const FLEXIBLE_MIN_WIDTH = 300;

/**
 * The width the widget will have. The container is hidden while it is empty (src/styles/checkout.css), so before the
 * widget renders it has no width of its own: the column's content box — the parent's width without its padding —
 * is measured instead.
 */
function availableWidth(element: HTMLElement): number {
  if (element.clientWidth > 0) return element.clientWidth;
  const parent = element.parentElement;
  if (!parent) return 0;
  const style = window.getComputedStyle(parent);
  return (
    parent.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  );
}

export type TurnstileHandle = {
  /** Asks for a fresh token; the spent one must be dropped by the caller. */
  reset: () => void;
};

async function loadTurnstile(): Promise<TurnstileApi> {
  await loadScriptOnce(TURNSTILE_SRC);
  const api = window.turnstile;
  if (!api) throw new Error("Turnstile did not define its API");
  return api;
}

export function TurnstileWidget({
  siteKey,
  ref,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  ref: Ref<TurnstileHandle>;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const callbacks = useRef({ onToken, onUnavailable });
  useEffect(() => {
    callbacks.current = { onToken, onUnavailable };
  }, [onToken, onUnavailable]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        const current = widget.current;
        if (!current) return;
        try {
          current.api.reset(current.id);
        } catch {
          // A widget that cannot reset yields no token: the page keeps asking for the security check.
        }
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        const element = container.current;
        if (cancelled || !element) return;
        const id = api.render(element, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          size:
            availableWidth(element) < FLEXIBLE_MIN_WIDTH
              ? "compact"
              : "flexible",
          callback: (token) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            return true;
          },
        });
        if (typeof id !== "string") {
          callbacks.current.onUnavailable();
          return;
        }
        widget.current = { api, id };
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      const current = widget.current;
      widget.current = null;
      if (!current) return;
      try {
        current.api.remove(current.id);
      } catch {
        // The widget is gone with its container either way.
      }
    };
  }, [siteKey]);

  return (
    <div
      ref={container}
      id="checkout-challenge"
      className="checkout-challenge"
    />
  );
}
