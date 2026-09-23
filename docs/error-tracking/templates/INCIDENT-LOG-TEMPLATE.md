# Incident Log — Aalishaan Studio

> One row per post-launch problem, newest on top. Created as `docs/INCIDENT-LOG.md` at the first incident and kept living forever. This file is the owner's five-minute weekly glance: everything moving toward Closed, every Closed row complete.

**The two closure rules (enforced, not suggested):**
1. No **Closed** without a regression test — the exact bug, reproduced as a permanent test in the launch-gate suite.
2. No **Closed** without **User informed ✓** — or the recorded reason "n/a — caught before any user was affected."

Status values: **Investigating → Fixing → Verifying → Closed** · Severity: **Blocker / High / Medium / Low** (definitions in `ERROR-TRACKING-GUIDE.md` §3)

| # | Date | Door (Sentry / User / Morning check) | What broke — plain words | Who was affected | Severity | Bug or not | Fix (PR / backlog ref) | Regression test ID | User informed | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 | [DATE] | [User report] | [e.g. Password reset email linked to the wrong address, so resets never completed] | [1 customer — a.__@__.com] | [Blocker] | [Bug] | [PR #__] | [AC-003b] | [✓ DATE / n/a — reason] | [Closed] |
| 002 | [DATE] | [Sentry] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [Investigating] |

## Patterns corner (reviewed in the weekly glance)

- [Same form / page / flow appearing 3+ times → note it here and ask whether something deeper needs a sprint.]
- [Repeated "not a bug" payment declines from one region/bank → worth a line on the checkout page? Owner decision, logged.]
