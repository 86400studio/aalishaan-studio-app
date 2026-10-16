import type { ReactNode } from "react";

/** The tracked small-caps label (docs/DESIGN.md §3 "Eyebrow / label"); page-family CSS recolours it. */
export function Eyebrow({
  light = false,
  children,
}: {
  light?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={light ? "eyebrow eyebrow--light" : "eyebrow"}>
      {children}
    </span>
  );
}
