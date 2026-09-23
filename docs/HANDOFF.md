# Handoff

How to hand Aalishaan Studio over to the Aalishaan Studio owner (or an incoming team) so they own everything,
nothing depends on you personally, and the site stays maintainable.

## 1. Accounts and access inventory

Fill this table first. Every row must end up owned by the client.

| Service | Account | Owner after handoff | How transferred |
|---|---|---|---|
| GitHub — `86400studio/aalishaan-studio-app` (app repository, D-02) | `86400studio` — a personal GitHub account that the owner states is their own (2026-09-23: "Its my own account and I'll keep it here and no need to transfer as I'm the owner"); public; created at S0.0 | the Aalishaan Studio owner (already the account holder) | No transfer planned (D-02). At handoff: confirm the collaborator list and remove any access that is no longer needed; `main` protection re-verified |
| GitHub — `86400studio/aalishaan-studio` (frozen prototype + GitHub Pages, D-PRE-15) | `86400studio` account (the owner's own — D-02) — exists (published prototype E8, commit `b24dce1b…`; its `/admin` still serves the superseded Admin A1 — D-36) | the Aalishaan Studio owner (already the account holder) | No transfer planned (D-02); stays frozen and published for side-by-side comparison (D-02); the app repo's D-07 binary reference points at its pinned commit |
| Hosting — Vercel / `aalishaan-studio-app` | Pending — sprint S0.1 (Gate 0: owned by the owner, or created by the delivery lead and transferred at handoff) | the Aalishaan Studio owner | Vercel project transfer / team invite flow; billing moved to the owner's payment method; Production env values (Sensitive) stay in place, `VERCEL_AUTOMATION_BYPASS_SECRET` rotated per §2 |
| Domain registrar — [DOMAIN] | TBD — decision D-04 (owner) | the Aalishaan Studio owner | Registrar's own transfer flow (domain = client property); DNS records added at S3.4 stay documented in `LAUNCH-CHECKLIST.md` Phase 2 |
| Database/auth — Supabase `aalishaan-studio-test` and `aalishaan-studio-prod` (D-05) | Pending — sprint S0.2 | the Aalishaan Studio owner | Transfer Supabase organisation/project ownership for both projects; delivery lead removed; `supabase-dev` MCP (Profile A, TEST only) disconnected; `SUPABASE_SECRET_KEY` rotated per §2 |
| Email provider (transactional + Supabase Auth SMTP) — TBD — decision D-06 (lean: Resend; owner account) | Pending — sprint S1.8 (owner-held account per D-06 / OI-09) | the Aalishaan Studio owner | Invite the owner as admin, remove yourself; sending domain = D-04 with SPF/DKIM/DMARC set at S3.3; `EMAIL_API_KEY` rotated per §2 |
| Payments — Razorpay (D-PRE-01) | Owner's account; Test Mode keys from S1.6, Live keys in Vercel Production only from S3.3 (OI-08, D-21) | the Aalishaan Studio owner | Owner-held account from the start; delivery lead's dashboard user removed; live key pair and `RAZORPAY_WEBHOOK_SECRET` rotated per §2 and the Production webhook re-registered |
| Delivery — Shiprocket (D-PRE-01) | Owner's account; test account from S2.9, Live in Vercel Production only from S3.3 (OI-08) | the Aalishaan Studio owner | Owner-held account from the start; delivery lead's user removed; API credentials and `SHIPROCKET_WEBHOOK_TOKEN` rotated per §2 |
| Error tracking — Sentry (D-23, installed at S0.1) | Pending — sprint S0.1 (Gate 0: owned by the owner, or created by the delivery lead and transferred at handoff) | the Aalishaan Studio owner | Transfer Sentry organisation ownership / invite the owner as owner and remove yourself; Production alert rule points at the owner; `SENTRY_AUTH_TOKEN` rotated per §2 |
| Rate limiting — Upstash Redis | Pending — the account exists by the S0.2 Gate 0 (TEST values in the Preview/Development scopes); first used in S1.2 (staff login throttling), public writes from S1.6; ownership is owner question 1 (`PROJECT-STATUS.md` §8) | the Aalishaan Studio owner | Transfer Upstash account/database ownership or invite the owner as admin and remove yourself; `UPSTASH_REDIS_REST_TOKEN` rotated per §2 |
| Bot protection — Cloudflare Turnstile | Pending — the account exists by the S0.2 Gate 0 (test keys in the Preview/Development scopes); first used in S1.6 (checkout; contact, newsletter and tracking lookup later); ownership is owner question 1 (`PROJECT-STATUS.md` §8) | the Aalishaan Studio owner | Cloudflare account held by the owner or widget re-created under the owner's account; `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` re-issued and redeployed |
| CI secrets — GitHub Actions secrets on `aalishaan-studio-app` (`PLAYWRIGHT_BASE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`; morning-check failure email) | Pending — sprint S0.2 (harness); morning check enabled at S3.4 | the Aalishaan Studio owner | Stay with the repository on the owner's own account (no transfer — D-02); values rotated and re-entered by the owner at handoff; failure email re-pointed at the owner's monitored mailbox |
| Analytics | N/A — no analytics or third-party scripts in V1 (D-12); primary metric = paid orders from the orders table | — | Nothing to transfer |

- [ ] Every service used by the site appears in the table — check env vars for ones you forgot.
- [ ] Each row states WHO owns it and HOW it was transferred or shared.

**Why this matters:** the most common post-handoff failure is a renewal or password owned by someone who left.

## 2. Credentials handling

- [ ] Never email or message passwords in plain text — use a password manager share or the provider's own invite/transfer flow.
- [ ] The client owns their accounts. You are removed, or downgraded to the minimum agreed role, at handoff.
- [ ] Rotate anything that was shared during the build: API keys, tokens, any password more than one person saw.
- [ ] After rotation, update the values in the host's env vars (and redeploy) — never in committed files.
- [ ] Confirm billing on every service points at the client's payment method, not yours.

**Never do this:**
- Never keep silent admin access "just in case" — access after handoff is agreed in writing or removed.
- Never hand over a key that was ever pasted into a chat without rotating it first.

## 3. Docs handoff — the repo docs pack IS the manual

There is no separate manual to write. Walk the client (or their next developer) through:

- [ ] `README.md` — what the project is, how to run it, where everything lives.
- [ ] `docs/PROJECT-STATUS.md` — the current state and the decision log (why things are the way they are).
- [ ] `docs/ROADMAP.md` — the post-launch backlog: what was deliberately deferred and where it's tracked.
- [ ] `docs/WORKFLOW.md` — how changes are made safely (their next developer starts here).
- [ ] **Predevelopment rationale** — for this project the approved package is the frozen prototype: walk the owner through the prototype repository `86400studio/aalishaan-studio` (already on the owner's own account — no transfer, D-02; commit `b24dce1bf498a5c8131694fef5fb1602139e1653`, E8) with its `docs/` (`PAGE-TRACKER.md`, `PROJECT-HISTORY.md`, `ADMIN-FINAL-FEATURES.md`, `DEVELOPMENT-HANDOFF.md`) and `docs/APPROVED-INPUTS.md` in this repository. That published commit still carries the superseded Admin A1: the final Admin (Admin A2 — 86400 UI edition, D-PRE-23 — the Admin design the build reproduces) lives **only** in this repository's `prototype/admin/` (prototype revision E10, with its own `README.md`, `QUICK-START.md`, `CAPABILITY-MAP.md`, `SECURITY-AND-STORAGE.md`, `TEST-RESULTS.md` and `CONTENTS-SHA256.txt`) until the owner decides to republish the prototype (D-36), so hand over this repository's `prototype/admin/` folder together with the prototype repository. Keep project decisions in `docs/PROJECT-STATUS.md`; preserve the reasoning behind scope, design, routes, copy, and wireframes.
- [ ] Env vars: `.env.example` lists every name; values live only in approved local/host secret stores and are never shown during the walkthrough.
- [ ] 30–60 minute walkthrough call: run the site locally, make a trivial change on a branch, open a PR, show the Preview.

## 4. Maintenance notes (leave these in writing)

- [ ] **How to request changes:** one change = one branch = one PR — even post-handoff, even for a typo.
      The workflow chain still applies: branch → build → local checks → PR → deployed Preview (Vercel or approved equivalent) → Codex review → merge → Production smoke test.
- [ ] **Dependency updates:** agree a cadence (e.g. monthly), always on a branch, always Preview-tested before merge.
- [ ] **When Production breaks:** who to call (name + channel), the host rollback action, the Git revert path, and database recovery limits in `docs/ROLLBACK.md`.
- [ ] **Monitoring & renewals:** who receives the uptime / primary-conversion / SSL / domain-expiry alerts, and what they do when one fires. Confirm the alerts point at a real, monitored person — a silent failure nobody is paged for is the same as no monitoring.
- [ ] **Content edits:** canonical source, editor roles, draft/review/publish flow, media ownership, redirects, and backup/export process. Approved launch copy changes deliberately, not ad hoc in components.
- [ ] **Locked facts/numbers:** hand over the list of exact claims the site makes so future edits keep them consistent.

## 5. Final checklist and sign-off

- [ ] All accounts transferred per §1; your access removed or downgraded as agreed.
- [ ] All shared credentials rotated per §2.
- [ ] Docs walkthrough completed; client knows where the manual lives.
- [ ] Maintenance notes delivered in writing.
- [ ] Open items from the backlog reviewed with the client — nothing surprising left.

**Sign-off**

| | Name | Date | Signature |
|---|---|---|---|
| Delivered by | | [DATE] | |
| Accepted by (the Aalishaan Studio owner) | | [DATE] | |

Next step → project closed. Future work re-enters through `docs/WORKFLOW.md`, one branch at a time.
