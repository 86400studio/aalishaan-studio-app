"use client";

import { useActionState } from "react";

import { ENROL } from "../../_components/strings";
import { confirmEnrolment, startEnrolment } from "../actions";
import {
  INITIAL_ENROL_CONFIRM,
  INITIAL_ENROL_START,
  type EnrolStartState,
} from "./enrol-state";

/**
 * The enrolment form — S1.2. A client component for one reason: the QR and the manual-entry key returned by the
 * start action must be shown before the confirm action runs. They are held here, in this browser tab's state,
 * and are never sent back: the start action is called with the return path alone, and the confirm form posts
 * the factor's id and the six-digit code. The form imports only the two server actions and the strings, and
 * renders the QR through <img src="data:…"> (CSP `img-src data:`), never as inline markup. Each server action
 * re-authorises on every call.
 */
export function EnrolForm({ next }: Readonly<{ next: string }>) {
  const [enrolment, start, starting] = useActionState(
    async (): Promise<EnrolStartState> => startEnrolment(next),
    INITIAL_ENROL_START,
  );
  const [confirmation, confirm, confirming] = useActionState(
    confirmEnrolment,
    INITIAL_ENROL_CONFIRM,
  );

  if (enrolment.step === "start")
    return (
      <form action={start} className="mt-6 grid gap-4 text-left">
        {enrolment.error ? (
          <p role="alert">{ENROL.errors[enrolment.error]}</p>
        ) : null}
        <button type="submit" className="border px-4 py-2" disabled={starting}>
          {ENROL.start}
        </button>
      </form>
    );

  return (
    <form action={confirm} className="mt-6 grid gap-4 text-left">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="factorId" value={enrolment.factorId} />
      {confirmation.error ? (
        <p role="alert">{ENROL.errors[confirmation.error]}</p>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: SVG from the Auth server, not an optimisable asset */}
      <img
        src={enrolment.qrCode}
        alt={ENROL.qrAlt}
        width={200}
        height={200}
        className="mx-auto"
      />
      <p>
        <span>{ENROL.secretLabel}</span>
        <br />
        <code data-testid="totp-secret">{enrolment.secret}</code>
      </p>
      <label className="grid gap-1">
        <span>{ENROL.code}</span>
        <input
          className="border px-3 py-2"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
          maxLength={6}
        />
      </label>
      <button type="submit" className="border px-4 py-2" disabled={confirming}>
        {ENROL.confirm}
      </button>
    </form>
  );
}
