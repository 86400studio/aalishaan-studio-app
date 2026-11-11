-- 0004_checkout.down.sql — the schema-recovery artifact paired with supabase/migrations/0004_checkout.sql (S1.6).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is run only on a written authorisation
-- that names this file and the project, after the checks in docs/database-changes/S1.6-0004-checkout.md →
-- "Rollback plan", and only when forward-fixing is not possible — on TEST by the owner in the SQL editor or by
-- the builder under the owner's scoped delegation (docs/database-changes/S1.1-0001-catalogue.md → "Rollback
-- rehearsal" states who and how), on PROD by the human owner only.
-- It DROPS the three S1.6 columns of orders and the three S1.6 columns of payment_attempts and so DELETES, for
-- every checkout order, the attempt binding (the customer can no longer resume that attempt), the confirmation
-- link's salt (that order's link can no longer be derived — the stored token hash stays, so a link already
-- delivered still verifies) and the provider-order state and times (which attempts were linked, failed or left
-- unknown, and the basis of each deadline; orders.expires_at itself stays) — down-SQL reverses schema, never
-- data. The orders, contacts, addresses, items, snapshots, payment attempts and audit rows themselves are not
-- touched. The application code of S1.6 must be rolled back first: without the five functions every checkout
-- answers "unavailable".
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the reversal is recorded
-- afterwards with `supabase migration repair --status reverted 0004 --project-ref <REF>` for the same project.

drop function if exists public.checkout_close_provider_create(uuid, text, text, boolean);
drop function if exists public.checkout_link_provider_order(uuid, text, timestamptz);
drop function if exists public.checkout_claim_provider_create(uuid);
drop function if exists public.checkout_create_pending_order(jsonb);
drop function if exists public.checkout_attempt_state(text);

drop trigger if exists payment_attempts_guard_checkout on public.payment_attempts;
drop function if exists public.guard_checkout_payment_attempt();
drop index if exists public.payment_attempts_checkout_provider_order_key;
drop index if exists public.payment_attempts_checkout_order_key;

alter table public.payment_attempts
  drop constraint if exists payment_attempts_linked_is_complete,
  drop constraint if exists payment_attempts_intent_is_untouched,
  drop constraint if exists payment_attempts_provider_order_state_allowed,
  drop column if exists provider_order_created_at,
  drop column if exists provider_create_requested_at,
  drop column if exists provider_order_state;

drop trigger if exists orders_guard_checkout_fields on public.orders;
drop function if exists public.guard_order_checkout_fields();

alter table public.orders
  drop constraint if exists orders_confirmation_token_salt_with_hash,
  drop constraint if exists orders_confirmation_token_salt_shape,
  drop constraint if exists orders_checkout_attempt_complete,
  drop constraint if exists orders_checkout_payload_mac_shape,
  drop constraint if exists orders_checkout_attempt_hash_shape,
  drop constraint if exists orders_checkout_attempt_hash_key,
  drop column if exists confirmation_token_salt,
  drop column if exists checkout_payload_mac,
  drop column if exists checkout_attempt_hash;
