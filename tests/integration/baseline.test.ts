import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  FIXTURE_NAMESPACE,
  INTEGRATION_NAMESPACE,
  resetFixtureNamespace,
} from "../../scripts/testing/lib/fixtures.mjs";
import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

/**
 * The 0000_init baseline on the real TEST project (docs/ENVIRONMENT-PARITY.md §12 P8b): privileged
 * create/read/update/delete of a namespaced synthetic fixture, the updated_at trigger, and anonymous
 * (publishable-key) read/insert/update/delete denied — each denial confirmed by a privileged post-check
 * that the forbidden mutation did not happen. Every row this file creates carries this run's id and is
 * removed in afterAll; residuals are asserted absent.
 */

const runId = randomBytes(6).toString("hex");
const RUN = `${INTEGRATION_NAMESPACE}${runId}`;
const CRUD_KEY = `${RUN}:crud`;
const NEIGHBOUR_KEY = `${RUN}:neighbour`;
const FIXTURE_SCOPED_KEY = `${FIXTURE_NAMESPACE}${runId}-scoped`;
const FIXTURE_OTHER_KEY = `${FIXTURE_NAMESPACE}${runId}-other-x`;
/** A NON-synthetic row inside the reset's own scope: the reset must never touch it. */
const FIXTURE_REAL_KEY = `${FIXTURE_NAMESPACE}${runId}-scoped-real`;
const ANON_INSERT_KEY = `${RUN}:anon-insert`;

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

let privileged: SupabaseClient;
let anon: SupabaseClient;

type Row = {
  id: string;
  check_key: string;
  status: string;
  synthetic: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

async function privilegedRow(key: string): Promise<Row | null> {
  const { data, error } = await privileged
    .from("system_checks")
    .select("id,check_key,status,synthetic,note,created_at,updated_at")
    .eq("check_key", key)
    .limit(1);
  expect(error).toBeNull();
  return (data as Row[] | null)?.[0] ?? null;
}

async function keysLike(pattern: string): Promise<string[]> {
  const { data, error } = await privileged
    .from("system_checks")
    .select("check_key")
    .like("check_key", pattern);
  expect(error).toBeNull();
  return ((data as Array<{ check_key: string }> | null) ?? []).map(
    (row) => row.check_key,
  );
}

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
});

afterAll(async () => {
  // Cleanup in finally-style: only this run's rows, in both namespaces it used. The non-synthetic row is
  // outside the reset's reach by design and is removed by an explicit privileged delete of its exact key.
  const integration = await resetFixtureNamespace(
    privileged,
    INTEGRATION_NAMESPACE,
    { scope: runId },
  );
  const fixture = await resetFixtureNamespace(privileged, FIXTURE_NAMESPACE, {
    scope: `${runId}-`,
  });
  expect(integration.ok, "integration cleanup").toBe(true);
  expect(fixture.ok, "fixture cleanup").toBe(true);
  const real = await privileged
    .from("system_checks")
    .delete()
    .eq("check_key", FIXTURE_REAL_KEY)
    .select("id");
  expect(real.error, "non-synthetic neighbour cleanup").toBeNull();
  expect(await keysLike(`${RUN}%`), "no residual integration row").toEqual([]);
  expect(
    await keysLike(`${FIXTURE_NAMESPACE}${runId}-%`),
    "no residual fixture row",
  ).toEqual([]);
});

describe("privileged access (secret key) to the baseline", () => {
  it("creates, reads, updates and deletes a namespaced synthetic row; updated_at moves on update", async () => {
    const insert = await privileged
      .from("system_checks")
      .insert({
        check_key: CRUD_KEY,
        status: "ok",
        synthetic: true,
        note: "crud",
      })
      .select("id,created_at,updated_at");
    expect(insert.error).toBeNull();
    expect(insert.data).toHaveLength(1);
    const created = await privilegedRow(CRUD_KEY);
    expect(created).not.toBeNull();
    expect(created?.synthetic).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const update = await privileged
      .from("system_checks")
      .update({ note: "crud updated" })
      .eq("check_key", CRUD_KEY)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(1);
    const updated = await privilegedRow(CRUD_KEY);
    expect(updated?.note).toBe("crud updated");
    expect(new Date(updated?.updated_at ?? 0).getTime()).toBeGreaterThan(
      new Date(updated?.created_at ?? 0).getTime(),
    );
    expect(updated?.created_at).toBe(created?.created_at);

    const remove = await privileged
      .from("system_checks")
      .delete()
      .eq("check_key", CRUD_KEY)
      .select("id");
    expect(remove.error).toBeNull();
    expect(remove.data).toHaveLength(1);
    expect(await privilegedRow(CRUD_KEY)).toBeNull();
  });

  it("refuses a status outside the allowed set and an over-long key (constraints hold)", async () => {
    const badStatus = await privileged.from("system_checks").insert({
      check_key: `${RUN}:bad-status`,
      status: "nope",
      synthetic: true,
    });
    expect(badStatus.error?.code).toBe("23514");
    const badKey = await privileged.from("system_checks").insert({
      check_key: `${RUN}:${"x".repeat(130)}`,
      status: "ok",
      synthetic: true,
    });
    expect(badKey.error?.code).toBe("23514");
  });
});

describe("anonymous access (publishable key) is denied — with privileged post-checks", () => {
  beforeAll(async () => {
    const seed = await privileged.from("system_checks").insert({
      check_key: NEIGHBOUR_KEY,
      status: "ok",
      synthetic: true,
      note: "neighbour",
    });
    expect(seed.error).toBeNull();
  });

  it("cannot read the row: denied, or an RLS-filtered empty result — never the data", async () => {
    const read = await anon
      .from("system_checks")
      .select("id,check_key")
      .eq("check_key", NEIGHBOUR_KEY);
    if (read.error) {
      expect([401, 403]).toContain(read.status);
    } else {
      expect(read.data).toEqual([]);
    }
    expect(
      await privilegedRow(NEIGHBOUR_KEY),
      "the row still exists",
    ).not.toBeNull();
  });

  it("cannot insert: the row never appears", async () => {
    const insert = await anon
      .from("system_checks")
      .insert({ check_key: ANON_INSERT_KEY, status: "ok", synthetic: true });
    if (!insert.error) {
      // Zero affected rows is possible under RLS; the post-check is the assertion.
      expect(insert.data ?? []).toEqual([]);
    }
    expect(
      await privilegedRow(ANON_INSERT_KEY),
      "no row was created",
    ).toBeNull();
  });

  it("cannot update: the note is unchanged", async () => {
    const update = await anon
      .from("system_checks")
      .update({ note: "tampered" })
      .eq("check_key", NEIGHBOUR_KEY)
      .select("id");
    if (!update.error) expect(update.data ?? []).toEqual([]);
    expect((await privilegedRow(NEIGHBOUR_KEY))?.note).toBe("neighbour");
  });

  it("cannot delete: the row survives", async () => {
    const remove = await anon
      .from("system_checks")
      .delete()
      .eq("check_key", NEIGHBOUR_KEY)
      .select("id");
    if (!remove.error) expect(remove.data ?? []).toEqual([]);
    expect(await privilegedRow(NEIGHBOUR_KEY)).not.toBeNull();
  });
});

describe("fixture hygiene (D-22 skeleton)", () => {
  it("a scoped reset removes only its own synthetic rows and leaves neighbours untouched", async () => {
    const seed = await privileged.from("system_checks").insert([
      { check_key: FIXTURE_SCOPED_KEY, status: "ok", synthetic: true },
      { check_key: FIXTURE_OTHER_KEY, status: "ok", synthetic: true },
      { check_key: FIXTURE_REAL_KEY, status: "ok", synthetic: false },
    ]);
    expect(seed.error).toBeNull();

    const result = await resetFixtureNamespace(privileged, FIXTURE_NAMESPACE, {
      scope: `${runId}-scoped`,
    });
    expect(result).toMatchObject({ ok: true, deleted: 1 });
    expect(await privilegedRow(FIXTURE_SCOPED_KEY)).toBeNull();
    expect(
      await privilegedRow(FIXTURE_REAL_KEY),
      "a non-synthetic row inside the reset's own scope survives",
    ).not.toBeNull();
    expect(
      await privilegedRow(FIXTURE_OTHER_KEY),
      "same namespace, other scope",
    ).not.toBeNull();
    expect(
      await privilegedRow(NEIGHBOUR_KEY),
      "other namespace",
    ).not.toBeNull();
  });

  it("the reset refuses a namespace outside the allow-list before touching the database", async () => {
    await expect(resetFixtureNamespace(privileged, "public:")).rejects.toThrow(
      /not an S0\.2 fixture namespace/,
    );
  });
});
