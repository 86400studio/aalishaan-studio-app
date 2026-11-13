"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether checkout is open on this deployment, for the checkout control of the cart drawer and the cart page — S1.6.
 * The value is decided on the server from configuration alone (src/lib/server/checkout/gate.ts
 * `checkoutPageConfig().open`, read in src/components/shell/public-shell.tsx) and handed down as one boolean: no
 * secret, no reason, no key. It only chooses between a link and a disabled button — the checkout page and both of
 * its server actions decide for themselves, so a wrong value here opens nothing. Outside the provider the answer is
 * closed.
 */
const CheckoutOpenContext = createContext(false);

export function CheckoutAvailabilityProvider({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <CheckoutOpenContext.Provider value={open}>
      {children}
    </CheckoutOpenContext.Provider>
  );
}

/** True when the server said checkout is open here. */
export function useCheckoutOpen(): boolean {
  return useContext(CheckoutOpenContext);
}
