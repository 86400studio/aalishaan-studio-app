# ENV-VARS-SAFETY.md — Environment Variables, In Plain English

The rules for handling configuration values and secrets on Aalishaan Studio. Read this once before touching any key; follow the procedures every time after.

## What env vars are

Environment variables are named values the app reads at build or run time — things like "which database URL do I talk to" or "what's the email provider's API key". They let the same code run in different environments (local, Preview, Production) with different values, and they keep secrets out of the code itself. The code references the NAME; the VALUE lives outside the repo.

## The two classes

**PUBLIC** — carries the selected framework's public prefix (for example, `NEXT_PUBLIC_*` in Next.js or `VITE_*` in Vite). Record the actual prefix in `TECH-ARCHITECTURE.md`.

- Inlined into the browser bundle **at build time**. Treat as world-readable, forever.
- Only ever: URLs, publishable/anon keys, and site config (e.g. `NEXT_PUBLIC_SITE_URL`).
- If you wouldn't print it on the homepage, it doesn't get the public prefix.

**PRIVATE** — everything else: provider API keys, secret keys, database credentials, JWT secrets.

- Read only in trusted server/build contexts defined by the locked framework.
- Never imported into browser code or passed through serialized props, HTML, logs, or error responses.

Why this matters: the prefix is not decoration — it is the boundary between "public forever" and "secret". One misprefixed key is a full leak.

## What never goes into client code

- The database secret / service-role key (it bypasses row-level security)
- Any provider API key or token (email, payments, CAPTCHA secret, rate limiter)
- Database passwords or connection strings
- JWT or session-signing secrets
- Webhook signing secrets
- Anything from a live env file that is not explicitly public

## What never gets committed

- `.env.local` or any project-specific live env file — ever. Confirm the selected filename is ignored on day one.
- Any file containing a real value — including docs, PR descriptions, and screenshots.
- The ONLY env file in git is `.env.example`: variable NAMES + safe placeholders, no real values. (Make sure `.gitignore` doesn't accidentally swallow it — whitelist with `!.env.example` if needed.)

**Never do this:** never paste a real key into a chat, a commit message, a code comment, or a "temporary" file. AI agents must not open, print, copy, or edit live env files. They verify ignore/tracked state without reading values.

## Where values live

| Context | Where the value lives |
|---|---|
| Local development | `.env.local` (gitignored, on the authorized operator's machine only) |
| Deployed Preview / Production | `Vercel` environment/secret settings, scoped per environment |

Same names everywhere; environment-specific values. Never copy a Production value into Preview.

## The change procedure (new or updated var)

1. Add the NAME (never the value) to `.env.example` and note it in the architecture doc, marked public or server-only.
2. The authorized owner sets the real value in the hosting/secret dashboard for each environment and in the ignored local env file where needed.
3. **Redeploy.** Existing deployments do not pick up changed values — and public values are baked in at build time, so they require a fresh build to take effect.
4. Verify the feature actually works on the deployed site, not just locally.

## The leak procedure

1. **Rotate the key immediately** at the provider. Do this FIRST — before any cleanup, before investigating how it happened.
2. The authorized owner updates the new value in every affected host environment and local machine; redeploy.
3. Then clean up: remove the value from wherever it leaked and fix the process that let it happen.
4. Record the incident in the decision/status log.

Why rotation comes first: git history, forks, caches, and screenshots are forever — the key was compromised the moment it was exposed. Scrubbing history is not a fix; a dead key is.

## Quick reference

| Value type | NAME | Public or private | Where it lives |
|---|---|---|---|
| Site URL | `NEXT_PUBLIC_SITE_URL` | Public | Local + Vercel environments (Production = D-04 domain) |
| Supabase project URL | `NEXT_PUBLIC_SUPABASE_URL` | Public | Local + Vercel; Preview/Development → TEST project, Production → PROD project |
| Supabase publishable key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Local + Vercel; Preview/Development → TEST project, Production → PROD project |
| Supabase secret key (webhooks, worker, exports, admin server actions) | `SUPABASE_SECRET_KEY` | Private | Vercel (Sensitive), per environment; server-only contexts only |
| Razorpay key id (Checkout.js) | `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Public | Test mode in Preview/local; Live only in Production (S3.3) |
| Razorpay key secret (Orders, refunds) | `RAZORPAY_KEY_SECRET` | Private | Test mode in Preview/local; Live only in Production (S3.3) |
| Razorpay webhook signature | `RAZORPAY_WEBHOOK_SECRET` | Private | Test mode in Preview/local; Live only in Production (S3.3) |
| Shiprocket (serviceability, shipments, tracking webhook) | `SHIPROCKET_API_EMAIL` / `SHIPROCKET_API_PASSWORD` / `SHIPROCKET_WEBHOOK_TOKEN` | Private | Test account in Preview/local; Live only in Production (S3.3) |
| Email provider (outbox; Supabase Auth SMTP) | `EMAIL_API_KEY` / `EMAIL_FROM_ADDRESS` (provider-specific names once D-06 is resolved) | Private | Isolated test destination in Preview/local; live domain in Production |
| Bot-protection secret | `TURNSTILE_SECRET_KEY` | Private | All environments (test keys outside Production) |
| Bot-protection site key | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public | All environments (test keys outside Production) |
| Rate limiting (public writes, staff login) | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Private | TEST database outside Production |
| Worker route authentication (`/api/jobs/run`) | `CRON_SECRET` | Private | All environments |
| Checkout enablement (`off` / `test` / `live`, with `business_rules.sales_open`) | `SALES_MODE` | Private (server-only config, not a secret) | `off` everywhere until S3.4 (Preview `test` from S1.6) |
| Error tracking and source maps | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Private / Public / build-only | One Sentry project for every environment (D-23); events are tagged `development` / `preview` / `production` from Vercel's `VERCEL_ENV`. The owner enters the DSN in Vercel Preview and Production (Development optional); `SENTRY_AUTH_TOKEN` only in the Preview and Production build scopes |
| Source-map upload target | `SENTRY_ORG` / `SENTRY_PROJECT` | Build-only, not secret | Vercel Preview and Production builds (S0.1) |
| Temporary Sentry test route (S0.1 → removed by S0.2) | `SENTRY_TEST_TOKEN` | Private (server-only) | A distinct value in Preview and in Production, at least 32 random characters, entered by the owner; revoked when S0.2 removes the route |
| Launch Gate and morning-check harness; Preview protection bypass | `PLAYWRIGHT_BASE_URL` / `VERCEL_AUTOMATION_BYPASS_SECRET` | Private (CI / server-only) | GitHub Actions secrets and local shell only |

These are this project's names (`TECH-ARCHITECTURE.md` §6 is authoritative and `PROJECT-STATUS.md` §9 mirrors it; names are proposed until S0.1/S0.2 make them real). Never fill a value into this document.

Next step → record the selected host/env model in `docs/TECH-ARCHITECTURE.md`; use `docs/SUPABASE-VERCEL-SETUP.md` only when that profile is selected.
