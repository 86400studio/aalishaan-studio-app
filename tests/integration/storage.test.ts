import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { BUCKET, MANIFEST_PATH } from "../../scripts/testing/lib/catalogue.mjs";
import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

/**
 * The public bucket on the real TEST project, after `pnpm db:test:upload-catalogue --source-root … --apply`
 * (docs/database-changes/S1.1-0001-catalogue.md → Verification 5): known enumerated objects resolve by their
 * public URL as WebP with the manifest's SHA-256; the publishable key can neither upload, update, delete nor
 * list through the Storage API, and a denied write changes nothing. The suite never skips: an object that has
 * not been uploaded fails with a plain message naming the upload command.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

type Entry = { object_path: string; sha256: string; size: string };
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
  entries: Entry[];
};
const SAMPLE = [
  manifest.entries.find((e) => e.object_path.endsWith("/frame-white-480.webp")),
  manifest.entries.find((e) =>
    e.object_path.endsWith("/close-antique-gold-1200.webp"),
  ),
  manifest.entries.find((e) => e.object_path.endsWith("/artwork-full.webp")),
].filter((e): e is Entry => Boolean(e));

let privileged: SupabaseClient;
let anon: SupabaseClient;

beforeAll(() => {
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new Error(target.reasons.join("; "));
  privileged = createClient(
    target.target.url,
    target.target.secretKey,
    NO_SESSION,
  );
  anon = createClient(
    target.target.url,
    target.target.publishableKey,
    NO_SESSION,
  );
  expect(SAMPLE).toHaveLength(3);
});

describe("known public objects resolve by URL", () => {
  it.each(SAMPLE.map((e) => [e.object_path, e] as const))(
    "%s is served as WebP with the manifest's SHA-256",
    async (objectPath, entry) => {
      const { data } = anon.storage.from(BUCKET).getPublicUrl(objectPath);
      const response = await fetch(data.publicUrl, { redirect: "manual" });
      expect(
        response.status,
        `${objectPath}: upload it with pnpm db:test:upload-catalogue --source-root <checkout> --apply`,
      ).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^image\/webp/);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.toString("latin1", 0, 4)).toBe("RIFF");
      expect(bytes.toString("latin1", 8, 12)).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        entry.sha256,
      );
    },
  );

  it("an object outside the enumerated contract does not exist", async () => {
    const { data } = anon.storage
      .from(BUCKET)
      .getPublicUrl("artworks/the-bridge-of-blue-stone/master.png");
    const response = await fetch(data.publicUrl, { redirect: "manual" });
    expect([400, 404]).toContain(response.status);
  });
});

describe("the publishable key cannot write or list", () => {
  const probePath = "artworks/zz-anon-probe/frame-white-480.webp";
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([16, 0, 0, 0]),
    Buffer.from("WEBPVP8 "),
    Buffer.alloc(8),
  ]);

  it("upload is denied and nothing appears", async () => {
    const upload = await anon.storage
      .from(BUCKET)
      .upload(probePath, webp, { contentType: "image/webp" });
    expect(upload.error).not.toBeNull();
    const listing = await privileged.storage
      .from(BUCKET)
      .list("artworks/zz-anon-probe");
    expect(listing.error).toBeNull();
    expect(listing.data ?? []).toEqual([]);
  });

  it("delete and update of a known object are denied and the object still resolves", async () => {
    const target = SAMPLE[0].object_path;
    const remove = await anon.storage.from(BUCKET).remove([target]);
    // The Storage API answers a denied delete with an error or with an empty result; the object must remain either way.
    if (!remove.error) expect(remove.data ?? []).toEqual([]);
    const update = await anon.storage
      .from(BUCKET)
      .update(target, webp, { contentType: "image/webp" });
    expect(update.error).not.toBeNull();
    const { data } = anon.storage.from(BUCKET).getPublicUrl(target);
    const response = await fetch(data.publicUrl, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(
      createHash("sha256")
        .update(Buffer.from(await response.arrayBuffer()))
        .digest("hex"),
    ).toBe(SAMPLE[0].sha256);
  });

  it("listing through the API is denied or empty for the publishable key", async () => {
    const listing = await anon.storage.from(BUCKET).list("artworks");
    if (!listing.error) expect(listing.data ?? []).toEqual([]);
  });
});
