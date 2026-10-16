import type { Metadata } from "next";

import { PublicPage } from "@/components/shell/public-page";
import { ParcelIcon, TrackForm } from "@/components/track/track-form";
import { TRACK, TRACK_HEAD } from "@/content/public/pages";
import { TRACK_FORM } from "@/content/public/strings";

/**
 * Track your artwork — S1.3 (docs/TECH-ARCHITECTURE.md §3a `/track`; prototype/pages/track/index.html).
 * The lookup is disabled with the NS-03 notice until S1.9; the result panel keeps the prototype's intro and
 * the studio-to-home placeholder, with the NS-03 notice in place of the sample-journey line.
 */
export const metadata: Metadata = {
  title: TRACK_HEAD.title,
  description: TRACK_HEAD.description,
};

export default function TrackPage() {
  return (
    <PublicPage variant="commerce">
      <div className="flow-layout tracking-layout">
        <TrackForm />
        <section
          id="tracking-result"
          className="flow-panel tracking-result"
          aria-live="polite"
        >
          <p>{TRACK.result.intro}</p>
          <div className="tracking-placeholder">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7M9 9h6" />
            </svg>
            <span>{TRACK.result.from}</span>
            <i></i>
            <ParcelIcon />
            <span>{TRACK.result.to}</span>
          </div>
          <p className="flow-fine">{TRACK_FORM.notice}</p>
        </section>
      </div>
    </PublicPage>
  );
}
