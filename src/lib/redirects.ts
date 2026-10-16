/**
 * The manifest aliases that are not app routes (prototype/site-manifest.json `aliases`;
 * docs/TECH-ARCHITECTURE.md §3d), as 301 redirects — the S1.3 route group. `/shop-all` → `/shop` and the
 * legacy nested artwork alias belong to S1.4 / S1.5; `/admin/wireframe`, `/site-map`, `/404` and `/500` are
 * not page routes and have no redirect (their disposition is the S3.4 alias review).
 */
export const ALIAS_REDIRECTS: ReadonlyArray<{
  source: string;
  destination: string;
}> = [
  { source: "/home", destination: "/" },
  { source: "/about-us", destination: "/about" },
  { source: "/track-order", destination: "/track" },
  // D-09: the prototype's demo confirmation page is not ported; the nearest honest destination.
  { source: "/order/demo", destination: "/track" },
];
