-- 0006_payment_evidence.down.sql — the schema-recovery artifact paired with
-- supabase/migrations/0006_payment_evidence.sql (S1.7, after the independent review's round 1).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is run only on a written authorisation
-- that names this file and the project, after the checks in docs/database-changes/S1.7-0006-payment-evidence.md
-- → "Rollback plan", and only when forward-fixing is not possible — on TEST by the owner in the SQL editor or by
-- the builder under the owner's scoped delegation (docs/database-changes/S1.1-0001-catalogue.md → "Rollback
-- rehearsal" states who and how), on PROD by the human owner only.
-- It DROPS provider_events.raw_body and so DELETES, for every delivery ledgered since 0006, the exact bytes the
-- webhook verified — the only copy of what the provider sent; the parsed payload stays. It restores the three
-- functions exactly as 0005 wrote them — payment_record_event(text, text, jsonb), payment_process_event(uuid) and
-- payment_record_provider_check(uuid, text, text) — and protect_provider_event() exactly as 0002 wrote it: from then
-- on a repeated event's money is not judged and the provider check records one payment, as before 0006.
-- Down-SQL reverses schema, never data: the reviews, holds, payment rows, ledger rows and audit rows written under
-- 0006 stay as they are, and an order flagged by its rules stays flagged. The application code of this change must
-- be rolled back first: its adapter calls payment_record_event with four arguments and
-- payment_record_provider_check with two, so after this file the webhook would answer "unavailable" (the provider
-- retries it) and the provider check "could not be checked" (no new payment is offered).
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the reversal is recorded
-- afterwards with `supabase migration repair --status reverted 0006 --project-ref <REF>` for the same project.

drop function if exists public.payment_record_provider_check(uuid, jsonb);

create or replace function public.payment_record_provider_check(
  p_payment_attempt_id uuid,
  p_payment_id         text,
  p_provider_status    text)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_pa    public.payment_attempts%rowtype;
  v_order public.orders%rowtype;
  v_pay   public.payment_attempts%rowtype;
  v_hold  text;
  v_held  boolean := false;
begin
  if p_payment_attempt_id is null
     or coalesce(p_payment_id !~ '^pay_[A-Za-z0-9]{6,60}$', true)
     or coalesce(p_provider_status not in ('captured', 'authorized'), true) then
    raise exception 'payment: invalid_request' using errcode = 'ZP001';
  end if;

  select pa.* into v_pa
    from public.payment_attempts pa
   where pa.id = p_payment_attempt_id and pa.provider_order_state is not null
     for update;
  if not found then
    raise exception 'payment: attempt_not_found' using errcode = 'ZP020';
  end if;
  select o.* into v_order from public.orders o where o.id = v_pa.order_id for update;

  -- Only an order that still awaits its payment can be held, and only where no other review stands: an API answer
  -- never confirms, never clears and never replaces a review. A captured answer does replace the weaker hold.
  v_hold := case p_provider_status when 'captured' then 'capture_unverified' else 'authorized_only' end;
  if v_pa.provider_order_state = 'linked'
     and v_order.payment_status = 'pending'
     and v_order.fulfilment_status = 'pending_payment'
     and (not v_order.needs_review
          or (v_order.payment_hold = 'authorized_only' and v_hold = 'capture_unverified')) then
    -- The payment the provider showed is recorded as known: status created, never authorised, captured or paid —
    -- only its signed event moves it. A later capture of ANOTHER payment of this order is then an extra payment,
    -- never the capture that clears this hold. A payment id another order holds is a conflict: nothing is rebound,
    -- and nothing of this call is kept.
    select p.* into v_pay
      from public.payment_attempts p
     where p.provider = 'razorpay' and p.provider_payment_id = p_payment_id
       for update;
    if found then
      if v_pay.order_id <> v_order.id or v_pay.provider_order_state is not null then
        raise exception 'payment: payment_conflict' using errcode = 'ZP021';
      end if;
    else
      insert into public.payment_attempts (
        order_id, provider, provider_order_id, provider_payment_id, amount_paise, currency, status,
        signature_verified)
      values (
        v_order.id, 'razorpay', v_pa.provider_order_id, p_payment_id, v_pa.amount_paise, 'INR', 'created', false);
    end if;

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
        'payment', jsonb_build_object('status', p_provider_status)),
      'provider_check',
      p_payment_id);

    v_held := true;
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

comment on function public.payment_record_provider_check(uuid, text, text) is
  'S1.7 (D-68): records that the provider''s API shows a captured or an authorised payment for a checkout attempt whose order still awaits payment and is under no other review — the order is flagged with the capture_unverified or authorized_only hold and one audit row, and that payment is recorded as known (its row, status created, signature_verified false — never authorised, captured or paid), so that the capture of another payment of the order is an extra payment and never clears the hold. It never confirms an order, never clears a flag and never replaces another review: only the signed captured event confirms, and clears the hold it finds. The same answer again changes nothing; a captured answer replaces the authorized_only hold; a payment id another order holds is refused (ZP021) and nothing of the call is kept. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.payment_record_provider_check(uuid, text, text) from public, anon, authenticated;
grant execute on function public.payment_record_provider_check(uuid, text, text) to service_role;

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
        -- A repeated or older event of a payment whose row is already there or further: no effect, no regression.
        v_outcome := case when v_kind = 'captured' then 'duplicate_capture' else 'stale_' || v_kind end;
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
          -- A failed payment leaves the order as it is: recoverable while its deadline stands.
          v_outcome := 'recorded:failed';
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
               and x.provider_payment_id is distinct from v_payment_id);

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
  'S1.7: processes one verified Razorpay event from its ledger row alone, in one transaction, and marks the row in that same transaction. payment.captured confirms the order it belongs to exactly once — the payment''s row, the order (payment_status captured, fulfilment_status confirmed, confirmed_at), its items'' stage, one audit row and one send_confirmation unit of pending work — only while the order awaits payment, for the stored amount in INR, with no other live payment, within its deadline by the event''s ledger time, and under no review other than a payment hold. payment.authorized raises the authorized_only hold; payment.failed is recorded. A wrong amount or currency, an extra or late payment, an order no longer awaiting payment, a payment id held elsewhere and an unknown reference are flagged and audited, never confirmed. A payment''s row only moves forward. A row already processed or ignored answers its recorded outcome with replayed = true. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.payment_process_event(uuid) from public, anon, authenticated;
grant execute on function public.payment_process_event(uuid) to service_role;

drop function if exists public.payment_record_event(text, text, jsonb, bytea);

create or replace function public.payment_record_event(
  p_event_id   text,
  p_event_type text,
  p_payload    jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_id       uuid;
  v_inserted boolean := true;
  v_derived  boolean := false;
  v_key      text;
  v_row      public.provider_events%rowtype;
begin
  if coalesce(p_event_id !~ '^[A-Za-z0-9_.:-]{1,120}$', true)
     or coalesce(p_event_type !~ '^[a-z][a-z0-9_.]{1,118}$', true)
     or p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'payment: invalid_request' using errcode = 'ZP001';
  end if;

  insert into public.provider_events (provider, event_id, event_type, signature_ok, payload)
  values ('razorpay', p_event_id, p_event_type, true, p_payload)
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- The id is already in the ledger. The same content is the same event again; other content is kept beside it
    -- under an id derived from that content — nothing stored is overwritten and nothing verified is dropped.
    v_inserted := false;
    select pe.* into v_row
      from public.provider_events pe
     where pe.provider = 'razorpay' and pe.event_id = p_event_id;
    if v_row.payload is distinct from p_payload or v_row.event_type is distinct from p_event_type then
      v_derived := true;
      v_key := p_event_id || '#' || substr(encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex'), 1, 32);
      insert into public.provider_events (provider, event_id, event_type, signature_ok, payload)
      values ('razorpay', v_key, p_event_type, true, p_payload)
      on conflict (provider, event_id) do nothing
      returning id into v_id;
      v_inserted := v_id is not null;
      if v_id is null then
        select pe.id into v_id
          from public.provider_events pe
         where pe.provider = 'razorpay' and pe.event_id = v_key;
      end if;
    else
      v_id := v_row.id;
    end if;
  end if;

  return (
    select jsonb_build_object(
             'event', pe.id,
             'inserted', v_inserted,
             'derived', v_derived,
             'processing_status', pe.processing_status)
      from public.provider_events pe
     where pe.id = v_id);
end;
$fn$;

comment on function public.payment_record_event(text, text, jsonb) is
  'S1.7: the insert-first ledger step for a Razorpay delivery whose signature the server has already verified — one provider_events row (signature_ok = true, the payload as delivered), or the row that already holds this event id. The same id with other content is never overwritten: it is stored beside the first under the id plus a digest of that content. Answers the row''s id, whether it was inserted now and its processing status; no business effect. EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.payment_record_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.payment_record_event(text, text, jsonb) to service_role;

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

alter table public.provider_events
  drop constraint if exists provider_events_raw_body_length,
  drop column if exists raw_body;
