"use client";

import { useActionState } from "react";

import { ENROL } from "../../_components/strings";
import { enrol } from "../actions";
import { INITIAL_ENROL_STATE } from "./enrol-state";

/**
 * The enrolment form — S1.2. A client component for one reason: the QR and the manual-entry key returned by the
 * `start` intent must be shown before the `confirm` intent runs. It holds no secret of its own, imports only the
 * server action and the strings, and renders the QR through <img src="data:…"> (CSP `img-src data:`), never as
 * inline markup. The server action re-authorises on every submit.
 */
export function EnrolForm({ next }: Readonly<{ next: string }>) {
  const [state, dispatch, pending] = useActionState(enrol, INITIAL_ENROL_STATE);

  return (
    <form action={dispatch} className="mt-6 grid gap-4 text-left">
      <input type="hidden" name="next" value={next} />
      {state.error ? <p role="alert">{ENROL.errors[state.error]}</p> : null}
      {state.step === "start" ? (
        <button
          type="submit"
          className="border px-4 py-2"
          name="intent"
          value="start"
          disabled={pending}
        >
          {ENROL.start}
        </button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: SVG from the Auth server, not an optimisable asset */}
          <img
            src={state.qrCode}
            alt={ENROL.qrAlt}
            width={200}
            height={200}
            className="mx-auto"
          />
          <p>
            <span>{ENROL.secretLabel}</span>
            <br />
            <code data-testid="totp-secret">{state.secret}</code>
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
          <button
            type="submit"
            className="border px-4 py-2"
            name="intent"
            value="confirm"
            disabled={pending}
          >
            {ENROL.confirm}
          </button>
        </>
      )}
    </form>
  );
}
