-- 0003_staff_auth — S1.2: staff identity and RBAC, the database half (docs/database-changes/S1.2-0003-staff-auth.md;
-- docs/TECH-ARCHITECTURE.md §4 row 0003, §5; docs/ROADMAP.md S1.2; decisions D-32e, D-35).
--
-- Additive only, on the S1.1 staff table:
--   * three columns on staff_profiles — mfa_enrolled_at (set by the server when a TOTP factor is verified),
--     revoked_at and revoked_reason (set by the server when access is revoked; a revoked row is never active);
--   * the enum permission_area — the six areas of the final Admin's own guards (work, support, finance,
--     catalogue, settings, export) — and staff_permission_areas(staff_role), the one place the database states
--     which areas a role holds: owner_admin all six, operations work + catalogue, support support (D-35).
--     The server mirrors this mapping in src/lib/staff/permissions.ts and a hermetic test keeps the two equal;
--   * the first row-level policy of the project: an authenticated staff member may SELECT their own
--     staff_profiles row, and only with a session at authenticator assurance level aal2 (MFA verified). Owner
--     reads of other rows stay on the server through the privileged client — no self-referencing policy and no
--     SECURITY DEFINER helper, so the policy cannot recurse and nothing bypasses RLS.
--
-- Not here: Auth users (created by the admin API — the TEST tool on TEST, the owner at S3.3 on PROD; the app
-- never offers sign-up), sessions, MFA factors (Supabase Auth's own tables), the audit rows (written by the
-- server into the S1.1 audit_log), invitations and presets (S2.1, 0005_settings). Every function stays
-- pinned to an empty search_path; nothing is SECURITY DEFINER; TRUNCATE stays revoked; anon keeps nothing.

-- (1) MFA and revocation state on the staff row ----------------------------------------------------------

alter table public.staff_profiles
  add column mfa_enrolled_at timestamptz,
  add column revoked_at      timestamptz,
  add column revoked_reason  text,
  add constraint staff_profiles_revoked_reason_length
    check (revoked_reason is null or char_length(revoked_reason) <= 500),
  -- A revoked member is never active; a disabled member (S2.1) may be inactive without a revocation.
  add constraint staff_profiles_revoked_not_active
    check (revoked_at is null or active = false);

comment on column public.staff_profiles.mfa_enrolled_at is
  'S1.2: when the server last recorded a verified TOTP factor for this member (the factor itself lives in Supabase Auth). NULL until the first enrolment; informational — the guard reads the Auth server''s factor list and assurance level, never this column, to decide access.';
comment on column public.staff_profiles.revoked_at is
  'S1.2: when access was revoked by the owner (active = false at the same time; the Auth user is banned so tokens stop refreshing). The guard denies an inactive row on every request. NULL while access stands.';
comment on column public.staff_profiles.revoked_reason is
  'S1.2: the owner''s stated reason for the revocation (also written to audit_log). At most 500 characters.';

-- (2) permission areas -----------------------------------------------------------------------------------

create type public.permission_area as enum ('work', 'support', 'finance', 'catalogue', 'settings', 'export');

comment on type public.permission_area is
  'S1.2: the six permission areas of the final Admin (prototype/admin/state.js guard()); finance, settings and export are owner-only at launch (D-35).';

create or replace function public.staff_permission_areas(role public.staff_role)
returns public.permission_area[]
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'owner_admin' then array['work', 'support', 'finance', 'catalogue', 'settings', 'export']::public.permission_area[]
    when 'operations'  then array['work', 'catalogue']::public.permission_area[]
    when 'support'     then array['support']::public.permission_area[]
  end
$$;

comment on function public.staff_permission_areas(public.staff_role) is
  'S1.2: the permission areas a staff role holds (D-35) — the database statement of the mapping the server mirrors in src/lib/staff/permissions.ts. Immutable; pinned empty search_path; not SECURITY DEFINER; reads no table.';

-- Readable by signed-in staff (later policies may call it) and by the server; never anonymously.
revoke execute on function public.staff_permission_areas(public.staff_role) from public, anon;
grant execute on function public.staff_permission_areas(public.staff_role) to authenticated, service_role;

-- (3) the first row-level policy: a staff member reads their own row, at aal2 only -------------------------

-- 0002 revoked every privilege from authenticated; SELECT alone comes back, under the policy below. No INSERT,
-- UPDATE or DELETE for authenticated: every write to this table is the server's, after its own guard.
grant select on table public.staff_profiles to authenticated;

create policy staff_profiles_select_own on public.staff_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );

comment on policy staff_profiles_select_own on public.staff_profiles is
  'S1.2: a signed-in staff member reads their own profile row, and only with a session that has passed MFA (aal2). No other row, no write. Owner reads of other members stay on the server (privileged client, after the server guard).';
