// @ts-check
/**
 * Safe request helpers for the deployed harness — docs/ENVIRONMENT-PARITY.md §10. Node's own `fetch` is
 * used on purpose: unlike Playwright's request context it never copies request headers into an error
 * message, so a failed request can never print the bypass secret. The bypass header is attached only to a
 * request whose origin is exactly the validated Preview origin, redirects are never followed (so a
 * credential can never follow an external Location), response bodies are bounded, and only the
 * security-relevant headers are kept — never a token-bearing Location; `Set-Cookie` values are returned
 * separately and only when the caller asks for them.
 */

export const BYPASS_HEADER = "x-vercel-protection-bypass";

export const SECURITY_HEADERS = Object.freeze([
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "x-robots-tag",
]);

const KEPT_HEADERS = new Set([
  ...SECURITY_HEADERS,
  "content-type",
  "cache-control",
  "allow",
]);

/**
 * @param {string} url
 * @param {string} origin
 */
export function isSameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * The bypass header for exactly the validated origin, otherwise nothing.
 * @param {string} url
 * @param {string} origin
 * @param {string | null | undefined} secret
 * @returns {Record<string, string>}
 */
export function bypassHeadersFor(url, origin, secret) {
  if (!secret) return {};
  return isSameOrigin(url, origin) ? { [BYPASS_HEADER]: secret } : {};
}

/**
 * The origin of a Location header, or null; the full value may carry tokens and is never kept.
 * @param {string | null} location
 * @param {string} base
 */
export function locationOrigin(location, base) {
  if (!location) return null;
  try {
    return new URL(location, base).origin;
  } catch {
    return null;
  }
}

/**
 * @param {Response} response
 * @param {number} maxBytes
 */
async function readBounded(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  // Only chunks that fit within the bound were kept, so the buffer is exactly their size.
  const kept = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(kept);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * @typedef {{
 *   status: number,
 *   headers: Record<string, string>,
 *   body: string,
 *   locationOrigin: string | null,
 *   setCookies: string[],
 *   url: string,
 * }} ExactResponse
 */

/**
 * One request to the exact validated origin. Throws before sending anything when the URL is elsewhere.
 * @param {string} url
 * @param {{
 *   origin: string,
 *   bypassSecret?: string | null,
 *   headers?: Record<string, string>,
 *   method?: string,
 *   body?: string,
 *   timeoutMs?: number,
 *   maxBodyBytes?: number,
 *   keepSetCookies?: boolean,
 *   fetchImpl?: typeof fetch,
 * }} options
 * @returns {Promise<ExactResponse>}
 */
export async function fetchExact(url, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!isSameOrigin(url, options.origin))
    throw new Error(
      `refusing a request outside the validated origin ${options.origin}`,
    );
  const response = await fetchImpl(url, {
    method: options.method ?? "GET",
    headers: {
      ...(options.headers ?? {}),
      ...bypassHeadersFor(url, options.origin, options.bypassSecret),
    },
    body: options.body,
    redirect: "manual",
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
  });
  const body = await readBounded(response, options.maxBodyBytes ?? 65536);
  /** @type {Record<string, string>} */
  const headers = {};
  response.headers.forEach((value, name) => {
    if (KEPT_HEADERS.has(name.toLowerCase()))
      headers[name.toLowerCase()] = value;
  });
  const setCookies =
    options.keepSetCookies === true &&
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  return {
    status: response.status,
    headers,
    body,
    locationOrigin: locationOrigin(response.headers.get("location"), url),
    setCookies,
    url,
  };
}

/**
 * Defensive last pass before anything is printed: every non-empty secret becomes "[redacted]".
 * @param {string} text
 * @param {readonly (string | undefined | null)[]} secrets
 */
export function redact(text, secrets) {
  let output = text;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0)
      output = output.split(secret).join("[redacted]");
  }
  return output;
}
