-- 0005_payment_finalization.down.sql — the schema-recovery artifact paired with
-- supabase/migrations/0005_payment_finalization.sql (S1.7).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is run only on a written authorisation
-- that names this file and the project, after the checks in docs/database-changes/S1.7-0005-payment-finalization.md
-- → "Rollback plan", and only when forward-fixing is not possible — on TEST by the owner in the SQL editor or by
-- the builder under the owner's scoped delegation (docs/database-changes/S1.1-0001-catalogue.md → "Rollback
-- rehearsal" states who and how), on PROD by the human owner only.
-- It DROPS the one S1.7 column of orders and so DELETES, for every order, the payment hold — which orders under
-- review a later valid capture may clear by itself. The review flag (orders.needs_review) stays, so after this file
-- every flagged order is a review for a person, and no hold is cleared automatically again — down-SQL reverses
-- schema, never data. The orders, their payment rows, the provider-event ledger, the audit rows and the pending
-- work already written are not touched: an order confirmed before this file stays confirmed, with its
-- send_confirmation task. The application code of S1.7 must be rolled back first: without the five functions the
-- webhook answers "unavailable" (the provider retries it), the Checkout return stays unverified and /order/[token]
-- shows its temporary error.
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the reversal is recorded
-- afterwards with `supabase migration repair --status reverted 0005 --project-ref <REF>` for the same project.

drop function if exists public.order_confirmation_view(text);
drop function if exists public.payment_record_provider_check(uuid, text, text);
drop function if exists public.payment_return_state(text, text);
drop function if exists public.payment_process_event(uuid);
drop function if exists public.payment_record_event(text, text, jsonb);

alter table public.orders
  drop constraint if exists orders_payment_hold_with_review,
  drop constraint if exists orders_payment_hold_allowed,
  drop column if exists payment_hold;
