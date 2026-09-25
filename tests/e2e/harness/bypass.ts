import type { BrowserContext } from "@playwright/test";

import {
  fetchExact,
  redact,
  type ExactResponse,
} from "../../../scripts/testing/lib/http.mjs";

import type { ResolvedTarget } from "./target";

/**
 * Deployment Protection bypass, kept apart from application authorisation (docs/ENVIRONMENT-PARITY.md
 * §10). The secret never enters Playwright's request context (its error "Call log" would echo request
 * headers) and never a context-wide header: one Node `fetch` to the exact validated origin obtains Vercel's
 * host-scoped bypass cookie, which is then added to the browser context; direct HTTP checks go through the
 * same Node `fetch`, attach the header only to that origin and never follow a redirect.
 */

export const SET_COOKIE_HEADER = "x-vercel-set-bypass-cookie";

export type ParsedCookie = {
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None";
  expires?: number;
};

/** A minimal Set-Cookie parser: name=value plus the attributes the bypass cookie uses. */
export function parseSetCookie(header: string): ParsedCookie | null {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const cookie: ParsedCookie = {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim(),
    path: "/",
    secure: false,
    httpOnly: false,
    sameSite: "Lax",
  };
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "path" && value.startsWith("/")) cookie.path = value;
    else if (key === "secure") cookie.secure = true;
    else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "samesite") {
      const normalised = value.toLowerCase();
      cookie.sameSite =
        normalised === "strict"
          ? "Strict"
          : normalised === "none"
            ? "None"
            : "Lax";
    } else if (key === "max-age" && /^\d+$/.test(value)) {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(value);
    } else if (key === "expires") {
      const at = Date.parse(value);
      if (!Number.isNaN(at)) cookie.expires = Math.floor(at / 1000);
    }
  }
  return cookie;
}

/**
 * One Node `fetch` to `<origin>/` with the bypass header and `x-vercel-set-bypass-cookie: true`; Vercel
 * answers with a redirect whose Set-Cookie carries the host-scoped bypass cookie. The redirect is not
 * followed; the cookie is added to the browser context for exactly that origin, so every later navigation,
 * sub-request or redirect the browser makes carries the cookie (host-only) and never the secret.
 */
export async function bootstrapBypassCookie(
  context: Pick<BrowserContext, "addCookies">,
  target: ResolvedTarget,
  fetchImpl?: typeof fetch,
): Promise<{ cookies: number }> {
  if (!target.bypassSecret) return { cookies: 0 };
  const url = `${target.origin}/`;
  let response: ExactResponse;
  try {
    response = await fetchExact(url, {
      origin: target.origin,
      bypassSecret: target.bypassSecret,
      headers: { [SET_COOKIE_HEADER]: "true" },
      keepSetCookies: true,
      fetchImpl,
    });
  } catch (error) {
    throw new Error(
      redact(
        `bypass bootstrap request to ${target.origin} failed: ${error instanceof Error ? error.message : String(error)}`,
        [target.bypassSecret],
      ),
    );
  }
  const cookies = response.setCookies
    .map(parseSetCookie)
    .filter((cookie): cookie is ParsedCookie => cookie !== null);
  if (cookies.length === 0)
    throw new Error(
      `the bypass bootstrap answered ${response.status} without a Set-Cookie for ${target.origin}`,
    );
  await context.addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      // `url` makes the cookie host-only for exactly this origin.
      url: `${target.origin}${cookie.path}`,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      ...(cookie.expires !== undefined ? { expires: cookie.expires } : {}),
    })),
  );
  return { cookies: cookies.length };
}

/**
 * A direct HTTP request to the exact validated origin through Node `fetch`: bypass header only there, no
 * redirect followed, only safe headers kept, and any error message redacted.
 */
export async function exactRequest(
  target: ResolvedTarget,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
  fetchImpl?: typeof fetch,
): Promise<ExactResponse> {
  const url = new URL(path, target.origin).toString();
  if (new URL(url).origin !== target.origin)
    throw new Error(`refusing a request outside ${target.origin}`);
  try {
    return await fetchExact(url, {
      origin: target.origin,
      bypassSecret: target.bypassSecret,
      method: init.method,
      headers: init.headers,
      body: init.body,
      fetchImpl,
    });
  } catch (error) {
    throw new Error(
      redact(
        `request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
        [target.bypassSecret],
      ),
    );
  }
}
