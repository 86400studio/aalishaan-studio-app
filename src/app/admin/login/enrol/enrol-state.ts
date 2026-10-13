/**
 * The states the enrolment form and its two server actions share — S1.2. A plain module (no directive), because
 * a "use server" file may export only async functions.
 *
 * The QR and the key come from the Auth server through the start action and go only to the signed-in staff
 * member's own browser, where the form keeps them in component state. Nothing sends them back: the confirm
 * action receives the factor's id and the six-digit code, and its own state is one error code.
 */

export type EnrolErrorCode = "code" | "unavailable";

export type EnrolStartState =
  | { step: "start"; error: EnrolErrorCode | null }
  | {
      step: "verify";
      factorId: string;
      /** A `data:image/svg+xml` URL rendered through <img>; never inlined as HTML. */
      qrCode: string;
      secret: string;
    };

export const INITIAL_ENROL_START: EnrolStartState = {
  step: "start",
  error: null,
};

export type EnrolConfirmState = { error: EnrolErrorCode | null };

export const INITIAL_ENROL_CONFIRM: EnrolConfirmState = { error: null };
