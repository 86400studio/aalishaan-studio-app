# SUPABASE-VERCEL-SETUP.md — Optional Vercel + Supabase Profile

Both parts apply to this project: hosting is Vercel (Part A, S0.1) and database and auth are Supabase (Part B, S0.2). Other providers must implement the equivalent isolation, Preview, access-control, and recovery rules in `TECH-ARCHITECTURE.md`. Names and steps only — **no real values ever go into this or another committed file**.

> Connecting a coding agent to Supabase via **MCP**? Read `SUPABASE-MCP-SAFETY.md` first — non-production only by default; production MCP stays disconnected unless a recorded read-only exception is approved.

## Part A — Only if using Vercel

### A1. Create the project

- [ ] Make `86400studio/aalishaan-studio-app` available on GitHub through the owner-authorized setup workflow — GitHub is the source of truth.
- [ ] In Vercel: **Add New Project** → import `86400studio/aalishaan-studio-app` → confirm the framework preset and install/build commands match `TECH-ARCHITECTURE.md` and the repository manifest.
- [ ] Name the Vercel project `aalishaan-studio-app`; leave the root directory as the repo root unless the app lives in a subfolder.

### A2. Environment variables (per environment)

Vercel has three environments: **Production**, **Preview**, **Development**. Set every variable per environment — same names everywhere, environment-specific values.

- [ ] The authorized owner adds each name from the project's architecture/env list with the correct environment scope; agents never handle or echo values.
- [ ] Mark every server-only value as **Sensitive**.
- [ ] Never copy a Production value into Preview — especially the site URL and any database credentials.
- [ ] After adding or changing any variable: **redeploy**. Existing deployments do not pick up new values; public-prefixed values are baked in at build time.

Why this matters: one shared value across environments is how Preview testing quietly mutates production data.

### A3. Deployment flow

- [ ] Confirm: every PR gets an isolated **Preview** deployment; merges to `main` deploy **Production**.
- [ ] Protect `main` on GitHub (PR + CI green required) so nothing reaches Production without: branch → build → local checks → PR → deployed Preview → Codex review → merge → Production smoke test.

### A4. Custom domain + SSL

- [ ] Add `[DOMAIN]` in Vercel → Domains; follow the DNS instructions shown (Vercel's dashboard is authoritative for the records).
- [ ] Wait for SSL to issue automatically; confirm `https://[DOMAIN]` loads and `http://` redirects to `https://`.
- [ ] Update the site-URL env var (e.g. `NEXT_PUBLIC_SITE_URL`) in **Production only** to `https://[DOMAIN]`, then redeploy.

### A5. Verify on the deployed site

- [ ] `curl -I https://[DOMAIN]` — confirm the security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) are present on the live response, not just in config.
- [ ] Click through the deployed site desktop + mobile; check the browser console for errors.

## Part B — Only if using Supabase

### B0. Decide first

Many websites need no database. Select Supabase only when the approved architecture needs its auth, stored data, or gated-content capabilities; otherwise skip this part and record `None` or the chosen provider.

### B1. Create TWO projects

- [ ] Create `aalishaan-studio-test` (development + Preview) and `aalishaan-studio-prod` (Production). **Never share one database across environments.** (Owner — pending at 2026-09-25; the S0.2 code refuses to run privileged paths until both refs are configured and distinct.)
- [ ] Record project names/refs (never keys) in the project status doc.

### B2. The key boundary

The **only** values that may ever appear in frontend code or public env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only secrets—the secret key (`sb_secret_*` / `service_role`), database password, JWT secret, or connection string—may be read only in trusted server contexts defined by the selected framework. Most sites never need them in app code at all.

**Never do this:**
- Never put any of those behind a `NEXT_PUBLIC_*` name.
- Never import them into browser/client code or pass them through serialized props.
- Never write them into any committed file, doc, PR, or screenshot.
- If one is ever exposed: rotate it immediately — do not try to scrub git history.

### B3. Auth & sessions

- [ ] Use Supabase's current integration pattern for the locked framework (for example, its SSR package where server rendering is used): separate public/browser and trusted server clients, with correct session refresh. (S0.2, 2026-09-25: the two clients exist without an SSR/auth package — `src/lib/supabase/browser.ts` reads the two public values only; `src/lib/server/supabase.ts` is `server-only`, session-less and identity-checked. Session handling, refresh and the redirect allow-list arrive with staff auth at S1.2.)
- [ ] Set a separate Site URL and redirect allow-list for each project: TEST permits localhost and this project's Preview hosts; PROD permits only approved production callback URLs. Use exact production paths and narrowly scoped Preview patterns; see `ENVIRONMENT-PARITY.md` §7.6.
- [ ] Confirm auth emails use the template's dynamic redirect variable, not a hardcoded site URL — otherwise Preview signups get sent to Production.

### B4. RLS from day one

- [ ] Enable Row Level Security **default-deny on every user-reachable table before any user data lands**. Then add minimum-grant, owner-scoped policies.

Why this matters: RLS is the last line of defense when application code gets a check wrong.

### B5. Migration workflow

- [ ] Every schema change lives in the repo as numbered SQL: up-SQL + a paired `.down.sql` + the RLS policies, all in the same PR. (S0.2 layout, 2026-09-25: `supabase/migrations/NNNN_name.sql` + `supabase/rollbacks/NNNN_name.down.sql` — the down file deliberately outside forward discovery — + `docs/database-changes/<sprint>-<change>.md`; the first change, `0000_init`, is drafted and unapplied; CLI usage in `supabase/README.md`.)
- [ ] Apply through the project's approved migration procedure: **TEST first → verify per role → owner approval → PROD**. Do not let an AI agent apply a Production migration without explicit authorization.
- [ ] Keep changes backwards-compatible so code and schema can deploy independently — a hosting rollback does NOT roll back the database.

### B6. Wire Vercel env vars to Supabase

| Env var name | Value | Production | Preview / Development | Public or server-only |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | *(never write here)* | PROD project URL | TEST project URL | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | *(never write here)* | PROD publishable key | TEST publishable key | Public |
| `NEXT_PUBLIC_SITE_URL` | *(never write here)* | `https://[DOMAIN]` | Preview origin (or unset) | Public |
| `SUPABASE_SECRET_KEY` *(only if truly needed)* | *(never write here)* | PROD secret | TEST secret | Server-only, Sensitive |
| `SUPABASE_TEST_PROJECT_REF` / `SUPABASE_PROD_PROJECT_REF` (S0.2) | *(the two refs — non-secret identifiers, recorded by name in `PROJECT-STATUS.md` §9)* | both refs | both refs | Server-only configuration |
| `S0_2_PROOF_TOKEN` (S0.2 only; removed by S1.1) | *(never write here)* | **absent** | Preview only (not Development) | Server-only, Sensitive |

⚠️ **The Value column stays blank forever.** Real values live only in an ignored local env file and the Vercel dashboard. Agents do not open or copy them. Never fill values into this or any committed file.

- [ ] Preview + Development point at the **TEST** project; Production points at the **PROD** project.
- [ ] After wiring: invite a TEST staff user from a Preview deploy and confirm the confirmation email links back to the **Preview** origin, and the new user appears in the **TEST** project — not PROD.

Next step → read `docs/ENV-VARS-SAFETY.md` before handling any secret, then run `docs/SECURITY-CHECKLIST.md` before launch.
