# QA Checklist

The two-part quality gate every branch passes before merge: Part 1 locally before the PR,
Part 2 on the deployed Preview (Vercel or approved equivalent) before independent review. Record results and the tested head SHA in the PR.

**The rule: merge only after BOTH parts pass.** Local green is necessary but not sufficient —
env inlining, auth origins, and integrations all behave differently deployed.

---

## Part 1 — LOCAL (before opening the PR)

### Build health
- [ ] Typecheck passes: `pnpm typecheck`.
- [ ] Lint passes: `pnpm lint`.
- [ ] Tests pass: `pnpm test` (state the reason for N/A).
- [ ] Production build passes: `pnpm build` — do not skip it because dev "looks fine".
- [ ] These are the same checks the **Code Check** enforces on the PR (`docs/TECHNICAL-INTEGRITY.md`); a green Code Check on the current head satisfies the boxes above — and red never merges.

### Automated tests (proportional to the change)
- [ ] If the project has no automated suite, record the architecture-approved reason and the manual coverage used; do not silently skip behavior checks. **"No suite" is permitted only for a fully static site** — a project with auth, gated content, a database, or payments must have an automated suite (this is a blocking gate, not a preference).
- [ ] New or changed behavior has regression coverage at the right layer: unit for logic, integration for handlers/data, and end-to-end for critical user flows.
- [ ] The standard end-to-end suite is the Launch Gate's whole-site suite (`docs/testing-setup/`, specs in `tests/e2e/`): sprints extend it — new features get new feature-list lines and specs there, and `/handle-error` regression tests land there too.
- [ ] 🔴 Auth, access, or database changes test both allowed **and denied** states for every affected role — at least one denied-state assertion per protected boundary. Manual Preview clicking is not a substitute for an automated denied-state test on an authorization boundary.

### Every touched page
- [ ] Renders without errors in the dev server AND on the production build.
- [ ] Zero console errors; no hydration warnings where the selected framework hydrates client UI—open DevTools, don't assume.
- [ ] Check pages the change *could* have affected, not just the ones you edited — don't assume isolation.

### Forms (if touched)
- [ ] Client validation fires on bad input with a clear message.
- [ ] Valid submit works end-to-end, or the documented local unavailable state is honest and prevents a fake success.
- [ ] Success state shows the approved copy; error state is handled — never a silent failure.

### Mobile viewport
- [ ] Every touched page at 320px width: no horizontal scroll, no overlap, tap targets usable.

### Accessibility
- [ ] Keyboard-only pass: logical tab order, visible focus, working skip link, and no keyboard trap in menus/dialogs.
- [ ] Forms have programmatic labels; required, error, and success states are announced and never rely on color alone.
- [ ] Headings and landmarks are meaningful; images have context-appropriate alt text (or empty alt when decorative).
- [ ] Reduced-motion mode works; content remains usable at 200% zoom.
- [ ] An automated accessibility scan reports no serious issue on each touched page; manual checks above still apply.

### Performance
- [ ] Key touched pages meet the project's recorded performance budget. **Default budget (use unless a stricter or consciously-relaxed one is logged as a decision):** mobile Lighthouse Performance ≥ 90, LCP ≤ 2.5s, CLS ≤ 0.1, total transferred JS ≤ ~300KB gzipped on the primary journey. "No budget yet" is not a pass — adopt the default or log an override; never let a page baseline its own slowness.
- [ ] Images have dimensions and appropriate sizes; no accidental large asset, font, script, or request was added.

### Content fidelity
- [ ] Every visible string matches the approved copy source VERBATIM — no paraphrasing, no "improvements".
- [ ] Locked facts/numbers (the exact claims the site makes) read correctly wherever they appear.
- [ ] No unfilled `[placeholder]` tokens reach the DOM.

### Secrets check
- [ ] Verify the selected live env file is ignored without opening it (for example, `git check-ignore .env.local`) and is neither tracked nor staged.
- [ ] Diff scan: no live env file, keys, tokens, or connection strings; placeholder-only `.env.example` contains no real value; no secret has a public prefix.
- [ ] Stage specific files — avoid blanket `git add -A` when there is any risk of catching secrets or caches.

**Why this matters:** everything above is cheap to fix now and expensive to fix after merge.

---

## Part 2 — DEPLOYED PREVIEW (before review and merge — mandatory)

Open the PR's Preview URL. Test the deployed build, not your local one.
Record the provider, URL, and tested head SHA using `templates/VERCEL-PREVIEW-TEST-TEMPLATE.md` (the supplied Vercel/equivalent record) and link it in the PR.

> **Full pass vs mobile smoke subset — be honest about which you ran.** The full pass below (keyboard/a11y, 320px layout, every touched page, regression spot-checks) requires a desktop browser with devtools. A quick check from a phone is a **mobile smoke subset**: the touched pages load, the primary conversion flow completes, and there is no obvious break — it is *not* the full pass and must be recorded as "mobile smoke only." A sprint that changed auth, a shared shell/component, or the primary conversion requires the full desktop pass before merge — do not sign it off from mobile alone.

### Full pass of touched pages
- [ ] Every touched page on desktop: layout, images, interactions.
- [ ] Every touched page on mobile (real device or 320–390px emulation).
- [ ] No layout shift, broken images, or runtime errors.

### Visual QA evidence (UI sprints)
- [ ] Capture screenshots of every touched page at **320 / 768 / 1440** on the deployed Preview, plus state coverage where it applies (default, hover/focus-visible, loading, empty, error) — via **Playwright MCP** or the **Agent Browser** CLI per `docs/BROWSER-TOOLS.md` (the `/browser-qa` skill runs this).
- [ ] Judge the captures against the approved mockup and `docs/DESIGN.md` §8 (frontend craft): record PASS or the exact visual gaps. "It renders" is not the bar — "it looks professionally designed" is.
- [ ] Attach or link the evidence in the PR alongside the Preview record.

### Deployed accessibility and performance
- [ ] Run the critical touched flow by keyboard on the Preview; focus, labels, errors, dialogs, and reduced motion behave as they did locally.
- [ ] Run the chosen accessibility scan against the deployed pages; no serious issue remains.
- [ ] Measure the key touched pages on Preview and record the result against the project's budget/baseline; investigate material regressions before merge.

### Primary conversion flow
- [ ] Walk the primary conversion flow end-to-end on the Preview (e.g. landing → form → submit → confirmation).
- [ ] Core forms really deliver in the Preview test environment. An optional integration may show only its architecture-approved unavailable state; never a fake success.

### Auth (only if the change touches auth — skip otherwise)
- [ ] Sign in / sign out / sign up / reset all work on the Preview.
- [ ] Auth email links resolve to the PREVIEW origin, never Production.
- [ ] Gated pages behave correctly per auth state (visitor / pending / member / admin — whichever apply).

### Links and images
- [ ] Every link on touched pages resolves — no 404s, no dead anchors.
- [ ] Images load and are not stretched or cropped wrongly.

### Regression spot-check
- [ ] Open 3–5 key UNTOUCHED pages across affected approved shells and confirm no unintended chrome, console, or styling regression.

**Never do this:**
- Never merge on local checks alone.
- Never mark Preview "tested" without actually opening the URL on both viewports.
- Never wave through a Preview failure as "probably an env thing" — diagnose it or fix the env, then re-test.

---

## Recording the result

- [ ] Comment on the PR: Part 1 pass (exact commands, tests, accessibility + results) and Part 2 pass (provider, Preview URL, tested head SHA, viewports, flows, accessibility, and performance results).
- [ ] Anything found and fixed during QA gets re-tested from the top of the affected section.

Next step → independent review via CODEX-REVIEW-PROMPT.md, then the owner merges. At launch time, `docs/LAUNCH-CHECKLIST.md`.
