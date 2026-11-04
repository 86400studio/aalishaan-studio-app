import "server-only";

import { cache } from "react";

import {
  finishCodeSchema,
  imageSlotSchema,
  PUBLIC_CATALOGUE_COLUMNS,
  publicCatalogueRowSchema,
  type PublicCatalogueRow,
} from "@/lib/schemas/catalogue";
import { catalogueImagePath } from "@/lib/site-images";
import {
  createBrowserSupabaseClient,
  readPublicSupabaseEnv,
  type BrowserClientOptions,
  type BrowserClientResult,
} from "@/lib/supabase/browser";
import { publicReadConfig, type PublicReadEnv } from "@/lib/supabase/config";

import { readServerSupabaseEnv } from "./supabase";

/**
 * The storefront's catalogue read — S1.4 (docs/TECH-ARCHITECTURE.md §3a, §4): every browse page renders the
 * `public_catalogue` projection and nothing else — no base table, no privileged key, no prototype data, no TEST
 * fallback. Rules:
 *
 * - The public client of this build (`createBrowserSupabaseClient`, the publishable key), session-less, after the
 *   identity check of `publicReadConfig`: the API URL's ref must be the one this deployment context expects
 *   (Production → PROD, everything else → TEST). The secret key is never needed: the identity check receives the
 *   public pair and the two refs, picked field by field from `readServerSupabaseEnv` (the one reader of the server
 *   names), so the secret is never passed on or kept.
 * - Each request is tagged `public-catalogue` for the data cache and bounded in time; the pages are ISR, regenerated
 *   after `CATALOGUE_REVALIDATE_SECONDS` or when the authenticated hook expires the tag and their paths
 *   (src/lib/server/catalogue-revalidation.ts). No filter value reaches this read: filtering is browser state.
 * - Rows are validated one by one against the projection's mirror and the S1.1 contract (the three finishes once
 *   each, the fifteen image objects at their own paths); an invalid row is left out with a sanitised diagnostic and
 *   the valid rows stay usable (the S1.1 record → Known limits: an incomplete Active artwork).
 * - An empty projection is a catalogue with no artworks (Production until S3.3 — D-48) and renders as such; a read
 *   that cannot be made, fails, is malformed or yields only invalid rows is "unavailable", never an empty catalogue.
 * - Unavailable while building renders the honest state (NS-26) only for a build that cannot be deployed and has no
 *   catalogue configuration: `not_configured` outside Vercel — the credential-free Code Check, a checkout without
 *   the local values. Every other unavailable read throws, so `next build` stops and the previous deployment keeps
 *   serving — never an hour of a cached "unavailable" page: a configured build whose read fails, is malformed or
 *   reaches the wrong project, and on Vercel a missing or malformed configuration too. A local build with the
 *   documented local values (docs/ENVIRONMENT-PARITY.md §4) is configured: it reads TEST at build.
 * - Unavailable at run time throws. On the hourly background regeneration ISR keeps the last good page and the error
 *   reaches Sentry. After the hook has expired the pages (catalogue-revalidation.ts) the next request waits for its
 *   render instead, so a failed read then answers the designed 500 (no-store) — under `next start` until a read
 *   succeeds, the expired page not served again; on Vercel the platform's cache decides after the first request
 *   (docs/TECH-ARCHITECTURE.md §3c).
 */

export const CATALOGUE_TAG = "public-catalogue";
/** The ISR window. Each browse page repeats it as a literal (`export const revalidate = 3600`), which the build requires. */
export const CATALOGUE_REVALIDATE_SECONDS = 3600;
/** Bounds the read and the client's retries (an aborted read is not retried). */
export const CATALOGUE_QUERY_TIMEOUT_MS = 5000;

export type CatalogueUnavailableReason =
  "not_configured" | "identity_mismatch" | "query_failed" | "malformed";

export type CatalogueRead =
  | {
      status: "ok";
      /** The valid rows, unordered (src/lib/catalogue/browse-model.ts orders them). */
      rows: readonly PublicCatalogueRow[];
      /** Rows left out as invalid — reported, never rendered. */
      omitted: number;
    }
  | { status: "unavailable"; reason: CatalogueUnavailableReason };

/** The data-cache options of every projection request: the one allow-listed tag and the ISR window. */
export function catalogueRequestInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    next: {
      tags: [CATALOGUE_TAG],
      revalidate: CATALOGUE_REVALIDATE_SECONDS,
    },
  };
}

function catalogueFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, catalogueRequestInit(init));
}

/** The public client on the server: no session to persist, refresh or detect (the health precedent), tagged requests. */
export const CATALOGUE_CLIENT_OPTIONS: BrowserClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { fetch: catalogueFetch },
};

export type CatalogueReaderDependencies = {
  /** The configured identity facts and the build's public pair — never the secret key. */
  env: () => PublicReadEnv;
  /** The public client of this build. */
  createPublicClient: () => BrowserClientResult;
  /** Where a sanitised diagnostic goes. */
  report: (message: string) => void;
};

export function defaultCatalogueReaderDependencies(): CatalogueReaderDependencies {
  return {
    env: () => {
      const env = readServerSupabaseEnv();
      return {
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        SUPABASE_TEST_PROJECT_REF: env.SUPABASE_TEST_PROJECT_REF,
        SUPABASE_PROD_PROJECT_REF: env.SUPABASE_PROD_PROJECT_REF,
        VERCEL_ENV: env.VERCEL_ENV,
      };
    },
    createPublicClient: () =>
      createBrowserSupabaseClient(
        readPublicSupabaseEnv(),
        CATALOGUE_CLIENT_OPTIONS,
      ),
    report: (message) => console.error(message),
  };
}

const FINISH_CODES = finishCodeSchema.options;

/** The fifteen (slot, size) objects of one artwork — the S1.1 contract: eight slots, the artwork itself at full size. */
const EXPECTED_IMAGES: readonly string[] = imageSlotSchema.options.flatMap(
  (slot) =>
    slot === "artwork" ? ["artwork full"] : [`${slot} 480`, `${slot} 1200`],
);

/** Why a schema-valid row still cannot be rendered, or null: the S1.1 invariants the mirror does not check. */
function contractProblem(row: PublicCatalogueRow): string | null {
  const finishes = row.variants.map((variant) => variant.finish);
  if (
    new Set(finishes).size !== FINISH_CODES.length ||
    row.variants.some(
      (variant) => variant.variant_code !== `${row.slug}:${variant.finish}`,
    )
  )
    return "variants:contract";
  const pairs = row.images.map((image) => `${image.slot} ${image.size}`);
  if (
    new Set(pairs).size !== EXPECTED_IMAGES.length ||
    !EXPECTED_IMAGES.every((pair) => pairs.includes(pair))
  )
    return "images:contract";
  for (const image of row.images) {
    const expected =
      image.slot === "artwork"
        ? catalogueImagePath(row.slug, "artwork", "full")
        : image.size === "full"
          ? null
          : catalogueImagePath(row.slug, image.slot, image.size);
    if (image.path !== expected) return "images:path";
  }
  return null;
}

/**
 * Each row on its own: the strict mirror of the projection, then the contract. Diagnostics name only the failing
 * field paths and issue codes — never a value, a row, an upstream message, a ref or a key.
 */
export function validateCatalogueRows(
  data: readonly unknown[],
  report: (message: string) => void,
): CatalogueRead {
  const rows: PublicCatalogueRow[] = [];
  const problems: string[] = [];
  for (const candidate of data) {
    const parsed = publicCatalogueRowSchema.safeParse(candidate);
    if (!parsed.success) {
      problems.push(
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.map(String).join(".")}:${issue.code}`)
          .join(","),
      );
      continue;
    }
    const problem = contractProblem(parsed.data);
    if (problem) {
      problems.push(problem);
      continue;
    }
    rows.push(parsed.data);
  }
  if (problems.length > 0)
    report(
      `[catalogue] ${problems.length} of ${data.length} public_catalogue rows left out (${problems.join("; ")})`,
    );
  if (data.length > 0 && rows.length === 0)
    return { status: "unavailable", reason: "malformed" };
  return { status: "ok", rows, omitted: problems.length };
}

/** One bounded read of the projection, classified. Never throws. */
export async function readPublicCatalogue(
  deps: CatalogueReaderDependencies = defaultCatalogueReaderDependencies(),
): Promise<CatalogueRead> {
  const configured = publicReadConfig(deps.env());
  if (!configured.ok)
    return {
      status: "unavailable",
      reason:
        configured.reason === "identity_mismatch" ||
        configured.reason === "refs_not_distinct"
          ? "identity_mismatch"
          : "not_configured",
    };
  const created = deps.createPublicClient();
  if (!created.ok) return { status: "unavailable", reason: "not_configured" };
  if (created.projectRef !== configured.config.projectRef)
    return { status: "unavailable", reason: "identity_mismatch" };
  try {
    const { data, error } = await created.client
      .from("public_catalogue")
      .select(PUBLIC_CATALOGUE_COLUMNS.join(","))
      .abortSignal(AbortSignal.timeout(CATALOGUE_QUERY_TIMEOUT_MS));
    if (error) return { status: "unavailable", reason: "query_failed" };
    // A success that is not an explicit array is malformed — never an empty catalogue.
    if (!Array.isArray(data))
      return { status: "unavailable", reason: "malformed" };
    return validateCatalogueRows(data, deps.report);
  } catch {
    return { status: "unavailable", reason: "query_failed" };
  }
}

/**
 * Thrown for every unavailable read but a `not_configured` one while building outside Vercel (the policy above);
 * carries a reason, never a value.
 */
export class CatalogueUnavailableError extends Error {
  constructor(readonly reason: CatalogueUnavailableReason) {
    super(`public catalogue unavailable (${reason})`);
    this.name = "CatalogueUnavailableError";
  }
}

/** True during `next build`'s prerender — a run-time value Next sets before its static workers start. */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** True on Vercel, at build and at run time (its system environment variables are exposed — ENVIRONMENT-PARITY.md). */
export function isVercelDeployment(): boolean {
  return process.env.VERCEL === "1";
}

/** The policy above around one read: unavailable renders only while building outside Vercel unconfigured, else throws. */
export async function catalogueForRender(
  read: () => Promise<CatalogueRead> = readPublicCatalogue,
  building: () => boolean = isBuildPhase,
  deployment: () => boolean = isVercelDeployment,
): Promise<CatalogueRead> {
  const result = await read();
  if (result.status === "ok") return result;
  if (result.reason === "not_configured" && building() && !deployment())
    return result;
  throw new CatalogueUnavailableError(result.reason);
}

/** The catalogue of one render: one read per request, shared by a page and its metadata. */
export const getPublicCatalogue = cache(() => catalogueForRender());
