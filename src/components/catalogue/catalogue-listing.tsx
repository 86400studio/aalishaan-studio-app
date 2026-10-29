"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
} from "react";

import { ArtCardView } from "@/components/catalogue/art-card";
import {
  ART_CARD,
  CATALOGUE_STATES,
  LISTING,
  SAVED_VIEW,
} from "@/content/public/browse";
import type { BrowseCard } from "@/lib/catalogue/browse-model";
import {
  activeFilters,
  EMPTY_FILTERS,
  filterUrl,
  matchesFilters,
  readFilterUrl,
  SELECT_KEYS,
  type FilterKey,
  type FilterOptions,
  type FilterValues,
  type SelectKey,
} from "@/lib/catalogue/filters";
import {
  browserLocalStorage,
  readSavedArtworks,
} from "@/lib/catalogue/saved-artworks";

/**
 * The listing of Shop All and the fourteen detail pages — S1.4 (prototype/scripts/build-browse.cjs:70 for the markup,
 * prototype/shared/browse.js for the behaviour, ported — never imported). The server renders every card, the empty
 * filters, the count and `All Artworks`, exactly the prototype's static HTML, which is also what a browser without
 * JavaScript keeps. After hydration the listing reads the URL (each filter, the legacy singulars, `?saved=1`) and the
 * saved artworks, hides what does not match with the `hidden` attribute, and writes every change back with
 * `history.replaceState`, as the prototype does — one history entry, so Back leaves the page and returning restores
 * the filters from the URL. The URL is read again on every change the router or the browser makes to it (a drawer's
 * "Saved artworks" link, the note's link, Back and Forward), through a small Suspense-wrapped reader of the search
 * params whose fallback is nothing, so the list never waits for it. Focus follows the prototype: removing a chip
 * focuses its control — or the heading while the filter panel is closed (a phone), where the control cannot take
 * focus; when the focused heart's card leaves the Saved view, the heading takes focus (browse.js:18), and so it does
 * when "Clear all filters" hides the block it sits in — each only while focus is still there, so a later render never
 * takes focus from where the visitor moved it.
 */

type FilterState = {
  values: FilterValues;
  savedOnly: boolean;
  /** Values the URL asked for that the page does not list: kept as options for the rest of the visit (browse.js:8). */
  extra: Readonly<Record<SelectKey, readonly string[]>>;
};

const NO_EXTRA: FilterState["extra"] = {
  collection: [],
  style: [],
  rooms: [],
  moods: [],
  palettes: [],
  orientation: [],
};

const INITIAL: FilterState = {
  values: EMPTY_FILTERS,
  savedOnly: false,
  extra: NO_EXTRA,
};

/** The saved-artworks snapshot as a string React can compare: the saved slugs, or this marker when storage refuses. */
const UNREADABLE = "storage:unreadable";

function mergeExtra(
  extra: FilterState["extra"],
  unlisted: Partial<Record<SelectKey, string>>,
): FilterState["extra"] {
  const next = { ...extra };
  for (const key of SELECT_KEYS) {
    const value = unlisted[key];
    if (value !== undefined && !next[key].includes(value))
      next[key] = [...next[key], value];
  }
  return next;
}

function subscribeToSavedArtworks(onChange: () => void): () => void {
  window.addEventListener("wishlistchange", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("wishlistchange", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Calls `onUrl` after hydration and whenever the router or the browser changes the search params. */
function UrlWatcher({ onUrl }: { onUrl: () => void }) {
  const search = useSearchParams().toString();
  useEffect(() => {
    onUrl();
  }, [search, onUrl]);
  return null;
}

export function CatalogueListing({
  cards,
  options,
  imageSizes,
}: {
  cards: readonly BrowseCard[];
  options: FilterOptions;
  imageSizes: string;
}) {
  const [state, setState] = useState<FilterState>(INITIAL);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const controls = useRef<Partial<Record<FilterKey, HTMLElement | null>>>({});
  /** The search this listing last wrote, so the router's echo of it is not read back over newer typing. */
  const written = useRef<string | null>(null);
  /** A focused control whose disappearance hands focus to the heading. */
  const watched = useRef<HTMLElement | null>(null);

  const slugs = useMemo(() => cards.map((card) => card.slug), [cards]);
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeToSavedArtworks(() => {
        // Before the change renders: the focused heart, if the Saved view may now hide its card.
        const active = document.activeElement;
        if (
          new URLSearchParams(window.location.search).get("saved") === "1" &&
          active instanceof HTMLElement &&
          active.matches(".wishlist") &&
          gridRef.current?.contains(active)
        )
          watched.current = active;
        onChange();
      }),
    [],
  );
  const savedSnapshot = useSyncExternalStore(
    subscribe,
    () => {
      const saved = readSavedArtworks(browserLocalStorage(), slugs);
      return saved.ok ? [...saved.saved].join(" ") : UNREADABLE;
    },
    () => "",
  );
  const storageReadable = savedSnapshot !== UNREADABLE;
  const saved = useMemo(
    () =>
      new Set(
        storageReadable && savedSnapshot !== "" ? savedSnapshot.split(" ") : [],
      ),
    [savedSnapshot, storageReadable],
  );

  const applyUrl = useCallback(() => {
    const search = window.location.search;
    if (search === written.current) return;
    written.current = null;
    const read = readFilterUrl(search, options);
    setState((previous) => ({
      values: read.values,
      savedOnly: read.savedOnly,
      extra: mergeExtra(previous.extra, read.unlisted),
    }));
  }, [options]);

  // browse.js:19 — the filter panel starts closed on a phone.
  useEffect(() => {
    if (window.matchMedia("(max-width:767px)").matches && detailsRef.current)
      detailsRef.current.open = false;
  }, []);

  useLayoutEffect(() => {
    const element = watched.current;
    if (element === null) return;
    watched.current = null;
    // A watch whose change did not render is stale by now: focus moves only if it is still on the element, or lost.
    const active = document.activeElement;
    if (
      (element.closest("[hidden]") || !element.isConnected) &&
      (active === element || active === document.body || active === null)
    )
      titleRef.current?.focus();
  });

  const commit = (next: FilterState) => {
    setState(next);
    const url = filterUrl(window.location.href, next.values, next.savedOnly);
    written.current = new URL(url, window.location.href).search;
    window.history.replaceState(null, "", url);
  };
  const change = (key: FilterKey, value: string) =>
    commit({ ...state, values: { ...state.values, [key]: value } });
  const remove = (key: FilterKey) => {
    commit({ ...state, values: { ...state.values, [key]: "" } });
    // Inside the closed panel the control cannot take focus, and the chip itself is about to go.
    if (detailsRef.current?.open) controls.current[key]?.focus();
    else titleRef.current?.focus();
  };
  const reset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit({ ...state, values: EMPTY_FILTERS });
  };
  const clearAll = (event: MouseEvent<HTMLButtonElement>) => {
    watched.current = event.currentTarget;
    commit({ ...state, values: EMPTY_FILTERS });
  };

  const visible = new Set(
    cards
      .filter((card) =>
        matchesFilters(card, state.values, state.savedOnly, saved),
      )
      .map((card) => card.slug),
  );
  const count = visible.size;
  const savedUnreadable = state.savedOnly && !storageReadable;
  const empty = savedUnreadable
    ? SAVED_VIEW.unavailable
    : state.savedOnly
      ? { heading: LISTING.empty.savedHeading, body: LISTING.empty.savedBody }
      : { heading: LISTING.empty.heading, body: LISTING.empty.body };

  return (
    <section className="container catalogue" id="artworks">
      <Suspense fallback={null}>
        <UrlWatcher onUrl={applyUrl} />
      </Suspense>
      <div className="catalogue-heading">
        <h2 tabIndex={-1} data-catalogue-title="" ref={titleRef}>
          <span data-catalogue-label="">
            {state.savedOnly ? LISTING.savedLabel : LISTING.label}
          </span>{" "}
          <span id="artwork-count" role="status" aria-live="polite">
            {LISTING.count(count)}
          </span>
        </h2>
      </div>
      <p
        className="saved-view-note"
        data-saved-note=""
        hidden={!state.savedOnly}
      >
        <Link href={LISTING.savedNote.href} prefetch={false}>
          {LISTING.savedNote.link}
        </Link>
        {LISTING.savedNote.text}
      </p>
      <details className="filters" open ref={detailsRef}>
        <summary>
          {LISTING.filters.summary}{" "}
          <span aria-hidden="true">{LISTING.filters.summaryMark}</span>
        </summary>
        <form
          id="filter-form"
          onSubmit={(event) => event.preventDefault()}
          onReset={reset}
        >
          <label className="search-field">
            {LISTING.filters.search.label}
            <input
              type="search"
              name="q"
              placeholder={LISTING.filters.search.placeholder}
              autoComplete="off"
              value={state.values.q}
              onChange={(event) => change("q", event.target.value)}
              ref={(element) => {
                controls.current.q = element;
              }}
            />
          </label>
          {SELECT_KEYS.map((key) => (
            <label key={key}>
              {LISTING.filters.selects[key].label}
              <select
                name={key}
                value={state.values[key]}
                onChange={(event) => change(key, event.target.value)}
                ref={(element) => {
                  controls.current[key] = element;
                }}
              >
                <option value="">{LISTING.filters.selects[key].all}</option>
                {options[key].map((option) => (
                  <option key={option}>{option}</option>
                ))}
                {/* A URL-only value keeps its exact spaces as the option's value (browse.js:8, `new Option(value, value)`). */}
                {state.extra[key].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="reset" className="filter-clear">
            {LISTING.filters.clear}
          </button>
        </form>
      </details>
      {/* The prototype's container has no role; `group` lets its name be read (an unnamed-role aria-label is not allowed). */}
      <div
        className="active-filters"
        role="group"
        aria-label={LISTING.chips.label}
      >
        {activeFilters(state.values).map(({ key, value }) => (
          <button
            key={key}
            type="button"
            aria-label={LISTING.chips.remove(value)}
            onClick={() => remove(key)}
          >
            {LISTING.chips.text(value)}
          </button>
        ))}
      </div>
      <div className="catalogue-grid" ref={gridRef}>
        {cards.map((card) => (
          <ArtCardView
            key={card.slug}
            slug={card.slug}
            title={card.title}
            hook={card.hook}
            label={ART_CARD.label}
            view={ART_CARD.view}
            price={{
              frame: ART_CARD.frame(card.finishName),
              amount: card.price ?? CATALOGUE_STATES.notAvailable,
            }}
            image={{
              src: card.image.src,
              srcSet: card.image.srcSet,
              sizes: imageSizes,
              alt: card.alt,
              width: 1000,
              height: 1000,
            }}
            hidden={!visible.has(card.slug)}
          />
        ))}
      </div>
      <div className="empty-results" hidden={count > 0}>
        <h3>{empty.heading}</h3>
        <p>{empty.body}</p>
        {savedUnreadable ? null : (
          <button
            className="button button--secondary"
            data-reset-filters=""
            onClick={clearAll}
          >
            {LISTING.empty.action}
          </button>
        )}
      </div>
    </section>
  );
}
