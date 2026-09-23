# Error Tracking — Start Here

This folder is the **after-launch safety net**: the moment something breaks for a real user, you know about it, you understand it in plain words, it gets fixed through a normal sprint, the fix gets a permanent test so it can never quietly return, and the affected user hears back from you.

It is self-contained. Drop it into any site — new build or existing — alongside `testing-setup/` (testing prevents bugs before launch; this catches whatever slips through after).

## What it does, in one paragraph

Sentry — a free error-tracking service, the only account in this module — sits inside the site like a black-box recorder. When an error happens to a real user, it records who it was, which page, which device, what the error said, and their last clicks, then emails you. That's Door A: most problems reach you before any user writes in. Door B is when a user does report something ("my payment failed", "I can't log in"): you paste their message into `/handle-error` and Claude Code checks all the logs — Sentry, Razorpay, Shiprocket, the transactional email provider (D-06), the server — and tells you in one plain paragraph what actually happened, whether it's even a bug, and how bad it is. From there both doors join the same lane: severity → fix sprint → new permanent test → user informed → incident logged closed.

## Files in this folder

| File | What it is | Who reads it |
|---|---|---|
| `ERROR-TRACKING-GUIDE.md` | The plain-English guide: the two doors, the lane, severities | **You** — read this first |
| `SETUP-CHECKLIST.md` | One-time Sentry setup, marked You / Claude Code | You + Claude Code |
| `handle-error.md` — installed as `.claude/skills/handle-error/SKILL.md` (not kept in this folder) | The Claude Code skill that investigates and drives every incident | Claude Code |
| `templates/INCIDENT-LOG-TEMPLATE.md` | The running register — one row per issue, closes only when the user is informed | Claude Code fills, you glance weekly |
| `templates/USER-UPDATE-TEMPLATE.md` | Ready-to-send messages for affected users | You send |

## Copy map (when applying to a project repo)

| This folder's item | Project repository location |
|---|---|
| Entire folder (except the skill) | `docs/error-tracking/` |
| `handle-error.md` — the Claude Code skill | `.claude/skills/handle-error/SKILL.md` (rename to `SKILL.md`) |
| Incident register (created at first incident) | `docs/INCIDENT-LOG.md` |

## First action

Read `ERROR-TRACKING-GUIDE.md` once (10 minutes). Then run `SETUP-CHECKLIST.md` — it ends with a deliberate test error so you *see* the alert arrive before you ever need it for real.
