"use client";

import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { DELIVERY_CHECK } from "@/content/public/cart";
import {
  clearDeliveryPin,
  isValidPin,
  readDeliveryPin,
  sanitisePinInput,
  saveDeliveryPin,
  subscribeToDeliveryPin,
} from "@/lib/bag";

/**
 * The PIN form of the artwork page and of the cart — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2
 * "Delivery check", "Selections"). The markup is the frozen prototype's: the artwork page's
 * `form.pd-delivery-check#delivery-check` (prototype/scripts/build-products.cjs:25) and the cart's
 * `form.delivery-check#cart-delivery` (prototype/scripts/build-shop-flow.cjs:9); `variant` picks one. The behaviour is
 * prototype/shared/delivery.js:43–50 (`bind`; never imported) without its simulated check:
 *
 * - The saved PIN (src/lib/bag/selections.ts) is filled in after hydration with the estimate-pending line.
 * - Typing keeps digits only, at most six, and clears the result; changing a saved PIN forgets it (the page's other
 *   PIN forms follow), as the prototype forgot its saved check.
 * - Checking validates the syntax only (locked-facts §6). An invalid PIN shows the prototype's own error, marks the
 *   field invalid, keeps focus there and is not saved. A valid PIN is saved and shows that delivery is not confirmed
 *   yet (NS-08) — no coverage table, zone, date or "available" claim; the PIN is never sent to the server.
 * - Another form of the page (or another tab) saving or clearing the PIN updates this one.
 *
 * Until hydration the field and button are disabled: without JavaScript a submit would put the PIN in the address
 * (a GET to the page), and there is nothing to check it with.
 */

type Variant = "product" | "cart";

export type DeliveryCheckProps =
  { variant: "product"; hint: string } | { variant: "cart"; hint?: never };

type Result = { status: "invalid" } | { status: "pending"; pin: string };

const IDS: Readonly<
  Record<Variant, { form: string; input: string; result: string }>
> = {
  product: {
    form: "delivery-check",
    input: "delivery-pincode",
    result: "delivery-result",
  },
  cart: {
    form: "cart-delivery",
    input: "cart-pincode",
    result: "cart-delivery-result",
  },
};
const PRODUCT_HINT_ID = "delivery-hint";

const subscribeToNothing = () => () => {};

export function DeliveryCheck(props: DeliveryCheckProps) {
  const { variant } = props;
  const ids = IDS[variant];
  const source = useId();
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const show = (pin: string | null) => {
      setValue(pin ?? "");
      setResult(pin === null ? null : { status: "pending", pin });
    };
    const saved = readDeliveryPin();
    if (saved !== null) show(saved);
    return subscribeToDeliveryPin(({ pin, source: from }) => {
      if (from !== source) show(pin);
    });
  }, [source]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = sanitisePinInput(event.target.value);
    setValue(next);
    setResult(null);
    const saved = readDeliveryPin();
    if (saved !== null && saved !== next) clearDeliveryPin({ source });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pin = value.trim();
    if (!isValidPin(pin)) {
      setResult({ status: "invalid" });
      event.currentTarget
        .querySelector<HTMLInputElement>(`#${ids.input}`)
        ?.focus();
      return;
    }
    saveDeliveryPin(pin, { source });
    setResult({ status: "pending", pin });
  };

  const status = result?.status;
  const message =
    result === null
      ? ""
      : result.status === "invalid"
        ? DELIVERY_CHECK.invalid
        : DELIVERY_CHECK.pending(result.pin);
  const product = variant === "product";
  const prefix = product ? "pd-delivery-check" : "delivery-check";

  return (
    <form
      className={prefix}
      id={ids.form}
      data-delivery-check=""
      data-status={status}
      noValidate
      onSubmit={onSubmit}
    >
      <label htmlFor={ids.input}>
        {product ? DELIVERY_CHECK.productLabel : DELIVERY_CHECK.cartLabel}
      </label>
      <div className={`${prefix}__row`}>
        <input
          id={ids.input}
          name="pincode"
          type={product ? "text" : undefined}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder={DELIVERY_CHECK.placeholder}
          aria-describedby={
            product ? `${ids.result} ${PRODUCT_HINT_ID}` : ids.result
          }
          aria-invalid={status === "invalid" ? true : undefined}
          value={value}
          onChange={onChange}
          disabled={!hydrated}
        />
        <button
          type="submit"
          className={product ? undefined : "button button--secondary"}
          disabled={!hydrated}
        >
          {DELIVERY_CHECK.submit}
        </button>
      </div>
      <p
        className={`${prefix}__result`}
        id={ids.result}
        data-delivery-result=""
        data-status={status}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      {props.variant === "product" ? (
        <p className="pd-delivery-check__hint" id={PRODUCT_HINT_ID}>
          {props.hint}
        </p>
      ) : null}
    </form>
  );
}
