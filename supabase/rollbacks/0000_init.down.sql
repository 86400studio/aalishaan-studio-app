-- 0000_init.down.sql — the schema-recovery artifact paired with supabase/migrations/0000_init.sql (S0.2).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is executed only by a human, after the
-- checks in docs/database-changes/S0.2-0000-init.md → "Rollback plan", and only when forward-fixing the
-- additive baseline is not possible. It DELETES every row of public.system_checks and cannot restore them —
-- down-SQL reverses schema, never data.
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the human records the
-- reversal afterwards with `supabase migration repair --status reverted 0000` against the same project.

drop trigger if exists system_checks_set_updated_at on public.system_checks;
drop table if exists public.system_checks;
drop function if exists public.lock_down_table(regclass);
drop function if exists public.set_updated_at();
