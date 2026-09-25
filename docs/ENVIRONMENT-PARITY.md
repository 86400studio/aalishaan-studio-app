# ENVIRONMENT-PARITY.md — Safe Preview Testing That Reflects Production

Copy to `docs/ENVIRONMENT-PARITY.md` at the Setup Gate. Fill only what the project uses.
This document owns environment assignments, differences and proof records. `TECH-ARCHITECTURE.md`
owns the chosen stack and variable names; `PROJECT-STATUS.md` owns progress and decisions.
The existing workflow, secret-handling rules and production access restrictions still apply.

## 0. In plain English — for the owner

**Keep test activity away from customers, while making the test site behave like the live site.**
The code should match; databases, payment modes and delivery destinations should be safely separated.
A dashboard setting is **configured**. A dated check showing the expected result is **verified**.
A green Preview reduces risk; the launch-day checks still matter.

For a simple site, check its pages, forms and destinations. Add database, login and payment checks only
when those features exist. Do not create extra services just to fill this template.

**Existing working sites:** keep their architecture and environments. Inventory and verify them first;
fix demonstrated gaps through normal focused PRs. This file does not require rebuilding a site.

## 1. The two rules

1. **Isolation:** Local/Preview tests must not access customer data, write to production databases,
   charge real money, or send messages to customers.
2. **Fidelity:** use the candidate code and the same relevant schema, access rules, feature settings
   and provider contracts. Record intentional differences and how each will be checked.

A configured split is not permission to run an unrestricted test suite. First verify the target,
then run bounded proof checks, then the full suite (§12).

### 1.1 Evidence vocabulary

| State | Meaning |
|---|---|
| Not Started / Pending | Required work or proof has not happened; name the owning sprint |
| Configured | Settings inspected; behavior not yet demonstrated |
| PASS / Verified | Dated evidence demonstrates this specific claim |
| FAIL | Observed mismatch; record the smallest fix |
| Blocked | A named prerequisite prevents the check |
| PARTIAL | Some evidence is missing; not PASS |
| Stale | Relevant code or configuration changed after the proof |
| N/A | Feature/control does not apply, with a reason; never disguises a missing required check |

Accepted risks live in `PROJECT-STATUS.md` §8, with an owner and compensating control. They cannot
waive the system's production database, payment, secret-handling or merge-blocking boundaries.

### 1.2 Never a secret value

Follow `ENV-VARS-SAFETY.md`. Record variable names, value classes (such as “TEST database URL”),
public hosts/project refs and redacted evidence. Never record keys, passwords, private connection
strings, session tokens or URLs containing bypass/reset tokens. Agents do not open live env files.
Owners enter values directly in approved local/host/CI secret stores.

## 2. Scope and companion rules

| Concern | Existing authority |
|---|---|
| Secrets, environment changes and redeployment | `ENV-VARS-SAFETY.md` |
| Selected stack, variable names and integrations | `TECH-ARCHITECTURE.md` §§2, 6–7 |
| Vercel/Supabase setup, when selected | `SUPABASE-VERCEL-SETUP.md` |
| Agent access to databases | `SUPABASE-MCP-SAFETY.md` |
| Migration delivery and recovery | `WORKFLOW.md`; `templates/SUPABASE-CHANGE-TEMPLATE.md` |
| Security and allowed/denied states | `SECURITY-CHECKLIST.md`; `QA-CHECKLIST.md` |
| Full-suite and daily testing | `testing-setup/TESTING-GUIDE.md`; `testing-setup/templates/MORNING-CHECK-TEMPLATE.md` |

**Project scope:** DATABASE (Supabase Postgres — separate TEST and PROD projects) · AUTH (Supabase Auth — staff only, MFA; no customer accounts in V1) · PAYMENTS (Razorpay test/live modes + webhooks) · EMAIL (transactional provider — open decision D-06 in `PROJECT-STATUS.md`) · FORMS (checkout, contact, newsletter, order-tracking lookup, the S2.21 waiting-list join) · STORAGE (Supabase Storage — private print masters and evidence; public catalogue images) · OTHER (Shiprocket test/live + webhooks; Upstash rate limiting; Cloudflare Turnstile; Sentry; Vercel Cron worker for the pending-work queue).
Mark unused rows/sections N/A with reasons; retain section and proof IDs so references remain useful.
Do not fill future release/merge evidence at setup: leave it Pending with the owning stage.

## 3. Infrastructure facts — actual and intended

Record facts from approved configuration evidence; do not assume a service is already configured.

| Fact | Current state / evidence date |
|---|---|
| Project and approved architecture | Aalishaan Studio; `TECH-ARCHITECTURE.md` (D-01 lean confirmed 2026-09-23 at kickoff sprint S0.0; locked when the S0.0 PR merges) |
| Actual production origin | https://aalishaan-studio-app.vercel.app — the Vercel production domain, protected (All Deployments), noindex holding page; first app deployment 2026-09-24 from `main` @ `d416bfb` (S0.1). The canonical domain is D-04 (S3.3/S3.4) |
| Intended domain and canonical host | TBD — open decision D-04 (owner confirms the production domain; the approved copy uses the `aalishaanstudio.com` mail domain); pending DNS |
| Hosting project and production branch | Vercel / `aalishaan-studio-app` — imported by the owner 2026-09-24 (team scope `86400studios-projects`), Git-connected; branch `claude/s0.1-setup-scaffold` pushed, PR #3; Production built from `main` @ `d416bfb` on 2026-09-24 (the earlier `ce41b34` builds had no app); Git root `.` (the repository root — no Root Directory), production branch `main`, Node 24.x from `engines`, pnpm 10.34.5 from `packageManager` |
| Preview hosts and protection | Per-deployment URLs `aalishaan-studio-<hash>-86400studios-projects.vercel.app` (tested: `aalishaan-studio-85syt0e53-…`, §12 P10). Selected policy (S0.1, 2026-09-24): Vercel Authentication with the **All Deployments** scope, included on Hobby since 2026-09-09 (vercel.com/changelog/protect-production-deployments-for-free-on-every-plan), so Preview and Production are both protected; Protection Bypass for Automation (also included on Hobby) for header probes. A new project starts on Standard Protection, which leaves production domains public — the owner switches it. All Deployments is evidenced by the owner's screenshot of Settings → Deployment Protection (2026-09-24; a Preview's `302` alone could not show it), with Protected Sourcemaps enabled — §12 P10 |
| Database/auth TEST and PROD | Pending owner creation (S0.2 In Progress, 2026-09-25) — `aalishaan-studio-test` (Local/Preview) / `aalishaan-studio-prod` (Production); public refs recorded in `PROJECT-STATUS.md` §9 when created. The code is wired for the split: Preview, Development and a local process resolve to the TEST ref, Production to the PROD ref, and every privileged path fails closed on a mismatch or on equal refs (`src/lib/supabase/config.ts`); the baseline `0000_init` is drafted and unapplied; Auth is not configured (staff auth is S1.2) |
| Payment testing environment and live account | Razorpay Test Mode (local/Preview) / Razorpay Live Mode (Production only) — Pending (S1.6/S1.7; live at S3.3) |
| Sandbox/live webhook destinations and API versions | Pending — `/api/webhooks/razorpay` and `/api/webhooks/shiprocket` on the candidate Preview (sandbox) and on Production (live); API versions recorded at S1.7 (Razorpay) and S2.10 (Shiprocket) |
| Email, forms, storage and other write destinations | Pending — email: isolated test inbox/sending domain for local/Preview vs live sending domain for Production; storage: TEST vs PROD Supabase buckets; forms write only to the TEST database from Preview |
| Shared provider account used by other sites? | TBD — not asked at S0.1; asked before each account's first use (`PROJECT-STATUS.md` §8c D-21, owner question 4) whether the Razorpay, Shiprocket and email accounts are shared with other sites |
| Stable callback URL, if needed | Pending — decided at S1.7 (lean: a controlled Preview alias serving the candidate commit for sandbox webhooks); tested commit tracked per run (§7.11) |

Never delete or reconfigure another site's products, webhooks, audiences or resources on a shared account.

## 4. Environment matrix — names and classes only

Inventory environment reads in application code, build/framework configuration, hosting overrides and
CI/test configuration. Match application names to `TECH-ARCHITECTURE.md` §6. These rows are this project's actual names (`TECH-ARCHITECTURE.md` §6 is authoritative; `PROJECT-STATUS.md` §9 mirrors it).

| Name / purpose | Visibility | Local | Preview | Production |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | TEST URL | TEST URL | PROD URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public/publishable | TEST key | TEST key | PROD key |
| `SUPABASE_SECRET_KEY` (server only: webhooks, worker, exports) | Server-only | TEST secret | TEST secret | PROD secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Public key id / server-only secret | Test mode | Test mode | Live mode |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only | Local listener secret | Sandbox endpoint secret | Live endpoint secret |
| Prices | N/A — amounts are computed server-side from the catalogue tables (no provider price IDs) | — | — | — |
| `SHIPROCKET_API_EMAIL` / `SHIPROCKET_API_PASSWORD` / `SHIPROCKET_WEBHOOK_TOKEN` | Server-only | Test account | Test account | Live account |
| `EMAIL_API_KEY` / `EMAIL_FROM_ADDRESS` (names finalised with the provider — D-06) | Server-only | Isolated test destination | Isolated test destination | Live sending domain |
| Form endpoints | N/A — forms post to this app's own server actions/routes, which write to the environment's database | — | — | — |
| `NEXT_PUBLIC_SITE_URL` | Public | Local origin | Validated Preview origin or proven fallback | Canonical production origin |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Server-only / Public | Test keys | Test keys | Live keys |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Server-only | TEST database | TEST database | PROD database |
| `CRON_SECRET` | Server-only | Local value | Preview value | Production value |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Server / Public / build-only | One project, env `development` (DSN optional; no `SENTRY_AUTH_TOKEN`) | One project, env `preview` | One project, env `production` |
| `SENTRY_ORG` / `SENTRY_PROJECT` (S0.1) | Build-only, not secret | — | Sentry slugs (for the source-map upload) | Sentry slugs |
| ~~`SENTRY_TEST_TOKEN`~~ (S0.1, temporary — **retired at S0.2, 2026-09-25**: the route, helper and tests are removed; the owner reports both Vercel entries deleted) | — | — | — | — |
| `SUPABASE_TEST_PROJECT_REF` / `SUPABASE_PROD_PROJECT_REF` (S0.2; non-secret identifiers — the trusted guard input, never derived from a URL or a key) | Server-only configuration | Both refs | Both refs | Both refs |
| `S0_2_PROOF_TOKEN` (S0.2; the Preview-only proof route `POST /api/setup-proof`) | Server-only | In the owner's trusted proof process only (the app never reads it locally) | Preview value | **absent** (the route denies everything outside a Preview anyway) |
| Sentry environment tag | Derived from `VERCEL_ENV` (server at runtime; browser inlined at build by `next.config.ts`) — never `NODE_ENV` | `development` | `preview` | `production` |
| `SALES_MODE` | Server-only config (`off` / `test` / `live`) | `test` (or `off`) | `test` from S1.6 | `off` until S3.4, then `live` |
| `PLAYWRIGHT_BASE_URL` (S0.2: no fallback; the immutable Preview deployment origin, matched with `PLAYWRIGHT_CANDIDATE_SHA` against the GitHub deployment record before any request; never the Production domain or a branch alias) | CI variable / local shell | Local loopback origin (`PLAYWRIGHT_TARGET_MODE=local` — never Preview evidence) | Validated Preview origin | Production only for the morning check (S3.4; no production mode exists at S0.2) |
| `PLAYWRIGHT_CANDIDATE_SHA` (S0.2) | CI variable / local shell — non-secret | — | The full candidate SHA | The merge SHA (S3.4) |
| `PLAYWRIGHT_TARGET_MODE` (S0.2; `preview` default or `local`) | Local shell — non-secret | `local` | `preview` | — |
| `GITHUB_TOKEN` (S0.2; optional, read-only — only raises the GitHub API rate limit for the deployment-evidence read of this public repository) | Local shell or GitHub Actions' own token — never a Vercel variable of this app | — | optional | optional (the S3.4 morning check) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | GitHub Actions secret / local shell or the owner's git-ignored `.env.local` only — sent only to the validated Preview origin | — | Preview bypass | Production bypass only while Deployment Protection is on (D-03) |

Database URL and keys must belong to the same project. Test/live payment keys, prices and signing
secrets must belong to their matching mode and endpoint. Match price currency, amount and recurring
vs one-time shape; IDs differ by design.

**Site URL:** never require it to be unset universally. Inspect its callers. Leaving it unset in Preview
is safe only when all relevant paths have a verified Preview-aware fallback. Validate request-derived
origins against trusted hosts; never trust arbitrary `Host`/`X-Forwarded-Host` headers. Auth and checkout
must return to the correct environment. Record the intended Preview metadata/noindex policy separately.

**Harness inventory:** `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_CANDIDATE_SHA` and `PLAYWRIGHT_TARGET_MODE` (GitHub Actions variables / local shell), `VERCEL_AUTOMATION_BYPASS_SECRET` (GitHub Actions secret / local shell or the owner's `.env.local` only; sent once to the exact validated Preview origin to obtain the host-scoped bypass cookie, and on direct HTTP checks only to that origin with redirects never followed — always through Node `fetch`, never Playwright's request context), `GITHUB_TOKEN` (optional, read-only; only raises the GitHub API rate limit for the deployment-evidence read), `S0_2_PROOF_TOKEN` (the owner's trusted proof process only, until S1.1 removes the route), the TEST Supabase names for `pnpm test:integration` and the proofs (the owner's local `.env.local`, loaded by every harness command including preview-mode Playwright, the shell winning — values never printed); later: TEST staff fixture credentials for the Playwright auth-setup project (S1.2; GitHub Actions secrets; never in the repo), `CRON_SECRET` for triggering the worker on Preview (S1.8). At S0.2 no GitHub Actions secret exists: real integration and the proofs run in the owner's trusted local process (§10), the Code Check stays uncredentialed, and a credentialed CI would be its own reviewed design.
Use only the storage required by the provider; no server secret becomes public. A names-only listing
proves scopes, not that a value belongs to TEST — the owner checks provenance and §12 checks behavior.

**Per dependency status:** Supabase TEST/PROD — In Progress (S0.2, 2026-09-25: clients, baseline and harness ready on the branch; the owner's projects and values pending; proofs P1, P2, P8, P8b and P11 Blocked on them, P12 Pending — §12) · Vercel Preview/Production — Preview verified 2026-09-24 (§12 P10 Preview half, P12), Production built from `main` and smoke-tested (protected) 2026-09-24; public half at launch · Razorpay sandbox/live — Pending (S1.6/S1.7; P4–P6, C1, C2, C15, C16; live at S3.3) · Shiprocket test/live — Pending (S2.9/S2.10; P6; live at S3.3) · Transactional email — Pending (S1.8; P7, C7) · Turnstile/Upstash — Pending (S1.6 checkout, S1.9 track, S2.12 newsletter, S2.13 contact, S2.21 waiting-list join; C10) · Sentry — Preview event and alert verified 2026-09-24 (issue `AALISHAAN-STUDIO-APP-4`), Production event and alert verified 2026-09-24 (`AALISHAAN-STUDIO-APP-5`) (S0.1; **D-23: this record ratifies installing Sentry at S0.1 instead of the error-tracking module's before-launch timing; confirmed 2026-09-23 at S0.0**). No proof is prefilled as PASS.

## 5. Findings — only when observed

Typical failures: Preview points to live data; a required integration is absent; production canonical
URLs point to localhost; an endpoint is hardcoded to a live destination; callback code is stale.
These are inspection prompts, not claims that the current project has these bugs.

Record a verified issue using `AGENTS.md` severities: **Blocking** or **Should-fix**, with location,
failure scenario, minimal fix and evidence. Track configured and behavior-verified completion separately.
Inventory latent writes too: adding a missing secret may enable a previously inactive live write.

## 6. Setup sequence — safe order

Owners manage real values. Agents prepare names, instructions and verification without reading secrets.

### Phase A — Establish isolated data destinations

- [ ] Identify existing TEST/PROD resources, or create only the required missing TEST resources.
- [ ] Prepare the test schema from reviewed migrations (§7.1); use synthetic data only.
- [ ] Scope database/auth entries correctly; remove live credentials from Local/Preview.
- [ ] Redeploy affected Previews. Complete §12 preflight and P1 before enabling privileged callbacks.

### Phase B — Payments, if used

- [ ] Use the provider's supported sandbox/test mode. Mirror the used prices, coupons and payment methods.
- [ ] Point sandbox webhooks at the candidate deployment (§7.11), with matching event/API contracts.
- [ ] Set test-mode credentials and endpoint-specific signing secrets only after database isolation is verified.
- [ ] Keep live endpoints on Production. Do not create real-card transactions for testing (§8 C1).

### Phase C — Email, forms and other writes

- [ ] Configure test audiences/inboxes/endpoints/storage and required fields/tags. Check secondary effects:
      CRM writes, notifications, automations and billing. A shared account does not make a shared key harmless.
- [ ] If a dependency cannot be isolated, use the restricted manual procedure in §9; automated writes stay blocked.

### Phase D — URLs and access

- [ ] Set environment origins according to their actual callers (§4), and auth settings per §7.6.
- [ ] Where Preview protection is enabled, configure the sanctioned bypass; retain application authentication.
- [ ] Record platform and CI secret locations by name; avoid placing secrets in URLs except where the
      provider requires it, and redact those URLs from all evidence.

### Phase E — Verify what exists

- [ ] Redeploy after environment changes; earlier deployments retain earlier settings.
- [ ] Run the applicable bounded proofs in §12. Setup can finish with future feature proofs Pending;
      their implementing sprint must complete them before testing that feature or enabling its writes.

## 7. Fidelity — keep the useful behavior equivalent

### 7.1 Schema source: migrations first

For new projects, use reviewed versioned migrations as the baseline. For existing projects, compare
those migrations with the actual schema. Only when the baseline is missing or has drifted, capture a
schema-only definition through an authorized read-only channel. Production MCP stays disconnected
unless its existing exception procedure is satisfied; the owner can supply redacted schema evidence.

Inspect captured SQL for embedded secrets, personal data and environment-specific URLs before committing.
Record it as an existing baseline under the selected migration tool's procedure; do not blindly replay
it on Production or generate a destructive down-file to drop existing production tables. Apply only to
TEST with required authorization. Never copy customer rows or auth password hashes to seed a test project.

### 7.2 Schema and access contracts

Compare columns, nullability, keys, constraints, indexes, grants, RLS, policies and relationships the
actual code depends on. A unique `(user, product)` constraint is required only if that application's
upsert depends on it; tier inheritance and cancellation rules come from approved requirements.
Test both authorized access and denial, including cross-user reads/writes.

### 7.3 Existing hand-run SQL

Compare it with the recorded production baseline before adopting it as a migration. Preserve observed
behavior; findings that require a schema change get their own reviewed migration. Do not silently add
indexes, change policies or rewrite existing migration history during documentation work.

### 7.4 Hidden database behavior

Compare triggers, functions, extensions, storage policies and jobs. Check external side effects before
running captured definitions in TEST: a database trigger may still call a live service.

### 7.5 Auth settings

Record both environments for confirmation requirements, enabled sign-in methods, password rules,
session/refresh expiry, email templates, SMTP, captcha and rate limits. Match relevant behavior;
document unavoidable differences and compensating checks. Unknown settings are PARTIAL, not PASS.
Screenshots must be checked for credentials, SMTP secrets, tokens and personal data before sharing.

### 7.6 Auth origins and redirects

| Setting | TEST | PROD |
|---|---|---|
| Site URL | Stable test origin; localhost only for an intentionally local flow | Actual canonical production origin |
| Allowed callbacks | Localhost and narrowly scoped project Preview hosts/paths | Exact approved production callback URLs |
| Excluded | Production hosts | Localhost and Preview hosts |

Verify delivered signup/reset links resolve to a working page in the intended environment. A correct
host with a 404 is only partial evidence. Preserve an old controlled callback temporarily only when
needed for existing links; record when it will be removed. Recheck after a domain move.
Supabase supports scoped Preview wildcards and recommends exact production paths; see its
[redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls).

### 7.7 Application redirect safety

The provider allow-list does not validate the application's own `next`/return path. Validate parsed
origins and allowed paths, including `//evil.example`, backslashes and encoded variants. Exercise
negative cases on TEST. Environment-independent bugs can and should be caught by focused tests.

### 7.8 Email/form contracts

Read the provider's actual field identifiers, types, tags and automation triggers; compare them with
payloads the code sends. A settings screenshot proves configuration, not delivery. Verify each used
field and final destination with a controlled test, including error handling when delivery fails.

### 7.9 Fixtures

Create TEST fixtures through supported provider/admin APIs or the approved seed mechanism. Include
only actual roles/states: anonymous, signed-in without permission, authorized, revoked/expired and
other relevant edge cases. Establish at least one paid state through sandbox checkout when used.
Use owner-controlled test inboxes for anything that sends mail. Passwords stay in secret stores;
record fixture labels and cleanup results. Production negative controls are read-only and scoped to
those test identities, not unrelated customer records.

### 7.10 Migration parity over time

Follow the selected migration process: versioned changes with access controls and recovery plan →
TEST apply/role verification → owner approval → human Production apply. Record both environments.

Compare schema/policies before the full Launch Gate and after relevant changes. A pending reviewed
migration may intentionally make TEST ahead of Production during its PR: record the exact expected
difference, backward compatibility and deployment order. Unexpected drift blocks affected tests/release;
never require a new migration in Production merely to permit its pre-merge Preview test.

### 7.11 Webhooks must exercise the candidate commit

Use an endpoint on the candidate Preview, or a controlled stable alias that serves **the same candidate
commit**. Record and verify both the browser deployment SHA and callback deployment SHA before payment
proofs. An alias that only mirrors `main` does not test a PR's changed webhook handler.

No permanent extra branch is required. Use the host's supported deployment/alias procedure; serialize
runs that share an alias or webhook endpoint so another run cannot move it mid-test. Verify reachability
and deployment metadata, not only HTTP status. Restore any temporary endpoint assignment after the run.
Live webhook destinations stay on Production. No branch-protection or review exception is introduced.
[Vercel documents deployment and branch URLs here](https://vercel.com/docs/deployments/generated-urls).

## 8. Intentional differences and compensating checks

Keep only applicable rows; record evidence or a named launch action for each.

| ID | Difference / gap | Check |
|---|---|---|
| C1 | Payment sandbox vs live | Razorpay Test Mode on Preview: success, failure, dismissed checkout, authorised-only and refund paths with Razorpay's documented test instruments; owner verifies live account readiness (capture mode D-21, webhook secret, settlement configuration — OI-08). Live-mode verification follows Razorpay's permitted procedure only (an owner-approved small real order and refund at S3.3); never manufacture live purchases as tests. Monitor genuine orders after launch. |
| C2 | Callback URL differs | Match browser and webhook candidate commits (§7.11); verify the persisted business result. |
| C3 | Preview deployment protection | Use a sanctioned bypass restricted to the validated origin. Verify the app receives the request and that the unbypassed response matches the configured protection. Test public Production pages without bypass. |
| C4 | Regions/latency | Record representative timings and investigate failures; justify timeout budgets against expected service behavior, without hiding defects. |
| C5 | Service plans/quotas | Health preflight; document compute, pause, email and rate-limit differences. Do not assume every free tier behaves identically. |
| C6 | Domains/cookies | Owner verifies live-domain sign-in/out, refresh and reset at launch and after a domain move. |
| C7 | Email deliverability | Test/capture inboxes for automated flows; owner checks real-domain delivery and spam placement at launch. Admin-generated links alone do not prove email delivery. |
| C8 | Marketing automations | Match fields/tags and observe the relevant journey in an isolated destination; otherwise §9. |
| C9 | Hardcoded live form destination | Isolate it before automated submission, or use §9's controlled manual check; never assume only an inbox is affected. |
| C10 | Bot/abuse controls | Verify allowed and rejected states in TEST, and missing/failed-verification server paths. Owner checks live widget configuration; do not load-test Production. |
| C11 | Build-time values | Redeploy; inspect served URLs and behavior under the recorded per-environment metadata policy. |
| C12 | Data shape/volume | Synthetic edge-case fixtures; relevant authorized read-only production diagnostics if needed. |
| C13 | Runtime/build settings | Match framework/runtime versions and relevant build flags; use the selected supported version from the architecture. |
| C14 | Zero-cost checkout / renewals | N/A — no discounts, zero-cost flows or subscriptions exist in V1 (D-PRE-09); every Test Mode purchase is a non-zero A2 print. |
| C15 | Live payment-account readiness | Owner checks enabled charges/payouts as applicable, outstanding provider requirements, payout destination and business settings; recheck after account changes. |
| C16 | Live webhook settings | Owner checks this site's Razorpay and Shiprocket webhook URLs, subscribed events (payment captured/failed, refund processed/failed; shipment status events) and signing secrets against the handlers at S3.3; verify alerts for failed delivery. No subscription events exist. |

Provider references: [Razorpay Orders](https://razorpay.com/docs/payments/orders/), [Razorpay webhooks](https://razorpay.com/docs/webhooks/), [Shiprocket developers](https://www.shiprocket.in/developers/),
[Vercel automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
Consult the selected provider's current documentation when implementing its configuration.

## 9. A dependency that cannot be isolated

This is a **manual exception for an email/form delivery check**, not permission for a full suite to use
live services. It never permits live database credentials, real payment tests, customer recipients or
campaign sends from Preview. Automated write tests remain blocked until an isolated destination exists.

Record the exact destination, all downstream effects, owner, test marker and cleanup procedure in
`PROJECT-STATUS.md` §8. The owner may perform a bounded delivery check using only their own inbox and
synthetic content, when already authorized. Record and complete cleanup. Mark that feature MANUAL in
the approved feature list; its result requires human evidence. Never label the dependency isolated,
never include this check in daily automation, and revisit the decision when the provider/flow changes.

## 10. Harness and evidence safety

- Keep existing local typecheck, lint, build, unit tests and safe browser QA. CI is preferred for
  credentialed end-to-end proofs; authorized local test execution may use existing secret stores
  without an agent reading or printing values. No CI-only rewrite is required.
- Resolve the candidate commit to its deployment; verify project, environment and SHA through hosting
  metadata. A hostname pattern alone does not prove Preview. Refuse unknown/live targets for full suites.
- Before any write, validate all destinations and key provenance. Use origin allow-lists and scoped
  credentials. A staging hostname is not enough if its database, email or webhook still points live.
- Send bypass headers only to the exact validated Preview origin, including direct HTTP requests.
  Do not use a context-wide secret header that leaks to third-party requests. Keep deployment protection
  separate from application auth. Vercel supports a bypass query parameter for callback senders that
  cannot set headers; the owner configures it privately and evidence must redact it.
- Disable traces, snapshots, screenshots and report attachments on secret-bearing flows unless proven
  redacted. Do not upload raw HTML reports that expose typed credentials. Keep auth state gitignored;
  publish sanitized results only. Never log process environments or reset/bypass URLs.
- Fixture writes use TEST only, with cleanup and a run record. Serialize shared accounts/aliases/resources.
  Record residual fixture data and remove it before it can affect another result.
- Missing required credentials, zero selected tests, silently omitted projects and skipped required
  assertions must fail the gate. A test that exits early because a product is already owned has not
  tested a new checkout. Never count that as a payment PASS.
- Use bounded waits and record retries/flaky outcomes; a retry must not conceal a reproducible defect.
- Preserve the owner-approved morning check: public reads plus a dedicated least-privilege production
  test-account login when needed. That login creates session/audit activity, so it is not literally
  read-only. Permit only its scoped account credentials; no bypass, service-role/payment/admin secrets,
  signup, purchase, form delivery or mutation suites. Validate its separate target and test selection.
- Failure email alone does not prove a scheduled run occurred. Verify a recent successful run and the
  notification channel; monitor missed runs where uptime is required. A no-submit form check does not
  prove delivery or payment processing; provider alerts/manual checks cover those outcomes.

## 11. What green Preview cannot guarantee

The suite proves only the scenarios it actually exercised at the recorded commit. It cannot fully prove
live credentials, domain/cookie settings, real email delivery, provider-account readiness or customer
traffic. Use the existing `LAUNCH-CHECKLIST.md` for live-domain checks, provider readiness and monitoring.

Payment assertions must verify the expected persisted business result (order/access record) and what
the user can actually access. A redirect, success banner or HTTP 200 alone is insufficient. A failed
webhook write must not be acknowledged as successful; test retry/idempotency behavior. For subscriptions,
test the approved failed-payment, renewal and cancellation policy. These are checks for possible defects,
not claims that any existing website is broken.

Live smoke checks are owner actions using controlled data and the provider's permitted procedures.
Do not manufacture live purchases as tests. Observe genuine orders and renewals through provider alerts
and recorded follow-up. The morning check covers only its selected safe paths, not every delivery/payment.

## 12. Verification — preflight, bounded proofs, then full suite

**Preflight before any external write:** confirm the candidate deployment/project/environment/SHA,
TEST database/auth assignments, sandbox payment mode, callback target, and isolated delivery destinations
that the proposed check can touch. Owner verification of key provenance is required; a names-only listing
is insufficient. If a destination is unknown, block that write. Do not “test the split” by writing blindly.

**No circular gate:** local checks and non-writing configuration probes can run first. The small,
explicitly scoped proof checks below establish safety for the full suite; they do not require that same
full suite to have passed. Setup proofs are not product acceptance tests or a substitute for the approved
feature list. Production-only checks belong to launch, not the prerequisites for a safe Preview run.

| ID | Applicable proof | PASS evidence |
|---|---|---|
| P1 | TEST wiring (database/auth) | Runtime project provenance checked for both public and privileged clients; TEST-only fixture sign-in when auth exists, or equivalent scoped TEST read for database-only sites. Sign-in alone cannot prove the server secret's project. |
| P2 | Signup/write destination | After preflight, a bounded synthetic signup or relevant data write lands only in TEST; authorized read-only PROD check finds no matching test identity/record. |
| P3 | Preview auth return | Signup/reset email resolves to the intended Preview and the page works. Redact tokens. |
| P4 | Payment mode | After preflight, sandbox checkout appears only in test mode; no matching live event. |
| P5 | Paid outcome | After P4, the expected TEST order/access record exists and the user's authorized content/action works; no corresponding PROD write. Adapt to the site's actual payment outcome. |
| P6 | Protected webhook reachability | Request reaches the candidate handler with the sanctioned bypass; unbypassed behavior matches protection settings. Signature rejection proves reachability only; P5 proves the business effect. N/A when no protected webhook. |
| P7 | Email/form isolation | Bounded submission lands in the isolated destination with expected fields/tags and no live counterpart. A §9 manual exception is recorded as non-isolated with linked human evidence, never an isolation PASS. |
| P8 | Schema/policy parity | Compare definitions, grants, RLS, triggers/functions and relevant settings. Only documented environment differences or the reviewed pending migration (§7.10) remain. |
| P8b | Authorization behavior | In TEST: the authorized user can perform approved actions; anonymous/other users cannot read or change protected data. Never attempt negative writes on PROD. |
| P9 | Auth settings | Relevant rows in §7.5 are evidenced for both projects; differences have compensating checks. |
| P10 | Hosting protection | Preview protection matches its selected policy; public Production pages work without bypass when deployed. Production half may remain Pending until launch. |
| P11 | Health | Required TEST services respond before each external test run; no unexamined pause/quota failure. |
| P12 | Scope/provenance inspection | Owner verifies TEST/sandbox provenance and scopes for every relevant credential/destination, including branch overrides. Names/scopes can be recorded; values cannot. Behavior is evidenced by the other applicable proofs. |
| P13 | Production auth return (launch) | Owner checks PROD Site URL/callback settings and a reset for their own account resolves to a working live page. No automated production reset. |

For each applicable proof record: `[ID] · [PASS/FAIL/PENDING/N/A] · [DATE] · [CANDIDATE SHA] ·
[DEPLOYMENT/CALLBACK SHA] · [SANITIZED EVIDENCE LINK] · [OWNER/NEXT ACTION]`.
**S0.1 records** (PR #3):

- `P10 (Preview half) · PASS · 2026-09-24 · 3f07d66697f56aa11b424c96126bdd2c948db908 · GitHub deployment 6638512041 (Vercel Preview, same SHA) · S0.1 record → "Preview record" · without the bypass `/` answers 302 to Vercel login on this deployment (owner probe; `/`, a missing path and POST /api/sentry-test also answered 302 to Claude on the earlier 0d27806 Preview, GitHub deployment 6638331522) — Vercel Authentication, scope All Deployments per the owner's Settings → Deployment Protection screenshot (a Preview's 302 alone could not show the scope); through the owner-run bypass the application answers with the six headers and noindex on / and on a missing path; the PR Preview is a separate deployment URL built from the PR head`
- `P10 (Production half) · PENDING · 2026-09-24 · d416bfbe2bf94fd0e729e1ac39a5666c8a1a54ed · Production deployments qts5y2d3e, 64m890ydl and hquc871zi (GitHub deployment 6641010256) · S0.1 record → "Closure" · protected by design until S3.4: without the bypass the production domain answers 302 (verified 2026-09-24, and at every step of rollback Drill 2) and through the owner-run bypass the application answers with the six headers and noindex; the PASS criterion — public Production pages working without the bypass — is a launch check (S3.4)`
- `P12 · PASS · 2026-09-24 · 3f07d66697f56aa11b424c96126bdd2c948db908 · Vercel project aalishaan-studio-app · owner screenshots of each variable's type and scopes as it was added and of the complete Project variable list (S0.1 record → "Owner actions received"), values never shown · exactly nine entries: SALES_MODE=off (Config) in all environments; NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT (Config) in Production and Preview; SENTRY_AUTH_TOKEN (Secret) and SENTRY_TEST_TOKEN (Secret) as separate Production and Preview entries (that the two SENTRY_TEST_TOKEN values differ is owner-stated, 2026-09-24; values never shown); no other provider value; no branch-specific override; "Enable access to System Environment Variables" on. Behaviour confirmed by the Preview Sentry event (environment preview, release = tested SHA)`
- P1–P9, P11, P13: N/A at S0.1 — no database, auth, payment, email, form or webhook exists yet (S0.2 onward).

**S0.2 records** (branch `claude/s0.2-supabase-proof-harness`, committed and pushed as PR #6 on 2026-09-25; the candidate SHA is the PR head at proof time — Vercel builds a Preview per push; every S0.2 proof below is refreshed at the actual candidate and none is prefilled):

- `P1 · PARTIAL · 2026-09-25 · 185592f5e72318a85678ffcf0fe2ab256ff95307 (provenance half; the table half at the proof candidate) · TEST kivaatbvxifunilxoxde · S0.2 record → "Checks run" · **provenance half PASS 2026-09-25 (evening):** the owner created both projects and entered the values (PROJECT-STATUS §9); \`pnpm db:test:preflight\` in the trusted process — secret key accepted (REST root, a secret-only endpoint), publishable key accepted (Auth health), URL ref = SUPABASE_TEST_PROJECT_REF ≠ SUPABASE_PROD_PROJECT_REF, baseline absent, anonymous read 404; statuses only, never a value. The table half stays pending. As designed, the read-only provenance half runs first, before the baseline exists: \`pnpm db:test:preflight\` probes the public and the privileged key separately against the intended project's API (an opaque key is never decoded), requires the URL's ref to equal SUPABASE_TEST_PROJECT_REF and to differ from SUPABASE_PROD_PROJECT_REF, and reports statuses only; the table-backed half (the deployed Preview's own privileged path writing and reading the marker) follows the authorised TEST apply — \`pnpm test:preview-proof\``
- `P2 (pattern) · BLOCKED · 2026-09-25 · (no candidate SHA) · — · S0.2 record · after P1: \`pnpm test:preview-proof --apply\` against the verified candidate Preview creates one \`s0-2-proof:<id>\` marker from the deployed route, confirms it from the trusted local process's privileged read of TEST, prints the exact read-only PROD query for the owner (schema presence, then the marker count when the table exists — run in the PROD SQL editor under Profile A, never MCP), then cleans up and confirms absence; a residual fails the proof and is recorded`
- `P8 · BLOCKED · 2026-09-25 · (no candidate SHA) · — · docs/database-changes/S0.2-0000-init.md → "Verification" · after the authorised TEST apply: the schema/access inventory (columns, constraints, trigger, function properties, grants, relrowsecurity, no policy, ledger row) read in the TEST SQL editor and captured with \`supabase db dump --schema public\`; the PROD comparison after the human apply. Expected difference until then: PROD lacks exactly 0000_init (§7.10); nothing else may differ`
- `P8b · BLOCKED · 2026-09-25 · (no candidate SHA) · — · tests/integration/baseline.test.ts · after the TEST apply: \`pnpm test:integration\` — privileged create/read/update/delete of a namespaced synthetic row, the updated_at trigger, anonymous read/insert/update/delete denied with privileged post-checks, a scoped reset sparing neighbours. The hermetic denied-state scaffold already runs in \`pnpm test:unit\` (333 tests, 2026-09-25) and is not P8b evidence`
- `P10 (Preview half) · PENDING · 2026-09-25 · (no candidate SHA) · — · S0.2 record · no PR or Preview yet. The smoke (\`pnpm test:e2e\`, desktop + mobile-390) passed 12/12 in local mode against \`next start\` on 2026-09-25 — not Preview evidence; the Preview run verifies the unbypassed 302 to Vercel's login and the app's response through the host-scoped bypass cookie`
- `P11 · PASS · 2026-09-25 (evening) · 185592f5e72318a85678ffcf0fe2ab256ff95307 · TEST kivaatbvxifunilxoxde · scripts/testing/preflight.mjs (\`pnpm db:test:preflight\` exit 0: Auth health 200 with the secret key and with the publishable key, REST root 200 with the secret key; rechecked before each external run) · before each external run: the Auth health probe and both key probes must answer 200 (a paused Free project fails here, not inside a test); pause owner and cadence recorded in PROJECT-STATUS §9 (the owner, weekly, and before each run); the disabled morning workflow is not a keepalive`
- `P12 · PENDING · 2026-09-25 · (no candidate SHA) · — · S0.2 record → "Owner setup" · the owner confirms, names only: both Supabase projects and refs, that the publishable and secret keys of each scope belong to that project (TEST in Preview/Development/local, PROD in Production), no branch-specific override, the two refs in every scope, S0_2_PROOF_TOKEN in Preview only, SENTRY_TEST_TOKEN removed everywhere (owner-reported 2026-09-25), the Upstash TEST database and Turnstile test keys in Preview/Development, and the Protection Bypass secret held in the trusted process. Setup reported done 2026-09-25 (dashboard screenshot of the variable list; Gate 0 Upstash/Turnstile test values present; both secret keys rotated after a partial paste in chat); the confirmation itself is taken at the candidate`

Use existing CI, Preview and project records; do not duplicate full reports here. Negative controls
match the specific test identity/event, not total production counts that legitimate users can change.
If an authorized read is unavailable, record the proof as blocked/partial rather than inventing evidence.

**Full Preview gate:** all applicable Preview proofs pass and are current; unused features have an N/A
reason. A §9 feature requires the approved MANUAL coverage and completed evidence, not skipped coverage.
Production halves of P10/P13 and live-domain/provider checks are due at launch. Required feature tests
must still pass in the full Launch Gate; partial proof runs cannot issue the launch GO.

**Re-run triggers:** changed environment values/overrides or destinations → affected wiring proofs after
redeploy; schema/policies → P8/P8b and affected flows; auth settings/domain → P3/P9 and P13 when live;
payments/webhook code or alias → P4/P5/P6 plus candidate-SHA check; email/form changes → P7; harness changes
→ target, credential and selection guards plus affected proofs. Recheck P11 each run. Preserve unrelated
valid evidence; do not demand every payment proof for a copy-only sprint.

## 13. Close-out record

- [ ] §3–§4 reflect actual environments; status/architecture point to the same facts.
- [ ] Applicable proofs are dated; future-stage checks are Pending with an owner, never prefilled PASS.
- [ ] Any mismatch has its minimal fix/decision in `PROJECT-STATUS.md` and the appropriate sprint.
- [ ] Test fixtures and temporary callback changes have recorded cleanup.
- [ ] Live-only residuals have explicit launch checklist/monitoring owners.

Delivery/review SHAs and verdicts belong in the existing sprint/Preview/review records. Fill them when
they exist. This reusable template does not require a fictitious PR, approval or merged SHA.

## 14. Keep the record accurate

Link primary evidence; distinguish observation from inference. Preserve useful decisions in Git history
and the decision log, without filling current instructions with old project-specific retractions.
Correct duplicated false claims wherever found. A substantive change invalidates the affected evidence
and review under `WORKFLOW.md`; never call a new head approved by an old review.

## 15. Where this plugs into the existing system

| Moment | Action |
|---|---|
| Setup Gate | Copy/fill applicable §3–§4; follow §6; establish safe destinations before enabling writes |
| Relevant sprint | Maintain environment contracts and complete/refresh affected §12 proofs |
| Pre-merge `/close` | Verify applicable isolation/parity evidence and the candidate callback commit |
| Full Launch Gate | Current Preview proofs, schema comparison where used, complete feature coverage |
| Launch day | Real-domain auth/forms and provider readiness; no real-card testing requirement |
| After launch | Safe morning checks, verified alerts and targeted rechecks after service changes |

Next: use `ENV-VARS-SAFETY.md` before handling configuration; `WORKFLOW.md` for any implementation change.
