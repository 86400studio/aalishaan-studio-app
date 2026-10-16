import type { FormEvent } from "react";

import { HELP_SEARCH } from "@/content/public/pages";

/**
 * The `help-search` form of the ten help-variant pages (D-11, amended at S0.0): a plain GET form to the About
 * hub, where the client-side search filters the index by `?q=`. On those pages no script is attached; the hub
 * reads the query. The hub renders the same form inside its editorial banner as a controlled input.
 */
export function HelpSearchForm({
  id = "help-search",
  value,
  onChange,
  onSubmit,
}: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const controlled = typeof value === "string" && onChange !== undefined;
  return (
    <form
      className="help-search"
      action={HELP_SEARCH.action}
      role="search"
      onSubmit={onSubmit}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10" cy="10" r="7"></circle>
        <path d="m15 15 6 6"></path>
      </svg>
      <label className="visually-hidden" htmlFor={id}>
        {HELP_SEARCH.label}
      </label>
      <input
        id={id}
        type="search"
        name="q"
        placeholder={HELP_SEARCH.placeholder}
        {...(controlled
          ? { value, onChange: (e) => onChange(e.currentTarget.value) }
          : {})}
      />
      <button type="submit">{HELP_SEARCH.submit}</button>
    </form>
  );
}
