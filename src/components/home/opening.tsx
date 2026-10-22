"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";

import { SpecCard } from "@/components/product/spec-card";
import { HERO, MATERIALS, PROMISES, SPECS } from "@/content/public/home";
import { siteImage, siteImageSrcSet } from "@/lib/site-images";

/**
 * Home's opening — the full-image hero, the three promises and the materials figure, with the
 * wall-to-materials artwork journey of prototype/index.html (the inline script at lines 977–1137, ported
 * here with refs; never imported). The algorithm is the prototype's: once the wall images have decoded, the
 * sequence is enabled on desktop (≥ 901 px and ≥ 680 px tall) or on a phone where the copy leaves room
 * (M4, home-r6.css), and never under `prefers-reduced-motion`; a scroll-driven progress moves the travelling
 * frame from the wall to the figure and crossfades the room into the material details through the custom
 * properties home.css reads. Static content is the default (`data-handoff="off"`): every section reads in
 * order without JavaScript.
 *
 * Two deliberate differences from the prototype's DOM work: the six specification cards are rendered in
 * `.mobile-materials` statically (the prototype moves the desktop nodes) and shown by the ≤ 900 px rules,
 * and `data-handoff` / `data-flying` / `--landed` sit on this component's wrapper rather than on `<html>`
 * (the selectors are descendant selectors, so the rules match the same). The three promises are removed
 * on mobile (M5) by CSS; the connectors SVG is drawn into the figure as the prototype draws it.
 */

const HERO_ROOM = {
  src: siteImage("page-hero", "1600"),
  mobile: siteImage("page-hero", "1200"),
} as const;
// The prototype's srcset gains the 800 px delivery copy (S1.3b, D-19): the travelling frame lands at about 415 CSS
// px on a phone, which at 1.75–2× needs 726–830 device pixels — the 1199 px copy is chosen only above that.
const HERO_ART = {
  src: siteImage("hero-artwork", "1200"),
  srcSet: siteImageSrcSet("hero-artwork", [
    ["600", "600w"],
    ["800", "800w"],
    ["1200", "1199w"],
  ]),
  sizes: "(max-width: 900px) 420px, 480px",
} as const;

const SEQUENCE_STYLE = {
  "--site-image-page-hero-1600": `url("${HERO_ROOM.src}")`,
  "--site-image-page-hero-1200": `url("${HERO_ROOM.mobile}")`,
} as CSSProperties;

const CONNECTOR_TARGETS: ReadonlyArray<readonly [number, number]> = [
  [0.055, 0.18],
  [0.23, 0.48],
  [0.055, 0.82],
  [0.77, 0.28],
  [0.72, 0.61],
  [0.94, 0.88],
];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const progressRange = (p: number, a: number, b: number) =>
  clamp((p - a) / (b - a), 0, 1);
const smooth = (t: number) => t * t * (3 - 2 * t);

type DesktopGeometry = {
  mobile: false;
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  scale: number;
};
type MobileGeometry = {
  mobile: true;
  x: number;
  y: number;
  w: number;
  dx: number;
  dy: number;
  scale: number;
  origin: number;
  duration: number;
  start: number;
  end: number;
};
type Geometry = DesktopGeometry | MobileGeometry;

function FramedArt({ fetchPriority }: { fetchPriority?: "high" }) {
  return (
    <div className="framed-art">
      {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
      <img
        className="framed-art__cutout"
        src={HERO_ART.src}
        srcSet={HERO_ART.srcSet}
        sizes={HERO_ART.sizes}
        width={1199}
        height={1312}
        alt={HERO.artworkAlt}
        decoding="async"
        fetchPriority={fetchPriority}
      />
    </div>
  );
}

export function HomeOpening() {
  const root = useRef<HTMLDivElement>(null);
  const sequence = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const heroCopy = useRef<HTMLDivElement>(null);
  const wall = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const destination = useRef<HTMLElement>(null);
  const flyer = useRef<HTMLDivElement>(null);
  const connectors = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const rootEl = root.current;
    const sequenceEl = sequence.current;
    const stageEl = stage.current;
    const heroEl = hero.current;
    const copyEl = heroCopy.current;
    const wallEl = wall.current;
    const detailsEl = details.current;
    const figureEl = figure.current;
    const destinationEl = destination.current;
    const flyerEl = flyer.current;
    const connectorsEl = connectors.current;
    if (
      !rootEl ||
      !sequenceEl ||
      !stageEl ||
      !heroEl ||
      !copyEl ||
      !wallEl ||
      !detailsEl ||
      !figureEl ||
      !destinationEl ||
      !flyerEl ||
      !connectorsEl
    )
      return;
    const destinationArt =
      destinationEl.querySelector<HTMLElement>(".framed-art");
    if (!destinationArt) return;
    // The six desktop specs, in the prototype's order (left column, then right).
    const specs = Array.from(
      figureEl.querySelectorAll<HTMLElement>(".anatomy__col .spec"),
    );

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia(
      "(min-width: 901px) and (min-height: 680px)",
    );
    let geometry: Geometry | null = null;
    let scheduled = false;
    let imagesReady = false;
    let disposed = false;
    const svgNS = "http://www.w3.org/2000/svg";

    function measureConnectors() {
      // Hidden at ≤ 900 px (home.css), where the drawing — six forced layouts between DOM writes, on every
      // measure — would show nothing; the resize or the media change that shows it calls this again through
      // measureJourney (S1.3b, D-19).
      if (getComputedStyle(connectorsEl!).display === "none") return;
      const box = figureEl!.getBoundingClientRect();
      const art = destinationEl!.getBoundingClientRect();
      connectorsEl!.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      connectorsEl!.replaceChildren();
      specs.forEach((spec, i) => {
        const target = CONNECTOR_TARGETS[i];
        if (!target) return;
        const x = art.left - box.left + target[0] * art.width;
        const y = art.top - box.top + target[1] * art.height;
        const rect = spec.getBoundingClientRect();
        const left = i < 3;
        // Wide layouts connect each description to its material. Stacked layouts use the same numbered
        // markers without lines crossing other descriptions.
        if (
          rect.top < art.bottom &&
          rect.bottom > art.top &&
          (rect.right <= art.left || rect.left >= art.right)
        ) {
          const sx = (left ? rect.right + 6 : rect.left - 6) - box.left;
          const sy = rect.top - box.top + rect.height / 2;
          const bend = left
            ? art.left - box.left - 12
            : art.right - box.left + 12;
          const line = document.createElementNS(svgNS, "path");
          line.setAttribute("d", `M ${sx} ${sy} H ${bend} L ${x} ${y}`);
          connectorsEl!.appendChild(line);
        }
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("r", "10");
        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(y));
        label.textContent = String(i + 1);
        connectorsEl!.append(dot, label);
      });
    }

    function setLive(heroInert: boolean, detailsInert: boolean) {
      heroEl!.inert = heroInert;
      detailsEl!.inert = detailsInert;
      heroEl!.setAttribute("aria-hidden", String(heroInert));
      detailsEl!.setAttribute("aria-hidden", String(detailsInert));
    }
    function setFree() {
      heroEl!.inert = false;
      detailsEl!.inert = false;
      heroEl!.removeAttribute("aria-hidden");
      detailsEl!.removeAttribute("aria-hidden");
    }

    function drawJourney() {
      scheduled = false;
      if (disposed || !geometry) return;
      if (geometry.mobile) {
        const mp = progressRange(window.scrollY, geometry.start, geometry.end);
        const travel = smooth(mp);
        const mx = geometry.x + (geometry.dx - geometry.x) * travel;
        const my = geometry.y + (geometry.dy - geometry.y) * travel;
        const ms = 1 + (geometry.scale - 1) * travel;
        const progress = progressRange(
          window.scrollY,
          geometry.origin,
          geometry.origin + geometry.duration,
        );
        flyerEl!.style.transform = `translate3d(${mx}px,${my}px,0) scale(${ms})`;
        flyerEl!.style.visibility = mp < 1 ? "visible" : "hidden";
        rootEl!.dataset.flying = String(mp > 0 && mp < 1);
        rootEl!.style.setProperty("--landed", mp >= 1 ? "visible" : "hidden");
        stageEl!.style.setProperty(
          "--room-opacity",
          String(1 - smooth(progressRange(progress, 0.12, 0.62))),
        );
        stageEl!.style.setProperty(
          "--copy-opacity",
          String(1 - smooth(progressRange(progress, 0.015, 0.2))),
        );
        stageEl!.style.setProperty(
          "--details-opacity",
          String(smooth(progressRange(progress, 0.52, 0.72))),
        );
        setLive(progress >= 0.2, progress < 0.52);
        return;
      }
      const p = clamp(
        -sequenceEl!.getBoundingClientRect().top /
          (sequenceEl!.offsetHeight - stageEl!.offsetHeight),
        0,
        1,
      );
      // The room remains visible while the frame descends, then yields to materials.
      const travel = smooth(progressRange(p, 0.07, 0.82));
      const x = geometry.x + (geometry.dx - geometry.x) * travel;
      const y = geometry.y + (geometry.dy - geometry.y) * travel;
      const scale = 1 + (geometry.scale - 1) * travel;
      flyerEl!.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
      const set = (name: string, value: string) =>
        stageEl!.style.setProperty(name, value);
      set("--room-opacity", String(1 - smooth(progressRange(p, 0.32, 0.88))));
      set("--wall-cover", String(smooth(progressRange(p, 0.005, 0.065))));
      set("--room-shift", `${-70 * travel}px`);
      set("--copy-opacity", String(1 - smooth(progressRange(p, 0.015, 0.2))));
      set("--details-opacity", String(smooth(progressRange(p, 0.58, 0.88))));
      set("--labels-opacity", String(smooth(progressRange(p, 0.78, 0.97))));
      set("--labels-shift", `${12 * (1 - progressRange(p, 0.66, 0.9))}px`);
      set("--lift-y", `${12 * Math.sin(Math.PI * travel)}px`);
      set("--lift-blur", `${22 * Math.sin(Math.PI * travel)}px`);
      set("--hero-events", p < 0.13 ? "auto" : "none");
      set("--detail-events", p > 0.8 ? "auto" : "none");
      setLive(p >= 0.13, p <= 0.8);
    }

    function measureJourney() {
      if (disposed) return;
      const small = window.innerWidth <= 900;
      // Reserve the actual copy height, including wrapped buttons and enlarged text.
      if (small) {
        const available =
          window.innerHeight - 76 - copyEl!.getBoundingClientRect().height - 24;
        heroEl!.style.setProperty(
          "--mobile-room-height",
          `${Math.max(180, Math.min(window.innerWidth * 1.04, available))}px`,
        );
      } else heroEl!.style.removeProperty("--mobile-room-height");
      const enabled =
        imagesReady &&
        (desktop.matches ||
          (small &&
            window.innerHeight >= 520 &&
            copyEl!.getBoundingClientRect().height + 280 <=
              window.innerHeight)) &&
        !motion.matches;
      const mobile = enabled && !desktop.matches;
      rootEl!.dataset.handoff = enabled ? (mobile ? "mobile" : "on") : "off";
      delete rootEl!.dataset.flying;
      rootEl!.style.removeProperty("--landed");
      flyerEl!.style.removeProperty("visibility");
      flyerEl!.style.removeProperty("opacity");
      geometry = null;
      if (!enabled) {
        setFree();
        stageEl!.removeAttribute("style");
        measureConnectors();
        return;
      }
      if (mobile) {
        setFree();
        stageEl!.removeAttribute("style");
        const sr = stageEl!.getBoundingClientRect();
        const mw = wallEl!.getBoundingClientRect();
        const md = destinationArt!.getBoundingClientRect();
        const duration = sequenceEl!.offsetHeight - stageEl!.offsetHeight;
        const origin = sequenceEl!.getBoundingClientRect().top + window.scrollY;
        geometry = {
          mobile: true,
          x: mw.left - sr.left,
          y: mw.top - sr.top,
          w: mw.width,
          dx: md.left - sr.left,
          dy: md.top - sr.top,
          scale: md.width / mw.width,
          origin,
          duration,
          start: origin + duration * 0.04,
          end: origin + duration * 0.72,
        };
        flyerEl!.style.width = `${geometry.w}px`;
        drawJourney();
        measureConnectors();
        return;
      }
      heroEl!.style.transform = "none";
      const sr = stageEl!.getBoundingClientRect();
      const wr = wallEl!.getBoundingClientRect();
      heroEl!.style.removeProperty("transform");
      const dr = destinationArt!.getBoundingClientRect();
      geometry = {
        mobile: false,
        x: wr.left - sr.left,
        y: wr.top - sr.top,
        w: wr.width,
        h: wr.height,
        dx: dr.left - sr.left,
        dy: dr.top - sr.top,
        scale: dr.width / wr.width,
      };
      flyerEl!.style.width = `${geometry.w}px`;
      drawJourney();
      measureConnectors();
    }

    function queueJourney() {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(drawJourney);
      }
    }

    window.addEventListener("scroll", queueJourney, { passive: true });
    window.addEventListener("resize", measureJourney);
    window.addEventListener("load", measureJourney);
    motion.addEventListener("change", measureJourney);
    desktop.addEventListener("change", measureJourney);
    Promise.all(
      Array.from(wallEl.querySelectorAll("img")).map((img) => img.decode()),
    )
      .then(() => {
        imagesReady = true;
        measureJourney();
      })
      .catch(() => measureJourney());
    if (document.fonts) document.fonts.ready.then(() => measureJourney());
    measureJourney();

    return () => {
      disposed = true;
      window.removeEventListener("scroll", queueJourney);
      window.removeEventListener("resize", measureJourney);
      window.removeEventListener("load", measureJourney);
      motion.removeEventListener("change", measureJourney);
      desktop.removeEventListener("change", measureJourney);
      rootEl.dataset.handoff = "off";
      setFree();
    };
  }, []);

  return (
    <div ref={root} data-handoff="off" style={SEQUENCE_STYLE}>
      <div className="opening-sequence" ref={sequence}>
        <div className="opening-stage" ref={stage}>
          <section
            className="opening"
            id="top"
            aria-labelledby="hero-title"
            ref={hero}
          >
            <div className="hero-scene">
              <picture>
                <source media="(max-width:900px)" srcSet={HERO_ROOM.mobile} />
                <img
                  className="hero-scene__room"
                  src={HERO_ROOM.src}
                  width={1672}
                  height={941}
                  alt={HERO.roomAlt}
                  fetchPriority="high"
                  decoding="async"
                />
              </picture>
              <div className="hero-scene__frame" ref={wall}>
                <FramedArt fetchPriority="high" />
              </div>
            </div>
            <div className="hero-panel">
              <div className="container">
                <div className="hero-copy" ref={heroCopy}>
                  <h1 id="hero-title">{HERO.heading}</h1>
                  <p className="hero-copy__lead">{HERO.lead}</p>
                  <div className="hero-copy__actions">
                    <Link
                      className="button button--primary"
                      href={HERO.primary.href}
                      prefetch={false}
                    >
                      {HERO.primary.label}
                    </Link>
                    <Link
                      className="button button--secondary"
                      href={HERO.secondary.href}
                      prefetch={false}
                    >
                      {HERO.secondary.label}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <ul className="hero-truth" aria-label={HERO.promiseLabel}>
              {PROMISES.map((promise) => (
                <li key={promise.title}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={promise.icon} />
                    {"extra" in promise
                      ? promise.extra.map((c) => (
                          <circle key={c.cx} cx={c.cx} cy={c.cy} r={c.r} />
                        ))
                      : null}
                  </svg>
                  <span>
                    <strong>{promise.title}</strong>
                    <span>{promise.line}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="section anatomy"
            id="anatomy"
            aria-labelledby="anatomy-title"
            ref={details}
          >
            <div className="container">
              <div className="anatomy__head">
                <span className="eyebrow">{MATERIALS.eyebrow}</span>
                <h2 id="anatomy-title">{MATERIALS.heading}</h2>
              </div>
              <div className="anatomy__figure" ref={figure}>
                <div className="anatomy__col">
                  {SPECS.slice(0, 3).map((spec, i) => (
                    <SpecCard key={spec.title} spec={spec} number={i + 1} />
                  ))}
                </div>
                <figure className="anatomy__art" ref={destination}>
                  <FramedArt fetchPriority="high" />
                  <figcaption className="visually-hidden">
                    {HERO.artworkCaption}
                  </figcaption>
                </figure>
                <div className="anatomy__col">
                  {SPECS.slice(3).map((spec, i) => (
                    <SpecCard key={spec.title} spec={spec} number={i + 4} />
                  ))}
                </div>
                <svg
                  className="anatomy__connectors"
                  aria-hidden="true"
                  ref={connectors}
                />
              </div>
            </div>
          </section>

          <div className="travelling-art" aria-hidden="true" ref={flyer}>
            <FramedArt fetchPriority="high" />
          </div>
        </div>
      </div>

      {/* M4 / M5: the six specification cards below the landing on ≤ 900 px (home-r6.css:57–60). */}
      <section className="mobile-materials" aria-label={MATERIALS.craftLabel}>
        <div className="container">
          <div className="mobile-material-details">
            {SPECS.map((spec, i) => (
              <SpecCard key={spec.title} spec={spec} number={i + 1} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
