# Testing Setup — Start Here

This folder is the **Launch Gate**: the system that proves every feature of a website works — big or small — *before* real users can find out that it doesn't.

It is self-contained. Drop it into a brand-new build (the SOP path) or into any **existing** website repo (the retrofit path) — it works the same way in both.

## What it does, in one paragraph

Claude Code scans the entire repository (not just the docs — the actual code: every page, form, endpoint, database rule, and email trigger), writes a plain-English list of every feature, and you approve that list. It then turns every approved line into an automated Playwright test — a robot user that clicks, signs staff in, fills forms, and pays with a Razorpay test card in Test Mode. The robot runs all the tests, delivers a PASS/FAIL report in plain words, failures become a normal fix sprint, and the gate re-runs until everything is green. Green = good to launch. After launch, a small daily "morning check" re-runs the most critical tests against the live site and emails you only when something fails.

## The five steps

1. **Setup** (once per site) — `SETUP-CHECKLIST.md`
2. **Feature list** — Claude Code drafts it; **you approve it** (your ten most important minutes)
3. **Tests written** — one test per approved line, including "people who shouldn't get in, can't"
4. **Run → report** — full run, plain-English PASS/FAIL report with severities
5. **Fix → re-run → GO** — failures become a fix sprint; failed tests re-run while fixing; the **full suite** re-runs before the GO verdict

Then: approve the 5–7 morning-check tests and launch through `docs/LAUNCH-CHECKLIST.md` as usual.

## Files in this folder

| File | What it is | Who reads it |
|---|---|---|
| `TESTING-GUIDE.md` | The plain-English guide to the whole system | **You** — read this first |
| `SETUP-CHECKLIST.md` | The one-time setup, step by step, marked You / Claude Code | You + Claude Code |
| `activate-testing.md` — installed as `.claude/skills/activate-testing/SKILL.md` (not kept in this folder) | The Claude Code skill that runs steps 2–5 | Claude Code |
| `templates/FEATURE-LIST-TEMPLATE.md` | Skeleton for the feature list you approve | Claude Code fills, you approve |
| `templates/TEST-REPORT-TEMPLATE.md` | Skeleton for the PASS/FAIL report | Claude Code fills, you read |
| `templates/MORNING-CHECK-TEMPLATE.md` | The daily GitHub check + how alerts reach you | Claude Code installs, you approve |

## Copy map (when applying to a project repo)

| This folder's item | Project repository location |
|---|---|
| Entire folder (except the skill) | `docs/testing-setup/` |
| `activate-testing.md` — the Claude Code skill | `.claude/skills/activate-testing/SKILL.md` (rename to `SKILL.md`) |
| Generated feature list | `docs/FEATURE-LIST.md` |
| Generated test reports | `docs/test-reports/[YYYY-MM-DD]-test-report.md` |
| Generated tests | `tests/e2e/` |
| Morning check workflow | `.github/workflows/morning-check.yml` |
| Companion from the development folder: `ENVIRONMENT-PARITY.md` | `docs/ENVIRONMENT-PARITY.md` — fill applicable services; use existing equivalent evidence when retrofitting |

## Retrofit rule (existing websites)

An existing site does not need the rest of the development system re-applied. Copy this folder and the environment-parity companion per the map above, preserving existing project records; run `SETUP-CHECKLIST.md`, then say `/activate-testing`. Use the site's existing safe environments and equivalent evidence; fix only demonstrated gaps. The code scan identifies what exists, and the approved requirements identify anything missing.

## First action

Read `TESTING-GUIDE.md` once (15 minutes). Then run `SETUP-CHECKLIST.md`.
