# Error Tracking Setup — One-Time Checklist

Run once per website. Sentry is the **only account in this module** (free tier — plenty at this scale). Your hands-on time: ~15 minutes. When the last box is ticked, the site reports its own problems from then on.

On this project the checklist runs in Setup sprint S0.1, not before launch (decision D-23, ratified in `docs/ENVIRONMENT-PARITY.md` §4), and it follows the project's model below. Reconciled 2026-09-24 at S0.1: one Sentry project with separate environments, values entered by the owner by name only, a Preview alert before merge and a Production alert after it, and the test route removed by the S0.2 PR — not a second project, a pasted DSN, a user e-mail context, a Preview promoted to Production or a same-sprint removal.

---

## Part 1 — Create the recorder (You, ~5 min)

- [x] **You:** go to **sentry.io** → open your own account (the owner's own Sentry account — owner answer 2026-09-23, `docs/PROJECT-STATUS.md` §8c D-23).
- [x] **You:** **Create Project** → platform: **Next.js** → one project for the site (for example `aalishaan-studio-app`). There is **one project for every environment**: events carry the environment `development`, `preview` or `production` (`docs/PROJECT-STATUS.md` §9, `docs/TECH-ARCHITECTURE.md` §6).
- [x] **You:** keep the project's **DSN** in Sentry (Project Settings → Client Keys). You enter it in Vercel yourself (Part 2); it is not pasted to Claude Code or into the repository.

## Part 2 — Install it (Claude Code, the S0.1 PR; you enter the values)

- [x] **Claude Code:** Sentry SDK for Next.js installed (`@sentry/nextjs` 10.75.2): `src/instrumentation.ts` (server and edge), `src/instrumentation-client.ts` (browser), `src/app/global-error.tsx` (React render errors), `next.config.ts` (build). DSN read from environment variables **by name only**; without a DSN the SDK stays off and never blocks a request. (S0.1 branch, 2026-09-24 — local build and tests; deployed behaviour is Part 4.)
- [x] **Claude Code:** privacy: no user context before staff sign-in exists (S1.2; customers are guests, D-PRE-03 — never attach customer PII, `docs/SECURITY-CHECKLIST.md` §9); `sendDefaultPii` off; before any event leaves, cookies, request bodies, query strings, user data and every request header except the user agent are removed, and breadcrumb URLs lose their query strings. No session replay.
- [x] **Claude Code:** environments come from Vercel's deployment context (`VERCEL_ENV`), not `NODE_ENV`, so Preview noise is never mistaken for Production; releases are the deployed commit (`VERCEL_GIT_COMMIT_SHA`).
- [x] **Claude Code:** readable error reports: source maps are generated and uploaded only by Vercel builds that hold `SENTRY_AUTH_TOKEN`, then deleted so none is served — tick when a Vercel build log shows the upload. (2026-09-24: the `3f07d66` Preview build log shows "[@sentry/nextjs - After Production Compile] Info: Successfully uploaded source maps to Sentry"; the Preview issue shows original file names and line numbers and a suspect commit; Vercel's "Protected Sourcemaps" is enabled; a direct `.map` request was not probed.)
- [x] **You:** in Vercel → the project → Settings → Environment Variables, enter by name (Claude Code gives the list; values never pass through Claude): `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` for Preview and Production; `SENTRY_AUTH_TOKEN` (an organisation auth token with source-map upload rights), `SENTRY_ORG` and `SENTRY_PROJECT` for Preview and Production; `SENTRY_TEST_TOKEN` — a different random value (at least 32 characters) for Preview and for Production. Redeploy after changes. (2026-09-24: names, types and scopes evidenced by the owner's screenshots — `ENVIRONMENT-PARITY.md` §12 P12; the two test-token values differ — owner-stated, 2026-09-24.)

## Part 3 — Point the alarm at your inbox (You, ~3 min, Claude Code gives exact clicks)

- [x] **You:** in Sentry → Alerts → create a **Preview verification** rule: when a new issue is created **and** the event's environment is `preview` → email you. Name it so it is obviously the Preview check (for example "Preview verification — S0.1").
- [x] **You:** create the **Production** rule: when a new issue is created **and** the environment is `production` → email you immediately. (Optional later: a second rule for "an old issue is happening a lot".)
- [x] **You:** confirm your Sentry account e-mail is the inbox you actually read daily, and that your notification settings deliver alert e-mails.

## Part 4 — Fire the test shot, then close

The shot is `POST /api/sentry-test` with `Authorization: Bearer <SENTRY_TEST_TOKEN>` — you run it (the token never goes into a URL, a log, a screenshot or a chat). Every other request gets a generic `404` and raises nothing.

- [x] **Preview (before merge):** on the S0.1 PR's tested Preview, confirm an unauthorised request gets `404` and raises no issue; then fire one authorised shot. Record the Sentry issue (environment `preview`, release = the tested head commit), the time, and that the **Preview verification** e-mail arrived. (2026-09-24, PR #3 Preview of `3f07d66`: denied `404`, authorised `sent`; issue `AALISHAAN-STUDIO-APP-4`, 14:02:14 UTC, `preview`, release `3f07d66…`; the owner received the "Preview verification — S0.1" e-mail; the Feed shows no other issue — S0.1 record, "Preview record".)
- [x] **Production (after the owner merges):** fire one authorised shot on the Production deployment built from `main` — never a Preview promoted to Production. Record the issue (environment `production`, release = the merge commit) and the **Production** alert e-mail. (2026-09-24: `https://aalishaan-studio-app.vercel.app`, built from `main` @ `d416bfb`: denied `404`, authorised `sent`; issue `AALISHAAN-STUDIO-APP-5`, 15:59:43 UTC, `production`, release `d416bfbe2bf9…`; the owner received the "Production" alert e-mail — S0.1 record, "Closure".)
- [x] **You:** confirm setup done, dated, in the S0.1 sprint record. An unverified alert channel is the same as no alert channel — this box is the point of the whole checklist. (2026-09-24: both alert e-mails received by the owner — S0.1 record, "Preview record" and "Closure".)
- [ ] **Claude Code (S0.2 PR at the latest):** remove the route, its helper and its tests; **you** delete or rotate `SENTRY_TEST_TOKEN` in every Vercel scope. Normal error reporting stays.

---

**Done.** From now on: alerts land in your inbox (Door A), user reports go to `/handle-error` (Door B), and `ERROR-TRACKING-GUIDE.md` §3 is the lane every incident travels.
