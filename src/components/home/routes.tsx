"use client";

import { useEffect, useRef, useState } from "react";

import { RouteCard } from "@/components/catalogue/route-card";
import { ROUTES } from "@/content/public/home";

/**
 * "Ways to shop" — the three route cards (prototype/index.html:603–630) with the tablet carousel dots of
 * the inline script (lines 935–954, ported — never imported): a dot scrolls its card into view and the
 * scroll position selects the dot. The track is a plain grid above 768 px and a stacked list under 600 px,
 * where the dots are hidden.
 */
const LARGE_WIDTHS: Record<(typeof ROUTES.cards)[number]["image"], string> = {
  "card-1-shop-all": "1200w",
  "card-2-collection": "1200w",
  "card-3-artstyle": "1122w",
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function HomeRoutes() {
  const track = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const count = ROUTES.cards.length;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollWidth <= el.clientWidth + 4) return;
      const i = Math.round(
        el.scrollLeft / (el.scrollWidth / el.children.length),
      );
      setSelected(clamp(i, 0, count - 1));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[i];
    if (el && card instanceof HTMLElement)
      el.scrollTo({
        left: card.offsetLeft - el.offsetLeft,
        behavior: "smooth",
      });
    setSelected(i);
  };

  return (
    <section
      className="section routes"
      id="routes"
      aria-labelledby="routes-title"
    >
      <div className="container">
        <h2 className="visually-hidden" id="routes-title">
          {ROUTES.heading}
        </h2>
        <div className="routes__track" ref={track}>
          {ROUTES.cards.map((card) => (
            <RouteCard
              key={card.image}
              image={card.image}
              largeWidth={LARGE_WIDTHS[card.image]}
              alt={card.alt}
              title={card.title}
              body={card.body}
              action={card.action}
            />
          ))}
        </div>
        <div
          className="routes__dots"
          role="tablist"
          aria-label={ROUTES.dotsLabel}
        >
          {ROUTES.cards.map((card, i) => (
            <button
              key={card.image}
              type="button"
              role="tab"
              aria-selected={selected === i}
              aria-label={card.title}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
