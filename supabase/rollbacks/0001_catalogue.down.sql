-- 0001_catalogue.down.sql — the schema-recovery artifact paired with supabase/migrations/0001_catalogue.sql (S1.1).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is executed only by a human, after the
-- checks in docs/database-changes/S1.1-0001-catalogue.md → "Rollback plan", and only when forward-fixing the
-- additive catalogue is not possible. It DELETES every row of the six catalogue tables and every object of
-- the bucket catalogue-public and cannot restore them — down-SQL reverses schema, never data. It refuses to
-- run while 0002_orders still references these tables (order_items → variants / artworks): reverse 0002 first.
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the human records the
-- reversal afterwards with `supabase migration repair --status reverted 0001` against the same project.

drop view if exists public.public_catalogue;

drop trigger if exists variants_enforce_variant_code on public.variants;
drop trigger if exists variants_set_updated_at on public.variants;
drop trigger if exists artwork_images_set_updated_at on public.artwork_images;
drop trigger if exists artworks_set_updated_at on public.artworks;
drop trigger if exists art_styles_set_updated_at on public.art_styles;
drop trigger if exists collections_set_updated_at on public.collections;

drop function if exists public.enforce_variant_code();

drop table if exists public.variants;
drop table if exists public.artwork_images;
drop table if exists public.artworks;
drop table if exists public.art_styles;
drop table if exists public.collections;
drop table if exists public.frame_finishes;

drop type if exists public.artwork_status;

-- The bucket's objects are the uploaded catalogue images (re-creatable from the pinned checkout, D-07); the
-- bucket row cannot be removed while objects remain.
delete from storage.objects where bucket_id = 'catalogue-public';
delete from storage.buckets where id = 'catalogue-public';
