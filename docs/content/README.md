# docs/content — Canonical content sources

This folder holds the exact claims and the copy-governance files the build engine reads. It deliberately does **not** duplicate the approved page copy: for Aalishaan Studio the approved copy is the frozen prototype (`prototype/`), and `docs/APPROVED-INPUTS.md` §2 maps every page to its source file.

| File | Purpose |
|---|---|
| `locked-facts.md` | Exact facts and numbers the site claims (prices, catalogue counts, finishes, providers, conventions) and the exact labels, stage names, image slots and counts of the final Admin — Admin A2 — 86400 UI edition (§9, §9a; reference revision E10). Implemented verbatim; never drift through copy edits. |
| `new-strings.md` | Register of strings the prototype lacks (server errors, integration states, real-data empty states). Exists since 2026-09-16 with NS-01–NS-09 seeded (NS-10 and NS-11 added 2026-09-17 for the final Admin; NS-12–NS-16 added 2026-09-23 for the E10 additions, D-37–D-39); rows are added by the sprint that needs them. Each entry: sprint, where it appears, the string, status (Proposed / Owner-approved / Superseded); approval lane per decision D-24. |

Rules: no placeholder tokens reach the DOM; every visible string matches its prototype source verbatim; a change to approved copy is a recorded owner decision, never an inline edit.
