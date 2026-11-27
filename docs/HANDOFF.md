# Handoff

How to hand Aalishaan Studio over to the Aalishaan Studio owner (or an incoming team) so they own everything,
nothing depends on you personally, and the site stays maintainable.

## 1. Accounts and access inventory

Fill this table first. Every row must end up owned by the client.

| Service | Account | Owner after handoff | How transferred |
|---|---|---|---|
| GitHub — `86400studio/aalishaan-studio-app` (app repository, D-02) | `86400studio` — a personal GitHub account that the owner states is their own (2026-09-23: "Its my own account and I'll keep it here and no need to transfer as I'm the owner"); public; created at S0.0 | the Aalishaan Studio owner (already the account holder) | No transfer planned (D-02). At handoff: confirm the collaborator list and remove any access that is no longer needed; `main` protection re-verified |
| GitHub — `86400studio/aalishaan-studio` (frozen prototype + GitHub Pages, D-PRE-15) | `86400studio` account (the owner's own — D-02) — exists (published prototype E8, commit `b24dce1b…`; its `/admin` still serves the superseded Admin A1 — D-36) | the Aalishaan Studio owner (already the account holder) | No transfer planned (D-02); stays frozen and published for side-by-side comparison (D-02); the app repo's D-07 binary reference points at its pinned commit |
| Hosting — Vercel / `aalishaan-studio-app` | The owner's own Vercel account (owner, 2026-09-23) — Hobby during development, Pro before launch (`PROJECT-STATUS.md` §8c D-03); project `aalishaan-studio-app` created by the owner at S0.1 (2026-09-24, team scope `86400studios-projects`), Git-connected to `86400studio/aalishaan-studio-app`, Vercel Authentication on All Deployments, a Protection Bypass for Automation secret held by the owner | the Aalishaan Studio owner (already the account holder) | No transfer — owner-held from the start; billing already the owner's; any other member removed or reduced to the agreed role at handoff; Production env values (Sensitive) stay in place, `VERCEL_AUTOMATION_BYPASS_SECRET` and `CATALOGUE_REVALIDATION_SECRET` (S1.4 — the catalogue revalidation hook, in every scope that holds it) rotated per §2 |
| Domain registrar — [DOMAIN] | TBD — decision D-04 (owner) | the Aalishaan Studio owner | Registrar's own transfer flow (domain = client property); DNS records added at S3.4 stay documented in `LAUNCH-CHECKLIST.md` Phase 2 |
| Database/auth — Supabase `aalishaan-studio-test` and `aalishaan-studio-prod` (D-05) | The owner's own Supabase account (owner, 2026-09-23) — Free during development, Pro before S2.20 (`PROJECT-STATUS.md` §8c D-05); projects created by the owner at S0.2 (2026-09-25; refs recorded by name in `PROJECT-STATUS.md` §9; `0000_init` applied on TEST the same day and on PROD by the owner's CLI on 2026-09-27, before the S0.2 merge, verified read-only through `supabase-prod-readonly`); the weekly Free-plan health/pause check is the owner's (`PROJECT-STATUS.md` §9) | the Aalishaan Studio owner (already the account holder) | No transfer — owner-held; any other member removed at handoff; `supabase-dev` MCP (TEST) and the read-only `supabase-prod-readonly` (D-40) disconnected; `SUPABASE_SECRET_KEY` rotated per §2 |
| Email provider (transactional + Supabase Auth SMTP) — TBD — decision D-06 (lean: Resend; owner account) | Pending — sprint S1.8 (owner-held account per D-06 / OI-09) | the Aalishaan Studio owner | Invite the owner as admin, remove yourself; sending domain = D-04 with SPF/DKIM/DMARC set at S3.3; `EMAIL_API_KEY` rotated per §2 |
| Payments — Razorpay (D-PRE-01) | Owner's account — **opened by the owner on 2026-11-11 for Test Mode** (no KYC yet; the Test Mode key pair is in the Vercel Preview scope, names only — `PROJECT-STATUS.md` §9); the verified account and Live keys in Vercel Production only from S3.3 (OI-08, D-21). **S1.7 (2026-11-22):** capture mode is automatic capture (D-21, the owner); a **Test Mode webhook** set by the owner on 2026-11-23 — no alias: one Preview deployment's own `/api/webhooks/razorpay` with Vercel's bypass parameter (now the deployment of `ec4c00c`; §4 "The Test Mode webhook while the site is built"), the events `payment.authorized`, `payment.captured` and `payment.failed`, and a secret of its own entered as `RAZORPAY_WEBHOOK_SECRET` in the Vercel Preview scope (entered 2026-11-23; names only — `docs/sprint-prompts/S1.7-razorpay-verification.md` → H.10, H.11). *Before (2026-11-22):* the owner's to set, at the stable Preview alias's address, pending the S1.7 TEST plan (H.9) | the Aalishaan Studio owner | Owner-held account from the start; delivery lead's dashboard user removed; live key pair and `RAZORPAY_WEBHOOK_SECRET` rotated per §2 and the Production webhook re-registered |
| Delivery — Shiprocket (D-PRE-01) | Owner's account; test account from S2.9, Live in Vercel Production only from S3.3 (OI-08) | the Aalishaan Studio owner | Owner-held account from the start; delivery lead's user removed; API credentials and `SHIPROCKET_WEBHOOK_TOKEN` rotated per §2 |
| Error tracking — Sentry (D-23, installed at S0.1) | The owner's own Sentry account (owner, 2026-09-23); organisation `aalishaan-studio`, project `aalishaan-studio-app` created by the owner at S0.1 (2026-09-24); alert rules "Preview verification — S0.1" and "Production" notify the owner's member `86400studio`; the organisation auth token for source-map upload is held in Vercel only | the Aalishaan Studio owner (already the account holder) | No transfer — owner-held; any other member removed at handoff; Production alert rule points at the owner; `SENTRY_AUTH_TOKEN` rotated per §2 |
| Rate limiting — Upstash Redis | Exists (S0.2 Gate 0, owner-confirmed 2026-09-25: the TEST database's URL and token are in the Preview/Development scopes — names only, `ENVIRONMENT-PARITY.md` §12 P12; no code reads them yet); first used in S1.2 (staff login throttling), public writes from S1.6; the owner's own account (owner, 2026-09-23) | the Aalishaan Studio owner (already the account holder) | No transfer — owner-held; any other member removed at handoff; `UPSTASH_REDIS_REST_TOKEN` rotated per §2 |
| Bot protection — Cloudflare Turnstile | Exists (S0.2 Gate 0, owner-confirmed 2026-09-25: the test site key and secret are in the Preview/Development scopes — names only, `ENVIRONMENT-PARITY.md` §12 P12; no code reads them yet); first used in S1.6 (checkout; contact, newsletter and tracking lookup later); the owner's own Cloudflare account (owner, 2026-09-23) | the Aalishaan Studio owner (already the account holder) | No transfer — owner-held; `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` re-issued and redeployed |
| CI secrets — GitHub Actions secrets on `aalishaan-studio-app` (`PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_CANDIDATE_SHA`, `VERCEL_AUTOMATION_BYPASS_SECRET`; `S0_2_PROOF_TOKEN` only in the owner's trusted proof process until S1.1 revokes it; morning-check failure email) | Pending — S0.2 built the harness (PR #6, merged 2026-09-27) but no Actions secret exists yet: real integration and the proofs run in the owner's trusted local process, a credentialed CI is a separately reviewed design; morning check enabled at S3.4 | the Aalishaan Studio owner | Stay with the repository on the owner's own account (no transfer — D-02); values rotated and re-entered by the owner at handoff; failure email re-pointed at the owner's monitored mailbox |
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
- [ ] **A payment that was made but is not confirmed (S1.7, D-68):** only Razorpay's signed `payment.captured` event confirms an order. Razorpay retries failed deliveries for 24 hours; if they keep failing for 24 hours it disables the webhook and says so to the webhook's **Alert Email Address** (without one, to the address under the Dashboard's settings), so that mailbox must be watched by the person named in this item. Repair the endpoint and re-enable it if Razorpay disabled it. Keep the webhook secret — and a deployment built with it — unchanged until any replay has landed: a replayed event is validated with the secret in force when it occurred. If the signed event is still missing, request that specific event through Dashboard → Help → Have a query? → Technical Support → Issue regarding Webhooks/API. Give the payment id — the `external_ref` of the order's `payment.return.verified` or `payment.hold.*` audit row — and the event id where the Dashboard's webhook log shows it. The webhook must have been enabled when the event occurred, the event must be at most 15 days old and the original signature must validate; there is no bulk replay. See the [Razorpay webhook FAQ](https://razorpay.com/docs/webhooks/faqs/). Outside that window no replay is possible: the order stays held or under review, and the person named in this item resolves it (the Admin's review queue is S2.2, refunds S2.4). A replay stored after the order's deadline does not confirm the order: it becomes a review a person resolves (`review:late_capture` — D-20; D-69 kept as built). Nobody marks an order paid by hand, and nothing is refunded automatically. Write down who does this and how they are told.
- [ ] **The Test Mode webhook while the site is built (S1.7, 2026-11-23):** Razorpay's Test Mode webhook names one Preview deployment's own address, with Vercel's bypass parameter (a copy of its value sits in Razorpay's dashboard — D-17 — never in the records; when the bypass secret is rotated (§2) this URL is updated or the webhook deleted). A Vercel deployment keeps the settings it was built with, so after any change of the Preview's Razorpay values the webhook must name a deployment built after the change; before a candidate's payment proof it is pointed at that candidate's deployment, and it is switched off before any `pnpm test` run on TEST (`PROJECT-STATUS.md` §5 #53 — one recorded exception: S1.7's `0007` TEST run, while a delivery of the lost-webhook proof was still awaited, D-73 (c)). At S3.3 the Live Mode webhook names the Production domain instead, with its own secret.

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
