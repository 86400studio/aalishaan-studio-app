"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useBag } from "@/components/commerce/bag-provider";
import { CATALOGUE_STATES } from "@/content/public/browse";
import { PRODUCT_NOTICES } from "@/content/public/product";
import { readFinishSelection, saveFinishSelection } from "@/lib/bag";
import type { FinishOption, ProductView } from "@/lib/catalogue/product-model";
import type { FinishCode } from "@/lib/schemas/catalogue";

import { Lightbox, type LightboxItem, type LightboxState } from "./lightbox";

/**
 * The artwork page's one piece of browser state — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2): the
 * selected frame finish, the add to the bag with its notice, and the one lightbox. The page is server-rendered with the
 * suggested finish (prototype/scripts/build-products.cjs); this provider is the port of prototype/product/r3.js's
 * state and its `render()` fan-out (never imported): every island that follows the finish — the stage and the
 * thumbnails, the price, the frame choice, the craft card of What you'll receive, the room photo of the Lantern's size
 * guide, the phone purchase bar and the variant added — reads it from here, so they cannot disagree. The Recommended
 * Frame line, the moodboard, the hero hook and the related cards never follow it (r3.js leaves them alone).
 *
 * - The finish chosen last in this tab is restored after hydration (`sessionStorage["aalishaan-frame-<slug>"]`, read
 *   and written only through src/lib/bag/selections.ts — r3.js:12–13, :85); the server and hydrating renders show
 *   the suggested finish. A stored value that is not a finish is ignored.
 * - "Add to cart" adds the selected variant (`<slug>:<finish>`, the bag identity) through the one bag store
 *   (src/components/commerce/bag-provider.tsx); the add never opens the drawer (r3.js:117–131). The notice is
 *   r3.js:127's: the memory-only disclosure when storage is unavailable (it stays), the 99 limit, or "Added to cart ·
 *   …" (hidden after 3.6 s). A finish the projection marks unavailable cannot be added: its price reads NS-29 and the
 *   buttons are disabled (the prototype has no unavailable finish).
 * - The prototype's "Continue to Checkout" link (unhidden by r3.js:125 after an add) is not rendered: no checkout
 *   exists before S1.6 (H.2 "Checkout handoff").
 */

/** What the islands need of the product: display strings, image URLs and variant codes only (no row, no paise). */
export type ProductClientModel = Pick<
  ProductView,
  "slug" | "title" | "suggestedFinish" | "finishOrder" | "finishes"
>;

type Notice = { text: string; open: boolean };

type ProductContextValue = {
  product: ProductClientModel;
  finish: FinishCode;
  option: FinishOption;
  /** The option's price line: its price, or NS-29 when it is not available to order. */
  priceLabel: (option: FinishOption) => string;
  selectFinish: (finish: FinishCode) => void;
  addSelected: () => void;
  notice: Notice;
  openLightbox: (items: readonly LightboxItem[], index: number) => void;
};

const ProductContext = createContext<ProductContextValue | null>(null);

const NOTICE_MS = 3600; // r3.js:129
const subscribeToNothing = () => () => {};
const priceLabel = (option: FinishOption) =>
  option.price ?? CATALOGUE_STATES.notAvailable;

export function ProductProvider({
  product,
  children,
}: {
  product: ProductClientModel;
  children: ReactNode;
}) {
  const { slug, title, suggestedFinish, finishes } = product;
  const { add } = useBag();

  // The tab's stored finish, read after hydration (the server snapshot is "nothing stored").
  const stored = useSyncExternalStore(
    subscribeToNothing,
    () => readFinishSelection(slug),
    () => null,
  );
  const [chosen, setChosen] = useState<FinishCode | null>(null);
  const finish = chosen ?? stored ?? suggestedFinish;
  const option = finishes[finish];

  const selectFinish = useCallback(
    (next: FinishCode) => {
      saveFinishSelection(slug, next);
      setChosen(next);
    },
    [slug],
  );

  const [notice, setNotice] = useState<Notice>({ text: "", open: false });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const addSelected = useCallback(() => {
    if (!option.available) return;
    const outcome = add(option.variantCode);
    const persistent = outcome.persistence === "local";
    const text = !persistent
      ? PRODUCT_NOTICES.memoryOnly
      : outcome.capped
        ? PRODUCT_NOTICES.limited
        : PRODUCT_NOTICES.added(title, option.name);
    setNotice({ text, open: true });
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = persistent
      ? setTimeout(
          () => setNotice((current) => ({ ...current, open: false })),
          NOTICE_MS,
        )
      : null;
  }, [add, option, title]);

  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const openLightbox = useCallback(
    (items: readonly LightboxItem[], index: number) => {
      if (items.length === 0) return;
      setLightbox({
        items,
        index: Math.min(Math.max(index, 0), items.length - 1),
        opener: document.activeElement,
      });
    },
    [],
  );
  const step = useCallback((direction: 1 | -1) => {
    setLightbox((current) =>
      current && current.items.length > 1
        ? {
            ...current,
            index:
              (current.index + direction + current.items.length) %
              current.items.length,
          }
        : current,
    );
  }, []);
  const closed = useCallback(() => setLightbox(null), []);

  const value = useMemo<ProductContextValue>(
    () => ({
      product,
      finish,
      option,
      priceLabel,
      selectFinish,
      addSelected,
      notice,
      openLightbox,
    }),
    [product, finish, option, selectFinish, addSelected, notice, openLightbox],
  );

  return (
    <ProductContext.Provider value={value}>
      {children}
      <Lightbox state={lightbox} onStep={step} onClosed={closed} />
    </ProductContext.Provider>
  );
}

export function useProduct(): ProductContextValue {
  const value = useContext(ProductContext);
  if (!value) throw new Error("useProduct is used outside an artwork page");
  return value;
}
