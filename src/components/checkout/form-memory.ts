import type {
  CheckoutField,
  CheckoutFieldValues,
  CheckoutPaymentMethod,
} from "@/lib/schemas/checkout";

/**
 * What the customer has typed into the checkout form, for the life of the page — S1.6. Framework-free and in memory
 * only: a module-level store, so cart → checkout → "Edit bag" → Back / Forward (client navigations of one page
 * session) keeps the fields and the chosen payment method, and a reload or a new tab starts empty.
 *
 * **Nothing here is ever written to `localStorage`, `sessionStorage`, a cookie or the address** — a name, an email,
 * a phone number and an address are personal data, and the browser keeps none of it for this site. The Cookies
 * page's clear control empties it (src/components/help/clear-preview-control.tsx), which is why this module imports
 * types only: that page loads it without loading the checkout.
 *
 * The memory holds only what was touched: the fields that were typed into and the payment method once one was
 * chosen. The form supplies the rest (empty fields, the first payment method).
 */

export type CheckoutFormState = {
  /** The fields typed into, by name; a field never touched is absent. */
  readonly fields: Readonly<Partial<CheckoutFieldValues>>;
  /** The chosen payment method, or null when none was chosen yet. */
  readonly payment: CheckoutPaymentMethod | null;
};

export type CheckoutFormMemory = {
  /** The remembered form; the same object until something changes. */
  get: () => CheckoutFormState;
  setField: (field: CheckoutField, value: string) => void;
  setPayment: (payment: CheckoutPaymentMethod) => void;
  /** Forgets everything typed. */
  clear: () => void;
};

const EMPTY_FORM: CheckoutFormState = Object.freeze({
  fields: Object.freeze({}),
  payment: null,
});

export function createFormMemory(): CheckoutFormMemory {
  let state: CheckoutFormState = EMPTY_FORM;
  return {
    get: () => state,
    setField(field, value) {
      if (state.fields[field] === value) return;
      state = Object.freeze({
        fields: Object.freeze({ ...state.fields, [field]: value }),
        payment: state.payment,
      });
    },
    setPayment(payment) {
      if (state.payment === payment) return;
      state = Object.freeze({ fields: state.fields, payment });
    },
    clear() {
      state = EMPTY_FORM;
    },
  };
}

/** The page's one instance. */
export const formMemory: CheckoutFormMemory = createFormMemory();
