# Post-Launch Backlog — Aalishaan Studio

> The single holding pen for everything that is not the current sprint. Copy once per project and keep it living — this file is the project's single backlog of record.

## Backlog

Type: feature / fix / improvement · Priority: High / Medium / Low · Effort: S / M / L · Status: Parked / Ready / Promoted / Done

| Item | Type | Priority | Effort | Source | Status | Notes |
|---|---|---|---|---|---|---|
| [Item name] | [feature] | [High] | [M] | [predev "Later" list / build deferral / post-launch feedback] | Parked | [Context, dependencies, needed-by if any] |
| [Item name] | [fix] | [Low] | [S] | [build deferral — [SPRINT_ID]] | Parked | [Why it was deferred] |
| | | | | | | |

## Intake rules

- [ ] New ideas land HERE, not in the current sprint. The sprint scope is closed once it starts.
- [ ] Deferred sprint scope arrives with a pointer to its brief (`docs/sprint-prompts/[SPRINT_ID]-[SLUG].md`) so context isn't lost.
- [ ] Security hardening deferrals (rate limiting, CAPTCHA, etc.) are marked **required-before-scale**, not optional. But **basic** public-form abuse control (a server-verified bot check and/or rate limit) is **launch-blocking** and may not be parked here — only *advanced* hardening (tighter limits, anomaly detection) is scale-deferrable (`docs/SECURITY-CHECKLIST.md` §5).
- [ ] Every item records its Source — where it came from decides how much re-validation it needs later.
- [ ] Nothing is deleted. Parked is a status, not a fate; rejected ideas keep a one-line "why" in Notes.

Why this matters: a trusted backlog is what makes "not now" a safe answer — ideas stop leaking into open sprints.

## Promotion rule

- [ ] A backlog item becomes work only by being promoted into a sprint via `SPRINT-PLAN-TEMPLATE.md` when its turn comes.
- [ ] On promotion: set Status to Promoted, note the [SPRINT_ID], and re-validate the item against the current repo (paths, routes, and assumptions rot).
- [ ] One sprint at a time — never promote an item into a sprint that is already running.

Never do this: never "quickly slip in" a backlog item mid-sprint, and never fix a backlog item silently inside an unrelated PR.

---

Next step → when an item's turn comes, scope it with `SPRINT-PLAN-TEMPLATE.md` and add it to `docs/ROADMAP.md`.
