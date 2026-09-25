-- 0000_init — the S0.2 baseline (additive; docs/ROADMAP.md S0.2, docs/TECH-ARCHITECTURE.md §4).
--
-- Applied to TEST (aalishaan-studio-test) by the authorised trusted process and to PROD (aalishaan-studio-prod)
-- by the human owner only; the exact procedure, verification and ledger steps are in
-- docs/database-changes/S0.2-0000-init.md. The paired schema-recovery artifact is
-- supabase/rollbacks/0000_init.down.sql — deliberately outside supabase/migrations/, so forward discovery
-- (`supabase db push`) can never run it.
--
-- Contents, in order:
--   (1) public.set_updated_at()          — BEFORE UPDATE trigger function that maintains updated_at.
--   (2) public.lock_down_table(regclass) — the default-deny helper: enables row level security and revokes
--                                          every privilege from public, anon and authenticated.
--   (3) public.system_checks             — the server-only table behind GET /api/health and the namespaced
--                                          synthetic fixtures of the S0.2 harness, locked down through (2).
--
-- No product, auth or storage object is created. No policy opens any table to anon or authenticated: after
-- this file only the service_role key (the server-only SUPABASE_SECRET_KEY) can read or write system_checks.
-- The CLI sends the whole file as one pipelined batch that ends with the migration-ledger insert, so a
-- failing statement rolls the file back; the dashboard SQL editor runs a pasted script as one implicit
-- transaction for the same reason.

-- (1) updated_at maintenance -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'S0.2 baseline: BEFORE UPDATE trigger function that sets updated_at to now(). Pinned empty search_path.';

-- No API role calls this directly. The trigger fires for the server's DML, so service_role keeps EXECUTE
-- explicitly (a trigger function cannot be invoked as a plain function anyway); anon and authenticated lose it.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

-- (2) default-deny helper -------------------------------------------------------------------------------------

create or replace function public.lock_down_table(target regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- A regclass renders as a correctly quoted, schema-qualified identifier, so no untrusted text ever
  -- reaches the DDL below; an unknown table fails at the cast, before this body runs.
  execute format('alter table %s enable row level security', target);
  execute format('revoke all privileges on table %s from public, anon, authenticated', target);
end;
$$;

comment on function public.lock_down_table(regclass) is
  'S0.2 baseline: default-deny helper — enables RLS and revokes every privilege from public, anon and authenticated. Migration-time use only; EXECUTE is granted to no API role.';

-- Migration-time helper for the migration role (the function owner) only: no API role may call it.
revoke execute on function public.lock_down_table(regclass) from public, anon, authenticated, service_role;

-- (3) system_checks -------------------------------------------------------------------------------------------

create table public.system_checks (
  id         uuid        not null default gen_random_uuid(),
  -- Namespaced key: fixture:<name> (seed skeleton), integration:<run> (tests), s0-2-proof:<run> (the Preview
  -- proof); the S2.20 probes add their own namespace. One row per key so a fixture is exact to clean up.
  check_key  text        not null,
  status     text        not null,
  -- Every harness row is synthetic; the S2.20 probes write real rows with synthetic = false.
  synthetic  boolean     not null default false,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_checks_pkey primary key (id),
  constraint system_checks_check_key_key unique (check_key),
  constraint system_checks_check_key_shape check (check_key ~ '^[a-z0-9][a-z0-9:_.-]{0,118}[a-z0-9]$'),
  constraint system_checks_status_allowed check (status in ('ok', 'degraded', 'failed')),
  constraint system_checks_note_length check (note is null or char_length(note) <= 500)
);

comment on table public.system_checks is
  'S0.2 baseline: operational status rows behind GET /api/health (status only, never rows) and the namespaced synthetic fixtures of the test harness. Server-only: no anon or authenticated access.';
comment on column public.system_checks.check_key is
  'Namespaced key (fixture:, integration:, s0-2-proof:, later the S2.20 probes); unique, 2–120 chars of [a-z0-9:_.-].';
comment on column public.system_checks.synthetic is
  'true for every harness row; the S0.2 fixture, proof and reset tools only ever touch synthetic rows in their own namespace.';

create trigger system_checks_set_updated_at
  before update on public.system_checks
  for each row execute function public.set_updated_at();

-- Default deny from creation: RLS on, no policy, no anon/authenticated privilege. Only the server-only
-- service_role key (which bypasses RLS) keeps access, granted explicitly rather than through defaults.
select public.lock_down_table('public.system_checks');
grant select, insert, update, delete on table public.system_checks to service_role;
