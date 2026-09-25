import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * The import boundary is enforced, not implied by a folder name: the real eslint.config.mjs lints
 * synthetic files at application paths, and the server modules are checked for the `server-only` marker
 * that turns any surviving client import into a build error.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: path.join(ROOT, "eslint.config.mjs"),
});

async function errorRulesFor(
  relativePath: string,
  code: string,
): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(ROOT, relativePath),
  });
  return result.messages
    .filter((message) => message.severity === 2)
    .map((message) => message.ruleId ?? "(fatal)");
}

const CLIENT_RULE = "aalishaan/no-server-import-in-client-module";
const IMPORT_RULE = "no-restricted-imports";
const SYNTAX_RULE = "no-restricted-syntax";
const USE_CLIENT = '"use client";\n';

/** Every way a source file can read one of the server-only names from process.env. */
const SERVER_ONLY_NAMES =
  "SUPABASE_SECRET_KEY|S0_2_PROOF_TOKEN|SUPABASE_(?:TEST|PROD)_PROJECT_REF";
const SERVER_ONLY_READ = new RegExp(
  `process\\.env(?:\\.|\\[\\s*["'\`])(?:${SERVER_ONLY_NAMES})\\b|\\{[^}]*\\b(?:${SERVER_ONLY_NAMES})\\b[^}]*\\}\\s*=\\s*process\\.env`,
);

describe(
  "eslint.config.mjs — server-only modules stay out of client code",
  { timeout: 120_000 },
  () => {
    it.each([
      [
        "a client component importing the privileged client by alias",
        "src/components/client.tsx",
        `${USE_CLIENT}import { createPrivilegedClient } from "@/lib/server/supabase";\nexport const x = createPrivilegedClient;\n`,
      ],
      [
        "a client page importing health by a deep relative path",
        "src/app/(store)/deep/page.tsx",
        `${USE_CLIENT}import { checkHealth } from "../../../lib/server/health";\nexport const x = checkHealth;\n`,
      ],
      [
        "a client component importing the server folder index",
        "src/components/x.tsx",
        `${USE_CLIENT}import * as server from "@/lib/server";\nexport const x = server;\n`,
      ],
      [
        "a client component importing the server-only marker",
        "src/components/x.tsx",
        `${USE_CLIENT}import "server-only";\nexport const x = 1;\n`,
      ],
      [
        "a client component importing the SDK",
        "src/components/x.tsx",
        `${USE_CLIENT}import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n`,
      ],
      [
        "a client component re-exporting a server module",
        "src/components/x.tsx",
        `${USE_CLIENT}export { checkHealth } from "@/lib/server/health";\n`,
      ],
      [
        "a client component re-exporting everything from a server module",
        "src/components/x.tsx",
        `${USE_CLIENT}export * from "../lib/server/health";\n`,
      ],
      [
        "a client component importing a server module dynamically",
        "src/components/x.tsx",
        `${USE_CLIENT}export const load = () => import("@/lib/server/health");\n`,
      ],
      [
        "a client component importing a server module through a template-literal dynamic import",
        "src/components/x.tsx",
        `${USE_CLIENT}export const load = () => import(\`@/lib/server/health\`);\n`,
      ],
      [
        "a client component with a comment before the directive",
        "src/components/x.tsx",
        `// a comment\n${USE_CLIENT}import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n`,
      ],
      [
        'a client module whose directive follows "use strict" in the prologue',
        "src/components/x.tsx",
        `"use strict";\n${USE_CLIENT}import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n`,
      ],
      [
        "a client component with a single-quoted directive",
        "src/components/x.tsx",
        `'use client';\nimport { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n`,
      ],
    ])("reports %s", async (_label, file, code) => {
      expect(await errorRulesFor(file, code)).toContain(CLIENT_RULE);
    });

    it.each([
      [
        "the public config module importing a server module",
        "src/lib/supabase/config.ts",
        'import { checkHealth } from "../server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "the browser factory importing a server module",
        "src/lib/supabase/browser.ts",
        'import { createPrivilegedClient } from "@/lib/server/supabase";\nexport const x = createPrivilegedClient;\n',
      ],
      [
        "a deep public module importing the server folder as a sibling",
        "src/lib/supabase/deep/thing.ts",
        'import { checkHealth } from "../../server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "the public config module importing the marker",
        "src/lib/supabase/config.ts",
        'import "server-only";\nexport const x = 1;\n',
      ],
      [
        "a public module other than the factory importing the SDK",
        "src/lib/supabase/config.ts",
        'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      ],
      [
        "the browser instrumentation hook importing a server module",
        "src/instrumentation-client.ts",
        'import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "a page creating an SDK client directly",
        "src/app/page.tsx",
        'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      ],
      [
        "a route handler creating an SDK client directly",
        "src/app/api/health/route.ts",
        'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      ],
      [
        "a server module other than the factory creating an SDK client",
        "src/lib/server/health.ts",
        'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      ],
      [
        "a page importing an SDK sub-package",
        "src/app/page.tsx",
        'import { PostgrestClient } from "@supabase/postgrest-js";\nexport const x = PostgrestClient;\n',
      ],
    ])("reports %s", async (_label, file, code) => {
      expect(await errorRulesFor(file, code)).toContain(IMPORT_RULE);
    });

    it.each([
      [
        "a server component page importing a server module",
        "src/app/page.tsx",
        'import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "an async server component outside app/ importing a server module",
        "src/components/orders-table.tsx",
        'import { checkHealth } from "../lib/server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "a server action module importing the privileged client",
        "src/app/checkout/actions.ts",
        '"use server";\nimport { createPrivilegedClient } from "@/lib/server/supabase";\nexport const x = createPrivilegedClient;\n',
      ],
      [
        "a route handler importing a server module",
        "src/app/api/health/route.ts",
        'import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "a nested route handler importing by a relative path",
        "src/app/api/setup-proof/route.ts",
        'import { handleSetupProof } from "../../../lib/server/setup-proof";\nexport const x = handleSetupProof;\n',
      ],
      [
        "a server module importing a sibling",
        "src/lib/server/health.ts",
        'import { createPrivilegedClient } from "./supabase";\nexport const x = createPrivilegedClient;\n',
      ],
      [
        "the privileged factory creating the SDK client",
        "src/lib/server/supabase.ts",
        'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      ],
      [
        "the browser factory creating the SDK client",
        "src/lib/supabase/browser.ts",
        'import { createClient } from "@supabase/supabase-js";\nexport const x = createClient;\n',
      ],
      [
        "a client component importing the browser factory",
        "src/components/x.tsx",
        `${USE_CLIENT}import { createBrowserSupabaseClient } from "@/lib/supabase/browser";\nexport const x = createBrowserSupabaseClient;\n`,
      ],
      [
        "a client component importing an unrelated sibling module",
        "src/components/x.tsx",
        `${USE_CLIENT}import { y } from "./y";\nexport const x = y;\n`,
      ],
      [
        'a server module whose "use client" string sits after a statement (not a directive)',
        "src/components/x.tsx",
        'const first = 1;\n"use client";\nimport { checkHealth } from "@/lib/server/health";\nexport const x = [first, checkHealth];\n',
      ],
      [
        "the server instrumentation hook importing a server module",
        "src/instrumentation.ts",
        'import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n',
      ],
      [
        "a unit test importing a server module",
        "tests/unit/example.test.ts",
        'import { checkHealth } from "@/lib/server/health";\nexport const x = checkHealth;\n',
      ],
    ])("allows %s", async (_label, file, code) => {
      const rules = await errorRulesFor(file, code);
      expect(rules).not.toContain(CLIENT_RULE);
      expect(rules).not.toContain(IMPORT_RULE);
    });

    it.each([
      [
        "a page",
        "src/app/page.tsx",
        "export const k = process.env.SUPABASE_SECRET_KEY;\n",
      ],
      [
        "a component reading the proof token",
        "src/components/x.tsx",
        "export const k = process.env.S0_2_PROOF_TOKEN;\n",
      ],
      [
        "a component reading a ref",
        "src/components/x.tsx",
        "export const k = process.env.SUPABASE_PROD_PROJECT_REF;\n",
      ],
      [
        "the browser factory",
        "src/lib/supabase/browser.ts",
        "export const k = process.env.SUPABASE_SECRET_KEY;\n",
      ],
      [
        "a route handler (server modules read the names, routes do not)",
        "src/app/api/health/route.ts",
        "export const k = process.env.SUPABASE_SECRET_KEY;\n",
      ],
      [
        "a page reading the secret with a computed key",
        "src/app/page.tsx",
        'export const k = process.env["SUPABASE_SECRET_KEY"];\n',
      ],
      [
        "a component destructuring the token from process.env",
        "src/components/x.tsx",
        "const { S0_2_PROOF_TOKEN } = process.env;\nexport const k = S0_2_PROOF_TOKEN;\n",
      ],
      [
        "next.config.ts (its env block is inlined into every bundle)",
        "next.config.ts",
        "const config = { env: { SECRET: process.env.SUPABASE_SECRET_KEY } };\nexport default config;\n",
      ],
    ])(
      "reports a server-only environment name read in %s",
      async (_label, file, code) => {
        expect(await errorRulesFor(file, code)).toContain(SYNTAX_RULE);
      },
    );

    it.each([
      [
        "a public name in a page",
        "src/app/page.tsx",
        "export const k = process.env.NEXT_PUBLIC_SUPABASE_URL;\n",
      ],
      [
        "a public name destructured in a page",
        "src/app/page.tsx",
        "const { NEXT_PUBLIC_SUPABASE_URL } = process.env;\nexport const k = NEXT_PUBLIC_SUPABASE_URL;\n",
      ],
      [
        "a server-only name inside a server module",
        "src/lib/server/setup-proof.ts",
        "export const k = process.env.S0_2_PROOF_TOKEN;\n",
      ],
      [
        "a server-only name inside the privileged factory",
        "src/lib/server/supabase.ts",
        "export const k = process.env.SUPABASE_SECRET_KEY;\n",
      ],
      [
        "a computed read of a server-only name inside a server module",
        "src/lib/server/supabase.ts",
        'export const k = process.env["SUPABASE_SECRET_KEY"];\n',
      ],
    ])("allows %s", async (_label, file, code) => {
      expect(await errorRulesFor(file, code)).not.toContain(SYNTAX_RULE);
    });
  },
);

describe("transitive protection — the marker the bundler enforces", () => {
  const serverDir = path.join(ROOT, "src", "lib", "server");
  const serverFiles = readdirSync(serverDir).filter((name) =>
    name.endsWith(".ts"),
  );

  it("has the expected server modules", () => {
    expect(serverFiles.sort()).toEqual([
      "health.ts",
      "setup-proof.ts",
      "supabase.ts",
    ]);
  });

  it.each(serverFiles)('%s starts with import "server-only"', (name) => {
    const source = readFileSync(path.join(serverDir, name), "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("the public modules import no server module and read no server-only name", () => {
    for (const name of ["config.ts", "browser.ts"]) {
      const source = readFileSync(
        path.join(ROOT, "src", "lib", "supabase", name),
        "utf8",
      );
      // Import specifiers only: a doc comment may name the server module, an import may not.
      const specifiers = [...source.matchAll(/from "([^"]+)"/g)].map(
        (match) => match[1],
      );
      for (const specifier of specifiers) {
        expect(specifier, `${name} imports ${specifier}`).not.toMatch(
          /(^|\/)server(\/|$)|^server-only$/,
        );
      }
      expect(source).not.toMatch(SERVER_ONLY_READ);
    }
  });

  it("no application file outside src/lib/server, and not next.config.ts, reads a server-only name", () => {
    const offenders: string[] = [];
    const check = (full: string) => {
      const source = readFileSync(full, "utf8");
      if (SERVER_ONLY_READ.test(source))
        offenders.push(path.relative(ROOT, full));
    };
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (full !== serverDir) walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          check(full);
        }
      }
    };
    walk(path.join(ROOT, "src"));
    check(path.join(ROOT, "next.config.ts"));
    expect(offenders).toEqual([]);
  });

  it("every route handler and page in src/app is a server module (no client directive) at S0.2", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/^(route|page|layout)\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, "utf8");
          if (/^\s*["']use client["'];/m.test(source))
            offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, "src", "app"));
    expect(offenders).toEqual([]);
  });
});
