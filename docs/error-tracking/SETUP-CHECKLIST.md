# Error Tracking Setup — One-Time Checklist

Run once per website. Sentry is the **only account in this module** (free tier — plenty at this scale). Your hands-on time: ~15 minutes. When the last box is ticked, the site reports its own problems from then on.

---

## Part 1 — Create the recorder (You, ~5 min)

- [ ] **You:** go to **sentry.io** → create a free account (or open the existing one — one account can hold every site as separate projects).
- [ ] **You:** **Create Project** → platform: **Next.js** → name it after the site (e.g. `aalishaan-studio`); `docs/PROJECT-STATUS.md` §9 records a Prod project for Production and a Dev project for Preview.
- [ ] **You:** Sentry shows a **DSN** — a long address starting with `https://…ingest…`. Copy it. It is the site's mailbox address for errors: fine to share with Claude Code, it unlocks nothing else.
- [ ] **You:** hand it over: *"Set up error tracking from docs/error-tracking — here's the Sentry DSN: […]"*

## Part 2 — Install it (Claude Code, one normal PR)

- [ ] **Claude Code:** install the Sentry SDK for Next.js via the standard wizard/config; DSN referenced as an environment variable **by name only** — the value goes into Vercel's dashboard, never into the repo.
- [ ] **Claude Code:** enable **user context**: errors from logged-in users carry their account ID/email, so "which user hit this" is always answerable (staff sign-ins only — customers check out as guests, D-PRE-03; never attach customer PII, per `docs/SECURITY-CHECKLIST.md` §9). Enable Sentry's default data-scrubbing so passwords and card-like values are never stored.
- [ ] **Claude Code:** tag environments so Production errors are unmistakable from Preview noise; alerts (below) fire on Production only.
- [ ] **Claude Code:** enable readable error reports (source maps) so reports point at real code, not minified gibberish.
- [ ] **You:** add the DSN env variable in Vercel (name given by Claude Code, value pasted by you) for Production and Preview. Merge the PR through the normal workflow.

## Part 3 — Point the alarm at your inbox (You, ~3 min, Claude Code gives exact clicks)

- [ ] **You:** in Sentry → the project → **Alerts** → create the rule: **when a new issue appears in Production → email me immediately**. (Optional later: a second rule for "an old issue is happening a lot".)
- [ ] **You:** confirm your Sentry account email is the inbox you actually read daily.

## Part 4 — Fire the test shot, then close

- [ ] **Claude Code:** deploy one **deliberate test error** behind a hidden path on Preview-promoted-to-Production (or the sanctioned equivalent), trigger it once, then remove it in the same sprint.
- [ ] **You:** confirm the alert email arrived and open it — you are looking at your first Sentry issue: the page, the device, the error, the moment. This is exactly what a real one will look like.
- [ ] **You:** confirm setup done, dated, in the PR or project status. An unverified alert channel is the same as no alert channel — this box is the point of the whole checklist.

---

**Done.** From now on: alerts land in your inbox (Door A), user reports go to `/handle-error` (Door B), and `ERROR-TRACKING-GUIDE.md` §3 is the lane every incident travels.
