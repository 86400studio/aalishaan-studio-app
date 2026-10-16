"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

import { TRACK, type TrackMode } from "@/content/public/pages";
import { TRACK_FORM } from "@/content/public/strings";

/**
 * The Track lookup panel (prototype/pages/track/index.html with prototype/shared/commerce-r9.js, the tab
 * behaviour ported — never imported): three tabs with a roving tabindex and arrow-key movement that swap
 * the field's label, placeholder, input mode and hint. At S1.3 nothing is looked up: the input and the
 * submit are disabled and the NS-03 notice stands where the prototype's sample button stood (the lookup
 * is S1.9; per-parcel milestones S2.10). The prototype's sample reference never appears (D-09).
 */
const ORDER: readonly TrackMode[] = ["order", "awb", "mobile"];

export function TrackForm() {
  const [mode, setMode] = useState<TrackMode>("order");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = TRACK.modes[mode];

  const select = (next: TrackMode, focus = false) => {
    setMode(next);
    if (focus) tabs.current[ORDER.indexOf(next)]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const n =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? ORDER.length - 1
          : (i + (event.key === "ArrowRight" ? 1 : ORDER.length - 1)) %
            ORDER.length;
    select(ORDER[n]!, true);
  };

  return (
    <section>
      <form
        id="track-form"
        className="flow-panel utility-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <span className="flow-symbol">
          <ParcelIcon />
        </span>
        <h1>{TRACK.heading}</h1>
        <div className="track-tabs" role="tablist" aria-label={TRACK.tabsLabel}>
          {TRACK.tabs.map((tab, i) => (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={mode === tab.mode}
              tabIndex={mode === tab.mode ? 0 : -1}
              data-track-mode={tab.mode}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              onClick={() => select(tab.mode)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label>
          <span id="track-label">{current.label}</span>
          <input
            name="reference"
            placeholder={current.placeholder}
            autoComplete="off"
            inputMode={mode === "mobile" ? "tel" : "text"}
            aria-describedby="track-hint track-notice"
            disabled
          />
        </label>
        <p id="track-hint" className="flow-fine">
          {current.hint}
        </p>
        <p id="track-error" className="field-error" role="status"></p>
        <button className="button button--primary" type="submit" disabled>
          {TRACK.submit}
        </button>
        {/* NS-03 (D-24): the honest state of the lookup until S1.9. */}
        <p id="track-notice" className="flow-fine">
          {TRACK_FORM.notice}
        </p>
      </form>
      <p className="flow-help">
        {TRACK.helpBefore}
        <Link href={TRACK.helpLink.href} prefetch={false}>
          {TRACK.helpLink.label}
        </Link>
      </p>
    </section>
  );
}

export function ParcelIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M4 17h2m4 0h6" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
