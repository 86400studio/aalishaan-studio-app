-- 0001_catalogue.down.sql — the schema-recovery artifact paired with supabase/migrations/0001_catalogue.sql (S1.1).
--
-- This file lives outside supabase/migrations/ on purpose: `supabase db push` discovers only that folder, so
-- forward discovery can never run it. It is a plan, not permission: it is run only on a written authorisation
-- that names this file and the project, after the checks in docs/database-changes/S1.1-0001-catalogue.md →
-- "Rollback plan", and only when forward-fixing the additive catalogue is not possible — on TEST by the owner
-- in the SQL editor or by the builder under the owner's scoped delegation (that record → "Rollback
-- rehearsal"), on PROD by the human owner only. It DELETES every row of the six catalogue tables and
-- cannot restore them — down-SQL reverses schema, never data. It refuses to run while 0002_orders still
-- references these tables (order_items → variants and frame_finishes): reverse 0002 first.
--
-- Storage is deliberately left alone: the bucket catalogue-public and its objects stay. Supabase Storage
-- refuses a SQL DELETE on storage.objects and storage.buckets (the statement-level storage.protect_delete
-- triggers), and a SQL delete would in any case orphan the stored files. The forward file's bucket insert is
-- `on conflict (id) do nothing`, so 0001 re-applies cleanly with the bucket as it is. Whoever needs the images
-- gone removes them through the Storage API (dashboard → Storage → catalogue-public → empty the bucket, then
-- delete it) under its own authorisation.
--
-- Reverse order of the forward file. The migration-ledger row is not touched here; the reversal is recorded
-- afterwards with `supabase migration repair --status reverted 0001 --project-ref <REF>` for the same project.

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
