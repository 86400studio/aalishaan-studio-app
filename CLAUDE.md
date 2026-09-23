# Aalishaan Studio — Claude Code Instructions

> This file governs the primary build agent in the 86400studio/aalishaan-studio-app repository.
> Companion docs: docs/WORKFLOW.md, docs/ROADMAP.md, docs/PROJECT-STATUS.md,
> docs/TECH-ARCHITECTURE.md, docs/DESIGN.md, and AGENTS.md.

## Project context

**Aalishaan Studio** is a website for the Aalishaan Studio owner: an Indian made-to-order framed
wall-art store (22 artworks, A2 prints, three frame finishes) for customers in India, plus the staff-only
Admin. The Admin is built to the final Admin design — Admin A2 — 86400 UI edition at `prototype/admin/`
(D-PRE-23: seven sections — Orders (landing page), Customers, Products, Support, Reports, Staff & Access,
Connections; Store setup and Access & backups in the owner menu; global search, View website and Help & demo
in the top bar) — with AF1 (`prototype/docs/ADMIN-FINAL-FEATURES.md`) as its scope: AF1's 26 capabilities
and stories US01–US23 are canonical, its §3 menu layout is superseded, and
`prototype/admin/CAPABILITY-MAP.md` maps every capability ID to its home in the final Admin; the Admin reference is the local `prototype/admin/` only — the published GitHub Pages prototype still serves the superseded Admin A1 at `/admin` (D-36). Scope fence: V1 as AF1 defines it —
guest checkout only (no customer accounts), no COD (online payment only; customers who ask to pay another way contact the studio — D-38), no new sizes/finishes/channels/custom orders, no
dedicated Accounting/CRM/Support tools, no public redesign (public design is locked at R13; the E4–E8 revisions are the frozen public reference and the prototype as a whole is revision E10 — E9 plus the three additions of 2026-09-23, D-37–D-39 —, with owner visual review of the E5/E7 mobile screens, the E1 fixes and the final Admin screens pending — OI-14).
Its approved conversion priorities are a completed guest purchase paid through Razorpay (primary), and
contact enquiry, newsletter signup, saved artworks and order tracking (secondary). Authentication (staff
only), database, private files, integrations (Razorpay, Shiprocket, transactional email) and hosting
behavior are defined in docs/TECH-ARCHITECTURE.md; do not invent them.

Approved factual claims and content sources are listed in docs/APPROVED-INPUTS.md (the frozen
prototype at `prototype/` is the approved mockup and copy baseline) and docs/content/locked-facts.md.
Implement them exactly. GitHub is the source of truth. Vercel provides
the Vercel Preview and Production when hosting is in scope. Work one sprint at a time from
docs/ROADMAP.md.

## Start every session

1. Read docs/PROJECT-STATUS.md, including current stage, active sprint, and open decisions.
2. Read the active sprint scope and exit checklist in docs/ROADMAP.md.
3. Inspect the package manifest, framework config, source tree, current branch, and git status.
4. Read every task input and relevant approved copy/design file before editing.
5. Confirm the task names the files allowed to change. If another file is needed, stop and explain why.
6. Work only inside the active sprint and branch named by the task.

When a sprint completes, update docs/PROJECT-STATUS.md and docs/ROADMAP.md in the same branch, provided
those files are listed as allowed changes. Otherwise report the required bookkeeping to the owner.

## Stack and sources of truth

The proposed stack (D-01 lean, locked at S0.0) is **Next.js (App Router) + TypeScript strict + Tailwind CSS + pnpm on Vercel, with Supabase (Postgres, Auth, Storage, RLS), Razorpay and Shiprocket**, recorded in docs/TECH-ARCHITECTURE.md with its package manager,
framework, styling, validation, data, integration, and hosting choices.

Verify the on-disk implementation before relying on a note. If code and documentation disagree, report
the mismatch. Update documentation only when the current task explicitly allows that file and change.
Treat traces of an earlier prototype or stack as historical.

## Approved content and design

- Copy comes from the approved copy sources named by the task — canonically the frozen prototype pages and their build sources under `prototype/` (page → source map in `docs/APPROVED-INPUTS.md`), with exact claims in `docs/content/locked-facts.md`. Implement both verbatim; do not rewrite approved copy or invent facts. If a needed string has no approved source (a new error, label or empty state), record it in `docs/content/new-strings.md` following the prototype's voice rather than inventing it inline, and flag it for owner approval (honest technical states — a disabled form, an order still confirming — may ship on the delivery lead's approval with owner review at the next check-in: decision D-24).
- Design comes from approved mockups and docs/DESIGN.md. Use the selected tokens and components.
- Use only the approved shell variants in docs/DESIGN.md or docs/TECH-ARCHITECTURE.md. Keep shared chrome
  consistent within each shell; do not invent page-specific header or footer variants.
- If copy, mockup, sitemap, or architecture conflicts, stop and record an open decision. Do not choose silently.

## Working rules

- Make the smallest safe change that completes the exact task.
- Preserve current behavior unless the task explicitly changes it.
- Do not perform unrelated refactors, renames, formatting, dependency changes, or cleanup.
- Do not change a locked stack layer without an explicit owner request.
- Preserve existing user changes. Never reset, discard, or overwrite work to obtain a clean tree.
- For auth, access gates, schema, env handling, security headers, routing, or destructive data behavior,
  explain a short plan before editing.
- If the task is ambiguous, choose the smallest safe interpretation only when it cannot change the result
  materially; otherwise stop and ask.

## Project-specific rules

- `prototype/` is frozen reference material. Never edit it, never import its runtime JS into the app, and
  never treat its demo behaviors (browser-side checkout, sample payment success, local Admin records,
  browser-side role preview) as working integrations. Port its design, copy, data and imagery deliberately.
- Prototype-only mechanisms of the final Admin are **replaced, never ported** (decision D-32 in
  `docs/PROJECT-STATUS.md` §8a names each production replacement and its sprint): the browser passphrase
  vault for private files; the local backup/restore ZIP and "Request persistent storage"; the
  "Download replacement assets" ZIP; "Publish in demo"; the role preview, the sample sign-in code,
  "Sign-out preview" and local staff records; simulated provider outcome selectors and demo tracking
  buttons; the scenario demos (Guided demos, the 23 scenario starts, the scenario indicator and the
  "LOCAL PROTOTYPE" bar — D-31); browser storage of records and files; evidence recorded as file names;
  sample HTML documents; the E10 storefront preview's read of the Admin's intake state, the `?intake=` switch, the `aalishaanIntakeWaitlist` list and its unsigned resume token (D-32j). No sprint builds any of these.
- Admin UI labels are quoted exactly from the final Admin as it renders (after the allow-listed copy
  simplification in `prototype/admin/studio-ui.js`), never from AF1 §3's superseded menu names or from
  retained Admin A1 wording that still surfaces in the package (for example "Return to Today" —
  `docs/PROJECT-STATUS.md` §10 #8). A label the final Admin does not contain goes to
  `docs/content/new-strings.md`.
- Staff roles at launch are the owner plus the two presets of the final Admin, Operations and Customer
  support; refunds and every other finance action are owner-only at launch (D-35). Every Admin request
  is authorised on the server — the prototype's role checks are presentation only
  (`docs/SECURITY-CHECKLIST.md` §9).
- Catalogue seed data comes from `prototype/data/products.json` and `prototype/data/pricing.json`;
  public pages display rupees formatted from paise; every stored monetary value is integer paise.
- Feature and story IDs (O1–O9, C1–C2, P1–P4, S1–S3, R1–R2, G1–G6, US01–US23) are stable references
  from AF1; every Admin sprint names the IDs it implements and its acceptance evidence.
- Owner inputs required before live sales (tax, shipping charges, framed dimensions, cancellation/return/
  refund terms, legal identity, invoice numbering) are configuration, not code: never substitute guessed
  values, zero charges or example rule values; keep the approved "pending" policy copy until the owner
  supplies the real terms.

## Security and environment safety

- For changes to environments, schema, auth, payments, forms, or test configuration, read `docs/ENVIRONMENT-PARITY.md`; refresh the affected proofs before testing or claiming parity.
- Follow the framework boundaries recorded in docs/TECH-ARCHITECTURE.md. Privileged logic and secrets stay
  in framework-defined server-only contexts; client code receives only approved public values.
- Never place a server-only value behind a public env prefix or pass it into client code.
- Never open, read, copy, print, or modify .env.local or another file containing live environment values.
  Use env variable names and documented placeholders only. A placeholder-only .env.example is permitted.
- Never hardcode or echo secrets, credentials, tokens, private keys, database passwords, or private URLs.
  If a leak is suspected, report only the file, line, and secret type; tell the owner to rotate it.
- Every gated route or data path, when the project has one, must enforce session and authorization checks
  server-side before protected data is read. Admin paths also verify the admin role server-side.
- Validate untrusted input. Validate redirect destinations and URL schemes; never feed untrusted data into
  raw HTML. Error responses must not expose internals or upstream bodies.
- Public write endpoints use the abuse controls selected in docs/TECH-ARCHITECTURE.md. Controls configured
  as required in Production fail closed.
- Database changes apply only when the project has a database and follow its selected migration and access
  policy. Ship the required forward/rollback artifacts and policies together. Do not apply a migration
  unless the owner explicitly asks; use a non-production environment first.

## Verification

Run the exact commands defined by the repo and filled task prompt:

1. Typecheck: pnpm typecheck
2. Lint: pnpm lint
3. Tests: pnpm test (Vitest unit/integration; `pnpm test:e2e` runs the Playwright suite in `tests/e2e/` when the sprint touches a flow)
4. Production build: pnpm build
5. Task-specific and manual checks: the sprint prompt's manual/Preview checks — `/browser-qa` evidence at 320 / 768 / 1440 for UI sprints (Admin sprints at 1440 / 1024 / 768 / 390 / 320 against the final Admin — `docs/ROADMAP.md` exit gate, `docs/DESIGN.md` §8), denied-state tests for every protected boundary, and the ENVIRONMENT-PARITY proofs the sprint affects

Do not guess a command or install/change dependencies to make a check run. Report checks that cannot run.
Fix failures caused by the task; label verified pre-existing failures. Review the complete diff and git
status without printing live values. Stage explicit files only when committing is authorized.

## Git and delivery rules

main is protected and production-ready. Use one focused branch per feature or fix, created from current
main. The normal chain is:

branch → implementation → local checks → PR → tested Vercel Preview → independent review →
merge by owner → Production smoke test

- Commit only when the filled task prompt explicitly says **Commit: YES**. Omitted or unfilled means NO.
- Push only when the filled task prompt explicitly says **Push: YES**. Omitted or unfilled means NO.
- Never push to main, push another branch, merge a PR, force-push, or skip hooks.
- One implementation agent owns a branch at a time.

Branch examples: claude/[SPRINT_ID]-short-slug and claude/fix-short-slug.

## Task report

Return:

1. Outcome and scope completed.
2. Files changed.
3. Commands/checks run and exact results.
4. Manual or Preview verification completed.
5. Risks, open decisions, or follow-ups.
6. Branch plus actual commit/push status; include commit SHA/message if committed, otherwise suggest a message.
7. Roadmap/status bookkeeping completed or still required.

## Clarification behavior

Proceed when the task, allowed files, and safety boundaries are clear. Ask only when missing information
would materially change the implementation or an open decision blocks the work.

Next step → AGENTS.md defines the independent review; docs/WORKFLOW.md defines the delivery chain.
