# Morning Check — Daily Watch on the Live Site

> After the Launch Gate passes, GitHub re-runs the 5–7 owner-approved safe checks against the live site daily and notifies on failure. Confirm a recent successful run as well as the alert channel: silence alone does not prove a run happened. These checks cover selected pages/login behavior; provider alerts or separate approved checks must cover actual form delivery and payment processing.

## Rules

- [ ] Only **safe-to-repeat** tests are included: pages render clean, login with the dedicated test staff account, staff access allowed / visitor denied, the checkout page behaves. **Nothing that creates real data** — no purchases, no signups, no emails to real inboxes. (The one real manual test submission remains a launch-checklist human task.)
- [ ] The selection (5–7 specs, tagged `@morning`) is proposed by Claude Code and **approved by the owner** before the workflow is enabled.
- [ ] Failure notifications verified: the owner has confirmed receiving GitHub's failure email once (see below).
- [ ] Any morning-check failure is handled through `docs/error-tracking/` as an incident — same lane as everything else.

- [ ] Follow `docs/ENVIRONMENT-PARITY.md` §10: validate the Production target and selected specs; allow only the dedicated account credentials, never Preview bypass or privileged provider secrets. Account login creates session/audit activity; it is the narrow approved exception to public reads.
- [ ] Verify a recent scheduled success and investigate missing runs; record a missed-run alert mechanism where uptime monitoring is required.

## The workflow file → `.github/workflows/morning-check.yml`

```yaml
name: Morning Check
on:
  schedule:
    - cron: "30 1 * * *"   # daily 01:30 UTC = 07:00 IST — GitHub cron is UTC; adjust to taste
  workflow_dispatch:         # allows a manual run anytime from the Actions tab
jobs:
  morning-check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Run @morning tests against production
        run: pnpm exec playwright test --grep "@morning"
        env:
          PLAYWRIGHT_BASE_URL: ${{ vars.PRODUCTION_URL }}
          MORNING_TEST_EMAIL: ${{ secrets.MORNING_TEST_EMAIL }}
          MORNING_TEST_PASSWORD: ${{ secrets.MORNING_TEST_PASSWORD }}
```

Setup notes (Claude Code fills, owner clicks):
- [ ] **You:** in the GitHub repo → Settings → Secrets and variables → Actions: add the variable `PRODUCTION_URL` and the two test-account secrets above. Values go **only** into that screen — never into files or chat. The test account is a dedicated, obviously-fake production login used for nothing else.
- [ ] **Claude Code:** tag the approved specs `@morning`; commit the workflow via the normal PR flow; confirm the spec set matches the owner-approved list exactly.

## How the alert reaches you

GitHub emails the repo owner automatically when a scheduled workflow **fails**. To make sure it is on:

- [ ] **You:** GitHub → your avatar → Settings → Notifications → Actions → check **"Only notify for failed workflows"** (and email as a channel).
- [ ] **You + Claude Code:** verify once — Claude Code triggers a deliberately failing manual run, you confirm the email arrived, Claude Code removes the deliberate failure. An unverified alert channel is the same as no alert channel.

## When a morning check fails

Do not panic-fix on `main`. Say: *"/handle-error — the morning check failed today, here's the email."* It follows the normal incident lane (`docs/error-tracking/ERROR-TRACKING-GUIDE.md`): understand → severity → fix sprint → the fixed thing gets a stronger test.
