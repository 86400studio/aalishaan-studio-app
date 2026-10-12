/**
 * The state the enrolment form and its server action share — S1.2. A plain module (no directive), because a
 * "use server" file may export only async functions; it holds no secret of its own — the QR and the key come from
 * the Auth server through the `start` intent and go only to the signed-in staff member's own browser.
 */
export type EnrolState =
  | { step: "start"; error: "code" | "unavailable" | null }
  | {
      step: "verify";
      factorId: string;
      /** A `data:image/svg+xml` URL rendered through <img>; never inlined as HTML. */
      qrCode: string;
      secret: string;
      error: "code" | "unavailable" | null;
    };

export const INITIAL_ENROL_STATE: EnrolState = { step: "start", error: null };
