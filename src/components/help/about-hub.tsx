"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import { HelpSearchForm } from "@/components/ui/help-search-form";
import { HelpRow } from "@/components/ui/help-row";
import { ABOUT_HUB, HELP_INDEX } from "@/content/public/pages";

/**
 * The About hub (prototype/pages/about/index.html with prototype/shared/about-hub.js, ported — never
 * imported): the editorial banner with the search form, the six category cards, and the search results
 * that replace them while a query is typed. The query comes from `?q=` (the ten help-variant pages submit
 * their `help-search` form here — D-11), is matched word by word against each entry's index text, and is
 * written back to the URL on submit without a navigation. The static hub renders without JavaScript.
 */
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const readQuery = () =>
  new URLSearchParams(window.location.search).get("q") ?? "";
const serverQuery = () => "";

export function AboutHub() {
  // The URL's `?q=` (empty in the static HTML), overridden by what the visitor types.
  const urlQuery = useSyncExternalStore(subscribe, readQuery, serverQuery);
  const [typed, setTyped] = useState<string | null>(null);
  const query = typed ?? urlQuery;
  const setQuery = setTyped;

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = HELP_INDEX.filter((entry) => {
    const text = entry.search.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <section className="help-banner help-banner--editorial">
        <h1>{ABOUT_HUB.heading}</h1>
        <p>{ABOUT_HUB.intro}</p>
        <HelpSearchForm value={query} onChange={setQuery} onSubmit={onSubmit} />
      </section>
      <div id="help-results" hidden={!searching}>
        <h2>{ABOUT_HUB.results.heading}</h2>
        <p id="help-result-status" role="status">
          {searching ? ABOUT_HUB.results.status(matches.length) : ""}
        </p>
        <div className="help-list">
          {matches.map((entry) => (
            <div key={entry.href}>
              <HelpRow
                href={entry.href}
                title={entry.title}
                line={entry.line}
              />
            </div>
          ))}
        </div>
        <p id="help-no-results" hidden={!searching || matches.length > 0}>
          {ABOUT_HUB.results.noResultsBefore}
          <Link href="/contact" prefetch={false}>
            {ABOUT_HUB.results.noResultsLink}
          </Link>
          {ABOUT_HUB.results.noResultsAfter}
        </p>
      </div>
      <div id="help-home" hidden={searching}>
        <div className="help-categories">
          {ABOUT_HUB.categories.map((category) => (
            <Link
              className="help-category"
              href={category.href}
              prefetch={false}
              key={category.href}
            >
              <span className="help-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {category.icon.map((d) => (
                    <path
                      key={d}
                      d={d}
                      transform={
                        "transform" in category ? category.transform : undefined
                      }
                    />
                  ))}
                  {"rect" in category ? (
                    <rect
                      x={category.rect.x}
                      y={category.rect.y}
                      width={category.rect.width}
                      height={category.rect.height}
                      rx={category.rect.rx}
                    />
                  ) : null}
                  {"circles" in category
                    ? category.circles.map((c) => (
                        <circle key={c.cx} cx={c.cx} cy={c.cy} r={c.r} />
                      ))
                    : null}
                </svg>
              </span>
              <h2>{category.heading}</h2>
              <p>{category.body}</p>
              <small>
                {category.meta} <span aria-hidden="true">→</span>
              </small>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
