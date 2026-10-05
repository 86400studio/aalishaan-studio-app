-- 0002_orders.down.sql — the schema-recovery artifact paired with supabase/migrations/0002_orders.sql (S1.1).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is executed only by a human, after the
-- checks in docs/database-changes/S1.1-0002-orders.md → "Rollback plan", and only when forward-fixing the
-- additive order schema is not possible. It DELETES every order, item, snapshot, payment attempt, provider
-- event, unit of pending work, history row, audit row, policy version, rule version, address, contact and
-- staff profile and cannot restore them — down-SQL reverses schema, never data; once real orders exist this
-- file is never run (the rollback plan prefers the forward fix).
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the human records the
-- reversal afterwards with `supabase migration repair --status reverted 0002` against the same project.

drop trigger if exists audit_log_insert_only on public.audit_log;
drop trigger if exists work_history_append_only on public.work_history;
drop trigger if exists pending_work_set_updated_at on public.pending_work;
drop trigger if exists provider_events_protect on public.provider_events;
drop trigger if exists payment_attempts_set_updated_at on public.payment_attempts;
drop trigger if exists purchase_snapshots_immutable on public.purchase_snapshots;
drop trigger if exists order_items_set_updated_at on public.order_items;
drop trigger if exists orders_set_updated_at on public.orders;
drop trigger if exists orders_guard_update on public.orders;
drop trigger if exists orders_assign_order_number on public.orders;
drop trigger if exists addresses_append_only on public.addresses;
drop trigger if exists customers_contact_set_updated_at on public.customers_contact;
drop trigger if exists policy_versions_append_only on public.policy_versions;
drop trigger if exists business_rules_append_only on public.business_rules;
drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;

drop table if exists public.audit_log;
drop table if exists public.work_history;
drop table if exists public.pending_work;
drop table if exists public.provider_events;
drop table if exists public.payment_attempts;
drop table if exists public.purchase_snapshots;
drop table if exists public.order_items;
drop table if exists public.orders;
drop table if exists public.order_number_counter;
drop table if exists public.addresses;
drop table if exists public.customers_contact;
drop table if exists public.policy_versions;
drop table if exists public.business_rules;
drop table if exists public.staff_profiles;

drop function if exists public.protect_provider_event();
drop function if exists public.guard_order_update();
drop function if exists public.assign_order_number();
drop function if exists public.next_order_number();
drop function if exists public.refuse_change();

drop type if exists public.staff_role;
