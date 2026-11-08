"use client";

import { Component, type ReactNode } from "react";

import { RECOVERY } from "@/content/public/pages";
import { reportToSentry } from "@/lib/report-error";

/**
 * The error boundary around the cart drawer's bag content — S1.5 (docs/PROJECT-STATUS.md §10 #23 (g); NS-18).
 * Without it a render error in the drawer's rows is above `src/app/(public)/error.tsx` (the drawers are the public
 * shell's, outside the page's boundary) and reaches `global-error.tsx`, which replaces the whole document. Here the
 * failure stays inside the drawer's body: the drawer's header — its Close button — is outside the boundary, so the
 * drawer still closes and the overlay provider releases the scroll lock, the inert background and the focus trap as
 * on any close; Escape and the backdrop keep working too.
 *
 * The fallback is the designed 500's own copy (prototype/500.html; `RECOVERY["500"]`, the wording NS-18 reuses — no
 * new string): its heading, its line and "Return home" as a plain link, a full page load (as the 500 does). The error
 * is reported to Sentry as the route boundaries report theirs; nothing of it reaches the page. A change of
 * `resetKey` (the drawer opening or closing) clears the failure, so the next open tries the content again.
 */

type Props = {
  /** A value whose change resets the boundary. */
  resetKey: unknown;
  children: ReactNode;
};

type State = { failed: boolean; resetKey: unknown };

export class OverlayErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: Props,
    state: State,
  ): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey)
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown): void {
    reportToSentry(error);
  }

  render(): ReactNode {
    return this.state.failed ? <OverlayErrorFallback /> : this.props.children;
  }
}

/** The designed 500's heading, line and way home, in the drawer's empty-state layout. */
export function OverlayErrorFallback() {
  const copy = RECOVERY["500"];
  return (
    <div className="cart-empty">
      <h3>{copy.heading}</h3>
      <p>{copy.body}</p>
      {/* a plain link: a full page load clears whatever failed (as on the 500 page) */}
      <a className="button button--primary" href={RECOVERY.primary.href}>
        {RECOVERY.primary.label}
      </a>
    </div>
  );
}
