"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CART_DRAWER, MENU_DRAWER } from "@/content/public/shell";

/**
 * The public shell's overlays — S1.3 (docs/DESIGN.md §4 "Drawers", §6): the menu and cart drawers, their
 * shared backdrop and the toast. The behaviour is ported from the inline script of prototype/index.html
 * (lines 866–915; never imported): opening a drawer removes its `inert`, marks every other child of the
 * `.site` wrapper inert, locks body scroll, syncs `aria-expanded` on its triggers, focuses the first control
 * and traps Tab; Escape and the backdrop close it; focus returns to the opener. A drawer is `role=dialog
 * aria-modal` with `tabindex=-1` and stays `inert` while closed. The cart drawer renders the approved empty
 * state until S1.5 brings the bag rows.
 */

type DrawerId = "mobile-nav" | "cart-drawer";

type OverlayContextValue = {
  active: DrawerId | null;
  open: (id: DrawerId) => void;
  close: () => void;
  toast: (message: string) => void;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

const TOAST_MS = 2600;

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DrawerId | null>(null);
  const [toastState, setToastState] = useState<{
    message: string;
    open: boolean;
  }>({ message: "", open: false });
  const opener = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback((id: DrawerId) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setActive(id);
  }, []);
  const close = useCallback(() => setActive(null), []);
  const toast = useCallback((message: string) => {
    setToastState({ message, open: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToastState((state) => ({ ...state, open: false })),
      TOAST_MS,
    );
  }, []);

  // Inert background, scroll lock, first-control focus, Tab trap and Escape — for the life of an open drawer.
  useEffect(() => {
    if (!active) return;
    const drawer = document.getElementById(active);
    const site = drawer?.closest(".site");
    if (!drawer || !site) return;
    const background = Array.from(site.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        !el.hasAttribute("data-overlay") &&
        !el.inert &&
        !/^(SCRIPT|STYLE)$/.test(el.tagName),
    );
    for (const el of background) el.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = drawer.querySelector<HTMLElement>("button, a, input");
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const focusable = Array.from(
          drawer.querySelectorAll<HTMLElement>(
            'a[href],button,input,select,textarea,summary,[tabindex="0"]',
          ),
        ).filter(
          (el) =>
            !(el as HTMLButtonElement).disabled &&
            !el.closest("[hidden],[inert]") &&
            el.getClientRects().length > 0,
        );
        const firstControl = focusable[0];
        const lastControl = focusable[focusable.length - 1];
        if (!drawer.contains(document.activeElement)) {
          event.preventDefault();
          firstControl?.focus();
        } else if (event.shiftKey && document.activeElement === firstControl) {
          event.preventDefault();
          lastControl?.focus();
        } else if (!event.shiftKey && document.activeElement === lastControl) {
          event.preventDefault();
          firstControl?.focus();
        }
        return;
      }
      if (event.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const el of background) el.inert = false;
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
      opener.current = null;
    };
  }, [active]);

  const value = useMemo<OverlayContextValue>(
    () => ({ active, open, close, toast }),
    [active, open, close, toast],
  );

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <div
        className="backdrop"
        data-overlay=""
        data-open={active ? "true" : undefined}
        aria-hidden="true"
        onClick={close}
      />
      <MenuDrawer open={active === "mobile-nav"} onClose={close} />
      <CartDrawer open={active === "cart-drawer"} onClose={close} />
      <div
        className="toast"
        data-overlay=""
        data-open={toastState.open ? "true" : undefined}
        role="status"
        aria-live="polite"
      >
        {toastState.message}
      </div>
    </OverlayContext.Provider>
  );
}

export function useOverlays(): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) throw new Error("useOverlays is used outside the public shell");
  return context;
}

/** A header button that opens a drawer; `aria-expanded` follows the drawer. */
export function DrawerTrigger({
  drawer,
  className,
  label,
  children,
}: {
  drawer: DrawerId;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const { active, open } = useOverlays();
  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      aria-controls={drawer}
      aria-expanded={active === drawer}
      onClick={() => open(drawer)}
    >
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <aside
      className="drawer drawer--left"
      id="mobile-nav"
      role="dialog"
      aria-modal="true"
      aria-label={MENU_DRAWER.title}
      tabIndex={-1}
      inert={!open}
      data-open={open ? "true" : undefined}
      data-overlay=""
    >
      <div className="drawer__header">
        <h2>{MENU_DRAWER.title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label={MENU_DRAWER.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="drawer__body">
        <nav aria-label="Mobile">
          <ul className="mobile-nav__list">
            {MENU_DRAWER.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} prefetch={false} onClick={onClose}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="drawer__footer">
        <Link
          className="button button--primary button--full"
          href={MENU_DRAWER.footerAction.href}
          prefetch={false}
          onClick={onClose}
        >
          {MENU_DRAWER.footerAction.label}
        </Link>
      </div>
    </aside>
  );
}

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <aside
      className="drawer drawer--right"
      id="cart-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={CART_DRAWER.title}
      tabIndex={-1}
      inert={!open}
      data-open={open ? "true" : undefined}
      data-overlay=""
    >
      <div className="drawer__header">
        <h2>{CART_DRAWER.title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label={CART_DRAWER.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="drawer__body">
        <div className="cart-empty">
          <h3>{CART_DRAWER.empty.heading}</h3>
          <p>{CART_DRAWER.empty.body}</p>
          <Link
            className="button button--primary"
            href={CART_DRAWER.empty.primary.href}
            prefetch={false}
            onClick={onClose}
          >
            {CART_DRAWER.empty.primary.label}
          </Link>
          <Link
            className="text-link"
            href={CART_DRAWER.empty.secondary.href}
            prefetch={false}
          >
            {CART_DRAWER.empty.secondary.label}
          </Link>
        </div>
      </div>
      <div className="drawer__footer">
        <Link
          className="button button--secondary button--full"
          href={CART_DRAWER.footerAction.href}
          prefetch={false}
          onClick={onClose}
        >
          {CART_DRAWER.footerAction.label}
        </Link>
      </div>
    </aside>
  );
}
