// @ts-check
/**
 * The D-22 TEST fixture skeleton (docs/PROJECT-STATUS.md §8a D-22, §8c): one namespaced synthetic
 * `system_checks` row to seed, and a reset that removes only synthetic rows inside an allowed namespace
 * (optionally narrowed to one run). No product table exists yet — S1.1 extends this. Nothing here can
 * drop, truncate, reset a database, delete auth users or touch a row outside its namespace.
 */

export const FIXTURE_NAMESPACE = "fixture:";
export const INTEGRATION_NAMESPACE = "integration:";
export const PROOF_NAMESPACE = "s0-2-proof:";
export const ALLOWED_NAMESPACES = Object.freeze([
  FIXTURE_NAMESPACE,
  INTEGRATION_NAMESPACE,
  PROOF_NAMESPACE,
]);

/** A run scope narrows a reset to `<namespace><scope>…`; only these characters are allowed. */
const SCOPE = /^[a-z0-9-]{0,64}$/;

export const BASELINE_FIXTURE = Object.freeze({
  check_key: "fixture:baseline",
  status: "ok",
  synthetic: true,
  note: "S0.2 baseline fixture (D-22 skeleton; extended at S1.1)",
});

/** @param {string} namespace */
export function isAllowedNamespace(namespace) {
  return ALLOWED_NAMESPACES.includes(namespace);
}

/**
 * Idempotent: the same row whether it existed or not (upsert on check_key).
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, count: number, code: string | null }>}
 */
export async function seedBaselineFixture(client, options = {}) {
  const { data, error } = await client
    .from("system_checks")
    .upsert({ ...BASELINE_FIXTURE }, { onConflict: "check_key" })
    .select("id")
    .abortSignal(AbortSignal.timeout(options.timeoutMs ?? 8000));
  return {
    ok: !error,
    count: Array.isArray(data) ? data.length : 0,
    code: error ? error.code : null,
  };
}

/**
 * Deletes synthetic rows whose key starts with `<namespace><scope>`; refuses any other namespace before
 * touching the client.
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} namespace
 * @param {{ scope?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, deleted: number, code: string | null }>}
 */
export async function resetFixtureNamespace(client, namespace, options = {}) {
  if (!isAllowedNamespace(namespace))
    throw new Error(`"${namespace}" is not an S0.2 fixture namespace`);
  const scope = options.scope ?? "";
  if (!SCOPE.test(scope))
    throw new Error("a reset scope may contain only [a-z0-9-]");
  const { data, error } = await client
    .from("system_checks")
    .delete()
    .eq("synthetic", true)
    .like("check_key", `${namespace}${scope}%`)
    .select("id")
    .abortSignal(AbortSignal.timeout(options.timeoutMs ?? 8000));
  return {
    ok: !error,
    deleted: Array.isArray(data) ? data.length : 0,
    code: error ? error.code : null,
  };
}

/**
 * How many rows (synthetic or not) currently carry keys in `<namespace><scope>`.
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} namespace
 * @param {{ scope?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, count: number, code: string | null }>}
 */
export async function countNamespace(client, namespace, options = {}) {
  if (!isAllowedNamespace(namespace))
    throw new Error(`"${namespace}" is not an S0.2 fixture namespace`);
  const scope = options.scope ?? "";
  if (!SCOPE.test(scope)) throw new Error("a scope may contain only [a-z0-9-]");
  const { count, error } = await client
    .from("system_checks")
    .select("id", { count: "exact", head: true })
    .like("check_key", `${namespace}${scope}%`)
    .abortSignal(AbortSignal.timeout(options.timeoutMs ?? 8000));
  return { ok: !error, count: count ?? 0, code: error ? error.code : null };
}
