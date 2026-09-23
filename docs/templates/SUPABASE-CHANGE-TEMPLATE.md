# Database Change Record — [CHANGE_NAME]

> One record per database change. Copy, fill, and keep with the PR that ships the change. Skip this template entirely if the project has no database.

## Change

| Field | Value |
|---|---|
| Change name | [CHANGE_NAME] |
| Migration number | [MIGRATION_NUMBER] (next free number — never reuse one) |
| Sprint / PR | [SPRINT_ID] / #[PR_NUMBER] |
| Supabase project(s) | [SUPABASE_PROJECT] (TEST) · [SUPABASE_PROJECT] (PROD) — names/refs only, never keys |
| Change class | [additive/backwards-compatible · reversible schema-only · destructive/data-changing] |
| Data impact | [none · transformed · deleted — name affected data without including PII] |
| Recovery source | [not needed · verified backup/PITR reference + human owner — never credentials] |

## What and why

[One paragraph: what this migration does (tables, columns, functions, policies) and why the sprint needs it. Flag any destructive operation (DROP, DELETE, type change) loudly here.]

## Files

- Up-SQL: `[PATH/TO/NNNN_change_name.sql]`
- Down-SQL: `[PATH/TO/NNNN_change_name.down.sql]` (state exactly what schema it reverses; never claim it restores deleted/transformed data)
- Access policy changes (RLS/policies) included in the same PR: yes — [LIST_POLICIES_OR_"none changed"]

If the change is destructive or data-changing, attach the owner-approved backup/PITR or forward-repair
procedure. A paired down file is still required for the schema plan, but it is not a data backup.

## Security check

- [ ] Default-deny preserved: every user-reachable table still has RLS enabled; no default-allow table shipped
- [ ] Writes are owner-scoped (row access tied to the authenticated user, checked server-side)
- [ ] No anonymous read/write path added unintentionally (list any intentional anon path and why: [ANSWER])
- [ ] Privileged functions: pinned `search_path`, authorization check inside the function, minimal returns, execute revoked from public/anon then granted to the intended role only
- [ ] No secret, key, or connection string in the SQL, the PR, or this record

## Applied and verified

| Environment | Date | Applied by | Verified how |
|---|---|---|---|
| TEST | [DATE] | [WHO] | [Read-only verification: query run + expected result, e.g. table exists, policy list matches, gated function refuses anon] |
| PROD | [DATE] | [WHO — a human runs production by hand] | [Same read-only verification, run after the human applied it] |

Never do this: never apply to production first, never let an AI agent write to production through any channel, and never apply to PROD before TEST is verified.

## Rollback plan

1. Stop or limit writes if continued traffic could compound the damage; record who authorized it.
2. Retreat the dependent code first (revert the PR / promote the previous deploy) when the prior code is compatible with the current schema.
3. Prefer keeping an additive schema and forward-fixing. If a schema rollback is necessary, test the down-SQL on TEST or a restored non-production copy before a human runs it in Production.
4. If data was transformed or deleted, restore it only through the approved backup/PITR or forward-repair procedure named above; down-SQL alone cannot recreate it.
5. Verify schema, policies, critical data invariants, and the affected user flow. Record what was and was not restored.

Order matters: schema deploys before the code that depends on it; on rollback, code normally retreats
first. **Host rollback does not restore the database, and down-SQL does not restore lost data.**

Never do this: never run a destructive down migration merely because a file exists, and never describe a
rollback as complete until both schema and data impact have been verified.

---

Next step → record the change in `docs/PROJECT-STATUS.md` (migration number + verified dates) in the same branch.
