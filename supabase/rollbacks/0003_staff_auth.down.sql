-- 0003_staff_auth.down.sql — the schema-recovery artifact paired with supabase/migrations/0003_staff_auth.sql (S1.2).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is run only on a written authorisation
-- that names this file and the project, after the checks in docs/database-changes/S1.2-0003-staff-auth.md →
-- "Rollback plan", and only when forward-fixing is not possible — on TEST by the owner in the SQL editor or by
-- the builder under the owner's scoped delegation (docs/database-changes/S1.1-0001-catalogue.md → "Rollback
-- rehearsal" states who and how), on PROD by the human owner only.
-- It DROPS the three S1.2 columns of staff_profiles and so DELETES every member's recorded MFA enrolment time,
-- revocation time and revocation reason — down-SQL reverses schema, never data. The Auth users, their
-- factors and sessions (Supabase Auth's own tables) and the audit rows (the S1.1 audit_log) are not touched.
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the reversal is recorded
-- afterwards with `supabase migration repair --status reverted 0003 --project-ref <REF>` for the same project.

drop policy if exists staff_profiles_select_own on public.staff_profiles;
revoke select on table public.staff_profiles from authenticated;

drop function if exists public.staff_permission_areas(public.staff_role);
drop type if exists public.permission_area;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_revoked_not_active,
  drop constraint if exists staff_profiles_revoked_reason_length,
  drop column if exists revoked_reason,
  drop column if exists revoked_at,
  drop column if exists mfa_enrolled_at;
