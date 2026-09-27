import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Import boundary (S0.2; docs/TECH-ARCHITECTURE.md §2, §6; docs/SECURITY-CHECKLIST.md §2).
 *
 * Every module under src/lib/server/ starts with `import "server-only"`, which makes the bundler fail any
 * build where such a module reaches a client bundle — that is the enforcement. The rules below report the
 * same mistakes before a build, at the import statement:
 *
 *  1. a `"use client"` module (wherever it lives; the directive may sit anywhere in the directive prologue)
 *     never imports a server-only module — by alias (`@/lib/server/...`), by a relative path at any depth,
 *     or the `server-only` marker itself — and never the Supabase SDK, whether by a static import, a
 *     re-export or a dynamic import with a static specifier (inline rule
 *     `aalishaan/no-server-import-in-client-module`);
 *  2. the browser-shared modules `src/lib/supabase/**` and `src/instrumentation-client.ts` never import a
 *     server module, whatever their directive;
 *  3. `@supabase/*` is imported only by the two factories (`src/lib/supabase/browser.ts`,
 *     `src/lib/server/supabase.ts`);
 *  4. the server-only environment names are read only inside src/lib/server/ — as a member read, a
 *     computed read or a destructuring of `process.env` — and never in `next.config.ts`, whose `env` block
 *     is inlined into every bundle. (An aliased `const e = process.env; e.X` is outside the rule; the
 *     unit sweep in tests/unit/import-boundary.test.ts and the `server-only` marker cover the rest.)
 *
 * Server components, route handlers, server actions and the server instrumentation hook may import server
 * modules: they run on the server. tests/unit/import-boundary.test.ts lints synthetic files at application
 * paths through this very configuration.
 */

/** A specifier that resolves to src/lib/server (alias, or a relative path at any depth) or the marker. */
const SERVER_SPECIFIER =
  /^(@\/lib\/server(\/.*)?|server-only|(\.\.?\/)+([^/]+\/)*server(\/.*)?)$/;
/** The Supabase SDK and its sub-packages. */
const SDK_SPECIFIER = /^@supabase\//;

const clientBoundaryPlugin = {
  meta: { name: "aalishaan-client-boundary", version: "0.3.0" },
  rules: {
    "no-server-import-in-client-module": {
      meta: {
        type: "problem",
        docs: {
          description:
            'A "use client" module never imports a server-only module or the Supabase SDK (S0.2 import boundary).',
        },
        schema: [],
        messages: {
          server:
            'A "use client" module cannot import "{{source}}": it is server-only (S0.2 import boundary; docs/TECH-ARCHITECTURE.md §6).',
          sdk: 'A "use client" module cannot import "{{source}}": create clients through src/lib/supabase/browser.ts.',
        },
      },
      create(context) {
        // The directive prologue: every leading expression statement that is a directive. Next treats a
        // "use client" anywhere in it as a client entry, so the rule does too.
        let isClientModule = false;
        for (const statement of context.sourceCode.ast.body) {
          if (
            statement.type !== "ExpressionStatement" ||
            typeof statement.directive !== "string"
          )
            break;
          if (statement.directive === "use client") {
            isClientModule = true;
            break;
          }
        }
        if (!isClientModule) return {};
        const check = (node, source) => {
          if (typeof source !== "string") return;
          if (SERVER_SPECIFIER.test(source))
            context.report({ node, messageId: "server", data: { source } });
          else if (SDK_SPECIFIER.test(source))
            context.report({ node, messageId: "sdk", data: { source } });
        };
        return {
          ImportDeclaration(node) {
            check(node, node.source.value);
          },
          ExportNamedDeclaration(node) {
            if (node.source) check(node, node.source.value);
          },
          ExportAllDeclaration(node) {
            check(node, node.source.value);
          },
          ImportExpression(node) {
            const { source } = node;
            if (source.type === "Literal") check(node, source.value);
            else if (
              source.type === "TemplateLiteral" &&
              source.expressions.length === 0
            )
              check(node, source.quasis[0]?.value.cooked);
          },
        };
      },
    },
  },
};

const SERVER_MODULE_PATTERNS = [
  {
    group: ["@/lib/server", "@/lib/server/*", "@/lib/server/**", "server-only"],
    message:
      "Browser-shared module: a server-only module is never imported here (S0.2 import boundary).",
  },
  {
    // Relative paths at any depth (gitignore-style matching): `../lib/server/x`, `../server/x`, `./server/x`.
    group: [
      "**/lib/server",
      "**/lib/server/*",
      "**/lib/server/**",
      "**/server",
      "**/server/*",
      "**/server/**",
    ],
    message:
      "Browser-shared module: a server-only module is never imported here, by any relative path (S0.2 import boundary).",
  },
];

const SUPABASE_SDK_PATTERNS = [
  {
    group: ["@supabase/supabase-js", "@supabase/supabase-js/*", "@supabase/*"],
    message:
      "Create Supabase clients only through src/lib/supabase/browser.ts (public) or src/lib/server/supabase.ts (privileged).",
  },
];

const SERVER_ONLY_NAMES =
  "^(SUPABASE_SECRET_KEY|SUPABASE_TEST_PROJECT_REF|SUPABASE_PROD_PROJECT_REF|S0_2_PROOF_TOKEN)$";
const PROCESS_ENV =
  "[object.type='MemberExpression'][object.object.name='process'][object.property.name='env']";
const SERVER_ONLY_ENV_MESSAGE =
  "Server-only environment names are read in src/lib/server modules only (docs/ENV-VARS-SAFETY.md).";

const SERVER_ONLY_ENV_RULE = [
  "error",
  {
    // process.env.NAME
    selector: `MemberExpression[computed=false]${PROCESS_ENV}[property.name=/${SERVER_ONLY_NAMES}/]`,
    message: SERVER_ONLY_ENV_MESSAGE,
  },
  {
    // process.env["NAME"]
    selector: `MemberExpression[computed=true]${PROCESS_ENV}[property.value=/${SERVER_ONLY_NAMES}/]`,
    message: SERVER_ONLY_ENV_MESSAGE,
  },
  {
    // const { NAME } = process.env
    selector: `VariableDeclarator[init.type='MemberExpression'][init.object.name='process'][init.property.name='env'] > ObjectPattern > Property[key.name=/${SERVER_ONLY_NAMES}/]`,
    message: SERVER_ONLY_ENV_MESSAGE,
  },
];

const APP_FILES = ["src/**/*.{ts,tsx,js,jsx,mts,mjs}"];
const BROWSER_SHARED_FILES = [
  "src/lib/supabase/**/*.{ts,tsx,js,jsx,mts,mjs}",
  "src/instrumentation-client.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The frozen, checksummed reference is never linted (TECHNICAL-INTEGRITY.md).
    "prototype/**",
    "coverage/**",
    // Playwright output (git-ignored).
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
  // 1. A "use client" module anywhere in the app never imports a server module or the SDK.
  {
    files: APP_FILES,
    plugins: { aalishaan: clientBoundaryPlugin },
    rules: { "aalishaan/no-server-import-in-client-module": "error" },
  },
  // 2. Browser-shared modules never import a server module; only the public factory may use the SDK.
  {
    files: BROWSER_SHARED_FILES,
    ignores: ["src/lib/supabase/browser.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...SERVER_MODULE_PATTERNS, ...SUPABASE_SDK_PATTERNS] },
      ],
    },
  },
  {
    files: ["src/lib/supabase/browser.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: SERVER_MODULE_PATTERNS }],
    },
  },
  // 3. Everywhere else in the app the SDK is reached only through the factories.
  {
    files: APP_FILES,
    ignores: [...BROWSER_SHARED_FILES, "src/lib/server/supabase.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: SUPABASE_SDK_PATTERNS }],
    },
  },
  // 4. Server-only environment names are read inside src/lib/server only — never in next.config.ts either.
  {
    files: [...APP_FILES, "next.config.ts"],
    ignores: ["src/lib/server/**"],
    rules: { "no-restricted-syntax": SERVER_ONLY_ENV_RULE },
  },
]);

export default eslintConfig;
