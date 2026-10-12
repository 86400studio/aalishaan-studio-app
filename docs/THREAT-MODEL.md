# THREAT-MODEL.md — Staff Access, Trust Boundaries and the Guard

Written at S1.2 (2026-10-12) for the `/close` skill and every later Admin sprint: what the staff side protects, who can reach it, where the trust boundaries sit and which invariants every merge keeps. It states the model as built; a change to the model is a reviewed change to this file and to `docs/TECH-ARCHITECTURE.md` §5 in the same PR. Customer-side threats (payments, tracking, public writes) are covered by `docs/SECURITY-CHECKLIST.md` §5 and §9 and by the sprints that build those paths (S1.6, S1.7, S1.9).

## 1. Assets

| Asset | Where | Who may touch it | Sprint |
|---|---|---|---|
| Staff identities and roles | Supabase Auth users (TEST / PROD) + `public.staff_profiles` (role, active, MFA and revocation state) | The owner creates and revokes (S1.2 server functions; the Staff & Access UI at S2.1); the TEST tool on TEST only | S1.1, S1.2 |
| The audit log | `public.audit_log` (insert-only, for every role) | Written by the server after its guard; read by the owner (Activity history, S2.1) | S1.1, S1.2 |
| Customer, order, payment and refund records | the S1.1 order tables; later the file registry and private buckets | Staff by role through the server guard and RLS; never anonymously; finance owner-only | S1.6–S2.x |
| Private files (print masters, evidence, exports) | Supabase Storage private buckets | Short-lived signed URLs issued by the server to an authorised member only | S2.3 |
| Business rules and policy versions | `business_rules`, `policy_versions` (append-only) | The owner approves (`settings`) | S2.1, S3.1 |
| Provider credentials and the server secret | Vercel environment (Sensitive) | The server only; never the browser, never a record | S0.2, S1.6+ |

## 2. Actors

| Actor | Trust | Reaches |
|---|---|---|
| Anonymous visitor | none | the public storefront; `public_catalogue` through the publishable key; the public write actions (each validated, throttled and bot-checked — S1.6+); nothing under `/admin` beyond the sign-in page |
| A holder of a staff password only (aal1) | partial — knows a password | the TOTP enrolment page (only for an active staff account with no verified factor) or the verification page; nothing else |
| Staff member at aal2 — Operations | trusted for `work`, `catalogue` | Orders, Products, Reports › Operations (as those sprints land); S1.2: the shell |
| Staff member at aal2 — Customer support | trusted for `support` | Orders (read-only panels), Customers, Support except Refunds, Reports › Operations; S1.2: the shell and Support |
| The owner at aal2 — `owner_admin` | trusted for all six areas | everything, including Staff & Access, Connections, Store setup, Refunds, every export |
| A revoked or disabled member | none, from the moment of revocation | nothing — the next request is denied whatever the cookies still say |
| An Auth user without a `staff_profiles` row | none | nothing — an Auth account is not a staff account; the session is ended locally and the honest notice shown |
| The server (Vercel functions) with the secret key | fully trusted, bypasses RLS | every table — only after the guard, and never on the strength of a request cookie or header |
| The TEST tools in the owner's trusted local process | trusted for TEST only | user creation, profile rows, MFA reset, the revocation exercise on `aalishaan-studio-test`; refused for PROD by the target guard |
| The human owner by hand | trusted for PROD | the Supabase dashboard and CLI: the PROD apply, the owner recovery route, the first PROD staff user (S3.3) |

## 3. Trust boundaries

1. **Browser → server.** Nothing in the browser decides anything. The prototype's role preview, hidden role select, sample access code and local staff records are presentation and were never ported (D-32e). The browser holds the session only as `httpOnly`, `secure`, `sameSite=lax` cookies scoped to `/admin` (`src/lib/server/staff-session.ts`, `STAFF_COOKIE_OPTIONS`) that no script can read.
2. **Cookie → identity.** A cookie is a claim, not an identity. The guard asks the Auth server (`auth.getUser()`) on every request; a forged, expired or revoked token yields no user. The assurance level is read from the claims of the token the Auth server has just validated; the factors from the user object it returned.
3. **Identity → staff member.** An Auth user is a staff member only through a `staff_profiles` row read with the privileged client, with `active = true` and a role the model knows. The owner creates these rows (the TEST tool on TEST; the owner by hand on PROD at S3.3; the Staff & Access UI at S2.1). Sign-up is never offered: the app contains no sign-up call, and the project setting "Allow new users to sign up" is off (owner, Gate 0 #11 on TEST; S3.3 on PROD).
4. **Staff member → authorisation.** The role maps to the six permission areas (`src/lib/staff/permissions.ts` = `public.staff_permission_areas()`); a route or action names the areas it requires and every one must be held (`decideAccess`, `src/lib/staff/access.ts`). The server guard runs for every page render (`guardAdminPage`) and inside every server action (`guardAction`) — an action reached from a page that already passed is still refused if the session has changed since. RLS mirrors the role as the second layer (S1.2: the own-row policy at aal2; later sprints add their policies).
5. **Server → database.** The privileged client bypasses RLS and is used only after the guard; it never reads a request cookie or header; it is created per call and never shared. The cookie client carries the publishable key and the member's own session, so RLS applies to anything it reads.
6. **Preview → TEST, Production → PROD.** The public values must point at the project the privileged identity resolved for the deployment context (`cookieClientConfig`), or the request is refused as unavailable: a Preview can never authenticate staff against PROD. The TEST tools refuse a PROD ref before any request.

## 4. The guard, in one table

| Facts established | Decision | What the member sees |
|---|---|---|
| Configuration, Auth or database unavailable | `unavailable` | "Not available right now" — never a pass |
| No user behind the cookies | `login` | redirected to `/admin/login` with a validated `next` |
| A user with no `staff_profiles` row (or a row of another user, or an unknown role) | `not_staff` | "No studio access" and a sign-out; the session is ended locally |
| An inactive row (revoked or disabled) | `revoked` | "Access revoked" and a sign-out — on the very next request |
| No verified TOTP factor | `enrol` | the enrolment page, and nothing else |
| A session below aal2 | `verify` | the verification page |
| A required area the role does not hold | `forbidden` | "Access restricted" (the final Admin's heading); nothing protected is read |
| Everything above satisfied | `allowed` | the page or the action, with the staff identity |

The table is a pure function with a unit test per row (`tests/unit/staff-access.test.ts`); the S1.2 acceptance denials (Operations and Customer support each denied the owner-only section and the finance route) are rows of it and real Preview routes (`tests/e2e/admin-access.*.spec.ts`).

## 5. Threats and controls

| Threat | Control | Evidence |
|---|---|---|
| Password guessing against a staff address | The Upstash throttle counts every attempt — 5 per address per 15 minutes, 20 per client address — before the password is checked, and fails **closed** (no names, no network, any error → the sign-in is refused with an honest notice). Addresses reach Redis as SHA-256 only. A password alone never yields a staff session (MFA). | `src/lib/server/login-throttle.ts`; `tests/unit/login-throttle.test.ts`; the Preview check at the limit (VS Code leg) |
| A stolen password | TOTP is mandatory; a session below aal2 reaches only the verification page; an account without a verified factor can only enrol — and only a staff account with a password session can enrol | the guard; `tests/unit/staff-access.test.ts`; `tests/e2e/auth.setup.ts` |
| A stolen session cookie | `httpOnly` + `secure` + `sameSite=lax`, path `/admin`; the Auth server is asked on every request; revocation denies on the next request and the Auth ban stops refresh | `STAFF_COOKIE_OPTIONS`; `revokeStaffAccess`; the revocation exercise on TEST |
| Open redirect through `next=` | `safeNextPath`: a same-origin path under `/admin` only — no scheme, host, `//`, backslash or control character; decoded once and re-checked; the sign-in pages themselves refused (no loop); fallback `/admin` | `tests/unit/next-path.test.ts`; `tests/e2e/admin-access.anon.spec.ts` |
| A role check only in the browser | None exists: every page and action calls the guard; the enrolment form is the only client component and imports the action alone; the import boundary keeps server modules and both Supabase packages out of client code | `eslint.config.mjs`; `tests/unit/import-boundary.test.ts` |
| Privilege escalation through a stale layout or a panel embedded in another screen | Pages, not layouts, call the guard; actions re-authorise on their own (the prototype's embedded panels did not — `PROJECT-STATUS.md` §10 #8) | every `src/app/admin/**/page.tsx`; `login/actions.ts` |
| A Preview authenticating against PROD | The public and privileged identities must agree on the project; mismatch → unavailable | `cookieClientConfig`; `src/lib/supabase/config.ts` |
| Public sign-up or self-registration | No sign-up call anywhere; the project setting off; users created only by the admin API in the TEST tool or by the owner | Gate 0 #11; `scripts/testing/staff-users.mjs` |
| Secrets in logs or records | No password, code, TOTP secret, QR, token or address is logged; failed sign-ins are audited by e-mail hash; the harness keeps TOTP secrets under the git-ignored `.auth/` | the actions; `staff-audit.ts`; `.gitignore` |
| Lost history of consequential actions | Sign-in, failed sign-in, MFA enrolment, role change, revocation and restoration write one insert-only `audit_log` row each (actor, action, entity, previous/next, reason) | `staff-audit.ts`; the 0002 record's append-only guards |
| The owner locked out (lost authenticator) | **Recovery route:** the human owner removes the lost TOTP factor in the Supabase dashboard (Authentication → Users → the user → Multi-factor → delete the factor) or, on TEST, runs `pnpm db:test:staff-users --apply --reset-mfa`; at the next sign-in the app forces a fresh enrolment and writes `staff.mfa_enrolled`; no code path skips MFA. A second owner account is not planned at launch (D-35), so the dashboard is the route. Exercised on TEST in the S1.2 VS Code leg and recorded in the sprint record. | this file; the 0003 change record → "Recovery route" |
| A revoked member's existing tab | The guard reads `active` on every request: the next click is denied; the Auth ban prevents a refresh | `decideAccess`; `revokeStaffAccess`; `tests/unit/staff-access.test.ts` |
| Enrolment abandoned half-way | `start` removes every unverified factor before enrolling a fresh one; an unverified factor never counts as MFA | `login/actions.ts` → `enrol` |
| The QR as an injection vector | The QR is a `data:image/svg+xml` from the Auth server rendered through `<img>` (CSP `img-src 'self' data:`), where SVG cannot run script; it is never inlined as markup | `security-headers.ts`; `enrol-form.tsx` |

## 6. Invariants every Admin merge keeps (checked by `/close`)

1. Every file under `src/app/admin/` that renders protected content or mutates calls `guardAdminPage` or `guardAction` before any read or write; the proxy decides nothing.
2. No route or action accepts a session below aal2 as a staff session; enrolment needs a staff password session and nothing else.
3. `src/lib/staff/permissions.ts` equals `public.staff_permission_areas()`; a route added to the Admin is added to `ADMIN_ROUTES` with the areas it requires, and nowhere else.
4. The privileged client is used only after the guard and never reads a request cookie or header; `@supabase/ssr` is imported by `src/lib/server/staff-session.ts` only; server-only names are read inside `src/lib/server/` only.
5. Every consequential staff action writes its audit row; nothing deletes or updates `audit_log`.
6. Revocation denies on the next request; the recovery route needs no code path that skips MFA.
7. Redirect targets come from `safeNextPath`; no new string is invented inline (docs/content/new-strings.md).
8. The TEST tools refuse a PROD ref before any request; no agent writes to PROD through any channel.

## 7. Out of scope at S1.2 (owned elsewhere)

Invitations, Disable / Enable and the staff directory (S2.1); an assignable finance permission (OI-10, S3.1); Turnstile on the staff sign-in (not at launch — `TECH-ARCHITECTURE.md` §7; S3.2 may revisit); Supabase Auth's own rate limits and SMTP (S1.8 — the owner's dashboard settings, `ENVIRONMENT-PARITY.md` §7.5); the PROD Auth settings and the first PROD staff user (S3.1 / S3.3); the Admin design (S1.9).

Next step → `/close` reads §4 and §6 against the diff of every Admin sprint; a new asset, actor or boundary is added here in the sprint that introduces it.
