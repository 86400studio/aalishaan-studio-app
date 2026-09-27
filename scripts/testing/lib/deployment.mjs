// @ts-check
/**
 * Preview target validation from trusted platform evidence — docs/ENVIRONMENT-PARITY.md §10, §12.
 *
 * A hostname pattern proves nothing, so before any bypass or proof credential is sent the harness matches
 * the configured target against the GitHub Deployments API of this repository: Vercel's Git integration
 * records every deployment there with its full commit SHA, its environment ("Preview" or "Production")
 * and, in the deployment status, the immutable deployment URL. The candidate SHA, the environment and the
 * exact origin must all agree.
 *
 * Assumptions recorded here: the repository is public (D-02), so the read needs no credential — the
 * unauthenticated GitHub limit is 60 requests per hour per address and a run uses two or three; an
 * optional read-only `GITHUB_TOKEN` (GitHub Actions' own token, or a fine-grained token with no scopes)
 * only raises that limit and is never required. One Vercel project is connected to the repository, so
 * the environment is exactly "Preview" (a second project would make it "Preview – <project>", which this
 * exact match refuses — fail closed). The record carries the commit, not the branch: Vercel sets the
 * deployment `ref` to the SHA, so the SHA is the identity the harness matches.
 */

export const REPOSITORY = "86400studio/aalishaan-studio-app";
export const GITHUB_API = "https://api.github.com";
/** The production domain (docs/ENVIRONMENT-PARITY.md §3); never a Preview target. */
export const PRODUCTION_HOSTS = Object.freeze([
  "aalishaan-studio-app.vercel.app",
]);
export const SHA = /^[0-9a-f]{40}$/;

/**
 * @param {string | undefined} value
 * @returns {value is string}
 */
function present(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Syntactic checks on the configured Preview origin; the deployment evidence check follows separately.
 * @param {string | undefined} raw
 * @returns {{ ok: true, origin: string } | { ok: false, reasons: string[] }}
 */
export function validatePreviewBaseUrl(raw) {
  if (!present(raw))
    return { ok: false, reasons: ["PLAYWRIGHT_BASE_URL is not set"] };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reasons: ["PLAYWRIGHT_BASE_URL is not a URL"] };
  }
  /** @type {string[]} */
  const reasons = [];
  if (url.protocol !== "https:")
    reasons.push("PLAYWRIGHT_BASE_URL must use https");
  if (url.username !== "" || url.password !== "")
    reasons.push("PLAYWRIGHT_BASE_URL must not carry userinfo");
  if (url.search !== "" || url.hash !== "")
    reasons.push(
      "PLAYWRIGHT_BASE_URL must not carry a query or fragment (no token-bearing URLs)",
    );
  if (url.pathname !== "/" && url.pathname !== "")
    reasons.push("PLAYWRIGHT_BASE_URL must be an origin without a path");
  const host = url.hostname;
  if (!host.endsWith(".vercel.app"))
    reasons.push("PLAYWRIGHT_BASE_URL is not a Vercel deployment host");
  if (PRODUCTION_HOSTS.includes(host))
    reasons.push("PLAYWRIGHT_BASE_URL is the Production domain — refused");
  if (host.includes("-git-"))
    reasons.push(
      "PLAYWRIGHT_BASE_URL is a branch alias, not an immutable deployment URL",
    );
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, origin: url.origin };
}

/**
 * Local mode accepts only a loopback origin and is never Preview evidence.
 * @param {string | undefined} raw
 * @returns {{ ok: true, origin: string } | { ok: false, reasons: string[] }}
 */
export function validateLocalBaseUrl(raw) {
  if (!present(raw))
    return { ok: false, reasons: ["PLAYWRIGHT_BASE_URL is not set"] };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reasons: ["PLAYWRIGHT_BASE_URL is not a URL"] };
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    url.protocol !== "http:" ||
    !loopback ||
    url.username !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    return {
      ok: false,
      reasons: [
        "local mode accepts only http://localhost:<port> or http://127.0.0.1:<port> without path, query or userinfo",
      ],
    };
  return { ok: true, origin: url.origin };
}

/**
 * @param {string | undefined} raw
 * @returns {{ ok: true, sha: string } | { ok: false, reasons: string[] }}
 */
export function validateCandidateSha(raw) {
  if (!present(raw))
    return { ok: false, reasons: ["PLAYWRIGHT_CANDIDATE_SHA is not set"] };
  if (!SHA.test(raw))
    return {
      ok: false,
      reasons: [
        "PLAYWRIGHT_CANDIDATE_SHA must be the full 40-character lower-case commit SHA",
      ],
    };
  return { ok: true, sha: raw };
}

/**
 * @typedef {{
 *   id: number,
 *   sha: string,
 *   ref: string,
 *   environment: string,
 *   productionEnvironment: boolean,
 *   environmentUrl: string | null,
 *   createdAt: string,
 * }} DeploymentEvidence
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads this repository's GitHub deployments for one commit and, for each, the first successful status
 * with its deployment URL. `token` is the optional read-only GITHUB_TOKEN (rate limit only).
 * @param {{ sha: string, fetchImpl?: typeof fetch, token?: string, timeoutMs?: number }} options
 * @returns {Promise<DeploymentEvidence[]>}
 */
export async function fetchPreviewEvidence(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!SHA.test(options.sha))
    throw new Error("fetchPreviewEvidence needs a full commit SHA");
  /** @type {Record<string, string>} */
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "aalishaan-studio-s0-2-harness",
  };
  if (present(options.token)) headers.authorization = `Bearer ${options.token}`;

  /** @param {string} pathname */
  async function getJson(pathname) {
    const response = await fetchImpl(`${GITHUB_API}${pathname}`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const limited =
        (response.status === 403 || response.status === 429) &&
        (remaining === "0" || response.headers.has("retry-after"));
      throw new Error(
        `GitHub API ${pathname} answered ${response.status}${
          limited
            ? " — the unauthenticated rate limit (60 requests per hour per address) is exhausted; wait, or set a read-only GITHUB_TOKEN in the trusted process"
            : ""
        }`,
      );
    }
    return /** @type {unknown} */ (await response.json());
  }

  const deployments = await getJson(
    `/repos/${REPOSITORY}/deployments?sha=${options.sha}&environment=Preview&per_page=20`,
  );
  if (!Array.isArray(deployments))
    throw new Error("GitHub API returned no deployment list");
  /** @type {DeploymentEvidence[]} */
  const evidence = [];
  for (const deployment of deployments) {
    if (!isRecord(deployment) || typeof deployment.id !== "number") continue;
    const statuses = await getJson(
      `/repos/${REPOSITORY}/deployments/${deployment.id}/statuses?per_page=10`,
    );
    let environmentUrl = null;
    if (Array.isArray(statuses)) {
      for (const status of statuses) {
        if (
          isRecord(status) &&
          status.state === "success" &&
          typeof status.environment_url === "string" &&
          status.environment_url !== ""
        ) {
          environmentUrl = status.environment_url;
          break;
        }
      }
    }
    evidence.push({
      id: deployment.id,
      sha: typeof deployment.sha === "string" ? deployment.sha : "",
      ref: typeof deployment.ref === "string" ? deployment.ref : "",
      environment:
        typeof deployment.environment === "string"
          ? deployment.environment
          : "",
      productionEnvironment: deployment.production_environment === true,
      environmentUrl,
      createdAt:
        typeof deployment.created_at === "string" ? deployment.created_at : "",
    });
  }
  return evidence;
}

/**
 * Pure match of the configured origin and SHA against the evidence: one successful Preview deployment of
 * exactly that commit must serve exactly that origin.
 * @param {{ origin: string, sha: string, evidence: DeploymentEvidence[] }} input
 * @returns {{ ok: true, deployment: DeploymentEvidence } | { ok: false, reasons: string[] }}
 */
export function matchPreviewTarget(input) {
  const { origin, sha, evidence } = input;
  const base = validatePreviewBaseUrl(origin);
  if (!base.ok) return base;
  if (!SHA.test(sha))
    return { ok: false, reasons: ["candidate SHA is not a full commit SHA"] };
  for (const deployment of evidence) {
    if (deployment.sha !== sha) continue;
    if (
      deployment.environment !== "Preview" ||
      deployment.productionEnvironment
    )
      continue;
    if (!deployment.environmentUrl) continue;
    let deployed;
    try {
      deployed = new URL(deployment.environmentUrl).origin;
    } catch {
      continue;
    }
    if (deployed === base.origin) return { ok: true, deployment };
  }
  return {
    ok: false,
    reasons: [
      `no successful Preview deployment of ${sha} in ${REPOSITORY} serves ${base.origin} (GitHub Deployments API)`,
    ],
  };
}
