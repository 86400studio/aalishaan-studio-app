-- 0002_orders — S1.1 (additive; docs/ROADMAP.md S1.1, docs/TECH-ARCHITECTURE.md §4, §5).
--
-- The records that cannot change after the first real order: customer contact and addresses, orders with
-- gapless AS-#### numbering and five separate statuses, order items, immutable purchase snapshots, policy
-- versions, versioned business rules, payment attempts, the provider-event ledger, the pending-work outbox
-- with its history, the insert-only audit log, and the staff profile with its role enum.
-- Applied to TEST by the owner-authorised trusted process and to PROD by the human owner only; procedure,
-- verification and ledger steps in docs/database-changes/S1.1-0002-orders.md. The paired schema-recovery
-- artifact is supabase/rollbacks/0002_orders.down.sql — outside supabase/migrations/ on purpose.
--
-- Contracts (S1.1 step 1; the change record carries the full inventory):
--   * money: integer bigint paise, INR only; total_paise = subtotal + coalesce(shipping) + coalesce(tax) —
--     shipping and tax stay NULL until the owner supplies them (OI-02, OI-03), never zero or a guess;
--   * numbering (D-09): orders.order_number = 'AS-' || n from a locked transactional counter row, assigned by
--     a BEFORE INSERT trigger — never by the caller of an order insert, never by a sequence (a rolled-back
--     insert consumes no number); the counter starts at 1001; no anonymous allocation path exists. Two limits,
--     both rules for the server code rather than database guards: orders are written with a plain INSERT only
--     (a row absorbed by ON CONFLICT has already taken a number), and the server role holds UPDATE on the
--     counter and EXECUTE on next_order_number() only because the trigger runs as the inserting role — nothing
--     but the order insert may use them;
--   * the confirmation token (D-09): orders.confirmation_token_hash is the lower-case hex SHA-256 of an opaque
--     token of at least 256 random bits that S1.6 issues and S1.7's /order/[token] verifies; the raw token is
--     never stored or logged; the column is NULL until issued and unique when present;
--   * immutability by trigger, for every role including the server's service_role: purchase_snapshots,
--     policy_versions, business_rules, addresses, work_history and audit_log refuse UPDATE and DELETE;
--     provider_events refuses DELETE and any UPDATE of its ledger fields (processing marks may change);
--     TRUNCATE is revoked from every API role;
--   * optimistic concurrency: orders.version is bumped by the database on every UPDATE;
--   * staff roles: the enum owner_admin / operations / support (D-35); staff_profiles rows arrive with real
--     Supabase Auth users in S1.2 — nothing is seeded, no demo staff;
--   * every table is private (RLS on, no policy, no anon/authenticated privilege); service_role holds only
--     the privileges each table's write rule needs; staff policies arrive with 0003_staff_auth.
--
-- Default deny is applied explicitly through public.lock_down_table(regclass) (0000_init); the platform's
-- ensure_rls event trigger is neither relied on nor altered. No DROP, DELETE, TRUNCATE or type change; no
-- SECURITY DEFINER; the one row this file inserts is the numbering counter's singleton. The CLI sends the
-- file as one pipelined batch ending with the ledger insert, so a failing statement rolls the file back.

-- (1) shared trigger functions ------------------------------------------------------------------------------

-- Refuses the operation outright: the append-only guard, independent of the caller's role.
create or replace function public.refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%.% is append-only: % is not allowed', tg_table_schema, tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

comment on function public.refuse_change() is
  'S1.1: BEFORE UPDATE OR DELETE trigger function that refuses the operation — the append-only guard of snapshots, ledgers and the audit log, for every role including service_role. Pinned empty search_path.';

revoke execute on function public.refuse_change() from public, anon, authenticated;
grant execute on function public.refuse_change() to service_role;

-- (2) staff --------------------------------------------------------------------------------------------------------

create type public.staff_role as enum ('owner_admin', 'operations', 'support');

comment on type public.staff_role is
  'S1.1: the owner plus the two presets of the final Admin — Operations and Customer support (D-35).';

create table public.staff_profiles (
  user_id      uuid              not null,
  role         public.staff_role not null,
  display_name text              not null,
  active       boolean           not null default true,
  created_at   timestamptz       not null default now(),
  updated_at   timestamptz       not null default now(),
  constraint staff_profiles_pkey primary key (user_id),
  constraint staff_profiles_user_id_fkey foreign key (user_id)
    references auth.users (id) on delete restrict,
  constraint staff_profiles_display_name_length check (char_length(display_name) between 1 and 120)
);

comment on table public.staff_profiles is
  'S1.1: one row per staff Auth user with its role (D-35). Rows arrive with real Supabase Auth users in S1.2; no demo staff is seeded. Private; staff policies arrive with 0003_staff_auth.';

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles for each row execute function public.set_updated_at();

-- (3) business rules and policy versions (versioned, append-only) ---------------------------------------------

create table public.business_rules (
  version                      integer     not null,
  effective_from               timestamptz not null,
  approver_name                text        not null,
  approver_staff_id            uuid,
  synthetic                    boolean     not null,
  sales_open                   boolean     not null,
  sales_open_reason            text,
  pending_order_expiry_minutes integer     not null,
  shipping_paise               bigint,
  tax_treatment                text,
  note                         text,
  created_at                   timestamptz not null default now(),
  constraint business_rules_pkey primary key (version),
  constraint business_rules_approver_staff_id_fkey foreign key (approver_staff_id)
    references public.staff_profiles (user_id) on delete restrict,
  constraint business_rules_version_positive check (version >= 1),
  constraint business_rules_approver_name_length check (char_length(approver_name) between 1 and 120),
  constraint business_rules_sales_open_reason_allowed check (sales_open_reason in ('prelaunch', 'capacity')),
  -- A closed store always carries its reason; an open one never does (D-37: prelaunch until S3.4, capacity for the S2.21 pause).
  constraint business_rules_sales_open_reason_consistent check (sales_open = (sales_open_reason is null)),
  constraint business_rules_expiry_bounded check (pending_order_expiry_minutes between 1 and 1440),
  constraint business_rules_shipping_paise_bounded check (shipping_paise is null or (shipping_paise >= 0 and shipping_paise <= 100000000000)),
  constraint business_rules_tax_treatment_allowed check (tax_treatment is null or tax_treatment in ('inclusive', 'exclusive')),
  constraint business_rules_note_length check (note is null or char_length(note) <= 500)
);

comment on table public.business_rules is
  'S1.1: effective-dated rule versions (append-only). synthetic = true marks placeholder values until the owner''s inputs (S3.1); sales_open with its reason is the S1.6 sales gate and the S2.21 pause (D-37); pending_order_expiry_minutes is the D-20 expiry as a rule, not a code constant. The approver is recorded by name (and by staff id once S1.2 creates users).';
comment on column public.business_rules.shipping_paise is
  'Integer paise or NULL while the owner has not supplied shipping charges (OI-03) — never zero as a guess.';

create trigger business_rules_append_only
  before update or delete on public.business_rules for each row execute function public.refuse_change();

create table public.policy_versions (
  id             uuid        not null default gen_random_uuid(),
  policy_key     text        not null,
  version        integer     not null,
  title          text        not null,
  intro          text        not null,
  body           jsonb       not null,
  terms_status   text        not null default 'pending',
  source         text        not null,
  effective_from timestamptz,
  created_at     timestamptz not null default now(),
  constraint policy_versions_pkey primary key (id),
  constraint policy_versions_key_version_key unique (policy_key, version),
  constraint policy_versions_key_allowed check (policy_key in (
    'shipping', 'cancellation', 'returns', 'refunds', 'privacy', 'terms', 'cookies'
  )),
  constraint policy_versions_version_positive check (version >= 1),
  constraint policy_versions_title_length check (char_length(title) between 1 and 160),
  constraint policy_versions_intro_length check (char_length(intro) <= 300),
  constraint policy_versions_body_is_array check (jsonb_typeof(body) = 'array'),
  constraint policy_versions_terms_status_allowed check (terms_status in ('pending', 'effective')),
  constraint policy_versions_source_length check (char_length(source) between 1 and 300)
);

comment on table public.policy_versions is
  'S1.1: the seven policy pages as versions (append-only): body = [{"heading","text"}] verbatim from the approved prototype page; terms_status = pending until the owner supplies the real terms (S3.1, OI-05). Orders snapshot the version ids that applied at purchase.';

create trigger policy_versions_append_only
  before update or delete on public.policy_versions for each row execute function public.refuse_change();

-- (4) customers and addresses -------------------------------------------------------------------------------------

create table public.customers_contact (
  id         uuid        not null default gen_random_uuid(),
  email      text,
  phone      text,
  name       text,
  synthetic  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_pkey primary key (id),
  constraint customers_contact_has_contact check (email is not null or phone is not null),
  constraint customers_contact_email_shape check (
    email is null or (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 254)
  ),
  -- The checkout's own rule for an Indian mobile number (locked-facts §6).
  constraint customers_contact_phone_shape check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  constraint customers_contact_name_length check (name is null or char_length(name) between 1 and 120)
);

create index customers_contact_email_idx on public.customers_contact (email);

comment on table public.customers_contact is
  'S1.1: the guest contact of an order (D-PRE-03: no accounts). PII — private, never projected; synthetic = true marks harness rows on TEST. Retention is owner input OI-10.';

create trigger customers_contact_set_updated_at
  before update on public.customers_contact for each row execute function public.set_updated_at();

create table public.addresses (
  id             uuid        not null default gen_random_uuid(),
  customer_id    uuid        not null,
  recipient_name text        not null,
  line1          text        not null,
  line2          text,
  city           text        not null,
  state          text        not null,
  pincode        text        not null,
  country        char(2)     not null default 'IN',
  phone          text,
  created_at     timestamptz not null default now(),
  constraint addresses_pkey primary key (id),
  constraint addresses_customer_id_fkey foreign key (customer_id)
    references public.customers_contact (id) on delete restrict,
  constraint addresses_recipient_name_length check (char_length(recipient_name) between 1 and 120),
  constraint addresses_line1_length check (char_length(line1) between 1 and 200),
  constraint addresses_line2_length check (line2 is null or char_length(line2) <= 200),
  constraint addresses_city_length check (char_length(city) between 1 and 100),
  constraint addresses_state_length check (char_length(state) between 1 and 100),
  -- The storefront's PIN-code rule (locked-facts §6); delivery scope is India (D-PRE-09).
  constraint addresses_pincode_shape check (pincode ~ '^[1-9][0-9]{5}$'),
  constraint addresses_country_india check (country = 'IN'),
  constraint addresses_phone_shape check (phone is null or phone ~ '^[6-9][0-9]{9}$')
);

create index addresses_customer_id_idx on public.addresses (customer_id);

comment on table public.addresses is
  'S1.1: the address as the customer entered it — append-only: a correction (S2.11) is a new row, the original promise is never overwritten. PII — private.';

create trigger addresses_append_only
  before update or delete on public.addresses for each row execute function public.refuse_change();

-- (5) the numbering counter and orders ----------------------------------------------------------------------------

-- One locked row; UPDATE … RETURNING inside the inserting transaction serialises concurrent orders and rolls
-- back with an aborted insert, so numbers are unique and gapless for plain inserts (an INSERT … ON CONFLICT
-- that absorbs a row has already taken its number: orders are never upserted). Not a sequence (nextval never
-- rolls back).
create table public.order_number_counter (
  id         boolean not null default true,
  next_value bigint  not null,
  constraint order_number_counter_pkey primary key (id),
  constraint order_number_counter_singleton check (id),
  constraint order_number_counter_from_1001 check (next_value >= 1001)
);

insert into public.order_number_counter (id, next_value) values (true, 1001);

comment on table public.order_number_counter is
  'S1.1: the singleton counter behind next_order_number() — the next AS-#### number to issue (D-09: gapless from AS-1001). Private to anon and authenticated. The server role holds SELECT and UPDATE because the order insert trigger runs as the inserting role; by rule nothing but the order insert uses them (a rule for the server code, not a database guard).';

create or replace function public.next_order_number()
returns text
language plpgsql
set search_path = ''
as $$
declare
  issued bigint;
begin
  update public.order_number_counter
     set next_value = next_value + 1
   where id
   returning next_value - 1 into issued;
  if issued is null then
    raise exception 'order_number_counter has no row' using errcode = 'P0002';
  end if;
  return 'AS-' || issued::text;
end;
$$;

comment on function public.next_order_number() is
  'S1.1: issues the next AS-#### number from the locked counter row inside the caller''s transaction (gapless; rolled back with it). Called by the orders insert trigger; EXECUTE for service_role only — no anonymous allocation path. Pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.next_order_number() from public, anon, authenticated;
grant execute on function public.next_order_number() to service_role;

create table public.orders (
  id                      uuid        not null default gen_random_uuid(),
  order_number            text        not null,
  customer_id             uuid        not null,
  shipping_address_id     uuid        not null,
  payment_status          text        not null default 'pending',
  fulfilment_status       text        not null default 'pending_payment',
  support_status          text        not null default 'none',
  refund_status           text        not null default 'none',
  settlement_status       text        not null default 'not_settled',
  currency                char(3)     not null default 'INR',
  subtotal_paise          bigint      not null,
  shipping_paise          bigint,
  tax_paise               bigint,
  total_paise             bigint      not null,
  business_rules_version  integer     not null,
  confirmation_token_hash text,
  version                 integer     not null default 1,
  expires_at              timestamptz,
  needs_review            boolean     not null default false,
  synthetic               boolean     not null default false,
  placed_at               timestamptz not null default now(),
  confirmed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint orders_pkey primary key (id),
  constraint orders_order_number_key unique (order_number),
  constraint orders_confirmation_token_hash_key unique (confirmation_token_hash),
  constraint orders_customer_id_fkey foreign key (customer_id)
    references public.customers_contact (id) on delete restrict,
  constraint orders_shipping_address_id_fkey foreign key (shipping_address_id)
    references public.addresses (id) on delete restrict,
  constraint orders_business_rules_version_fkey foreign key (business_rules_version)
    references public.business_rules (version) on delete restrict,
  constraint orders_order_number_shape check (order_number ~ '^AS-[0-9]{4,12}$'),
  constraint orders_payment_status_allowed check (payment_status in ('pending', 'captured', 'failed', 'expired')),
  constraint orders_fulfilment_status_allowed check (fulfilment_status in (
    'pending_payment', 'confirmed', 'in_production', 'shipped', 'delivered', 'part_delivered', 'on_hold', 'cancelled'
  )),
  constraint orders_support_status_allowed check (support_status in ('none', 'open', 'resolved')),
  constraint orders_refund_status_allowed check (refund_status in ('none', 'requested', 'partial', 'refunded')),
  constraint orders_settlement_status_allowed check (settlement_status in (
    'not_settled', 'provider_settled', 'bank_matched', 'disputed'
  )),
  constraint orders_currency_inr check (currency = 'INR'),
  constraint orders_subtotal_paise_bounded check (subtotal_paise >= 0 and subtotal_paise <= 100000000000),
  constraint orders_shipping_paise_bounded check (shipping_paise is null or (shipping_paise >= 0 and shipping_paise <= 100000000000)),
  constraint orders_tax_paise_bounded check (tax_paise is null or (tax_paise >= 0 and tax_paise <= 100000000000)),
  constraint orders_total_paise_bounded check (total_paise >= 0 and total_paise <= 100000000000),
  -- Exact arithmetic in paise; unknown charges stay NULL and contribute nothing until the owner supplies them.
  constraint orders_total_is_sum check (total_paise = subtotal_paise + coalesce(shipping_paise, 0) + coalesce(tax_paise, 0)),
  -- D-09: lower-case hex SHA-256 of the opaque confirmation token; never the token itself.
  constraint orders_confirmation_token_hash_shape check (
    confirmation_token_hash is null or confirmation_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint orders_version_positive check (version >= 1)
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_payment_status_idx on public.orders (payment_status);
create index orders_expires_at_idx on public.orders (expires_at) where expires_at is not null;

comment on table public.orders is
  'S1.1: one row per order with separate payment / fulfilment / support / refund / settlement statuses, exact paise totals, the applied business-rules version, the D-09 token hash, a database-bumped version and the D-20 expiry. order_number is assigned by the insert trigger. Private; the customer reaches it only through the server-mediated /order/[token] or /track.';
comment on column public.orders.confirmation_token_hash is
  'Lower-case hex SHA-256 of the opaque confirmation token (≥ 256 random bits) issued at S1.6; NULL until issued; unique; the raw token is never stored.';
comment on column public.orders.version is
  'Optimistic-concurrency token, incremented by the database on every UPDATE; staff actions supply the version they read (S2.1).';

-- The database assigns the number; a caller-supplied value is refused, so numbering stays gapless.
create or replace function public.assign_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_number is not null then
    raise exception 'orders.order_number is assigned by the database, never by the caller'
      using errcode = '23514';
  end if;
  new.order_number := public.next_order_number();
  return new;
end;
$$;

comment on function public.assign_order_number() is
  'S1.1: BEFORE INSERT trigger function on orders — refuses a caller-supplied order_number and assigns the next AS-#### from the locked counter. Pinned empty search_path.';

revoke execute on function public.assign_order_number() from public, anon, authenticated;
grant execute on function public.assign_order_number() to service_role;

create or replace function public.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_number is distinct from old.order_number then
    raise exception 'orders.order_number is immutable' using errcode = '23514';
  end if;
  if new.placed_at is distinct from old.placed_at then
    raise exception 'orders.placed_at is immutable' using errcode = '23514';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function public.guard_order_update() is
  'S1.1: BEFORE UPDATE trigger function on orders — order_number and placed_at never change; version is bumped by the database on every update. Pinned empty search_path.';

revoke execute on function public.guard_order_update() from public, anon, authenticated;
grant execute on function public.guard_order_update() to service_role;

create trigger orders_assign_order_number
  before insert on public.orders for each row execute function public.assign_order_number();
create trigger orders_guard_update
  before update on public.orders for each row execute function public.guard_order_update();
create trigger orders_set_updated_at
  before update on public.orders for each row execute function public.set_updated_at();

create table public.order_items (
  id               uuid        not null default gen_random_uuid(),
  order_id         uuid        not null,
  variant_id       uuid        not null,
  variant_code     text        not null,
  finish_code      text        not null,
  quantity         integer     not null,
  unit_price_paise bigint      not null,
  line_total_paise bigint      generated always as (unit_price_paise * quantity) stored,
  stage            smallint    not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint order_items_pkey primary key (id),
  constraint order_items_order_variant_key unique (order_id, variant_id),
  constraint order_items_order_id_fkey foreign key (order_id)
    references public.orders (id) on delete restrict,
  constraint order_items_variant_id_fkey foreign key (variant_id)
    references public.variants (id) on delete restrict,
  constraint order_items_finish_code_fkey foreign key (finish_code)
    references public.frame_finishes (code) on delete restrict,
  constraint order_items_variant_code_shape check (variant_code ~ '^[a-z0-9]+(-[a-z0-9]+)*:(white|black|antique-gold)$'),
  -- The storefront's quantity cap (locked-facts §6: 1–99 per artwork and finish line).
  constraint order_items_quantity_bounded check (quantity between 1 and 99),
  constraint order_items_unit_price_paise_positive check (unit_price_paise > 0 and unit_price_paise <= 100000000000),
  -- The generated line total carries the same bound as every other money column (it could otherwise reach 99 times it).
  constraint order_items_line_total_paise_bounded check (unit_price_paise * quantity <= 100000000000),
  -- The eleven Admin order stages, 0 Pending payment … 10 Delivered (locked-facts §9).
  constraint order_items_stage_bounded check (stage between 0 and 10)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

comment on table public.order_items is
  'S1.1: the lines of an order — the variant as purchased (code and unit price in paise copied at checkout, so later price edits leave the order intact), the quantity (1–99) and the item''s stage (0–10, the eleven Admin stages).';

create trigger order_items_set_updated_at
  before update on public.order_items for each row execute function public.set_updated_at();

create table public.purchase_snapshots (
  id                     uuid        not null default gen_random_uuid(),
  order_id               uuid        not null,
  snapshot               jsonb       not null,
  policy_version_ids     uuid[]      not null default '{}',
  business_rules_version integer     not null,
  created_at             timestamptz not null default now(),
  constraint purchase_snapshots_pkey primary key (id),
  constraint purchase_snapshots_order_id_key unique (order_id),
  constraint purchase_snapshots_order_id_fkey foreign key (order_id)
    references public.orders (id) on delete restrict,
  constraint purchase_snapshots_business_rules_version_fkey foreign key (business_rules_version)
    references public.business_rules (version) on delete restrict,
  constraint purchase_snapshots_snapshot_is_object check (jsonb_typeof(snapshot) = 'object')
);

comment on table public.purchase_snapshots is
  'S1.1: what the customer bought as it was presented — artworks, variants, prices in paise, the address, the policy versions and the rule version — written in the checkout transaction (S1.6) and never changed (append-only trigger).';

create trigger purchase_snapshots_immutable
  before update or delete on public.purchase_snapshots for each row execute function public.refuse_change();

-- (6) payments and the provider-event ledger -----------------------------------------------------------------------

create table public.payment_attempts (
  id                  uuid        not null default gen_random_uuid(),
  order_id            uuid        not null,
  provider            text        not null default 'razorpay',
  provider_order_id   text,
  provider_payment_id text,
  amount_paise        bigint      not null,
  currency            char(3)     not null default 'INR',
  status              text        not null default 'created',
  signature_verified  boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payment_attempts_pkey primary key (id),
  constraint payment_attempts_order_id_fkey foreign key (order_id)
    references public.orders (id) on delete restrict,
  constraint payment_attempts_provider_allowed check (provider in ('razorpay')),
  constraint payment_attempts_provider_order_id_length check (provider_order_id is null or char_length(provider_order_id) between 1 and 120),
  constraint payment_attempts_provider_payment_id_length check (provider_payment_id is null or char_length(provider_payment_id) between 1 and 120),
  constraint payment_attempts_amount_paise_positive check (amount_paise > 0 and amount_paise <= 100000000000),
  constraint payment_attempts_currency_inr check (currency = 'INR'),
  constraint payment_attempts_status_allowed check (status in ('created', 'authorized', 'captured', 'failed'))
);

create index payment_attempts_order_id_idx on public.payment_attempts (order_id);
create unique index payment_attempts_provider_payment_key
  on public.payment_attempts (provider, provider_payment_id) where provider_payment_id is not null;

comment on table public.payment_attempts is
  'S1.1: one row per payment attempt against an order (Razorpay Order and payment ids, amount in paise, status, whether the signature verified). Only a captured status confirms an order (SECURITY-CHECKLIST §9).';

create trigger payment_attempts_set_updated_at
  before update on public.payment_attempts for each row execute function public.set_updated_at();

create table public.provider_events (
  id                uuid        not null default gen_random_uuid(),
  provider          text        not null,
  event_id          text        not null,
  event_type        text        not null,
  signature_ok      boolean     not null,
  payload           jsonb       not null,
  received_at       timestamptz not null default now(),
  processing_status text        not null default 'received',
  processed_at      timestamptz,
  processing_note   text,
  constraint provider_events_pkey primary key (id),
  constraint provider_events_provider_event_key unique (provider, event_id),
  constraint provider_events_provider_allowed check (provider in ('razorpay', 'shiprocket', 'email')),
  constraint provider_events_event_id_length check (char_length(event_id) between 1 and 200),
  constraint provider_events_event_type_length check (char_length(event_type) between 1 and 120),
  constraint provider_events_processing_status_allowed check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  constraint provider_events_processing_note_length check (processing_note is null or char_length(processing_note) <= 500)
);

comment on table public.provider_events is
  'S1.1: the insert-first ledger of every inbound provider event, unique per (provider, event_id) — a repeated, delayed or out-of-order event has exactly one business effect (SECURITY-CHECKLIST §9). Ledger fields never change; only the processing marks do.';

-- DELETE is refused; UPDATE may touch only the processing marks.
create or replace function public.protect_provider_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'public.provider_events is append-only: DELETE is not allowed' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.provider is distinct from old.provider
     or new.event_id is distinct from old.event_id
     or new.event_type is distinct from old.event_type
     or new.signature_ok is distinct from old.signature_ok
     or new.payload is distinct from old.payload
     or new.received_at is distinct from old.received_at then
    raise exception 'public.provider_events ledger fields are immutable; only processing_status, processed_at and processing_note may change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.protect_provider_event() is
  'S1.1: BEFORE UPDATE OR DELETE trigger function on provider_events — refuses DELETE and any change to the ledger fields; processing marks may change. Pinned empty search_path.';

revoke execute on function public.protect_provider_event() from public, anon, authenticated;
grant execute on function public.protect_provider_event() to service_role;

create trigger provider_events_protect
  before update or delete on public.provider_events for each row execute function public.protect_provider_event();

-- (7) the pending-work outbox and its history ---------------------------------------------------------------------

create table public.pending_work (
  id           uuid        not null default gen_random_uuid(),
  kind         text        not null,
  entity_type  text        not null,
  entity_id    uuid,
  dedupe_key   text        not null,
  payload      jsonb       not null default '{}'::jsonb,
  status       text        not null default 'queued',
  run_after    timestamptz not null default now(),
  attempts     integer     not null default 0,
  max_attempts integer     not null default 5,
  claimed_at   timestamptz,
  claimed_by   text,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pending_work_pkey primary key (id),
  constraint pending_work_dedupe_key_key unique (dedupe_key),
  constraint pending_work_kind_shape check (kind ~ '^[a-z][a-z0-9_]{1,60}$'),
  constraint pending_work_entity_type_length check (char_length(entity_type) between 1 and 60),
  constraint pending_work_dedupe_key_length check (char_length(dedupe_key) between 1 and 200),
  constraint pending_work_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint pending_work_status_allowed check (status in ('queued', 'claimed', 'done', 'dead')),
  constraint pending_work_attempts_nonnegative check (attempts >= 0),
  constraint pending_work_max_attempts_bounded check (max_attempts between 1 and 50),
  constraint pending_work_claimed_by_length check (claimed_by is null or char_length(claimed_by) <= 120),
  constraint pending_work_last_error_length check (last_error is null or char_length(last_error) <= 1000)
);

create index pending_work_queue_idx on public.pending_work (status, run_after);

comment on table public.pending_work is
  'S1.1: the transactional outbox — a business transaction inserts the follow-up it needs in the same transaction; dedupe_key is unique so a repeated insert is one unit of work. The worker (S1.8) claims rows with row locks, retries within max_attempts and dead-letters the rest.';

create trigger pending_work_set_updated_at
  before update on public.pending_work for each row execute function public.set_updated_at();

create table public.work_history (
  id              uuid        not null default gen_random_uuid(),
  pending_work_id uuid        not null,
  attempt         integer     not null,
  outcome         text        not null,
  detail          text,
  created_at      timestamptz not null default now(),
  constraint work_history_pkey primary key (id),
  constraint work_history_pending_work_id_fkey foreign key (pending_work_id)
    references public.pending_work (id) on delete restrict,
  constraint work_history_attempt_positive check (attempt >= 1),
  constraint work_history_outcome_allowed check (outcome in ('succeeded', 'retry', 'dead', 'paused')),
  constraint work_history_detail_length check (detail is null or char_length(detail) <= 1000)
);

create index work_history_pending_work_id_idx on public.work_history (pending_work_id);

comment on table public.work_history is
  'S1.1: every attempt of every unit of pending work (append-only).';

create trigger work_history_append_only
  before update or delete on public.work_history for each row execute function public.refuse_change();

-- (8) the audit log (insert-only) ---------------------------------------------------------------------------------

create table public.audit_log (
  id           uuid        not null default gen_random_uuid(),
  actor_type   text        not null,
  actor_id     uuid,
  action       text        not null,
  entity_type  text        not null,
  entity_id    text,
  previous     jsonb,
  next         jsonb,
  reason       text,
  external_ref text,
  created_at   timestamptz not null default now(),
  constraint audit_log_pkey primary key (id),
  constraint audit_log_actor_type_allowed check (actor_type in ('staff', 'system', 'customer')),
  constraint audit_log_action_length check (char_length(action) between 1 and 120),
  constraint audit_log_entity_type_length check (char_length(entity_type) between 1 and 60),
  constraint audit_log_entity_id_length check (entity_id is null or char_length(entity_id) <= 120),
  constraint audit_log_reason_length check (reason is null or char_length(reason) <= 1000),
  constraint audit_log_external_ref_length check (external_ref is null or char_length(external_ref) <= 200)
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at);

comment on table public.audit_log is
  'S1.1: the insert-only audit record of consequential actions — actor, time, previous and new values, reason, external reference (SECURITY-CHECKLIST §9 rule 7). Nothing in it is ever updated or deleted.';

create trigger audit_log_insert_only
  before update or delete on public.audit_log for each row execute function public.refuse_change();

-- (9) default deny on every table; narrow explicit service_role grants ------------------------------------------

select public.lock_down_table('public.staff_profiles');
select public.lock_down_table('public.business_rules');
select public.lock_down_table('public.policy_versions');
select public.lock_down_table('public.customers_contact');
select public.lock_down_table('public.addresses');
select public.lock_down_table('public.order_number_counter');
select public.lock_down_table('public.orders');
select public.lock_down_table('public.order_items');
select public.lock_down_table('public.purchase_snapshots');
select public.lock_down_table('public.payment_attempts');
select public.lock_down_table('public.provider_events');
select public.lock_down_table('public.pending_work');
select public.lock_down_table('public.work_history');
select public.lock_down_table('public.audit_log');

-- Supabase's default privileges grant the API roles every privilege on a new table; the helper revokes
-- anon / authenticated / public, and service_role is revoked here and re-granted only what its write rule
-- needs (never TRUNCATE; never UPDATE or DELETE on an append-only table — the triggers refuse them too).
revoke all privileges on table public.staff_profiles       from service_role;
revoke all privileges on table public.business_rules       from service_role;
revoke all privileges on table public.policy_versions      from service_role;
revoke all privileges on table public.customers_contact    from service_role;
revoke all privileges on table public.addresses            from service_role;
revoke all privileges on table public.order_number_counter from service_role;
revoke all privileges on table public.orders               from service_role;
revoke all privileges on table public.order_items          from service_role;
revoke all privileges on table public.purchase_snapshots   from service_role;
revoke all privileges on table public.payment_attempts     from service_role;
revoke all privileges on table public.provider_events      from service_role;
revoke all privileges on table public.pending_work         from service_role;
revoke all privileges on table public.work_history         from service_role;
revoke all privileges on table public.audit_log            from service_role;

grant select, insert, update         on table public.staff_profiles       to service_role;
grant select, insert                 on table public.business_rules       to service_role;
grant select, insert                 on table public.policy_versions      to service_role;
grant select, insert, update, delete on table public.customers_contact    to service_role;
grant select, insert                 on table public.addresses            to service_role;
grant select, update                 on table public.order_number_counter to service_role;
grant select, insert, update         on table public.orders               to service_role;
grant select, insert, update         on table public.order_items          to service_role;
grant select, insert                 on table public.purchase_snapshots   to service_role;
grant select, insert, update         on table public.payment_attempts     to service_role;
grant select, insert, update         on table public.provider_events      to service_role;
grant select, insert, update, delete on table public.pending_work         to service_role;
grant select, insert                 on table public.work_history         to service_role;
grant select, insert                 on table public.audit_log            to service_role;
