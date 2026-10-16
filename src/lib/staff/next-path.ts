/**
 * The `next` return path of the staff sign-in — S1.2 (docs/SECURITY-CHECKLIST.md §3 "Redirect targets are
 * validated same-origin"; docs/ENVIRONMENT-PARITY.md §7.7). A pure function: the value a sign-in, verification or
 * enrolment page is asked to return to is accepted only as a same-origin path under `/admin`; anything else —
 * a scheme, a host, a protocol-relative `//`, a backslash, a control character, an encoded variant of any of
 * these, a path outside `/admin`, or the sign-in pages themselves (which would loop) — falls back to `/admin`.
 * The value is percent-decoded once and re-checked, so `%2F%2F` and `%5C` cannot smuggle a host or a backslash.
 */

export const ADMIN_HOME = "/admin";

const MAX_LENGTH = 512;
/** `/admin`, optionally followed by path segments and a query of plain characters; no `//`, no `.`-only segment. */
const SAFE_PATH =
  /^\/admin(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*\/?(?:\?[A-Za-z0-9._~=&%-]*)?$/;
const LOGIN_PREFIX = "/admin/login";

export function safeNextPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_LENGTH
  )
    return ADMIN_HOME;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return ADMIN_HOME;
  }
  // The raw and the decoded form must both be free of a protocol-relative start, a backslash and control
  // characters; the shape rule applies to the decoded form, which is what the browser would navigate to.
  for (const candidate of [value, decoded]) {
    if (candidate.includes("//") || candidate.includes("\\")) return ADMIN_HOME;
    if (/[\u0000-\u001f\u007f]/.test(candidate)) return ADMIN_HOME;
  }
  if (!SAFE_PATH.test(decoded)) return ADMIN_HOME;
  // The sign-in pages are never a return target — with or without a query, which would otherwise slip past.
  const pathOnly = decoded.split("?")[0];
  if (pathOnly === LOGIN_PREFIX || pathOnly.startsWith(`${LOGIN_PREFIX}/`))
    return ADMIN_HOME;
  // A path that decodes differently is kept only in its decoded, re-validated form.
  return decoded;
}

/** The sign-in URL that returns to `next` after sign-in and MFA, with `next` validated first. */
export function loginUrlFor(next: unknown): string {
  const safe = safeNextPath(next);
  return safe === ADMIN_HOME
    ? LOGIN_PREFIX
    : `${LOGIN_PREFIX}?next=${encodeURIComponent(safe)}`;
}
