-- 0007_payment_review — S1.7, after the independent review's round 2 (findings 1 and 2): a payment the provider
-- shows live beside its own signed failure is a review, and the provider check keeps what it observed for every
-- linked attempt — a confirmed order, or one under another review, included (docs/database-changes/
-- S1.7-0007-payment-review.md; docs/code-reviews/S1.7-razorpay-verification-review.md → "Implementation PR,
-- round 2"; docs/TECH-ARCHITECTURE.md §4 row 0007).
--
-- Why a third S1.7 migration: 0005 and 0006 are applied on TEST and are never edited. Both rules below must hold
-- under the row locks the payment functions already take (the checkout row, then the order, then the payments).
--
-- What changes (function bodies and comments only — no table, column, index, policy, grant or signature):
--   * payment_process_event(uuid): a signed payment.failed of the payment a standing provider-check hold names is
--     a review no later capture clears (payment_state_conflict), never "recorded:failed" beside a clearable hold;
--     and while a hold stands, a provider-check hold naming ANOTHER payment counts as another live payment, so a
--     hold raised before 0007 for a payment whose row already says failed can never be cleared by a different
--     payment's capture (extra_payment);
--   * payment_record_provider_check(uuid, jsonb): every linked attempt's observation is recorded, not only an order
--     that still awaits its payment. Each payment shown that is not on record gets its known row (created, never
--     verified). A confirmed order meets an exact repeat of its confirmed payment as a no-op, and anything else —
--     another payment, other money — as a review that keeps the confirmation, its items' stage and its single
--     send_confirmation task. An order that no longer awaits its payment is order_not_payable; a payment not on
--     record for an order under a review that is not a hold is audited beside that review (order_under_review); a
--     listed payment whose row says failed is payment_state_conflict. Only an order that awaits its payment, under no
--     review other than a hold, is ever held. Every review audit is written once per distinct observation.
--
-- House style of 0004–0006: plpgsql, pinned empty search_path, never SECURITY DEFINER, EXECUTE revoked from
-- public, anon and authenticated and granted to service_role only; no BEGIN/COMMIT (the CLI applies the file as one
-- unit). Paired with supabase/rollbacks/0007_payment_review.down.sql, which restores 0006's two definitions word for
-- word and keeps every row.

create or replace function public.payment_process_event(p_event uuid)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_event             public.provider_events%rowtype;
  v_entity            jsonb;
  v_kind              text;
  v_payment_id        text;
  v_provider_order_id text;
  v_amount            bigint;
  v_currency          text;
  v_pa                public.payment_attempts%rowtype;
  v_order             public.orders%rowtype;
  v_pay               public.payment_attempts%rowtype;
  v_pay_found         boolean := false;
  v_storable          boolean;
  v_other_live        boolean;
  v_reason            text;
  v_status            text := 'processed';
  v_outcome           text;
begin
  if p_event is null then
    raise exception 'payment: invalid_request' using errcode = 'ZP001';
  end if;

  -- (a) the ledger row, locked: a concurrent delivery of the same event waits here, then reads its marks.
  select pe.* into v_event
    from public.provider_events pe
   where pe.id = p_event
     for update;
  if not found or v_event.provider <> 'razorpay' or v_event.signature_ok is not true then
    raise exception 'payment: event_not_found' using errcode = 'ZP010';
  end if;
  if v_event.processing_status in ('processed', 'ignored') then
    return jsonb_build_object(
      'outcome', coalesce(v_event.processing_note, v_event.processing_status),
      'replayed', true);
  end if;

  -- (b) what the event says — read from the ledger row alone.
  v_kind := case v_event.event_type
              when 'payment.captured' then 'captured'
              when 'payment.authorized' then 'authorized'
              when 'payment.failed' then 'failed'
            end;
  v_entity := v_event.payload #> '{payload,payment,entity}';

  if v_kind is null then
    -- Any other event (order.paid included) is kept in the ledger and has no business effect.
    v_status := 'ignored';
    v_outcome := 'unsupported_event';
  elsif jsonb_typeof(v_entity) is distinct from 'object'
        or jsonb_typeof(v_entity -> 'id') is distinct from 'string'
        or coalesce((v_entity ->> 'id') !~ '^pay_[A-Za-z0-9]{6,60}$', true)
        or jsonb_typeof(v_entity -> 'amount') is distinct from 'number'
        or coalesce((v_entity ->> 'amount') !~ '^[0-9]{1,15}$', true)
        or jsonb_typeof(v_entity -> 'currency') is distinct from 'string'
        or coalesce((v_entity ->> 'currency') !~ '^[A-Z]{3}$', true)
        or coalesce(jsonb_typeof(v_entity -> 'order_id') not in ('string', 'null'), false)
        or (v_kind = 'captured'
            and ((v_entity ->> 'status') is distinct from 'captured'
                 or (v_entity -> 'captured') is distinct from 'true'::jsonb)) then
    v_status := 'ignored';
    v_outcome := 'malformed_payment';
  else
    v_payment_id := v_entity ->> 'id';
    v_amount := (v_entity ->> 'amount')::bigint;
    v_currency := v_entity ->> 'currency';
    v_provider_order_id := v_entity ->> 'order_id';

    -- (c) the order the payment belongs to: the checkout row that holds the provider's order id — never a guess by
    --     amount, receipt or time, and never a row that is not a checkout's own.
    if coalesce(v_provider_order_id ~ '^order_[A-Za-z0-9]{6,60}$', false) then
      select pa.* into v_pa
        from public.payment_attempts pa
       where pa.provider = 'razorpay'
         and pa.provider_order_id = v_provider_order_id
         and pa.provider_order_state is not null
         for update;
    end if;

    if v_pa.id is null then
      if v_kind = 'failed' then
        v_status := 'ignored';
        v_outcome := 'unknown_reference';
      else
        -- Money the provider reports for a reference no checkout row holds: no order is flagged or guessed; the
        -- evidence is this audit row, tied to the ledger row.
        insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason, external_ref)
        values (
          'system',
          'payment.review.unknown_reference',
          'provider_event',
          v_event.id::text,
          null,
          jsonb_build_object(
            'payment', jsonb_build_object('status', v_kind, 'amount_paise', v_amount, 'currency', v_currency),
            'provider_order_id', v_provider_order_id,
            'unlinked_rows', (select count(*)
                                from public.payment_attempts l
                               where l.provider = 'razorpay'
                                 and l.provider_order_id = v_provider_order_id
                                 and l.provider_order_state is null)),
          'unknown_reference',
          v_payment_id);
        v_outcome := 'review:unknown_reference';
      end if;
    else
      select o.* into v_order from public.orders o where o.id = v_pa.order_id for update;

      select p.* into v_pay
        from public.payment_attempts p
       where p.provider = 'razorpay' and p.provider_payment_id = v_payment_id
         for update;
      v_pay_found := found;

      if v_pay_found and (v_pay.order_id <> v_order.id or v_pay.provider_order_state is not null) then
        -- The payment id is already on a row that is not this order's payment row: nothing is rebound.
        v_reason := 'payment_conflict';
      elsif v_pay_found
            and ((v_kind = 'captured' and v_pay.status = 'captured')
                 or (v_kind = 'authorized' and v_pay.status in ('authorized', 'captured'))
                 or (v_kind = 'failed' and v_pay.status in ('failed', 'authorized', 'captured'))) then
        -- A repeated or older event of a payment whose row is already there or further: the row never moves back.
        -- 0006: it is the same payment again only if it states the money a signed event already recorded on the row
        -- (an authorised or captured row's amount and currency were written by one, and judged against the order
        -- then). An authorised or captured event that contradicts that money is a review no later capture clears —
        -- step (g) — and the row is left exactly as it is. A failed event's money is judged on neither path.
        if v_kind <> 'failed' and v_currency is distinct from v_pay.currency then
          v_reason := 'currency_mismatch';
        elsif v_kind <> 'failed' and v_amount is distinct from v_pay.amount_paise then
          v_reason := 'amount_mismatch';
        else
          v_outcome := case when v_kind = 'captured' then 'duplicate_capture' else 'stale_' || v_kind end;
        end if;
      else
        -- (d) the payment's own row moves forward. A currency the row cannot hold, or an amount outside its bounds,
        --     is never written as something else, and a row that already exists is then left exactly as it was:
        --     the ledger and the audit row carry what the event said.
        v_storable := v_currency = 'INR' and v_amount between 1 and 100000000000;
        if v_storable and v_pay_found then
          update public.payment_attempts
             set status = v_kind,
                 signature_verified = true,
                 amount_paise = v_amount
           where id = v_pay.id;
        elsif v_storable then
          insert into public.payment_attempts (
            order_id, provider, provider_order_id, provider_payment_id, amount_paise, currency, status,
            signature_verified)
          values (v_order.id, 'razorpay', v_provider_order_id, v_payment_id, v_amount, 'INR', v_kind, true);
        end if;

        if v_kind = 'failed' then
          -- A signed failure contradicting a live API observation needs a human decision.
          if v_order.payment_hold is not null and exists (
            select 1 from public.audit_log a
             where a.entity_type = 'order' and a.entity_id = v_order.id::text
               and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')
               and a.reason = 'provider_check' and a.external_ref = v_payment_id
          ) then
            v_reason := 'payment_state_conflict';
          else
            v_outcome := 'recorded:failed';
          end if;
        else
          -- Another payment of this order that is known and has not failed: authorised or captured by a signed
          -- event, reported by a verified Checkout return, or shown captured or authorised by the provider check
          -- (which records that payment's row). Its existence makes this one an extra payment — never the capture
          -- that clears a hold raised for the other.
          v_other_live := exists (
            select 1
              from public.payment_attempts x
             where x.order_id = v_order.id
               and x.provider_order_state is null
               and x.status <> 'failed'
               and x.provider_payment_id is distinct from v_payment_id)
            or (v_order.payment_hold is not null and exists (
              -- A hold created before 0007 can name a payment whose row already says failed.
              select 1 from public.audit_log a
               where a.entity_type = 'order' and a.entity_id = v_order.id::text
                 and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')
                 and a.reason = 'provider_check' and a.external_ref <> v_payment_id));

          -- (e) every reason this payment cannot confirm — or, authorised, cannot simply wait for its capture.
          v_reason := case
            when v_order.payment_status = 'captured' then 'extra_payment'
            when v_order.payment_status <> 'pending' or v_order.fulfilment_status <> 'pending_payment'
              then 'order_not_payable'
            when v_currency <> 'INR' then 'currency_mismatch'
            when v_amount <> v_order.total_paise or v_amount <> v_pa.amount_paise then 'amount_mismatch'
            when v_other_live then 'extra_payment'
            when v_kind = 'captured' and v_order.expires_at is null then 'expiry_missing'
            when v_kind = 'captured' and v_event.received_at > v_order.expires_at then 'late_capture'
            when v_kind = 'captured' and v_order.needs_review and v_order.payment_hold is null
              then 'order_under_review'
          end;

          if v_reason is null and v_kind = 'captured' then
            -- (f) the confirmation: the order, its items, one audit row and one unit of pending work — together.
            update public.orders
               set payment_status = 'captured',
                   fulfilment_status = 'confirmed',
                   confirmed_at = now(),
                   needs_review = false,
                   payment_hold = null
             where id = v_order.id;

            update public.order_items set stage = 1 where order_id = v_order.id and stage = 0;

            insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason, external_ref)
            values (
              'system',
              'payment.captured.confirmed',
              'order',
              v_order.id::text,
              jsonb_build_object(
                'payment_status', v_order.payment_status,
                'fulfilment_status', v_order.fulfilment_status,
                'needs_review', v_order.needs_review,
                'payment_hold', v_order.payment_hold),
              jsonb_build_object(
                'payment_status', 'captured',
                'fulfilment_status', 'confirmed',
                'needs_review', false,
                'payment_hold', null,
                'payment', jsonb_build_object('status', 'captured', 'amount_paise', v_amount, 'currency', 'INR'),
                'event', v_event.id),
              'captured_event',
              v_payment_id);

            -- One unit of pending work per order, by its key. A row that already holds the key must be this
            -- order's own confirmation task; anything else stops the confirmation whole.
            insert into public.pending_work (kind, entity_type, entity_id, dedupe_key, payload)
            values (
              'send_confirmation',
              'order',
              v_order.id,
              'send_confirmation:order:' || v_order.id::text,
              jsonb_build_object('v', 1))
            on conflict (dedupe_key) do nothing;
            perform 1
               from public.pending_work w
              where w.dedupe_key = 'send_confirmation:order:' || v_order.id::text
                and w.kind = 'send_confirmation'
                and w.entity_type = 'order'
                and w.entity_id = v_order.id;
            if not found then
              raise exception 'payment: outbox_conflict' using errcode = 'ZP030';
            end if;

            v_outcome := 'confirmed';
          elsif v_reason is null then
            -- An authorised payment for the right order and amount, with nothing else in the way: a hold its own
            -- capture clears. An order that is already under review keeps that review as it is.
            if not v_order.needs_review then
              update public.orders
                 set needs_review = true,
                     payment_hold = 'authorized_only'
               where id = v_order.id;

              insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason, external_ref)
              values (
                'system',
                'payment.hold.authorized_only',
                'order',
                v_order.id::text,
                jsonb_build_object('needs_review', false, 'payment_hold', null),
                jsonb_build_object(
                  'needs_review', true,
                  'payment_hold', 'authorized_only',
                  'payment', jsonb_build_object('status', 'authorized', 'amount_paise', v_amount, 'currency', v_currency),
                  'event', v_event.id),
                'authorized_event',
                v_payment_id);

              v_outcome := 'hold:authorized_only';
            else
              v_outcome := 'recorded:authorized';
            end if;
          end if;
        end if;
      end if;

      if v_reason is not null then
        -- (g) a review no later capture clears: the flag stands without a hold, and the reason is audited.
        if not v_order.needs_review or v_order.payment_hold is not null then
          update public.orders
             set needs_review = true,
                 payment_hold = null
           where id = v_order.id;
        end if;

        insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason, external_ref)
        values (
          'system',
          'payment.review.' || v_reason,
          'order',
          v_order.id::text,
          jsonb_build_object(
            'payment_status', v_order.payment_status,
            'needs_review', v_order.needs_review,
            'payment_hold', v_order.payment_hold),
          jsonb_build_object(
            'payment_status', v_order.payment_status,
            'needs_review', true,
            'payment_hold', null,
            'payment', jsonb_build_object('status', v_kind, 'amount_paise', v_amount, 'currency', v_currency),
            'event', v_event.id),
          v_reason,
          v_payment_id);

        v_outcome := 'review:' || v_reason;
      end if;
    end if;
  end if;

  -- (h) the event's marks, in the same transaction as its effect: never "processed" before the effect commits.
  update public.provider_events
     set processing_status = v_status,
         processed_at = now(),
         processing_note = v_outcome
   where id = v_event.id;

  return jsonb_build_object('outcome', v_outcome, 'replayed', false);
end;
$fn$;

comment on function public.payment_process_event(uuid) is
  'S1.7 (0006 amends the rule for a repeated event; 0007 the rules for a signed failure and for another live payment): processes one verified Razorpay event from its ledger row alone, in one transaction, and marks the row in that same transaction. payment.captured confirms the order it belongs to exactly once — the payment''s row, the order (payment_status captured, fulfilment_status confirmed, confirmed_at), its items'' stage, one audit row and one send_confirmation unit of pending work — only while the order awaits payment, for the stored amount in INR, with no other live payment, within its deadline by the event''s ledger time, and under no review other than a payment hold. Another live payment is any other known payment of the order whose row has not failed, or — while a hold stands — a payment that a provider-check hold of the order named (0007). payment.authorized raises the authorized_only hold. payment.failed is recorded, except the failure of the payment a standing provider-check hold names: a review no later capture clears (payment_state_conflict — 0007). A wrong amount or currency, an extra or late payment, an order no longer awaiting payment, a payment id held elsewhere and an unknown reference are flagged and audited, never confirmed. A payment''s row only moves forward, and a repeated or older event of it is the same payment again only if it states the amount and currency a signed event already recorded on that row: an authorised or captured event that contradicts them is flagged and audited (currency_mismatch / amount_mismatch — 0006), never taken for a duplicate. A row already processed or ignored answers its recorded outcome with replayed = true. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.payment_process_event(uuid) from public, anon, authenticated;
grant execute on function public.payment_process_event(uuid) to service_role;

create or replace function public.payment_record_provider_check(
  p_payment_attempt_id uuid,
  p_payments           jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_pa           public.payment_attempts%rowtype;
  v_order        public.orders%rowtype;
  v_pay          public.payment_attempts%rowtype;
  v_item         jsonb;
  v_ids          text[] := '{}';
  v_id           text;
  v_amount       bigint;
  v_currency     text;
  v_captured     boolean;
  v_currency_off boolean;
  v_amount_off   boolean;
  v_hold         text;
  v_reason       text;
  v_ref          text;
  v_seen         jsonb := '[]'::jsonb;
  v_held         boolean := false;
  v_holdable     boolean;
  v_new          boolean := false;
begin
  -- (a) every value's shape, before anything is read or written: one to 99 live payments (the most one page of the
  --     provider's listing holds), each exactly an id, a status, an amount in exact paise (a decimal string) and a
  --     currency, the ids distinct.
  if p_payment_attempt_id is null
     or p_payments is null
     or jsonb_typeof(p_payments) is distinct from 'array' then
    raise exception 'payment: invalid_request' using errcode = 'ZP001';
  end if;
  if jsonb_array_length(p_payments) not between 1 and 99 then
    raise exception 'payment: invalid_request' using errcode = 'ZP001';
  end if;
  for v_item in select e.value from jsonb_array_elements(p_payments) as e(value) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'payment: invalid_request' using errcode = 'ZP001';
    end if;
    if (select count(*) from jsonb_object_keys(v_item)) <> 4
       or not (v_item ?& array['id', 'status', 'amount_paise', 'currency'])
       or jsonb_typeof(v_item -> 'id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'status') is distinct from 'string'
       or jsonb_typeof(v_item -> 'amount_paise') is distinct from 'string'
       or jsonb_typeof(v_item -> 'currency') is distinct from 'string'
       or coalesce((v_item ->> 'id') !~ '^pay_[A-Za-z0-9]{6,60}$', true)
       or coalesce((v_item ->> 'status') not in ('captured', 'authorized'), true)
       or coalesce((v_item ->> 'amount_paise') !~ '^[1-9][0-9]{0,14}$', true)
       or coalesce((v_item ->> 'currency') !~ '^[A-Z]{3}$', true)
       or (v_item ->> 'id') = any (v_ids) then
      raise exception 'payment: invalid_request' using errcode = 'ZP001';
    end if;
    v_ids := v_ids || (v_item ->> 'id');
  end loop;

  -- (b) the locks every writer of an order's payments takes, in their order (0005 contract 14): the checkout's
  --     payment-attempt row, then its order; the payments' own rows below.
  select pa.* into v_pa
    from public.payment_attempts pa
   where pa.id = p_payment_attempt_id and pa.provider_order_state is not null
     for update;
  if not found then
    raise exception 'payment: attempt_not_found' using errcode = 'ZP020';
  end if;
  select o.* into v_order from public.orders o where o.id = v_pa.order_id for update;

  -- (c) what the provider showed, judged as the event path judges a payment (0005 step (e)), every live payment
  --     counted: a captured one makes the hold capture_unverified; another currency, an amount that is not both the
  --     order's total and the checkout row's amount, or more than one live payment is a review no capture clears.
  select bool_or((e.value ->> 'status') = 'captured'),
         bool_or((e.value ->> 'currency') <> 'INR'),
         bool_or((e.value ->> 'amount_paise')::bigint <> v_order.total_paise
                 or (e.value ->> 'amount_paise')::bigint <> v_pa.amount_paise)
    into v_captured, v_currency_off, v_amount_off
    from jsonb_array_elements(p_payments) as e(value);
  v_hold := case when v_captured then 'capture_unverified' else 'authorized_only' end;
  v_reason := case
    when v_currency_off then 'currency_mismatch'
    when v_amount_off then 'amount_mismatch'
    when cardinality(v_ids) > 1 then 'extra_payment'
  end;

  -- (d) 0007: what the provider showed is kept for EVERY linked attempt — the checkout row's and the order's locks
  --     (above) serialise this snapshot with signed events, so a webhook that committed first (a confirmation, a
  --     review) is seen here and the observation is still recorded beside it. Only an order that still awaits its
  --     payment, under no review other than a hold, can be held; any other order is never held and never cleared.
  if v_pa.provider_order_state = 'linked' then
    v_holdable := v_order.payment_status = 'pending'
                  and v_order.fulfilment_status = 'pending_payment'
                  and (not v_order.needs_review or v_order.payment_hold is not null);

    -- One payment with the stored intent's money is still a review when another payment stands for the order: on a
    -- confirmed order, any payment but the one whose signed capture confirmed it; otherwise, as the event path counts
    -- another live payment (payment_process_event, step (e)), any other known payment whose row has not failed
    -- (reported by a verified return, authorised or captured by a signed event, or shown by an earlier provider
    -- check) — or, while a hold stands, a payment that a provider-check hold of the order named (a hold created
    -- before 0007 can name a payment whose row already says failed): never a hold its own capture could not clear.
    if v_reason is null and v_order.payment_status = 'captured' and not exists (
      select 1 from public.audit_log a
       where a.entity_type = 'order' and a.entity_id = v_order.id::text
         and a.action = 'payment.captured.confirmed' and a.external_ref = v_ids[1]
    ) then
      v_reason := 'extra_payment';
    elsif v_reason is null and v_order.payment_status <> 'captured' and (exists (
      select 1 from public.payment_attempts p
       where p.order_id = v_order.id and p.provider_order_state is null
         and p.status <> 'failed' and p.provider_payment_id is distinct from v_ids[1]
    ) or (v_order.payment_hold is not null and exists (
      select 1 from public.audit_log a
       where a.entity_type = 'order' and a.entity_id = v_order.id::text
         and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')
         and a.reason = 'provider_check' and a.external_ref <> v_ids[1]))) then
      v_reason := 'extra_payment';
    end if;

    for v_item in
      select e.value from jsonb_array_elements(p_payments) as e(value) order by e.value ->> 'id'
    loop
      v_id := v_item ->> 'id';
      v_amount := (v_item ->> 'amount_paise')::bigint;
      v_currency := v_item ->> 'currency';
      select p.* into v_pay
        from public.payment_attempts p
       where p.provider = 'razorpay' and p.provider_payment_id = v_id
         for update;
      if found then
        if v_pay.order_id <> v_order.id or v_pay.provider_order_state is not null then
          raise exception 'payment: payment_conflict' using errcode = 'ZP021';
        end if;
        if v_pay.status = 'failed' then
          v_reason := coalesce(v_reason, 'payment_state_conflict');
        end if;
      elsif v_currency = 'INR' and v_amount between 1 and 100000000000 then
        insert into public.payment_attempts (
          order_id, provider, provider_order_id, provider_payment_id, amount_paise, currency, status,
          signature_verified)
        values (
          v_order.id, 'razorpay', v_pa.provider_order_id, v_id, v_amount, 'INR', 'created', false);
        v_new := true;
      end if;
      v_seen := v_seen || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'status', v_item ->> 'status',
        'amount_paise', v_amount,
        'currency', v_currency));
    end loop;

    -- An order that cannot be held is never left without a record of a live payment: one that no longer awaits its
    -- payment (fulfilment moved on, or its payment expired or failed) is order_not_payable, as the event path's step
    -- (e) judges it; one under a review that is not a hold keeps that review, and a payment shown for it that was not
    -- on record is audited beside it (order_under_review). A listing of payments already on record changes nothing.
    if v_reason is null and v_order.payment_status <> 'captured' and not v_holdable then
      v_reason := case
        when v_order.payment_status <> 'pending' or v_order.fulfilment_status <> 'pending_payment'
          then 'order_not_payable'
        when v_new then 'order_under_review'
      end;
    end if;

    -- The audit row names the strongest payment shown: the first captured one, else the first authorised one, by id.
    select e.value ->> 'id' into v_ref
      from jsonb_array_elements(p_payments) as e(value)
     order by (e.value ->> 'status') = 'captured' desc, e.value ->> 'id'
     limit 1;

    if v_reason is null and v_holdable
       and (not v_order.needs_review or (v_order.payment_hold = 'authorized_only' and v_hold = 'capture_unverified')) then
      -- Exactly one payment, the stored intent's money, for an order that awaits it: the hold its own signed capture
      -- clears. A captured answer replaces the weaker authorized_only hold (0005); an equal or stronger hold stands.
      update public.orders
         set needs_review = true,
             payment_hold = v_hold
       where id = v_order.id;

      insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason, external_ref)
      values (
        'system',
        'payment.hold.' || v_hold,
        'order',
        v_order.id::text,
        jsonb_build_object('needs_review', v_order.needs_review, 'payment_hold', v_order.payment_hold),
        jsonb_build_object(
          'needs_review', true,
          'payment_hold', v_hold,
          'payment', (v_seen -> 0) - 'id'),
        'provider_check',
        v_ref);

      v_held := true;
    elsif v_reason is not null and not exists (
      select 1 from public.audit_log a
       where a.entity_type = 'order' and a.entity_id = v_order.id::text
         and a.reason = 'provider_check' and a.action = 'payment.review.' || v_reason
         and a.next -> 'payments' = v_seen
    ) then
      -- A review no later capture clears: the flag stands without a hold, and what the provider showed is audited —
      -- every payment with the money it observed, which the payment rows cannot always hold — once per distinct
      -- observation. The flag is set where it is not and a hold is cleared; an existing review stands as it is, and
      -- nothing else of the order moves (payment_status, fulfilment, confirmed_at, items, pending work).
      update public.orders
         set needs_review = true,
             payment_hold = null
       where id = v_order.id and (not needs_review or payment_hold is not null);

      insert into public.audit_log (actor_type, action, entity_type, entity_id, previous, next, reason, external_ref)
      values (
        'system',
        'payment.review.' || v_reason,
        'order',
        v_order.id::text,
        jsonb_build_object(
          'payment_status', v_order.payment_status,
          'needs_review', v_order.needs_review,
          'payment_hold', v_order.payment_hold),
        jsonb_build_object(
          'payment_status', v_order.payment_status,
          'needs_review', true,
          'payment_hold', null,
          'payments', v_seen),
        'provider_check',
        v_ref);
    end if;
  end if;

  return (
    select jsonb_build_object(
             'held', v_held,
             'payment_status', o.payment_status,
             'needs_review', o.needs_review,
             'payment_hold', o.payment_hold)
      from public.orders o
     where o.id = v_order.id);
end;
$fn$;

comment on function public.payment_record_provider_check(uuid, jsonb) is
  'S1.7 (0006; D-68; 0007 records every linked attempt''s observation): records what the provider''s API shows for a linked checkout attempt — EVERY live payment it listed (captured or authorised), each with the amount and currency the provider observed — under the checkout row''s and the order''s locks, which serialise it with signed events. Each payment shown that is not on record gets its row, status created, signature_verified false, the observed amount where the row can hold it (INR, within bounds) — never authorised, captured or paid. Only an order that still awaits its payment and is under no review other than a hold is ever held: exactly one payment, for the order''s total and the checkout row''s amount in INR, with no other known payment (as the event path counts one: another payment row that has not failed, or — while a hold stands — another payment a provider-check hold of the order named), is the capture_unverified or authorized_only hold with one audit row payment.hold.<hold> (reason provider_check, the observed money in it); a captured answer replaces the authorized_only hold. Otherwise it is a review no later capture clears, with one audit row payment.review.<reason> (reason provider_check) carrying every payment as observed, written once per distinct observation: more than one live payment, another currency or amount, or one payment beside another known one or other than the payment that confirmed the order (extra_payment / currency_mismatch / amount_mismatch); a listed payment whose row says failed (payment_state_conflict); an order no longer awaiting its payment (order_not_payable); a payment not on record for an order already under a review that is not a hold (order_under_review). A review sets needs_review where it is not set and clears a hold; it never changes payment_status, fulfilment_status, confirmed_at, items or pending work, and never clears a review. An exact repeat — a confirmed order''s own payment, or payments already on record for an order under review — writes nothing. It never confirms an order. A payment id another order holds is refused (ZP021) and nothing of the call is kept. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.payment_record_provider_check(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.payment_record_provider_check(uuid, jsonb) to service_role;
