import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

// Only the framework's cache functions are replaced: the real route's default dependencies reach these fakes.
const nextCache = vi.hoisted(() => ({
  revalidateTag: vi.fn<(tag: string, profile: { expire: number }) => void>(),
  revalidatePath: vi.fn<(path: string) => void>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: nextCache.revalidateTag,
  revalidatePath: nextCache.revalidatePath,
}));

import * as route from "@/app/api/revalidate/catalogue/route";
import { CATALOGUE_PAGE_PATHS } from "@/lib/catalogue/browse-model";
import {
  MAX_BODY_BYTES,
  MIN_SECRET_LENGTH,
  REVALIDATION_TARGETS,
  handleCatalogueRevalidation,
  isAuthorized,
  parseRevalidationRequest,
} from "@/lib/server/catalogue-revalidation";

/**
 * The catalogue's revalidation hook — S1.4 (src/lib/server/catalogue-revalidation.ts behind
 * `POST /api/revalidate/catalogue`): only POST; an exact bearer secret, or the same generic 404 that reads no body;
 * then the one bounded JSON target, or 400; only then the one tag and the 17 browse paths expire. No response carries
 * the secret. Hermetic: the revalidators are injected (or `next/cache` is a fake) and the secret is a run-time stand-in.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** A repository-relative path with forward slashes, whatever the platform's separator (Windows: `\`). */
const toPosix = (relativePath: string) =>
  relativePath.split(path.sep).join("/");

const HOOK_URL = "https://preview.example.test/api/revalidate/catalogue";
// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const SECRET = "Ab9_".repeat(10); // 40 characters of the b64token set
const WRONG = "Zy8-".repeat(10); // the same length, another value
const PAYLOAD = JSON.stringify({ target: "catalogue" });

/** The 17 browse pages the hook expires (docs/TECH-ARCHITECTURE.md §3a), as literals. */
const EXPECTED_PATHS = [
  "/shop",
  "/collections",
  "/collections/painted-in-gold",
  "/collections/blossoms-in-ink",
  "/collections/the-age-of-sail",
  "/art-styles",
  "/art-styles/gilded-peaks",
  "/art-styles/rinpa-moon",
  "/art-styles/four-gentlemen",
  "/art-styles/scarlet-blossom",
  "/art-styles/moonlit-blossom",
  "/art-styles/hand-printed-ukiyo-e",
  "/art-styles/mythic-voyage",
  "/art-styles/corsair-chronicles",
  "/art-styles/ghostly-armada",
  "/art-styles/marquetry-voyage",
  "/art-styles/neo-classical-fantasy",
];

type Revalidators = {
  revalidateTag: Mock<(tag: string, profile: { expire: number }) => void>;
  revalidatePath: Mock<(path: string) => void>;
};
type HookDeps = Revalidators & {
  env: { CATALOGUE_REVALIDATION_SECRET?: string };
};

function hookDeps(
  env: HookDeps["env"] = { CATALOGUE_REVALIDATION_SECRET: SECRET },
): HookDeps {
  return {
    env,
    revalidateTag: vi.fn<(tag: string, profile: { expire: number }) => void>(),
    revalidatePath: vi.fn<(path: string) => void>(),
  };
}

type HookInit = {
  method?: string;
  /** The Authorization header; null sends none. */
  authorization?: string | null;
  /** The Content-Type header; null sends none (a string body then gets the platform's text/plain). */
  contentType?: string | null;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  url?: string;
};

/** A POST of the valid payload with the exact secret, unless the test says otherwise. */
function hookRequest(init: HookInit = {}): Request {
  const headers = new Headers(init.headers);
  const authorization =
    init.authorization === undefined ? `Bearer ${SECRET}` : init.authorization;
  if (authorization !== null) headers.set("authorization", authorization);
  const contentType =
    init.contentType === undefined ? "application/json" : init.contentType;
  if (contentType !== null) headers.set("content-type", contentType);
  const body = init.body === undefined ? PAYLOAD : init.body;
  // `duplex` lets a stream be a request body in Node's fetch; the DOM's RequestInit does not name it.
  const requestInit: RequestInit & { duplex: "half" } = {
    method: init.method ?? "POST",
    headers,
    duplex: "half",
  };
  if (body !== null) requestInit.body = body;
  return new Request(init.url ?? HOOK_URL, requestInit);
}

/**
 * A request body that records each read (its `pull`) and its cancellation, then yields `chunks` and ends. With no
 * read-ahead (`highWaterMark: 0`), `pull` runs only when the handler reads.
 */
function recordingBody(chunks: readonly string[] = [PAYLOAD]) {
  const encoder = new TextEncoder();
  const record = { pulls: 0, cancelled: false };
  let next = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        record.pulls += 1;
        if (next < chunks.length)
          controller.enqueue(encoder.encode(chunks[next++]));
        else controller.close();
      },
      cancel() {
        record.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, record };
}

/**
 * A request whose header values reach the handler exactly as written. Fetch's `Headers` (like Node's HTTP parser)
 * strips surrounding whitespace, so a trailing space can be presented only this way.
 */
function asReceived(request: Request, raw: Record<string, string>): Request {
  Object.defineProperty(request, "headers", {
    value: { get: (name: string) => raw[name.toLowerCase()] ?? null },
  });
  return request;
}

/** The body as JSON, after checking that neither it nor any header carries the secret or a presented credential. */
async function jsonOf(
  response: Response,
  ...presented: string[]
): Promise<unknown> {
  const text = await response.text();
  const fragments = [SECRET, WRONG, ...presented]
    .filter((value) => value.length >= 8)
    .map((value) => value.slice(0, 8));
  for (const fragment of fragments) {
    expect(text).not.toContain(fragment);
    for (const [name, value] of response.headers) {
      expect(name).not.toContain(fragment);
      expect(value).not.toContain(fragment);
    }
  }
  return JSON.parse(text) as unknown;
}

async function expectRevalidated(
  response: Response,
  revalidators: Revalidators,
): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await jsonOf(response)).toEqual({
    status: "revalidated",
    target: "catalogue",
    paths: 17,
  });
  expect(revalidators.revalidateTag.mock.calls).toEqual([
    ["public-catalogue", { expire: 0 }],
  ]);
  expect(revalidators.revalidatePath.mock.calls).toEqual(
    EXPECTED_PATHS.map((page) => [page]),
  );
}

/** A denial: the generic 404, uncached, and nothing expired. */
async function expectNotFound(
  response: Response,
  revalidators: Revalidators,
  ...presented: string[]
): Promise<void> {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await jsonOf(response, ...presented)).toEqual({
    status: "not_found",
  });
  expect(revalidators.revalidateTag).not.toHaveBeenCalled();
  expect(revalidators.revalidatePath).not.toHaveBeenCalled();
}

/** Invalid input after authentication: 400, uncached, and nothing expired. */
async function expectInvalid(
  response: Response,
  revalidators: Revalidators,
): Promise<void> {
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await jsonOf(response)).toEqual({ status: "invalid_request" });
  expect(revalidators.revalidateTag).not.toHaveBeenCalled();
  expect(revalidators.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/revalidate/catalogue — allowed: the exact secret, then the one target", () => {
  it("expires the catalogue's tag once and each of the 17 browse paths once, in order, and answers 200", async () => {
    const deps = hookDeps();
    const response = await handleCatalogueRevalidation(hookRequest(), deps);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    await expectRevalidated(response, deps);
    expect(CATALOGUE_PAGE_PATHS).toEqual(EXPECTED_PATHS);
  });

  it.each([
    "application/json; charset=utf-8",
    "application/json;charset=UTF-8",
    "Application/JSON",
  ])("accepts the content type %j", async (contentType) => {
    const deps = hookDeps();
    await expectRevalidated(
      await handleCatalogueRevalidation(hookRequest({ contentType }), deps),
      deps,
    );
  });

  it("reads a streamed body (the read detector of the denial tests sees an allowed read)", async () => {
    const deps = hookDeps();
    const { stream, record } = recordingBody([
      PAYLOAD.slice(0, 5),
      PAYLOAD.slice(5),
    ]);
    await expectRevalidated(
      await handleCatalogueRevalidation(hookRequest({ body: stream }), deps),
      deps,
    );
    expect(record.pulls).toBeGreaterThan(0);
    expect(record.cancelled).toBe(false);
  });

  it("accepts a body of exactly 256 bytes (the payload padded with JSON whitespace)", async () => {
    expect(MAX_BODY_BYTES).toBe(256);
    const deps = hookDeps();
    const body = PAYLOAD.padEnd(MAX_BODY_BYTES, " ");
    expect(new TextEncoder().encode(body).byteLength).toBe(256);
    await expectRevalidated(
      await handleCatalogueRevalidation(hookRequest({ body }), deps),
      deps,
    );
  });

  it("accepts a secret of exactly 32 characters, and a base64 secret with padding", async () => {
    expect(MIN_SECRET_LENGTH).toBe(32);
    const shortest = "k".repeat(MIN_SECRET_LENGTH);
    const base64 = `${"Q".repeat(20)}+/${"z".repeat(20)}9=`;
    for (const secret of [shortest, base64]) {
      const deps = hookDeps({ CATALOGUE_REVALIDATION_SECRET: secret });
      const response = await handleCatalogueRevalidation(
        hookRequest({ authorization: `Bearer ${secret}` }),
        deps,
      );
      expect(response.status).toBe(200);
      expect(await jsonOf(response, secret)).toEqual({
        status: "revalidated",
        target: "catalogue",
        paths: 17,
      });
    }
  });
});

describe("POST /api/revalidate/catalogue — denied: the same 404, no body read, nothing expired", () => {
  it.each([
    ["no Authorization header", null],
    ["another scheme (Basic)", `Basic ${SECRET}`],
    ["a lower-case scheme", `bearer ${SECRET}`],
    ["two spaces after the scheme", `Bearer  ${SECRET}`],
    ["a tab after the scheme", `Bearer\t${SECRET}`],
    ["the scheme without a credential", "Bearer"],
    ["extra text after the secret", `Bearer ${SECRET} extra`],
    ["a wrong secret of the same length", `Bearer ${WRONG}`],
    ["a prefix of the secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret plus one character", `Bearer ${SECRET}A`],
    ["a character outside the b64token set", `Bearer ${SECRET.slice(0, -1)}!`],
    [
      "padding inside the token",
      `Bearer ${SECRET.slice(0, 20)}=${SECRET.slice(20)}`,
    ],
    ["the secret quoted", `Bearer "${SECRET}"`],
    [
      "two Authorization headers (joined into one list)",
      `Bearer ${SECRET}, Bearer ${SECRET}`,
    ],
  ])("denies %s", async (_label, authorization) => {
    const deps = hookDeps();
    const { stream, record } = recordingBody();
    const request = hookRequest({ authorization, body: stream });
    await expectNotFound(
      await handleCatalogueRevalidation(request, deps),
      deps,
    );
    expect(record.pulls).toBe(0);
    expect(request.bodyUsed).toBe(false);
  });

  it("denies a trailing space after the secret, as the header arrives", async () => {
    const deps = hookDeps();
    const { stream, record } = recordingBody();
    const request = asReceived(
      hookRequest({ authorization: null, body: stream }),
      {
        authorization: `Bearer ${SECRET} `,
        "content-type": "application/json",
      },
    );
    expect(request.headers.get("authorization")).toBe(`Bearer ${SECRET} `);
    await expectNotFound(
      await handleCatalogueRevalidation(request, deps),
      deps,
    );
    expect(record.pulls).toBe(0);
    // Through the platform the space never arrives: `Headers` presents the exact secret instead.
    expect(
      new Headers({ authorization: `Bearer ${SECRET} ` }).get("authorization"),
    ).toBe(`Bearer ${SECRET}`);
  });

  it("denies the secret in another header, the query string or the body", async () => {
    for (const request of [
      hookRequest({
        authorization: null,
        headers: { "x-revalidation-secret": SECRET },
      }),
      hookRequest({ authorization: null, url: `${HOOK_URL}?secret=${SECRET}` }),
      hookRequest({
        authorization: null,
        body: JSON.stringify({ target: "catalogue", secret: SECRET }),
      }),
    ]) {
      const deps = hookDeps();
      await expectNotFound(
        await handleCatalogueRevalidation(request, deps),
        deps,
      );
    }
  });

  const DISABLED: ReadonlyArray<[string, HookDeps["env"]]> = [
    ["absent", {}],
    ["undefined", { CATALOGUE_REVALIDATION_SECRET: undefined }],
    ["empty", { CATALOGUE_REVALIDATION_SECRET: "" }],
    [
      "31 characters",
      { CATALOGUE_REVALIDATION_SECRET: "c".repeat(MIN_SECRET_LENGTH - 1) },
    ],
    ["blank", { CATALOGUE_REVALIDATION_SECRET: " ".repeat(40) }],
    // Long enough, but no `Authorization` header can carry it (the b64token set): the hook can never be called.
    [
      "32 characters with symbols outside the bearer token set",
      { CATALOGUE_REVALIDATION_SECRET: "Kq7!vR#2mZ@9xL$4pW%8nT^6bY&3cF*1" },
    ],
    [
      "an inner =",
      {
        CATALOGUE_REVALIDATION_SECRET: `${"Ab9_".repeat(5)}=${"Ab9_".repeat(5)}`,
      },
    ],
    ["a trailing space", { CATALOGUE_REVALIDATION_SECRET: `${SECRET} ` }],
  ];

  it.each(DISABLED)(
    "is disabled while the configured secret is %s: every credential is denied",
    async (_label, env) => {
      const configured = env.CATALOGUE_REVALIDATION_SECRET;
      for (const authorization of [
        `Bearer ${SECRET}`,
        `Bearer ${configured ?? "undefined"}`,
        "Bearer",
      ]) {
        const deps = hookDeps(env);
        const { stream, record } = recordingBody();
        await expectNotFound(
          await handleCatalogueRevalidation(
            hookRequest({ authorization, body: stream }),
            deps,
          ),
          deps,
          ...(configured?.trim() ? [configured] : []),
        );
        expect(record.pulls).toBe(0);
      }
    },
  );
});

describe("POST /api/revalidate/catalogue — invalid input after authentication: 400, nothing expired", () => {
  it("refuses a request with no content type, without reading its body", async () => {
    const deps = hookDeps();
    const { stream, record } = recordingBody();
    const request = hookRequest({ contentType: null, body: stream });
    expect(request.headers.get("content-type")).toBeNull();
    await expectInvalid(await handleCatalogueRevalidation(request, deps), deps);
    expect(record.pulls).toBe(0);
  });

  it("refuses a request with no content type and a byte body", async () => {
    const deps = hookDeps();
    const request = hookRequest({
      contentType: null,
      body: new Blob([PAYLOAD]),
    });
    expect(request.headers.get("content-type")).toBeNull();
    await expectInvalid(await handleCatalogueRevalidation(request, deps), deps);
  });

  it.each([
    "text/plain",
    "text/json",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
  ])("refuses the content type %j", async (contentType) => {
    const deps = hookDeps();
    await expectInvalid(
      await handleCatalogueRevalidation(hookRequest({ contentType }), deps),
      deps,
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["an empty body", ""],
    ["null", "null"],
    ["a string", '"catalogue"'],
    ["an array", "[]"],
    ["an array holding the payload", `[${PAYLOAD}]`],
    ["an empty object", "{}"],
    ["an extra key", '{"target":"catalogue","x":1}'],
    ["another target", '{"target":"all"}'],
    ["a path as the target", '{"target":"/shop"}'],
    ["a URL as the target", '{"target":"https://example.test/shop"}'],
    ["a number as the target", '{"target":1}'],
    ["a null target", '{"target":null}'],
    ["a differently cased target", '{"target":"Catalogue"}'],
    ["an array target", '{"target":["catalogue"]}'],
    ["the tag instead of the target", '{"tag":"public-catalogue"}'],
    ["a path instead of the target", '{"path":"/shop"}'],
  ])("refuses %s", async (_label, body) => {
    const deps = hookDeps();
    await expectInvalid(
      await handleCatalogueRevalidation(hookRequest({ body }), deps),
      deps,
    );
  });

  it("refuses a declared length of 257 without reading the body", async () => {
    const deps = hookDeps();
    const { stream, record } = recordingBody();
    const request = hookRequest({
      body: stream,
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    });
    expect(request.headers.get("content-length")).toBe("257");
    await expectInvalid(await handleCatalogueRevalidation(request, deps), deps);
    expect(record.pulls).toBe(0);
  });

  it.each(["abc", "-1", "1e2", "0x10", "1.5"])(
    "refuses the declared length %j",
    async (length) => {
      const deps = hookDeps();
      await expectInvalid(
        await handleCatalogueRevalidation(
          hookRequest({ headers: { "content-length": length } }),
          deps,
        ),
        deps,
      );
    },
  );

  it("refuses a streamed body past 256 bytes without a declared length, cancelling it at the first chunk beyond", async () => {
    const deps = hookDeps();
    const { stream, record } = recordingBody(
      Array.from({ length: 10 }, () => " ".repeat(100)),
    );
    const request = hookRequest({ body: stream });
    expect(request.headers.get("content-length")).toBeNull();
    await expectInvalid(await handleCatalogueRevalidation(request, deps), deps);
    expect(record.pulls).toBe(3);
    expect(record.cancelled).toBe(true);
  });

  it("refuses a 257-byte body (the payload padded with JSON whitespace)", async () => {
    const deps = hookDeps();
    await expectInvalid(
      await handleCatalogueRevalidation(
        hookRequest({ body: PAYLOAD.padEnd(MAX_BODY_BYTES + 1, " ") }),
        deps,
      ),
      deps,
    );
  });

  it("bounds the bytes actually read when a declared length understates the body", async () => {
    const deps = hookDeps();
    await expectInvalid(
      await handleCatalogueRevalidation(
        hookRequest({
          body: `${" ".repeat(300)}${PAYLOAD}`,
          headers: { "content-length": "10" },
        }),
        deps,
      ),
      deps,
    );
  });
});

describe("POST /api/revalidate/catalogue — other methods", () => {
  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "refuses %s with 405 and Allow: POST, even with the secret, and expires nothing",
    async (method) => {
      const deps = hookDeps();
      const response = await handleCatalogueRevalidation(
        hookRequest({ method, body: null }),
        deps,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await jsonOf(response)).toEqual({ status: "method_not_allowed" });
      expect(deps.revalidateTag).not.toHaveBeenCalled();
      expect(deps.revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("isAuthorized — the exact bearer secret; never throws", () => {
  it("accepts exactly the configured secret", () => {
    expect(isAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["the scheme alone", "Bearer"],
    ["the scheme and a space", "Bearer "],
    ["a leading space", ` Bearer ${SECRET}`],
    ["a trailing space", `Bearer ${SECRET} `],
    ["a trailing newline", `Bearer ${SECRET}${String.fromCharCode(10)}`],
    ["a NUL credential", `Bearer ${String.fromCharCode(0)}`],
    ["a NUL after the secret", `Bearer ${SECRET}${String.fromCharCode(0)}`],
    ["a lone surrogate", `Bearer ${String.fromCharCode(0xd800)}`],
    ["a non-ASCII character", `Bearer ${SECRET}${String.fromCharCode(0xe9)}`],
    ["a 64 KiB credential", `Bearer ${"A".repeat(65536)}`],
    ["a shorter credential", `Bearer ${SECRET.slice(0, 10)}`],
    ["a wrong secret of the same length", `Bearer ${WRONG}`],
  ])("refuses %s without throwing", (_label, authorization) => {
    expect(() => isAuthorized(authorization, SECRET)).not.toThrow();
    expect(isAuthorized(authorization, SECRET)).toBe(false);
  });

  it("refuses everything while the configured secret is unset, empty or short", () => {
    const short = "c".repeat(MIN_SECRET_LENGTH - 1);
    for (const configured of [undefined, "", short]) {
      expect(isAuthorized(`Bearer ${SECRET}`, configured)).toBe(false);
      expect(isAuthorized(`Bearer ${configured ?? ""}`, configured)).toBe(
        false,
      );
    }
  });
});

describe("parseRevalidationRequest — exactly one allow-listed target; never throws", () => {
  it("accepts exactly {target: 'catalogue'}, with any JSON whitespace", () => {
    expect(REVALIDATION_TARGETS).toEqual(["catalogue"]);
    expect(parseRevalidationRequest(PAYLOAD)).toBe("catalogue");
    expect(parseRevalidationRequest(' { "target" : "catalogue" } ')).toBe(
      "catalogue",
    );
  });

  it.each([
    "",
    " ",
    "{",
    "}",
    "null",
    "true",
    "0",
    '"catalogue"',
    "[]",
    `[${PAYLOAD}]`,
    "{}",
    '{"target":"catalogue","x":1}',
    '{"target":"all"}',
    '{"target":"/shop"}',
    '{"target":1}',
    '{"target":null}',
    '{"target":"Catalogue"}',
    '{"target":"catalogue "}',
    '{"target":["catalogue"]}',
    '{"target":{"name":"catalogue"}}',
    '{"__proto__":{"target":"catalogue"}}',
    `${PAYLOAD}x`,
    String.fromCharCode(0xd800),
  ])("returns null for %j without throwing", (text) => {
    expect(() => parseRevalidationRequest(text)).not.toThrow();
    expect(parseRevalidationRequest(text)).toBeNull();
  });

  it("returns null for deeply nested or oversized text without throwing", () => {
    for (const text of [
      "[".repeat(100000),
      `${"[".repeat(5000)}${"]".repeat(5000)}`,
      `{"target":"${"c".repeat(100000)}"}`,
    ]) {
      expect(() => parseRevalidationRequest(text)).not.toThrow();
      expect(parseRevalidationRequest(text)).toBeNull();
    }
  });
});

describe("the route module — src/app/api/revalidate/catalogue/route.ts", () => {
  it("exports POST as its only method handler, dynamic and on the Node runtime", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic", "runtime"]);
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])
      expect(route).not.toHaveProperty(method);
    expect(typeof route.POST).toBe("function");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("the real route reads the secret from the server environment and expires through next/cache", async () => {
    vi.stubEnv("CATALOGUE_REVALIDATION_SECRET", SECRET);
    await expectRevalidated(await route.POST(hookRequest()), nextCache);
  });

  it("the real route denies a wrong secret", async () => {
    vi.stubEnv("CATALOGUE_REVALIDATION_SECRET", SECRET);
    await expectNotFound(
      await route.POST(hookRequest({ authorization: `Bearer ${WRONG}` })),
      nextCache,
    );
  });

  it("the real route is disabled while the secret is unset", async () => {
    vi.stubEnv("CATALOGUE_REVALIDATION_SECRET", undefined);
    await expectNotFound(await route.POST(hookRequest()), nextCache);
  });
});

describe("the secret's name", () => {
  it("is read in src/lib/server/catalogue-revalidation.ts, once, and named in no other source file", () => {
    const naming: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          readFileSync(full, "utf8").includes("CATALOGUE_REVALIDATION_SECRET")
        )
          naming.push(toPosix(path.relative(ROOT, full)));
      }
    };
    walk(path.join(ROOT, "src"));
    expect(naming).toEqual(["src/lib/server/catalogue-revalidation.ts"]);
    const hook = readFileSync(
      path.join(ROOT, "src", "lib", "server", "catalogue-revalidation.ts"),
      "utf8",
    );
    expect(
      hook.match(/process\.env\.CATALOGUE_REVALIDATION_SECRET\b/g),
    ).toHaveLength(1);
    expect(
      readFileSync(path.join(ROOT, "next.config.ts"), "utf8"),
    ).not.toContain("CATALOGUE_REVALIDATION_SECRET");
  });
});
