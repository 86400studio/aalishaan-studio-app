-- 0004_checkout — S1.6: the checkout's atomic pending-order write and its provider-order state
-- (docs/database-changes/S1.6-0004-checkout.md; docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3;
-- docs/TECH-ARCHITECTURE.md §4 row 0004, §5; decisions D-09 as amended by D-61, D-20, D-60).
--
-- Why a migration at all: a guest order is a contact, an address, an order with its number, its items, its
-- immutable snapshot and its first payment attempt, and they must commit together or not at all. The server
-- reaches Postgres through PostgREST only, where one request is one transaction — so the write is one function
-- call. Nothing here is a general SQL entry point: five narrow functions with fixed statements.
--
-- Additive only, on two S1.1 tables:
--   * orders gains three nullable columns — checkout_attempt_hash (the SHA-256 of the browser's random attempt
--     key: the only handle on an attempt; unique), checkout_payload_mac (an HMAC of the submitted bag and details
--     keyed by that attempt key: the same key with other details is refused; no digest of personal data that a
--     database copy alone could test) and confirmation_token_salt (the per-order salt the confirmation link is
--     derived from with a server-only secret — D-61; the link itself is never stored, only its hash, as D-09 has it);
--   * payment_attempts gains provider_order_state for the checkout's one order-creation row per order
--     (intent → requested → linked | failed | unknown; unknown → linked | failed; NULL on every other row, so S1.7
--     stays free to add per-payment rows), the time the provider call was claimed and the provider's own creation
--     time; one checkout row per order and one row per provider order id, by partial unique indexes;
--   * two guard triggers: an order's attempt hash, payload MAC, token hash, token salt and a set expiry never
--     change; a checkout attempt row keeps its order, amount, currency and provider ids, and its state moves only
--     along the transitions above;
--   * five functions, in the house style (plpgsql, pinned empty search_path, never SECURITY DEFINER, EXECUTE
--     revoked from public / anon / authenticated and granted to service_role only):
--       checkout_create_pending_order(jsonb)                      the atomic write, or the same attempt again;
--       checkout_attempt_state(text)                              the one read path, by attempt hash;
--       checkout_claim_provider_create(uuid)                      the single compare-and-set before the provider call;
--       checkout_link_provider_order(uuid, text, timestamptz)     provider id, its creation time and the expiry, together;
--       checkout_close_provider_create(uuid, text, text, boolean) requested → failed | unknown, with an audit row.
--
-- Rules these functions keep (the change record states each with its test):
--   * every value is checked inside the function and refused with a fixed message and a custom SQLSTATE (class
--     ZC — an implementation-defined class), so a table CHECK never fires with a customer's row in its detail;
--   * orders are written with a plain INSERT (0002: never ON CONFLICT — the numbering trigger must not consume a
--     number for an absorbed row); a repeated attempt is found first, under an advisory lock on its hash;
--   * the effective business rule is read inside the transaction (latest effective_from not in the future, version
--     as the tie-break). S1.6 accepts only an open rule that is marked synthetic: real sales need the owner's
--     charges and tax (S3.1) and open by their own change, never through this file. Unknown shipping stays NULL;
--   * variants and their artworks are read under row locks, so a price or status cannot change between the check
--     and the write; the recomputed total must equal the total the page showed — a precondition that can only refuse;
--   * the snapshot carries items, totals, the address, the rule and the seven current policy versions — not the
--     email address or the phone number;
--   * no EXCEPTION block anywhere: any failure aborts the statement, so the transaction rolls back whole, the
--     order number included.
--
-- No table privilege changes, no policy, no DROP, DELETE, TRUNCATE or type change. Applied to TEST by the
-- owner-authorised trusted process and to PROD by the human owner only. The paired schema-recovery artifact is
-- supabase/rollbacks/0004_checkout.down.sql — outside supabase/migrations/ on purpose.

-- (1) orders: attempt ownership and the derived confirmation link ------------------------------------------------

alter table public.orders
  add column checkout_attempt_hash   text,
  add column checkout_payload_mac    text,
  add column confirmation_token_salt text,
  add constraint orders_checkout_attempt_hash_key unique (checkout_attempt_hash),
  add constraint orders_checkout_attempt_hash_shape
    check (checkout_attempt_hash is null or checkout_attempt_hash ~ '^[0-9a-f]{64}$'),
  add constraint orders_checkout_payload_mac_shape
    check (checkout_payload_mac is null or checkout_payload_mac ~ '^[0-9a-f]{64}$'),
  -- An attempt is its hash and its payload binding, together or not at all.
  add constraint orders_checkout_attempt_complete
    check ((checkout_attempt_hash is null) = (checkout_payload_mac is null)),
  add constraint orders_confirmation_token_salt_shape
    check (confirmation_token_salt is null or confirmation_token_salt ~ '^[0-9a-f]{64}$'),
  -- A salt exists only beside the hash of the link derived from it.
  add constraint orders_confirmation_token_salt_with_hash
    check (confirmation_token_salt is null or confirmation_token_hash is not null);

comment on column public.orders.checkout_attempt_hash is
  'S1.6: lower-case hex SHA-256 of the browser-minted random attempt key (32 bytes). The only handle on a checkout attempt — no lookup by email, phone or order number exists. NULL on orders not created by the checkout; unique; never changes.';
comment on column public.orders.checkout_payload_mac is
  'S1.6: lower-case hex HMAC-SHA-256, keyed by the attempt key, of the canonical submitted bag and details. The same attempt key with different details is refused. Not a digest of personal data that the database alone could test: the key is never stored.';
comment on column public.orders.confirmation_token_salt is
  'S1.6 (D-61, amending D-09): lower-case hex of 32 random bytes. The confirmation link is derived from it with the server-only ORDER_TOKEN_SECRET; the link is never stored — confirmation_token_hash holds its SHA-256. Set once.';

create or replace function public.guard_order_checkout_fields()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.checkout_attempt_hash is distinct from old.checkout_attempt_hash
     or new.checkout_payload_mac is distinct from old.checkout_payload_mac then
    raise exception 'orders: the checkout attempt binding is written at insert and never changes'
      using errcode = '23514';
  end if;
  if old.confirmation_token_hash is not null
     and new.confirmation_token_hash is distinct from old.confirmation_token_hash then
    raise exception 'orders.confirmation_token_hash is set once' using errcode = '23514';
  end if;
  if old.confirmation_token_salt is not null
     and new.confirmation_token_salt is distinct from old.confirmation_token_salt then
    raise exception 'orders.confirmation_token_salt is set once' using errcode = '23514';
  end if;
  if old.expires_at is not null and new.expires_at is distinct from old.expires_at then
    raise exception 'orders.expires_at is set once and never extended' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

comment on function public.guard_order_checkout_fields() is
  'S1.6: BEFORE UPDATE trigger function on orders — the attempt hash and payload MAC never change after insert; the confirmation token hash, its salt and a set expires_at are set once (D-20: the deadline is never extended). Pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.guard_order_checkout_fields() from public, anon, authenticated;
grant execute on function public.guard_order_checkout_fields() to service_role;

create trigger orders_guard_checkout_fields
  before update on public.orders for each row execute function public.guard_order_checkout_fields();

-- (2) payment_attempts: the provider-order state of a checkout's order-creation row ---------------------------

alter table public.payment_attempts
  add column provider_order_state         text,
  add column provider_create_requested_at timestamptz,
  add column provider_order_created_at    timestamptz,
  add constraint payment_attempts_provider_order_state_allowed
    check (provider_order_state is null
           or provider_order_state in ('intent', 'requested', 'linked', 'failed', 'unknown')),
  -- Before the claim nothing about the provider is recorded; a linked row carries the provider's id and time.
  add constraint payment_attempts_intent_is_untouched
    check (provider_order_state is distinct from 'intent'
           or (provider_order_id is null and provider_create_requested_at is null
               and provider_order_created_at is null)),
  add constraint payment_attempts_linked_is_complete
    check (provider_order_state is distinct from 'linked'
           or (provider_order_id is not null and provider_order_created_at is not null
               and provider_create_requested_at is not null));

comment on column public.payment_attempts.provider_order_state is
  'S1.6: where the checkout''s one provider-order creation stands — intent (written with the order), requested (the single claim before the provider call), linked (provider order id stored, expiry set), failed (the provider refused; no payment can start) or unknown (no usable answer; held, never created again, recovered only by a read by receipt). NULL on rows that are not a checkout''s order-creation row.';
comment on column public.payment_attempts.provider_create_requested_at is
  'S1.6: when the provider-create call was claimed (intent → requested). A requested row that stays without an answer is closed as unknown, never called again.';
comment on column public.payment_attempts.provider_order_created_at is
  'S1.6 (D-20): the provider''s own creation time of the order — the basis of orders.expires_at. Set once, with the link.';

-- One checkout row per order; one row per provider order id among checkout rows.
create unique index payment_attempts_checkout_order_key
  on public.payment_attempts (order_id) where provider_order_state is not null;
create unique index payment_attempts_checkout_provider_order_key
  on public.payment_attempts (provider, provider_order_id) where provider_order_state is not null;

create or replace function public.guard_checkout_payment_attempt()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.provider_order_state is null then
    if new.provider_order_state is not null then
      raise exception 'payment_attempts: a row becomes a checkout row at insert only' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.provider_order_state is null then
    raise exception 'payment_attempts: a checkout row keeps its provider order state' using errcode = '23514';
  end if;
  if new.order_id is distinct from old.order_id
     or new.provider is distinct from old.provider
     or new.amount_paise is distinct from old.amount_paise
     or new.currency is distinct from old.currency then
    raise exception 'payment_attempts: a checkout row keeps its order, provider, amount and currency'
      using errcode = '23514';
  end if;
  if (old.provider_order_id is not null and new.provider_order_id is distinct from old.provider_order_id)
     or (old.provider_order_created_at is not null
         and new.provider_order_created_at is distinct from old.provider_order_created_at)
     or (old.provider_create_requested_at is not null
         and new.provider_create_requested_at is distinct from old.provider_create_requested_at) then
    raise exception 'payment_attempts: a checkout row''s provider order id and times are set once'
      using errcode = '23514';
  end if;
  if new.provider_order_state is distinct from old.provider_order_state
     and not (
       (old.provider_order_state = 'intent' and new.provider_order_state = 'requested')
       or (old.provider_order_state = 'requested' and new.provider_order_state in ('linked', 'failed', 'unknown'))
       or (old.provider_order_state = 'unknown' and new.provider_order_state in ('linked', 'failed'))
     ) then
    raise exception 'payment_attempts: provider order state cannot move from % to %',
      old.provider_order_state, new.provider_order_state using errcode = '23514';
  end if;
  return new;
end;
$fn$;

comment on function public.guard_checkout_payment_attempt() is
  'S1.6: BEFORE UPDATE trigger function on payment_attempts — a non-checkout row never becomes a checkout row; a checkout row keeps its order, provider, amount and currency, sets its provider order id and times once, and moves only intent → requested → linked | failed | unknown and unknown → linked | failed. Pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.guard_checkout_payment_attempt() from public, anon, authenticated;
grant execute on function public.guard_checkout_payment_attempt() to service_role;

create trigger payment_attempts_guard_checkout
  before update on public.payment_attempts for each row execute function public.guard_checkout_payment_attempt();

-- (3) the one read path -----------------------------------------------------------------------------------------

create or replace function public.checkout_attempt_state(p_attempt_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_state jsonb;
begin
  if p_attempt_hash is null or p_attempt_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  select jsonb_build_object(
           'order_number', o.order_number,
           'payment_attempt_id', pa.id,
           'amount_paise', pa.amount_paise,
           'currency', pa.currency,
           'provider_order_state', pa.provider_order_state,
           'provider_order_id', pa.provider_order_id,
           'provider_create_requested_at', pa.provider_create_requested_at,
           'expires_at', o.expires_at,
           'payment_status', o.payment_status,
           'needs_review', o.needs_review,
           'placed_at', o.placed_at,
           'server_time', now())
    into v_state
    from public.orders o
    join public.payment_attempts pa
      on pa.order_id = o.id and pa.provider_order_state is not null
   where o.checkout_attempt_hash = p_attempt_hash;
  return v_state;
end;
$fn$;

comment on function public.checkout_attempt_state(text) is
  'S1.6: where a checkout attempt stands, by the SHA-256 of its attempt key — the order number, the payment attempt id, the stored amount, the provider-order state and id, the expiry, the payment status, the review flag and the database''s time. NULL when no such attempt exists. No personal data. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.checkout_attempt_state(text) from public, anon, authenticated;
grant execute on function public.checkout_attempt_state(text) to service_role;

-- (4) the atomic write ---------------------------------------------------------------------------------------------

create or replace function public.checkout_create_pending_order(p_request jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_attempt_hash  text;
  v_payload_mac   text;
  v_token_hash    text;
  v_token_salt    text;
  v_expected_text text;
  v_expected      bigint;
  v_contact       jsonb;
  v_address       jsonb;
  v_items         jsonb;
  v_item          jsonb;
  v_name          text;
  v_email         text;
  v_phone         text;
  v_line1         text;
  v_line2         text;
  v_city          text;
  v_state         text;
  v_pincode       text;
  v_code          text;
  v_codes         text[] := '{}';
  v_existing_mac  text;
  v_rule          public.business_rules%rowtype;
  v_found         bigint;
  v_all_ok        boolean;
  v_max_line      bigint;
  v_subtotal      bigint;
  v_shipping      bigint;
  v_total         bigint;
  v_lines         jsonb;
  v_policy_ids    uuid[];
  v_policies      jsonb;
  v_customer_id   uuid;
  v_address_id    uuid;
  v_order_id      uuid;
  v_order_number  text;
  v_placed_at     timestamptz;
begin
  -- (a) structure and every value shape, before anything is read or written. One fixed message: nothing a
  --     customer typed can reach an error text.
  if p_request is null or jsonb_typeof(p_request) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_request)) <> 8
     or not (p_request ?& array['attempt_hash', 'payload_mac', 'token_hash', 'token_salt',
                                'expected_total_paise', 'contact', 'address', 'items']) then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  v_attempt_hash  := p_request ->> 'attempt_hash';
  v_payload_mac   := p_request ->> 'payload_mac';
  v_token_hash    := p_request ->> 'token_hash';
  v_token_salt    := p_request ->> 'token_salt';
  v_expected_text := p_request ->> 'expected_total_paise';
  v_contact       := p_request -> 'contact';
  v_address       := p_request -> 'address';
  v_items         := p_request -> 'items';
  if coalesce(v_attempt_hash !~ '^[0-9a-f]{64}$', true)
     or coalesce(v_payload_mac !~ '^[0-9a-f]{64}$', true)
     or coalesce(v_token_hash !~ '^[0-9a-f]{64}$', true)
     or coalesce(v_token_salt !~ '^[0-9a-f]{64}$', true)
     or coalesce(v_expected_text !~ '^(0|[1-9][0-9]{0,11})$', true)
     or jsonb_typeof(v_contact) is distinct from 'object'
     or jsonb_typeof(v_address) is distinct from 'object'
     or jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  v_expected := v_expected_text::bigint;

  if (select count(*) from jsonb_object_keys(v_contact)) <> 3
     or not (v_contact ?& array['name', 'email', 'phone'])
     or jsonb_typeof(v_contact -> 'name') is distinct from 'string'
     or jsonb_typeof(v_contact -> 'email') is distinct from 'string'
     or jsonb_typeof(v_contact -> 'phone') is distinct from 'string'
     or (select count(*) from jsonb_object_keys(v_address)) <> 5
     or not (v_address ?& array['line1', 'line2', 'city', 'state', 'pincode'])
     or jsonb_typeof(v_address -> 'line1') is distinct from 'string'
     or jsonb_typeof(v_address -> 'line2') not in ('string', 'null')
     or jsonb_typeof(v_address -> 'city') is distinct from 'string'
     or jsonb_typeof(v_address -> 'state') is distinct from 'string'
     or jsonb_typeof(v_address -> 'pincode') is distinct from 'string' then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  v_name    := v_contact ->> 'name';
  v_email   := v_contact ->> 'email';
  v_phone   := v_contact ->> 'phone';
  v_line1   := v_address ->> 'line1';
  v_line2   := v_address ->> 'line2';
  v_city    := v_address ->> 'city';
  v_state   := v_address ->> 'state';
  v_pincode := v_address ->> 'pincode';
  -- The same bounds as the 0002 table checks (customers_contact, addresses), so those never fire here.
  if char_length(v_name) not between 1 and 120
     or char_length(v_email) > 254
     or v_email <> lower(v_email)
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     or v_phone !~ '^[6-9][0-9]{9}$'
     or char_length(v_line1) not between 1 and 200
     or (v_line2 is not null and char_length(v_line2) not between 1 and 200)
     or char_length(v_city) not between 1 and 100
     or char_length(v_state) not between 1 and 100
     or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;

  if jsonb_array_length(v_items) not between 1 and 66 then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  for v_item in select e.value from jsonb_array_elements(v_items) as e(value) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 2
       or not (v_item ?& array['variant_code', 'quantity'])
       or jsonb_typeof(v_item -> 'variant_code') is distinct from 'string'
       or jsonb_typeof(v_item -> 'quantity') is distinct from 'number' then
      raise exception 'checkout: invalid_request' using errcode = 'ZC001';
    end if;
    v_code := v_item ->> 'variant_code';
    if char_length(v_code) > 140
       or v_code !~ '^[a-z0-9]+(-[a-z0-9]+)*:(white|black|antique-gold)$'
       or (v_item ->> 'quantity') !~ '^[1-9][0-9]?$'
       or v_code = any (v_codes) then
      raise exception 'checkout: invalid_request' using errcode = 'ZC001';
    end if;
    v_codes := v_codes || v_code;
  end loop;

  -- (b) one submission at a time per attempt key; the lock is released when the transaction ends.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_attempt_hash, 0));

  -- (c) the same attempt again: the existing order, untouched — no number is taken. Other details under the
  --     same key are refused.
  select o.checkout_payload_mac into v_existing_mac
    from public.orders o
   where o.checkout_attempt_hash = v_attempt_hash;
  if found then
    if v_existing_mac is distinct from v_payload_mac then
      raise exception 'checkout: attempt_payload_changed' using errcode = 'ZC002';
    end if;
    return public.checkout_attempt_state(v_attempt_hash) || jsonb_build_object('replayed', true);
  end if;

  -- (d) the effective rule, read inside this transaction. S1.6 opens only on an open rule marked synthetic.
  select br.* into v_rule
    from public.business_rules br
   where br.effective_from <= now()
   order by br.effective_from desc, br.version desc
   limit 1;
  if not found or not v_rule.sales_open then
    raise exception 'checkout: sales_closed' using errcode = 'ZC003';
  end if;
  if not v_rule.synthetic or v_rule.tax_treatment is not distinct from 'exclusive' then
    raise exception 'checkout: rule_not_supported' using errcode = 'ZC004';
  end if;
  -- Unknown shipping stays NULL (never zero as a guess); tax is not computed — no rate exists before S3.1.
  v_shipping := v_rule.shipping_paise;

  -- (e) the bought variants and their artworks, locked for this transaction, then read.
  perform 1
     from public.variants v
     join public.artworks a on a.id = v.artwork_id
    where v.variant_code = any (v_codes)
    order by v.variant_code
      for share of v, a;
  -- Every bought code must have a row that is now locked: variant_code is unique, so no unlocked row can then
  -- match in the statements below (a row that became visible only after the locking statement is refused here).
  get diagnostics v_found = row_count;
  if v_found is distinct from jsonb_array_length(v_items)::bigint then
    raise exception 'checkout: item_unavailable' using errcode = 'ZC005';
  end if;

  select count(*),
         bool_and(a.status = 'Active'::public.artwork_status
                  and v.availability = 'made_to_order'
                  and v.currency = 'INR'),
         max(v.price_paise * i.quantity),
         sum(v.price_paise * i.quantity),
         jsonb_agg(jsonb_build_object(
           'variant_code', v.variant_code,
           'finish_code', v.finish_code,
           'finish_name', f.name,
           'artwork_slug', a.slug,
           'artwork_title', a.title,
           'orientation', a.orientation,
           'quantity', i.quantity,
           'unit_price_paise', v.price_paise,
           'line_total_paise', v.price_paise * i.quantity) order by i.ordinality)
    into v_found, v_all_ok, v_max_line, v_subtotal, v_lines
    from (select e.value ->> 'variant_code' as variant_code,
                 (e.value ->> 'quantity')::integer as quantity,
                 e.ordinality
            from jsonb_array_elements(v_items) with ordinality as e(value, ordinality)) i
    join public.variants v on v.variant_code = i.variant_code
    join public.artworks a on a.id = v.artwork_id
    join public.frame_finishes f on f.code = v.finish_code;
  if v_found is distinct from jsonb_array_length(v_items)::bigint or v_all_ok is not true then
    raise exception 'checkout: item_unavailable' using errcode = 'ZC005';
  end if;
  if v_max_line > 100000000000 or v_subtotal > 100000000000 then
    raise exception 'checkout: amount_out_of_range' using errcode = 'ZC008';
  end if;

  -- (f) the total, recomputed here; the page's total is only a precondition.
  v_total := v_subtotal + coalesce(v_shipping, 0);
  if v_total < 100 or v_total > 100000000000 then
    raise exception 'checkout: amount_out_of_range' using errcode = 'ZC008';
  end if;
  if v_total <> v_expected then
    raise exception 'checkout: total_changed' using errcode = 'ZC006';
  end if;

  -- (g) the seven policy pages as they stand: the latest version of each key that is not dated in the future.
  select count(*),
         array_agg(p.id order by p.policy_key),
         jsonb_agg(jsonb_build_object(
           'policy_key', p.policy_key,
           'version', p.version,
           'id', p.id,
           'terms_status', p.terms_status) order by p.policy_key)
    into v_found, v_policy_ids, v_policies
    from (select distinct on (pv.policy_key) pv.id, pv.policy_key, pv.version, pv.terms_status
            from public.policy_versions pv
           where pv.effective_from is null or pv.effective_from <= now()
           order by pv.policy_key, pv.version desc) p;
  if v_found is distinct from 7 then
    raise exception 'checkout: policies_missing' using errcode = 'ZC007';
  end if;

  -- (h) the writes — plain INSERTs, the order's number from the 0002 trigger, the items last.
  insert into public.customers_contact (email, phone, name, synthetic)
  values (v_email, v_phone, v_name, v_rule.synthetic)
  returning id into v_customer_id;

  insert into public.addresses (customer_id, recipient_name, line1, line2, city, state, pincode, country, phone)
  values (v_customer_id, v_name, v_line1, v_line2, v_city, v_state, v_pincode, 'IN', v_phone)
  returning id into v_address_id;

  insert into public.orders (
    customer_id, shipping_address_id, subtotal_paise, shipping_paise, tax_paise, total_paise,
    business_rules_version, confirmation_token_hash, confirmation_token_salt,
    checkout_attempt_hash, checkout_payload_mac, synthetic)
  values (
    v_customer_id, v_address_id, v_subtotal, v_shipping, null, v_total,
    v_rule.version, v_token_hash, v_token_salt,
    v_attempt_hash, v_payload_mac, v_rule.synthetic)
  returning id, order_number, placed_at into v_order_id, v_order_number, v_placed_at;

  insert into public.purchase_snapshots (order_id, snapshot, policy_version_ids, business_rules_version)
  values (
    v_order_id,
    jsonb_build_object(
      'v', 1,
      'order_number', v_order_number,
      'placed_at', v_placed_at,
      'currency', 'INR',
      'synthetic', v_rule.synthetic,
      'items', v_lines,
      'totals', jsonb_build_object(
        'subtotal_paise', v_subtotal,
        'shipping_paise', v_shipping,
        'tax_paise', null::bigint,
        'total_paise', v_total),
      'address', jsonb_build_object(
        'recipient_name', v_name,
        'line1', v_line1,
        'line2', v_line2,
        'city', v_city,
        'state', v_state,
        'pincode', v_pincode,
        'country', 'IN'),
      'rule', jsonb_build_object(
        'version', v_rule.version,
        'synthetic', v_rule.synthetic,
        'pending_order_expiry_minutes', v_rule.pending_order_expiry_minutes,
        'shipping_paise', v_rule.shipping_paise,
        'tax_treatment', v_rule.tax_treatment),
      'policies', v_policies),
    v_policy_ids,
    v_rule.version);

  insert into public.payment_attempts (order_id, provider, amount_paise, currency, status, provider_order_state)
  values (v_order_id, 'razorpay', v_total, 'INR', 'created', 'intent');

  insert into public.order_items (order_id, variant_id, variant_code, finish_code, quantity, unit_price_paise)
  select v_order_id, v.id, v.variant_code, v.finish_code, i.quantity, v.price_paise
    from (select e.value ->> 'variant_code' as variant_code,
                 (e.value ->> 'quantity')::integer as quantity,
                 e.ordinality
            from jsonb_array_elements(v_items) with ordinality as e(value, ordinality)) i
    join public.variants v on v.variant_code = i.variant_code
   order by i.ordinality;

  return public.checkout_attempt_state(v_attempt_hash) || jsonb_build_object('replayed', false);
end;
$fn$;

comment on function public.checkout_create_pending_order(jsonb) is
  'S1.6: the checkout''s atomic write — one call, one transaction: the guest contact, the address, the pending order (its AS-#### from the 0002 trigger, by plain INSERT), the immutable snapshot with the seven current policy versions and the rule version, the first payment attempt (provider_order_state = intent) and the items. Recomputes every price and the total from the catalogue under row locks and refuses when the total differs from the one the page showed; opens only on an effective, open rule marked synthetic (S1.6 — real sales open by their own change). The same attempt hash with the same payload MAC returns the existing order and takes no number; with another MAC it is refused. Every refusal is a fixed message with SQLSTATE class ZC; nothing is written on a refusal. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.checkout_create_pending_order(jsonb) from public, anon, authenticated;
grant execute on function public.checkout_create_pending_order(jsonb) to service_role;

-- (5) the provider step: claim, link, close ------------------------------------------------------------------------
-- Lock order in all three: the payment attempt row, then its order (S1.7 follows the same order).

create or replace function public.checkout_claim_provider_create(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_pa      public.payment_attempts%rowtype;
  v_order   public.orders%rowtype;
  v_rule    public.business_rules%rowtype;
  v_minutes integer;
  v_claimed boolean := false;
begin
  if p_payment_attempt_id is null then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  select pa.* into v_pa
    from public.payment_attempts pa
   where pa.id = p_payment_attempt_id and pa.provider_order_state is not null
     for update;
  if not found then
    raise exception 'checkout: attempt_not_found' using errcode = 'ZC010';
  end if;
  select o.* into v_order from public.orders o where o.id = v_pa.order_id for update;

  if v_pa.provider_order_state = 'intent' then
    if v_order.payment_status <> 'pending' or v_order.needs_review then
      raise exception 'checkout: state_conflict' using errcode = 'ZC011';
    end if;
    -- The store may have closed since the order was written: no provider order is created for a closed store.
    select br.* into v_rule
      from public.business_rules br
     where br.effective_from <= now()
     order by br.effective_from desc, br.version desc
     limit 1;
    if not found or not v_rule.sales_open or not v_rule.synthetic then
      raise exception 'checkout: sales_closed' using errcode = 'ZC003';
    end if;
    -- An order that was never sent to the provider within its own rule's window is not started late.
    select br.pending_order_expiry_minutes into v_minutes
      from public.business_rules br
     where br.version = v_order.business_rules_version;
    if now() > v_order.placed_at + make_interval(mins => v_minutes) then
      raise exception 'checkout: attempt_too_old' using errcode = 'ZC012';
    end if;
    update public.payment_attempts
       set provider_order_state = 'requested',
           provider_create_requested_at = now()
     where id = v_pa.id;
    v_claimed := true;
  end if;

  return public.checkout_attempt_state(v_order.checkout_attempt_hash)
         || jsonb_build_object('claimed', v_claimed);
end;
$fn$;

comment on function public.checkout_claim_provider_create(uuid) is
  'S1.6: the single compare-and-set before the provider call — moves a checkout attempt intent → requested under its row lock and answers claimed = true exactly once; any later or concurrent call answers claimed = false with the current state. Refuses when the store has closed since, when the order is not pending or is under review, or when the order is older than its rule''s window. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.checkout_claim_provider_create(uuid) from public, anon, authenticated;
grant execute on function public.checkout_claim_provider_create(uuid) to service_role;

create or replace function public.checkout_link_provider_order(
  p_payment_attempt_id  uuid,
  p_provider_order_id   text,
  p_provider_created_at timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_pa      public.payment_attempts%rowtype;
  v_order   public.orders%rowtype;
  v_minutes integer;
  v_linked  boolean := false;
begin
  if p_payment_attempt_id is null or p_provider_created_at is null
     or coalesce(p_provider_order_id !~ '^order_[A-Za-z0-9]{6,60}$', true) then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  select pa.* into v_pa
    from public.payment_attempts pa
   where pa.id = p_payment_attempt_id and pa.provider_order_state is not null
     for update;
  if not found then
    raise exception 'checkout: attempt_not_found' using errcode = 'ZC010';
  end if;
  select o.* into v_order from public.orders o where o.id = v_pa.order_id for update;

  if v_pa.provider_order_state = 'linked' then
    -- The same id again is the same link; another id is a conflict, never an overwrite.
    if v_pa.provider_order_id is distinct from p_provider_order_id then
      raise exception 'checkout: state_conflict' using errcode = 'ZC011';
    end if;
  else
    if v_pa.provider_order_state not in ('requested', 'unknown') or v_order.payment_status <> 'pending' then
      raise exception 'checkout: state_conflict' using errcode = 'ZC011';
    end if;
    -- The provider's creation time must be plausible for this order: it is the basis of the deadline.
    if p_provider_created_at < v_order.placed_at - interval '10 minutes'
       or p_provider_created_at > now() + interval '10 minutes' then
      raise exception 'checkout: provider_time_out_of_range' using errcode = 'ZC013';
    end if;
    select br.pending_order_expiry_minutes into v_minutes
      from public.business_rules br
     where br.version = v_order.business_rules_version;
    update public.payment_attempts
       set provider_order_id = p_provider_order_id,
           provider_order_created_at = p_provider_created_at,
           provider_order_state = 'linked'
     where id = v_pa.id;
    -- D-20: the deadline is the provider's creation time plus the pinned rule's minutes — set here, once.
    update public.orders
       set expires_at = p_provider_created_at + make_interval(mins => v_minutes)
     where id = v_order.id and expires_at is null;
    v_linked := true;
  end if;

  return public.checkout_attempt_state(v_order.checkout_attempt_hash)
         || jsonb_build_object('linked', v_linked);
end;
$fn$;

comment on function public.checkout_link_provider_order(uuid, text, timestamptz) is
  'S1.6 (D-20): stores the provider order id and the provider''s creation time on a requested or unknown checkout attempt and sets orders.expires_at = that time + the pinned rule''s minutes — together, once. The same id again changes nothing; another id, another state or an implausible provider time is refused. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.checkout_link_provider_order(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.checkout_link_provider_order(uuid, text, timestamptz) to service_role;

create or replace function public.checkout_close_provider_create(
  p_payment_attempt_id uuid,
  p_outcome            text,
  p_reason             text,
  p_needs_review       boolean)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_pa      public.payment_attempts%rowtype;
  v_order   public.orders%rowtype;
  v_closed  boolean := false;
  v_flagged boolean := false;
begin
  if p_payment_attempt_id is null or p_needs_review is null
     or coalesce(p_outcome not in ('failed', 'unknown'), true)
     or coalesce(p_reason !~ '^[a-z][a-z0-9_]{1,59}$', true) then
    raise exception 'checkout: invalid_request' using errcode = 'ZC001';
  end if;
  select pa.* into v_pa
    from public.payment_attempts pa
   where pa.id = p_payment_attempt_id and pa.provider_order_state is not null
     for update;
  if not found then
    raise exception 'checkout: attempt_not_found' using errcode = 'ZC010';
  end if;
  select o.* into v_order from public.orders o where o.id = v_pa.order_id for update;

  if v_pa.provider_order_state is distinct from p_outcome then
    if not (v_pa.provider_order_state = 'requested'
            or (v_pa.provider_order_state = 'unknown' and p_outcome = 'failed')) then
      raise exception 'checkout: state_conflict' using errcode = 'ZC011';
    end if;
    update public.payment_attempts set provider_order_state = p_outcome where id = v_pa.id;
    v_closed := true;
  end if;
  -- The review flag is raised whenever it is asked for and not yet set — also when the attempt already holds this
  -- outcome (a link refused during recovery reaches here with the state already unknown).
  v_flagged := p_needs_review and not v_order.needs_review;
  if v_flagged then
    update public.orders set needs_review = true where id = v_order.id;
  end if;
  if v_closed or v_flagged then
    insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason)
    values (
      'system',
      'checkout.provider_create.' || p_outcome,
      'payment_attempt',
      v_pa.id::text,
      jsonb_build_object('provider_order_state', v_pa.provider_order_state),
      jsonb_build_object('provider_order_state', p_outcome, 'needs_review', p_needs_review),
      p_reason);
  end if;

  return public.checkout_attempt_state(v_order.checkout_attempt_hash)
         || jsonb_build_object('closed', v_closed);
end;
$fn$;

comment on function public.checkout_close_provider_create(uuid, text, text, boolean) is
  'S1.6: records that the provider call of a checkout attempt ended without a link — requested → failed (the provider refused: no payment can start) or requested → unknown (no usable answer: held, never called again), or unknown → failed — with a reason code, an optional review flag on the order and one audit_log row. The same outcome again changes nothing, unless it asks for a review the order does not have yet: the flag is then raised and audited, the state untouched; a linked attempt is never closed. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.checkout_close_provider_create(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.checkout_close_provider_create(uuid, text, text, boolean) to service_role;
