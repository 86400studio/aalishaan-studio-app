/**
 * The browse pages' search and filters — S1.4: the frozen prototype's runtime (prototype/shared/browse.js, which is
 * never imported) as pure functions, shared by the listing (src/components/catalogue/catalogue-listing.tsx) and the
 * unit suite. Filter state is browser state only: the URL holds it, written with `history.replaceState` as the
 * prototype writes it (one history entry for the page, not one per change), and the server never reads it, so the
 * ISR page is the same for every query and no filter value reaches a shared cache key.
 */

export const FILTER_KEYS = [
  "q",
  "collection",
  "style",
  "rooms",
  "moods",
  "palettes",
  "orientation",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** The six selects, in the form's order. */
export type SelectKey = Exclude<FilterKey, "q">;
export const SELECT_KEYS: readonly SelectKey[] = [
  "collection",
  "style",
  "rooms",
  "moods",
  "palettes",
  "orientation",
];

export type FilterValues = Readonly<Record<FilterKey, string>>;

export const EMPTY_FILTERS: FilterValues = {
  q: "",
  collection: "",
  style: "",
  rooms: "",
  moods: "",
  palettes: "",
  orientation: "",
};

/** Each select's options on one page: the distinct values of that page's artworks (build-browse.cjs:70). */
export type FilterOptions = Readonly<Record<SelectKey, readonly string[]>>;

/** The prototype's singular names, read when the plural is absent (browse.js:8) and never written. */
const LEGACY_NAMES: Readonly<Partial<Record<FilterKey, string>>> = {
  rooms: "room",
  moods: "mood",
  palettes: "palette",
};

/** Removed from the URL on every write (browse.js:16); nothing in the storefront gives `restore` a meaning. */
const REPLACED_PARAMS: readonly string[] = [
  ...FILTER_KEYS,
  "saved",
  "room",
  "mood",
  "palette",
  "restore",
];

/** browse.js:6 — case-insensitive, trimmed. */
export function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export type UrlFilterState = {
  values: FilterValues;
  /** `?saved=1` — the Saved artworks view (browse.js:8). */
  savedOnly: boolean;
  /** A select value the page does not list: the prototype adds it as an option and selects it (browse.js:8). */
  unlisted: Partial<Record<SelectKey, string>>;
};

/**
 * The filters a URL asks for (browse.js `readURL`): each key, else its legacy singular; a select value matches its
 * option case-insensitively and takes the option's own text; "study" or "office" as a room is Study & Office; any
 * other value is kept as given and reported as unlisted. Untrusted text, rendered only through React's escaping.
 */
export function readFilterUrl(
  search: string,
  options: FilterOptions,
): UrlFilterState {
  const params = new URLSearchParams(search);
  const values: Record<FilterKey, string> = { ...EMPTY_FILTERS };
  const unlisted: Partial<Record<SelectKey, string>> = {};
  for (const key of FILTER_KEYS) {
    const legacy = LEGACY_NAMES[key];
    const raw = params.get(key) || (legacy ? params.get(legacy) : null) || "";
    if (key === "q" || raw === "") {
      values[key] = raw;
      continue;
    }
    // The "All …" option's value is "", which a value of spaces alone matches once normalised (browse.js:8).
    if (normalize(raw) === "") {
      values[key] = "";
      continue;
    }
    const wanted =
      key === "rooms" && ["study", "office"].includes(normalize(raw))
        ? "Study & Office"
        : raw;
    const listed = options[key].find(
      (option) => normalize(option) === normalize(wanted),
    );
    values[key] = listed ?? wanted;
    if (listed === undefined) unlisted[key] = wanted;
  }
  return { values, savedOnly: params.get("saved") === "1", unlisted };
}

/**
 * The URL after a change (browse.js `update`): the filter names and their legacy singulars removed, every non-empty
 * filter set in the form's order, `saved=1` kept in the Saved view; other parameters and the fragment untouched.
 * Returns a same-origin path for `history.replaceState`.
 */
export function filterUrl(
  href: string,
  values: FilterValues,
  savedOnly: boolean,
): string {
  const url = new URL(href);
  for (const name of REPLACED_PARAMS) url.searchParams.delete(name);
  for (const key of FILTER_KEYS)
    if (values[key]) url.searchParams.set(key, values[key]);
  if (savedOnly) url.searchParams.set("saved", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What a card offers the filters: its names, facets and words (the prototype's `#browse-data` fields that matter). */
export type FilterableArtwork = {
  slug: string;
  title: string;
  hook: string;
  /** The collection's name — the Collection select's value. */
  collection: string;
  /** The style's short name — the Art style select's value. */
  style: string;
  rooms: readonly string[];
  moods: readonly string[];
  palettes: readonly string[];
  orientation: string;
};

/**
 * browse.js:11 — saved first (in the Saved view only the saved artworks), then every filter: the search is a
 * case-insensitive substring of the title, hook, collection and style; a select matches when any of the artwork's
 * values equals it, ignoring case.
 */
export function matchesFilters(
  artwork: FilterableArtwork,
  values: FilterValues,
  savedOnly: boolean,
  saved: ReadonlySet<string>,
): boolean {
  if (savedOnly && !saved.has(artwork.slug)) return false;
  return FILTER_KEYS.every((key) => {
    const wanted = values[key];
    if (!wanted) return true;
    if (key === "q")
      return normalize(
        [artwork.title, artwork.hook, artwork.collection, artwork.style].join(
          " ",
        ),
      ).includes(normalize(wanted));
    const field = artwork[key];
    return (typeof field === "string" ? [field] : field).some(
      (value) => normalize(value) === normalize(wanted),
    );
  });
}

/** The active chips (browse.js:15): one per non-empty filter, in the form's order. */
export function activeFilters(
  values: FilterValues,
): Array<{ key: FilterKey; value: string }> {
  return FILTER_KEYS.filter((key) => values[key] !== "").map((key) => ({
    key,
    value: values[key],
  }));
}
