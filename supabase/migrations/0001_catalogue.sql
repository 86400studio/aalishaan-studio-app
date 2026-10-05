-- 0001_catalogue — S1.1 (additive; docs/ROADMAP.md S1.1, docs/TECH-ARCHITECTURE.md §4).
--
-- The sellable catalogue: three collections, eleven art styles, three frame finishes, 22 artworks, their
-- enumerated public images and 66 variants (one per artwork and finish), plus the one public projection the
-- storefront reads (public_catalogue) and the public Storage bucket that serves the optimised WebP images.
-- Applied to TEST by the owner-authorised trusted process and to PROD by the human owner only; procedure,
-- verification and ledger steps in docs/database-changes/S1.1-0001-catalogue.md. The paired schema-recovery
-- artifact is supabase/rollbacks/0001_catalogue.down.sql — outside supabase/migrations/ on purpose.
--
-- Contracts (decided in S1.1 step 1 — the change record carries the full inventory):
--   * every stored money value is an integer bigint in paise, INR only (docs/TECH-ARCHITECTURE.md → Money);
--   * stored artwork statuses are Draft / In review / Active / Hidden / Retired — the final Admin displays
--     Hidden as "Paused" and Retired as "Archived" (display labels only, D-33);
--   * variant_code is "<artwork slug>:<finish code>", the approved bag key of the storefront (locked-facts §6);
--   * the only anonymous read path is the view public_catalogue: an explicit allow-list of columns over
--     Active artworks, security_barrier, owned by the migration role; every base table is private
--     (RLS on, no policy, no anon/authenticated privilege); no `select *` contract exists;
--   * the public bucket `catalogue-public` serves exactly the enumerated object paths written into
--     artwork_images by the seed; no anon/authenticated policy exists on storage.objects for it, so uploads,
--     updates, deletes and API listings are denied outside the server's secret key.
--
-- Default deny is applied explicitly through public.lock_down_table(regclass) (0000_init); the platform's
-- event trigger ensure_rls → public.rls_auto_enable() (docs/ENVIRONMENT-PARITY.md §7.4) also enables RLS on
-- every new table in public — this file does not rely on it and does not alter it.
--
-- No DROP, DELETE, TRUNCATE or type change; no SECURITY DEFINER; no policy opens a table to anon or
-- authenticated. The CLI sends the file as one pipelined batch ending with the ledger insert, so a failing
-- statement rolls the whole file back.

-- (1) status type ------------------------------------------------------------------------------------------

create type public.artwork_status as enum ('Draft', 'In review', 'Active', 'Hidden', 'Retired');

comment on type public.artwork_status is
  'S1.1: stored catalogue statuses. The final Admin displays Hidden as "Paused" and Retired as "Archived" (D-33).';

-- (2) tables --------------------------------------------------------------------------------------------------

create table public.collections (
  id         uuid        not null default gen_random_uuid(),
  slug       text        not null,
  name       text        not null,
  intro      text        not null,
  sort_order smallint    not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_pkey primary key (id),
  constraint collections_slug_key unique (slug),
  constraint collections_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint collections_name_length check (char_length(name) between 1 and 120),
  constraint collections_intro_length check (char_length(intro) <= 600),
  constraint collections_sort_order_positive check (sort_order >= 1)
);

comment on table public.collections is
  'S1.1: the three collections (locked-facts §4). Private; read by anonymous users only through public_catalogue.';

create table public.art_styles (
  id            uuid        not null default gen_random_uuid(),
  slug          text        not null,
  name          text        not null,
  full_name     text        not null,
  intro         text        not null,
  collection_id uuid        not null,
  sort_order    smallint    not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint art_styles_pkey primary key (id),
  constraint art_styles_slug_key unique (slug),
  constraint art_styles_collection_id_fkey foreign key (collection_id)
    references public.collections (id) on delete restrict,
  constraint art_styles_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint art_styles_name_length check (char_length(name) between 1 and 120),
  constraint art_styles_full_name_length check (char_length(full_name) between 1 and 200),
  constraint art_styles_intro_length check (char_length(intro) <= 600),
  constraint art_styles_sort_order_positive check (sort_order >= 1)
);

create index art_styles_collection_id_idx on public.art_styles (collection_id);

comment on table public.art_styles is
  'S1.1: the eleven art styles, each inside one collection (locked-facts §4). Private; projected through public_catalogue.';

create table public.frame_finishes (
  code       text        not null,
  name       text        not null,
  sort_order smallint    not null,
  created_at timestamptz not null default now(),
  constraint frame_finishes_pkey primary key (code),
  constraint frame_finishes_name_key unique (name),
  constraint frame_finishes_sort_order_key unique (sort_order),
  -- The three approved finishes; a fourth needs its own decision and migration (D-PRE-09).
  constraint frame_finishes_code_allowed check (code in ('white', 'black', 'antique-gold'))
);

comment on table public.frame_finishes is
  'S1.1: the three frame finishes — white, black, antique-gold (display names White, Black, Antique Gold; locked-facts §3).';

create table public.artworks (
  id              uuid                  not null default gen_random_uuid(),
  slug            text                  not null,
  title           text                  not null,
  full_title      text                  not null,
  hook            text                  not null,
  description     text                  not null,
  collection_id   uuid                  not null,
  art_style_id    uuid                  not null,
  orientation     text                  not null,
  rooms           text[]                not null default '{}',
  moods           text[]                not null default '{}',
  palettes        text[]                not null default '{}',
  palette_hues    text[]                not null default '{}',
  suggested_frame text                  not null,
  featured        boolean               not null default false,
  -- The editor's free-text "Production lead time". Null until the owner supplies OI-03; never a seeded
  -- customer promise (the final Admin's "5-7 working days" is a demo default — docs/ROADMAP.md S1.1).
  lead_time       text,
  seo_title       text                  not null,
  seo_description text                  not null,
  default_alt     text                  not null,
  image_alt_text  text                  not null,
  status          public.artwork_status not null default 'Draft',
  published_at    timestamptz,
  -- The workbook row the seed read (prototype/data/workbook-source.json) — a reference, never public.
  source_row      smallint,
  created_at      timestamptz           not null default now(),
  updated_at      timestamptz           not null default now(),
  constraint artworks_pkey primary key (id),
  constraint artworks_slug_key unique (slug),
  constraint artworks_collection_id_fkey foreign key (collection_id)
    references public.collections (id) on delete restrict,
  constraint artworks_art_style_id_fkey foreign key (art_style_id)
    references public.art_styles (id) on delete restrict,
  constraint artworks_suggested_frame_fkey foreign key (suggested_frame)
    references public.frame_finishes (code) on delete restrict,
  constraint artworks_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  constraint artworks_title_length check (char_length(title) between 1 and 160),
  constraint artworks_full_title_length check (char_length(full_title) between 1 and 220),
  constraint artworks_hook_length check (char_length(hook) between 1 and 300),
  constraint artworks_description_length check (char_length(description) between 1 and 4000),
  constraint artworks_orientation_allowed check (orientation in ('Portrait', 'Landscape')),
  -- The locked filter facets (locked-facts §4); a new facet value needs its own decision and migration.
  constraint artworks_rooms_allowed check (
    rooms <@ array['Living Room', 'Bedroom', 'Dining Room', 'Study & Office']::text[]
  ),
  constraint artworks_moods_allowed check (
    moods <@ array['Full of wonder', 'Bold', 'Calm', 'Grounded', 'Warm', 'Nostalgic']::text[]
  ),
  constraint artworks_palettes_allowed check (
    palettes <@ array[
      'Gold & Gilded', 'Blues & Indigo', 'Greens & Teals', 'Ink & Monochrome',
      'Reds & Blush', 'Sepia & Cream', 'Earth & Terracotta', 'Jewel & Deep Tones'
    ]::text[]
  ),
  constraint artworks_palette_hues_bounded check (cardinality(palette_hues) <= 4),
  constraint artworks_lead_time_length check (lead_time is null or char_length(lead_time) between 1 and 80),
  constraint artworks_seo_title_length check (char_length(seo_title) between 1 and 200),
  constraint artworks_seo_description_length check (char_length(seo_description) between 1 and 400),
  constraint artworks_default_alt_length check (char_length(default_alt) between 1 and 300),
  constraint artworks_image_alt_text_length check (char_length(image_alt_text) between 1 and 300),
  constraint artworks_published_only_when_active check (status <> 'Active' or published_at is not null),
  constraint artworks_source_row_positive check (source_row is null or source_row >= 1)
);

create index artworks_collection_id_idx on public.artworks (collection_id);
create index artworks_art_style_id_idx on public.artworks (art_style_id);
create index artworks_status_idx on public.artworks (status);

comment on table public.artworks is
  'S1.1: the 22 artworks with the public product fields the final Admin edits (hook = "Short introduction", suggested_frame = "Default frame", seo_title / seo_description / default_alt = the SEO & publish tab). Private; projected through public_catalogue when Active.';
comment on column public.artworks.default_alt is
  'The final Admin''s "Default image description" — seeded from products.json alt (docs/ROADMAP.md S1.1).';
comment on column public.artworks.image_alt_text is
  'The artwork page''s stage-image alt as the approved build renders it — the workbook''s "Image Alt Text" column (build-products.cjs altText), falling back to default_alt.';
comment on column public.artworks.lead_time is
  'The editor''s free-text production lead time. Null until owner input OI-03; never a seeded customer promise.';
comment on column public.artworks.status is
  'Draft / In review / Active / Hidden / Retired — the final Admin displays Hidden as "Paused" and Retired as "Archived" (D-33).';

create table public.artwork_images (
  id            uuid        not null default gen_random_uuid(),
  artwork_id    uuid        not null,
  slot          text        not null,
  size_label    text        not null,
  object_path   text        not null,
  source_path   text        not null,
  source_sha256 text        not null,
  sort_order    smallint    not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint artwork_images_pkey primary key (id),
  constraint artwork_images_object_path_key unique (object_path),
  constraint artwork_images_artwork_slot_size_key unique (artwork_id, slot, size_label),
  constraint artwork_images_artwork_id_fkey foreign key (artwork_id)
    references public.artworks (id) on delete restrict,
  -- The eight named public image slots of the final Admin's product model (frame and close-up per finish,
  -- the paper detail, the artwork itself); S2.5's product_media manages their later replacements.
  constraint artwork_images_slot_allowed check (slot in (
    'frame-white', 'close-white', 'frame-black', 'close-black',
    'frame-antique-gold', 'close-antique-gold', 'paper', 'artwork'
  )),
  constraint artwork_images_size_allowed check (size_label in ('480', '1200', 'full')),
  constraint artwork_images_artwork_is_full check ((slot = 'artwork') = (size_label = 'full')),
  -- The enumerated object-path contract of the public bucket: artworks/<slug>/<slot>-<size>.webp.
  constraint artwork_images_object_path_shape check (
    object_path ~ '^artworks/[a-z0-9]+(-[a-z0-9]+)*/((frame|close)-(white|black|antique-gold)|paper)-(480|1200)\.webp$'
    or object_path ~ '^artworks/[a-z0-9]+(-[a-z0-9]+)*/artwork-full\.webp$'
  ),
  constraint artwork_images_source_path_shape check (
    source_path ~ '^assets/[a-z0-9-]+(/[A-Za-z0-9._ %()-]+)*\.webp$' and char_length(source_path) <= 300
  ),
  constraint artwork_images_source_sha256_shape check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint artwork_images_sort_order_bounded check (sort_order between 0 and 99)
);

create index artwork_images_artwork_id_idx on public.artwork_images (artwork_id);

comment on table public.artwork_images is
  'S1.1: the enumerated public images per artwork — object_path in the bucket catalogue-public (artworks/<slug>/<slot>-<size>.webp), the prototype source path and its SHA-256 from the pinned checkout (D-07). The upload tool writes the objects; nothing else is public.';

create table public.variants (
  id           uuid        not null default gen_random_uuid(),
  artwork_id   uuid        not null,
  finish_code  text        not null,
  variant_code text        not null,
  price_paise  bigint      not null,
  currency     char(3)     not null default 'INR',
  availability text        not null default 'made_to_order',
  lead_time    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint variants_pkey primary key (id),
  constraint variants_variant_code_key unique (variant_code),
  constraint variants_artwork_finish_key unique (artwork_id, finish_code),
  constraint variants_artwork_id_fkey foreign key (artwork_id)
    references public.artworks (id) on delete restrict,
  constraint variants_finish_code_fkey foreign key (finish_code)
    references public.frame_finishes (code) on delete restrict,
  constraint variants_variant_code_shape check (variant_code ~ '^[a-z0-9]+(-[a-z0-9]+)*:(white|black|antique-gold)$'),
  -- Exact integer paise, positive, and bounded well inside bigint and JavaScript's safe-integer range.
  constraint variants_price_paise_positive check (price_paise > 0 and price_paise <= 100000000000),
  constraint variants_currency_inr check (currency = 'INR'),
  constraint variants_availability_allowed check (availability in ('made_to_order', 'unavailable')),
  constraint variants_lead_time_length check (lead_time is null or char_length(lead_time) between 1 and 80)
);

create index variants_artwork_id_idx on public.variants (artwork_id);

comment on table public.variants is
  'S1.1: one row per artwork and finish (66). variant_code = "<slug>:<finish>", the storefront''s bag key; price_paise is exact integer paise in INR (launch prices 1900000 / 2100000 / 2300000 — D-PRE-08).';
comment on column public.variants.price_paise is
  'Integer paise (bigint), INR only; browser values are display only — checkout recomputes from this column.';

-- (3) triggers: updated_at maintenance and the variant-code contract ------------------------------------------

create trigger collections_set_updated_at
  before update on public.collections for each row execute function public.set_updated_at();
create trigger art_styles_set_updated_at
  before update on public.art_styles for each row execute function public.set_updated_at();
create trigger artworks_set_updated_at
  before update on public.artworks for each row execute function public.set_updated_at();
create trigger artwork_images_set_updated_at
  before update on public.artwork_images for each row execute function public.set_updated_at();
create trigger variants_set_updated_at
  before update on public.variants for each row execute function public.set_updated_at();

-- variant_code must equal "<artwork slug>:<finish code>" at every insert and update (the approved bag key).
create or replace function public.enforce_variant_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected text;
begin
  select a.slug || ':' || new.finish_code into expected
    from public.artworks a where a.id = new.artwork_id;
  if expected is null then
    raise exception 'variants.artwork_id % does not exist', new.artwork_id using errcode = '23503';
  end if;
  if new.variant_code is distinct from expected then
    raise exception 'variants.variant_code must be "<artwork slug>:<finish code>" (expected %)', expected
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.enforce_variant_code() is
  'S1.1: BEFORE INSERT OR UPDATE trigger function — variant_code equals "<artwork slug>:<finish code>". Pinned empty search_path; not SECURITY DEFINER.';

revoke execute on function public.enforce_variant_code() from public, anon, authenticated;
grant execute on function public.enforce_variant_code() to service_role;

create trigger variants_enforce_variant_code
  before insert or update of artwork_id, finish_code, variant_code on public.variants
  for each row execute function public.enforce_variant_code();

-- (4) default deny on every table, explicit service_role grants ------------------------------------------------

select public.lock_down_table('public.collections');
select public.lock_down_table('public.art_styles');
select public.lock_down_table('public.frame_finishes');
select public.lock_down_table('public.artworks');
select public.lock_down_table('public.artwork_images');
select public.lock_down_table('public.variants');

-- Supabase's default privileges grant the API roles every privilege on a new table; the helper revokes
-- anon / authenticated / public, and service_role is revoked here and re-granted exactly the four DML
-- privileges (never TRUNCATE, REFERENCES or TRIGGER). The server-only secret key (service_role bypasses RLS)
-- is the seed, reset and — from S2.5 — the editor's path; staff-role policies arrive with 0003_staff_auth.
-- Referenced rows are protected by the restrict foreign keys.
revoke all privileges on table public.collections    from service_role;
revoke all privileges on table public.art_styles     from service_role;
revoke all privileges on table public.frame_finishes from service_role;
revoke all privileges on table public.artworks       from service_role;
revoke all privileges on table public.artwork_images from service_role;
revoke all privileges on table public.variants       from service_role;

grant select, insert, update, delete on table public.collections    to service_role;
grant select, insert, update, delete on table public.art_styles     to service_role;
grant select, insert, update, delete on table public.frame_finishes to service_role;
grant select, insert, update, delete on table public.artworks       to service_role;
grant select, insert, update, delete on table public.artwork_images to service_role;
grant select, insert, update, delete on table public.variants       to service_role;

-- (5) the public projection ---------------------------------------------------------------------------------------

-- An explicit allow-list over Active artworks. The view is owned by the migration role and is not
-- security_invoker, so a read through it carries the owner's table access (the base tables stay private and
-- need no anon grant); security_barrier keeps a caller's predicates from being evaluated before the status
-- filter, so a leaky function can never see a non-Active row. No id, status, source row or timestamp other
-- than published_at is exposed; money is bigint paise inside the variants JSON.
create view public.public_catalogue with (security_barrier = true) as
select
  a.slug,
  a.title,
  a.full_title,
  a.hook,
  a.description,
  c.slug       as collection_slug,
  c.name       as collection_name,
  c.intro      as collection_intro,
  c.sort_order as collection_sort_order,
  s.slug       as style_slug,
  s.name       as style_name,
  s.full_name  as style_full_name,
  s.intro      as style_intro,
  s.sort_order as style_sort_order,
  a.orientation,
  a.rooms,
  a.moods,
  a.palettes,
  a.palette_hues,
  a.suggested_frame,
  a.featured,
  a.lead_time,
  a.seo_title,
  a.seo_description,
  a.default_alt,
  a.image_alt_text,
  a.published_at,
  (
    select jsonb_agg(
      jsonb_build_object(
        'finish', v.finish_code,
        'finish_name', f.name,
        'variant_code', v.variant_code,
        'price_paise', v.price_paise,
        'currency', v.currency,
        'availability', v.availability,
        'lead_time', v.lead_time
      ) order by f.sort_order
    )
    from public.variants v
    join public.frame_finishes f on f.code = v.finish_code
    where v.artwork_id = a.id
  ) as variants,
  (
    select jsonb_agg(
      jsonb_build_object('slot', i.slot, 'size', i.size_label, 'path', i.object_path)
      order by i.slot, i.size_label
    )
    from public.artwork_images i
    where i.artwork_id = a.id
  ) as images
from public.artworks a
join public.collections c on c.id = a.collection_id
join public.art_styles  s on s.id = a.art_style_id
where a.status = 'Active';

comment on view public.public_catalogue is
  'S1.1: the only anonymous read path of the catalogue — an explicit column allow-list over Active artworks (security_barrier; owner-privileged, not security_invoker). Nothing private: no ids, status, source rows or timestamps other than published_at.';

-- Default privileges would expose the new view to the API roles in full; revoke, then grant SELECT only.
revoke all privileges on table public.public_catalogue from public, anon, authenticated, service_role;
grant select on table public.public_catalogue to anon, authenticated, service_role;

-- (6) the public bucket --------------------------------------------------------------------------------------------

-- Public reads are served by URL from the bucket's objects; the enumerated object paths are those written
-- into artwork_images by the seed and uploaded by `pnpm db:test:upload-catalogue` with the secret key (which
-- bypasses storage RLS). No policy is created on storage.objects for this bucket: anon and authenticated can
-- neither list, upload, update nor delete through the Storage API (RLS on storage.objects denies without a
-- policy). The 5 MiB limit and the image/webp allow-list bound what the server itself may store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue-public', 'catalogue-public', true, 5242880, array['image/webp'])
on conflict (id) do nothing;
