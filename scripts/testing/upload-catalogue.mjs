#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:upload-catalogue --source-root <path> [--apply] [--overwrite]` — the S1.1 catalogue image
 * upload (D-07: the optimised catalogue WebP files are not in this repository; they are read from a local
 * checkout of the published prototype commit b24dce1b… that the owner names on the command line).
 *
 * Bounded and enumerated: only the files listed in scripts/testing/catalogue-images.json (the manifest the
 * seed plan generates — 330 entries: frame and close-up per finish at 480 and 1200, the paper detail at both
 * sizes, the artwork itself) are considered. Each file is resolved inside the source root — a path that
 * escapes the root through `..`, an absolute path, a symbolic link or a path that resolves outside the
 * root through a linked directory is refused —, must be a regular file of at most 5 MiB whose bytes start
 * with the WebP signature and whose SHA-256 equals the manifest's (taken from the prototype's E10
 * development baseline; the hash, not the path, is what fixes the content). The checkout is
 * verified too: with a `.git` directory its HEAD must be the pinned commit; without one the hashes alone
 * stand, and the report says so. Masters, unlisted files and anything outside the enumerated contract are
 * never uploaded.
 *
 * Dry run by default (every file verified, nothing uploaded); `--apply` uploads with the server's secret
 * key to the public bucket `catalogue-public` at the manifest's object path. Idempotent, and never
 * destructive without `--overwrite`: a missing object is uploaded; an object that already exists is KEPT —
 * counted as skipped when its size equals the source file's, listed by path when its size differs or the
 * bucket's listing gives no usable size. With `--overwrite` (and `--apply`) every existing object is
 * replaced, the same-size ones included: the listing gives a length, not the content. (The seed keeps a
 * differing row in the same way and overwrites it only with its flag.) The matching artwork_images rows are
 * expected from `pnpm db:test:seed` (reported, never created here). PROD, an unknown target, missing
 * credentials or mismatched refs are refused before any request, with names only.
 */
import { execFileSync } from "node:child_process";
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

import { createClient } from "@supabase/supabase-js";

import {
  BUCKET,
  MANIFEST_PATH,
  PINNED_PROTOTYPE_COMMIT,
} from "./lib/catalogue.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

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
 * @typedef {{ slug: string, slot: string, size: string, object_path: string, source_path: string, sha256: string }} ManifestEntry
 */

/**
 * Resolves and verifies one manifest entry against the source root. Pure, no network.
 * @param {string} root the real path of the source root
 * @param {ManifestEntry} entry
 * @returns {{ ok: true, file: string, bytes: number } | { ok: false, reason: string }}
 */
export function verifySourceFile(root, entry) {
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
  if (
    bytes.length < 12 ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP"
  )
    return { ok: false, reason: "not a WebP file (signature)" };
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== entry.sha256)
    return { ok: false, reason: "SHA-256 differs from the manifest" };
  return { ok: true, file: real, bytes: st.size };
}

/** @param {string} root */
export function checkoutCommit(root) {
  if (!existsSync(path.join(root, ".git"))) return null;
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unreadable";
  }
}

/**
 * One entry of the bucket's listing, as far as this tool reads it.
 * @typedef {{ name: string, metadata?: Record<string, unknown> | null }} ListedObject
 * @typedef {"missing" | "same" | "differs" | "unknown"} ObjectState
 * @typedef {{ state: ObjectState, action: "upload" | "replace" | "keep", upsert: boolean }} UploadDecision
 */

/**
 * What the bucket's listing says about one manifest object, against the verified source file's size. Pure, no
 * network. "same" means the same length, not the same bytes: the listing gives a size and an opaque eTag, no
 * SHA-256 to compare with the manifest's, and the integration suite compares the SHA-256 of what the public
 * URL serves for three sampled objects only. A listing entry without a usable size is "unknown", never "same".
 * @param {ListedObject | null | undefined} existing the listing entry with exactly this object's name, if any
 * @param {number} bytes the verified source file's size
 * @returns {ObjectState}
 */
export function objectState(existing, bytes) {
  if (!existing) return "missing";
  const raw = existing.metadata?.size;
  const size =
    typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : null;
  if (size === null) return "unknown";
  return size === bytes ? "same" : "differs";
}

/**
 * Decides one object. An object that already exists is never replaced without `--overwrite`: whatever its
 * size, it is kept. Only a missing object is uploaded, and without `upsert`, so that an object which appears
 * between the listing and the upload is refused by Storage, not replaced. `upsert` is true in exactly one
 * case: an existing object and the explicit flag.
 * @param {ListedObject | null | undefined} existing
 * @param {number} bytes
 * @param {boolean} overwrite whether `--overwrite` was given
 * @returns {UploadDecision}
 */
export function decideUpload(existing, bytes, overwrite) {
  const state = objectState(existing, bytes);
  if (state === "missing") return { state, action: "upload", upsert: false };
  if (overwrite) return { state, action: "replace", upsert: true };
  return { state, action: "keep", upsert: false };
}

/**
 * The part of a Storage bucket this tool uses; the unit suite passes a recording fake.
 * @typedef {{
 *   list: (dir: string, options: { search: string, limit: number }) => PromiseLike<{ data: ListedObject[] | null, error: { message: string } | null }>,
 *   upload: (objectPath: string, body: Buffer, options: { contentType: string, cacheControl: string, upsert: boolean }) => PromiseLike<{ error: { message: string } | null }>,
 * }} BucketLike
 * @typedef {{ uploaded: number, replaced: number, wouldUpload: number, wouldReplace: number, same: number, differs: string[], unknown: string[] }} ReconcileResult
 */

/**
 * Brings the bucket to the manifest, one verified file at a time, under `decideUpload`'s rule. A dry run
 * (`apply` false) lists and decides but never calls `upload`. Kept objects whose size differs from the
 * source's, or whose size the listing does not give, are returned by path (`differs`, `unknown`) so the caller
 * can report them. The first listing or upload error stops the run: no later object is listed or sent.
 * @param {BucketLike} bucket
 * @param {Array<{ entry: ManifestEntry, file: string, bytes: number }>} verified
 * @param {{ apply: boolean, overwrite: boolean, read?: (file: string) => Buffer }} options
 * @returns {Promise<ReconcileResult>}
 */
export async function reconcileObjects(bucket, verified, options) {
  const read = options.read ?? ((file) => readFileSync(file));
  /** @type {ReconcileResult} */
  const result = {
    uploaded: 0,
    replaced: 0,
    wouldUpload: 0,
    wouldReplace: 0,
    same: 0,
    differs: [],
    unknown: [],
  };
  for (const { entry, file, bytes } of verified) {
    const dir = path.posix.dirname(entry.object_path);
    const name = path.posix.basename(entry.object_path);
    const listing = await bucket.list(dir, { search: name, limit: 5 });
    if (listing.error)
      throw new Error(`bucket list failed: ${listing.error.message}`);
    const existing = (listing.data ?? []).find((o) => o.name === name);
    const decision = decideUpload(existing, bytes, options.overwrite);
    if (decision.action === "keep") {
      if (decision.state === "same") result.same += 1;
      else if (decision.state === "differs")
        result.differs.push(entry.object_path);
      else result.unknown.push(entry.object_path);
      continue;
    }
    if (!options.apply) {
      if (decision.action === "replace") result.wouldReplace += 1;
      else result.wouldUpload += 1;
      continue;
    }
    const up = await bucket.upload(entry.object_path, read(file), {
      contentType: "image/webp",
      // One hour, not a year: the object paths carry no version, so a replaced image keeps its URL. The
      // long-lived caching rule (a version in the path, or this short lifetime) is settled with the pages
      // that render these URLs — S1.5 / S2.5 (docs/database-changes/S1.1-0001-catalogue.md → "Known limits").
      cacheControl: "3600",
      upsert: decision.upsert,
    });
    if (up.error)
      throw new Error(
        `upload ${entry.object_path} failed: ${up.error.message}`,
      );
    if (decision.action === "replace") result.replaced += 1;
    else result.uploaded += 1;
  }
  return result;
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

  /** @type {{ commit: string, bucket: string, entries: ManifestEntry[] }} */
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.commit !== PINNED_PROTOTYPE_COMMIT || manifest.bucket !== BUCKET)
    throw new Error(
      "manifest header does not match the pinned commit or bucket",
    );

  /** @type {Array<{ entry: ManifestEntry, file: string, bytes: number }>} */
  const verified = [];
  /** @type {string[]} */
  const failures = [];
  for (const entry of manifest.entries) {
    const result = verifySourceFile(root, entry);
    if (result.ok)
      verified.push({ entry, file: result.file, bytes: result.bytes });
    else failures.push(`${entry.source_path}: ${result.reason}`);
  }
  console.log(
    `Manifest: ${manifest.entries.length} entries; verified ${verified.length}; refused ${failures.length}.`,
  );
  if (failures.length > 0) {
    console.error("Refused files (nothing is uploaded while any entry fails):");
    for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
    if (failures.length > 20)
      console.error(`  … and ${failures.length - 20} more`);
    process.exitCode = 1;
    return;
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
  console.log(`TEST project ${target.target.ref} verified; bucket ${BUCKET}.`);
  const client = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // The seed must have written the rows this upload serves.
  const rows = await client
    .from("artwork_images")
    .select("object_path", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  // A count that did not come back is a failure, never zero: a HEAD answer carries no error body, so a
  // missing table reads as "no error".
  if (rows.error || rows.count === null) {
    const reason = rows.error?.code
      ? rows.error.code
      : !rows.error
        ? "no count returned (is the table there?)"
        : rows.status > 0
          ? `HTTP ${rows.status}`
          : "no response (network error or timeout)";
    throw new Error(
      `artwork_images read: ${reason} — apply 0001_catalogue and run the seed first`,
    );
  }
  if (rows.count !== manifest.entries.length)
    console.log(
      `Note: artwork_images holds ${rows.count} rows, the manifest ${manifest.entries.length} — run pnpm db:test:seed --apply so the projection matches the objects.`,
    );

  const result = await reconcileObjects(client.storage.from(BUCKET), verified, {
    apply,
    overwrite,
  });
  // The first line counts everything sent, replacements included, so that a run with --overwrite never reads
  // "0 written"; without the flag nothing is replaced and the line is the one the records quote. With the
  // flag no object is kept, so a dry run says so instead of a same-size count the loop did not take.
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
      `NOT replaced: ${kept.length} object(s) already in the bucket were kept although they are not confirmed to equal the source — ${result.differs.length} with a different size, ${result.unknown.length} whose size the bucket does not report. An existing object is replaced only with --overwrite.`,
    );
    // Every path, not a sample: --overwrite is all or nothing — it replaces every existing object, the
    // same-size ones included — so this list is how the operator learns which of them are not confirmed to
    // equal the source (at most the manifest's 330 lines).
    for (const line of kept) console.log(`  - ${line}`);
  }
}

// Run only as the entry point (the unit suite imports this file). fileURLToPath, not URL.pathname: on Windows
// the pathname keeps a leading slash and percent-encodes the spaces, so the two never matched and the tool
// printed nothing, uploaded nothing and exited 0.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      `Upload error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
