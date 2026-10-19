#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:upload-site-images --source-root <path> [--apply] [--overwrite]` — the S1.3 site-image
 * upload (docs/PROJECT-STATUS.md D-48; D-07: the prototype's site images are not in this repository; they
 * are read from a local checkout of the published prototype commit b24dce1b… that the owner names on the
 * command line).
 *
 * Bounded and enumerated like the catalogue upload: only the files listed in scripts/testing/site-images.json
 * are considered — the prototype's responsive WebP copies (uploaded as they are) and the PNG-only sources
 * the storefront shows (the five craft details, the A2 size comparison, the FAQ illustration), which are
 * encoded to WebP at their native size by Playwright's Chromium, the prototype's own method
 * (prototype/scripts/prepare-mobile-site.cjs: "Encode responsive delivery copies of approved images. No
 * creative edits or source changes."). Each source file is resolved inside the source root — a path that
 * escapes the root, an absolute path, a symbolic link or a path that resolves outside the root is refused —,
 * must be a regular file of at most 20 MiB whose bytes carry the signature its entry declares and whose
 * SHA-256 equals the manifest's (taken from the prototype's E10 development baseline). The checkout is
 * verified too: with a `.git` directory its HEAD must be the pinned commit. Nothing outside the manifest is
 * ever uploaded.
 *
 * Dry run by default — every file verified and every PNG encoded, then `.env.local` loaded and TEST read: the
 * five identity probes and one listing per manifest entry (25 read requests: 23 with the secret key, 2 with the
 * publishable key), nothing uploaded; `--apply` adds one upload per missing object (45 requests on an empty prefix) with the server's
 * secret key to the public bucket `catalogue-public` under `site/`. Idempotent and never
 * destructive without `--overwrite` (the catalogue tool's rule, reused: an existing object is kept; the
 * listing gives a length, not the content). PROD, an unknown target, missing credentials or mismatched refs
 * are refused before any request, with names only. The encoded copy's size is reported, never a value.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { BUCKET, PINNED_PROTOTYPE_COMMIT } from "./lib/catalogue.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";
import { checkoutCommit, reconcileObjects } from "./upload-catalogue.mjs";

export const MANIFEST_PATH = fileURLToPath(
  new URL("./site-images.json", import.meta.url),
);
export const SITE_PREFIX = "site/";
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_OBJECT_BYTES = 5 * 1024 * 1024; // the bucket's limit (0001_catalogue)
const WEBP_QUALITY = 0.92; // prototype/scripts/prepare-mobile-site.cjs

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const sourceRootArg =
  process.argv
    .find((arg) => arg.startsWith("--source-root="))
    ?.slice("--source-root=".length) ??
  (() => {
    const i = process.argv.indexOf("--source-root");
    return i >= 0 ? process.argv[i + 1] : undefined;
  })();

/**
 * @typedef {{ name: string, size: string, width: number | null, height: number | null, object_path: string, source_path: string, sha256: string, encode: boolean }} SiteEntry
 */

/** @param {Buffer} bytes */
export function isWebp(bytes) {
  return (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  );
}

/** @param {Buffer} bytes */
export function isPng(bytes) {
  return (
    bytes.length >= 8 && bytes.toString("latin1", 0, 8) === "\x89PNG\r\n\x1a\n"
  );
}

/**
 * A manifest entry is well formed: a name, a `site/<name>-<size>.webp` object path, a plain relative source
 * path, a 64-hex SHA-256, and dimensions unless the copy is the one native CSS background.
 * @param {SiteEntry} entry
 * @returns {string | null} the problem, or null
 */
export function entryProblem(entry) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.name)) return "name";
  if (entry.object_path !== `${SITE_PREFIX}${entry.name}-${entry.size}.webp`)
    return "object_path";
  if (!/^[0-9a-f]{64}$/.test(entry.sha256)) return "sha256";
  if (entry.encode !== entry.source_path.toLowerCase().endsWith(".png"))
    return "encode flag";
  if (!entry.encode && !entry.source_path.toLowerCase().endsWith(".webp"))
    return "source type";
  if (entry.size !== "native") {
    if (
      !Number.isInteger(entry.width) ||
      !Number.isInteger(entry.height) ||
      /** @type {number} */ (entry.width) <= 0 ||
      /** @type {number} */ (entry.height) <= 0
    )
      return "dimensions";
    if (entry.encode && String(entry.width) !== entry.size)
      return "an encoded copy is stored at its native width";
  }
  return null;
}

/**
 * Resolves and verifies one entry against the source root. Pure, no network.
 * @param {string} root the real path of the source root
 * @param {SiteEntry} entry
 * @returns {{ ok: true, file: string, bytes: number } | { ok: false, reason: string }}
 */
export function verifySiteSource(root, entry) {
  const rel = entry.source_path;
  if (
    path.isAbsolute(rel) ||
    rel.includes("\\") ||
    rel
      .split("/")
      .some((segment) => segment === ".." || segment === "" || segment === ".")
  )
    return { ok: false, reason: "source path is not a plain relative path" };
  const candidate = path.resolve(root, rel);
  if (!candidate.startsWith(root + path.sep))
    return { ok: false, reason: "source path escapes the source root" };
  if (!existsSync(candidate)) return { ok: false, reason: "file is missing" };
  const lst = lstatSync(candidate);
  if (lst.isSymbolicLink())
    return { ok: false, reason: "symbolic link refused" };
  if (!lst.isFile()) return { ok: false, reason: "not a regular file" };
  let real;
  try {
    real = realpathSync(candidate);
  } catch {
    return { ok: false, reason: "file could not be resolved" };
  }
  if (!real.startsWith(root + path.sep))
    return { ok: false, reason: "file resolves outside the source root" };
  const st = statSync(real);
  if (st.size === 0 || st.size > MAX_BYTES)
    return {
      ok: false,
      reason: `size ${st.size} outside 1…${MAX_BYTES} bytes`,
    };
  const bytes = readFileSync(real);
  if (entry.encode ? !isPng(bytes) : !isWebp(bytes))
    return {
      ok: false,
      reason: entry.encode
        ? "not a PNG file (signature)"
        : "not a WebP file (signature)",
    };
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== entry.sha256)
    return { ok: false, reason: "SHA-256 differs from the manifest" };
  return { ok: true, file: real, bytes: st.size };
}

/**
 * Encodes the verified PNG sources to WebP at their native size through one headless Chromium page: the
 * image is decoded from a data URL, drawn 1:1 on a canvas and exported as WebP (the prototype's own
 * method and quality). Returns the copies keyed by source file, with the decoded dimensions.
 * @param {Array<{ entry: SiteEntry, file: string }>} sources
 * @returns {Promise<Map<string, { bytes: Buffer, width: number, height: number }>>}
 */
export async function encodeDeliveryCopies(sources) {
  const copies = new Map();
  if (sources.length === 0) return copies;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>encode</title>");
    for (const { entry, file } of sources) {
      const dataUrl = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
      const encoded = await page.evaluate(
        async ({ src, quality }) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("no 2d context");
          context.drawImage(image, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            data: canvas.toDataURL("image/webp", quality).split(",")[1],
          };
        },
        { src: dataUrl, quality: WEBP_QUALITY },
      );
      const bytes = Buffer.from(encoded.data, "base64");
      if (!isWebp(bytes))
        throw new Error(`${entry.name}: the browser did not produce WebP`);
      if (
        entry.size !== "native" &&
        (encoded.width !== entry.width || encoded.height !== entry.height)
      )
        throw new Error(
          `${entry.name}: decoded ${encoded.width}×${encoded.height}, the manifest says ${entry.width}×${entry.height}`,
        );
      copies.set(file, { bytes, width: encoded.width, height: encoded.height });
    }
  } finally {
    await browser.close();
  }
  return copies;
}

async function main() {
  if (!sourceRootArg) {
    console.error(
      "Refused: --source-root <path to the pinned prototype checkout> is required.",
    );
    process.exitCode = 2;
    return;
  }
  let root;
  try {
    root = realpathSync(path.resolve(sourceRootArg));
  } catch {
    console.error("Refused: the source root does not exist.");
    process.exitCode = 2;
    return;
  }
  const commit = checkoutCommit(root);
  if (
    commit === "unreadable" ||
    (commit !== null && commit !== PINNED_PROTOTYPE_COMMIT)
  ) {
    console.error(
      `Refused: the checkout at the source root is not at the pinned prototype commit ${PINNED_PROTOTYPE_COMMIT} (git rev-parse HEAD ${commit === "unreadable" ? "could not be read" : `is ${commit}`}).`,
    );
    process.exitCode = 2;
    return;
  }
  console.log(
    commit
      ? `Source root verified: git HEAD is the pinned commit ${PINNED_PROTOTYPE_COMMIT.slice(0, 8)}.`
      : "Source root has no .git directory — the pinned commit cannot be confirmed; every file is verified by its SHA-256 from the manifest instead (say so in the record).",
  );

  /** @type {{ commit: string, bucket: string, prefix: string, entries: SiteEntry[] }} */
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (
    manifest.commit !== PINNED_PROTOTYPE_COMMIT ||
    manifest.bucket !== BUCKET ||
    manifest.prefix !== SITE_PREFIX
  )
    throw new Error(
      "manifest header does not match the pinned commit, bucket or prefix",
    );
  const malformed = manifest.entries
    .map((entry) => [entry.name, entryProblem(entry)])
    .filter(([, problem]) => problem !== null);
  if (malformed.length > 0)
    throw new Error(
      `manifest entries malformed: ${malformed.map(([k, p]) => `${k} (${p})`).join(", ")}`,
    );

  /** @type {Array<{ entry: SiteEntry, file: string, bytes: number }>} */
  const verified = [];
  /** @type {string[]} */
  const failures = [];
  for (const entry of manifest.entries) {
    const result = verifySiteSource(root, entry);
    if (result.ok)
      verified.push({ entry, file: result.file, bytes: result.bytes });
    else failures.push(`${entry.source_path}: ${result.reason}`);
  }
  console.log(
    `Manifest: ${manifest.entries.length} entries; verified ${verified.length}; refused ${failures.length}.`,
  );
  if (failures.length > 0) {
    console.error("Refused files (nothing is uploaded while any entry fails):");
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }

  const copies = await encodeDeliveryCopies(
    verified.filter(({ entry }) => entry.encode),
  );
  /** @type {Array<{ entry: SiteEntry, file: string, bytes: number }>} */
  const objects = verified.map(({ entry, file, bytes }) => {
    const copy = copies.get(file);
    const size = copy ? copy.bytes.length : bytes;
    if (size > MAX_OBJECT_BYTES)
      throw new Error(
        `${entry.object_path}: ${size} bytes exceeds the bucket's ${MAX_OBJECT_BYTES}-byte limit`,
      );
    return { entry, file, bytes: size };
  });
  for (const { entry, file } of verified) {
    const copy = copies.get(file);
    if (copy)
      console.log(
        `Encoded ${entry.object_path}: ${copy.width}×${copy.height}, ${copy.bytes.length} bytes.`,
      );
  }

  loadLocalEnv();
  const target = resolveTestTarget(process.env);
  if (!target.ok) {
    console.error("Refused before any request:");
    for (const reason of target.reasons) console.error(`  - ${reason}`);
    process.exitCode = 2;
    return;
  }
  const probe = await probeIdentity(target.target);
  const problems = probeProblems(probe);
  if (problems.length > 0) {
    console.error("Preflight FAILED — nothing uploaded:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `TEST project ${target.target.ref} verified; bucket ${BUCKET}, prefix ${SITE_PREFIX}.`,
  );
  const client = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // The catalogue tool's reconciliation reads only `object_path`; its entry shape is satisfied with the
  // site image's name as the slot under the `site` area so the two tools share one reconciliation.
  const result = await reconcileObjects(
    client.storage.from(BUCKET),
    objects.map(({ entry, file, bytes }) => ({
      entry: {
        slug: "site",
        slot: entry.name,
        size: entry.size,
        object_path: entry.object_path,
        source_path: entry.source_path,
        sha256: entry.sha256,
      },
      file,
      bytes,
    })),
    {
      apply,
      overwrite,
      read: (file) => copies.get(file)?.bytes ?? readFileSync(file),
    },
  );
  const sameClause = overwrite
    ? "none skipped (--overwrite replaces the same-size objects too)"
    : `${result.same} already present with the same size`;
  console.log(
    apply
      ? `Upload applied: ${result.uploaded + result.replaced} object(s) written, ${result.same} already present with the same size and skipped.`
      : `Dry run: ${result.wouldUpload + result.wouldReplace} object(s) would be uploaded, ${sameClause}. Re-run with --apply under the owner's TEST storage authorisation.`,
  );
  if (result.replaced > 0 || result.wouldReplace > 0)
    console.log(
      apply
        ? `Of those, ${result.replaced} replaced an existing object (--overwrite).`
        : `Of those, ${result.wouldReplace} would replace an existing object (--overwrite).`,
    );
  const kept = [
    ...result.differs.map((p) => `${p} (a different size)`),
    ...result.unknown.map((p) => `${p} (no size in the listing)`),
  ];
  if (kept.length > 0) {
    console.log(
      `NOT replaced: ${kept.length} object(s) already in the bucket were kept although they are not confirmed to equal the source. An existing object is replaced only with --overwrite.`,
    );
    for (const line of kept) console.log(`  - ${line}`);
  }
}

// Run only as the entry point (the unit suite imports this file).
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
