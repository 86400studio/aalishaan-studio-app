import { CATALOGUE_STATES, LISTING } from "@/content/public/browse";
import {
  browseCard,
  filterOptions,
  sortForDisplay,
} from "@/lib/catalogue/browse-model";
import type { PublicCatalogueRow } from "@/lib/schemas/catalogue";

import { CatalogueListing } from "./catalogue-listing";
import { ART_CARD_SIZES } from "./image-sizes";

/**
 * The catalogue block of Shop All and the fourteen detail pages, from the projection's rows for that page (S1.4):
 * the listing when it has artworks; when it has none — Production until S3.3 loads the catalogue (D-48), or a group
 * whose artworks are all hidden — the count and the honest empty state (NS-27), not the "no match" copy of a
 * filter; when the page was built outside Vercel without the catalogue's configuration (the Code Check, a checkout
 * without the local values — src/lib/server/catalogue.ts), the honest unavailable state (NS-26) and no count. Never a
 * fallback card. Without JavaScript the hearts cannot save, so they are hidden, as on Home (docs/DESIGN.md §6).
 */
const NO_SCRIPT_CSS = ".wishlist{display:none}";

export function CatalogueSection({
  rows,
}: {
  /** The page's rows, or null when the catalogue is unavailable. */
  rows: readonly PublicCatalogueRow[] | null;
}) {
  if (rows === null || rows.length === 0) {
    const state =
      rows === null ? CATALOGUE_STATES.unavailable : CATALOGUE_STATES.empty;
    return (
      <section className="container catalogue" id="artworks">
        <div className="catalogue-heading">
          <h2 tabIndex={-1} data-catalogue-title="">
            <span data-catalogue-label="">{LISTING.label}</span>
            {rows === null ? null : (
              <>
                {" "}
                <span id="artwork-count" role="status" aria-live="polite">
                  {LISTING.count(0)}
                </span>
              </>
            )}
          </h2>
        </div>
        <div className="empty-results">
          <h3>{state.heading}</h3>
          <p>{state.body}</p>
        </div>
      </section>
    );
  }
  const cards = sortForDisplay(rows).map(browseCard);
  return (
    <>
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <CatalogueListing
        cards={cards}
        options={filterOptions(cards)}
        imageSizes={ART_CARD_SIZES}
      />
    </>
  );
}

/** The hubs' honest states: no heading of their own level there, so the two lines read as one. */
export function HubNotice({ unavailable }: { unavailable: boolean }) {
  const state = unavailable
    ? CATALOGUE_STATES.unavailable
    : CATALOGUE_STATES.empty;
  return (
    <section className="container catalogue">
      <div className="empty-results">
        <p>
          {state.heading} {state.body}
        </p>
      </div>
    </section>
  );
}
