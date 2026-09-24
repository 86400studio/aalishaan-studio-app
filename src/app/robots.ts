import type { MetadataRoute } from "next";

// Closed holding page (D-03). Crawling is allowed on purpose: the page's noindex metadata and the X-Robots-Tag
// header are what keep it out of search indexes, and a crawler blocked here could never read them (a linked URL
// could then still be listed without its content). Revisited when sales open at S3.4.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
