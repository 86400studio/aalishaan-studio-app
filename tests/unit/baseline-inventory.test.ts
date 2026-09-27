import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Regression guards for the baseline fixture and the harness contract: the migration inventory the CLI
 * would discover, the safety properties of the forward and down SQL, the CLI configuration, the Playwright
 * gate, the disabled morning workflow, the unchanged Code Check gates and the exact script contract.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");

// The pinned CLI's file pattern and its one legacy exclusion (apps/cli-go/pkg/migration at 2.117.0).
const CLI_MIGRATION_PATTERN = /^([0-9]+)_(.*)\.sql$/;
const CLI_LEGACY_INIT = /([0-9]{14})_init\.sql/;

describe("supabase/migrations — forward discovery", () => {
  const files = readdirSync(path.join(ROOT, "supabase", "migrations")).sort();

  it("holds exactly the S0.2 baseline under the roadmap's name", () => {
    expect(files).toEqual(["0000_init.sql"]);
  });

  it("is discovered by the CLI: matches its pattern and is not the legacy dashboard init it skips", () => {
    for (const file of files) {
      const match = CLI_MIGRATION_PATTERN.exec(file);
      expect(match, file).not.toBeNull();
      expect(match?.[1]).toBe("0000");
      expect(match?.[2]).toBe("init");
      const legacy = CLI_LEGACY_INIT.exec(file);
      expect(
        legacy === null || Number(legacy[1]) >= 20211209000000,
        `${file} would be skipped`,
      ).toBe(true);
    }
  });

  it("contains no down file — rollback artifacts live outside forward discovery", () => {
    expect(files.filter((file) => /down/i.test(file))).toEqual([]);
    expect(
      existsSync(
        path.join(ROOT, "supabase", "rollbacks", "0000_init.down.sql"),
      ),
    ).toBe(true);
  });
});

describe("supabase/migrations/0000_init.sql — additive default-deny baseline", () => {
  const sql = read("supabase/migrations/0000_init.sql").toLowerCase();

  it("creates only the three baseline objects", () => {
    expect(sql.match(/create (or replace )?function/g)).toHaveLength(2);
    expect(sql).toContain("create or replace function public.set_updated_at()");
    expect(sql).toContain(
      "create or replace function public.lock_down_table(target regclass)",
    );
    expect(sql.match(/create table/g)).toHaveLength(1);
    expect(sql).toContain("create table public.system_checks");
    expect(sql.match(/create trigger/g)).toHaveLength(1);
  });

  it("enables RLS through the helper from creation, opens no policy and revokes anon/authenticated", () => {
    expect(sql).toContain(
      "select public.lock_down_table('public.system_checks');",
    );
    expect(sql).toContain("enable row level security");
    expect(sql).toContain(
      "revoke all privileges on table %s from public, anon, authenticated",
    );
    expect(sql).not.toContain("create policy");
    expect(sql).not.toMatch(/grant [^;]* to (public|anon|authenticated)\b/);
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.system_checks to service_role;",
    );
  });

  it("hardens both functions: pinned empty search_path, no security definer, EXECUTE revoked from the API roles (service_role keeps only the trigger function)", () => {
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(sql).not.toContain("security definer");
    expect(sql).toContain(
      "revoke execute on function public.set_updated_at() from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.set_updated_at() to service_role;",
    );
    expect(sql).toContain(
      "revoke execute on function public.lock_down_table(regclass) from public, anon, authenticated, service_role;",
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.lock_down_table/,
    );
    // The only grants in the file go to service_role: the table privileges and the trigger function.
    expect(sql.match(/^grant /gm)).toHaveLength(2);
  });

  it("is additive: no drop, truncate, delete, alter system, or destructive statement", () => {
    for (const forbidden of [
      "drop ",
      "truncate",
      "delete from",
      "alter system",
      "disable row level security",
      "create extension",
      "create schema",
      "create role",
      "alter role",
      "pg_net",
      "cron.",
    ]) {
      expect(sql, forbidden).not.toContain(forbidden);
    }
    expect(sql).not.toContain("force row level security");
  });

  it("bounds the table: unique namespaced key, allowed statuses, bounded note, updated_at trigger", () => {
    expect(sql).toContain("unique (check_key)");
    expect(sql).toContain(
      "check_key ~ '^[a-z0-9][a-z0-9:_.-]{0,118}[a-z0-9]$'",
    );
    expect(sql).toContain("status in ('ok', 'degraded', 'failed')");
    expect(sql).toContain("char_length(note) <= 500");
    expect(sql).toContain("before update on public.system_checks");
    expect(sql).toContain("execute function public.set_updated_at()");
  });

  it("has no pipeline-incompatible statement, so the CLI applies it as one implicit transaction", () => {
    expect(sql).not.toMatch(/concurrently|^\s*vacuum|^\s*cluster|^\s*reindex/m);
  });
});

describe("supabase/rollbacks/0000_init.down.sql — schema recovery only", () => {
  const sql = read("supabase/rollbacks/0000_init.down.sql").toLowerCase();

  it("reverses exactly the three objects in reverse order and nothing else", () => {
    const statements = sql
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"))
      .map((line) => line.trim());
    expect(statements).toEqual([
      "drop trigger if exists system_checks_set_updated_at on public.system_checks;",
      "drop table if exists public.system_checks;",
      "drop function if exists public.lock_down_table(regclass);",
      "drop function if exists public.set_updated_at();",
    ]);
  });

  it("says plainly that it deletes rows and does not restore them", () => {
    const raw = read("supabase/rollbacks/0000_init.down.sql");
    expect(raw).toMatch(/DELETES every row/);
    expect(raw).toMatch(/cannot restore/);
  });
});

describe("supabase/config.toml", () => {
  const toml = read("supabase/config.toml");

  it("names the project and disables seeding", () => {
    expect(toml).toMatch(/^project_id = "aalishaan-studio-app"$/m);
    const seedSection = toml.slice(toml.indexOf("[db.seed]"));
    expect(seedSection).toMatch(/^enabled = false$/m);
    expect(toml).toMatch(/^\[db\.migrations\][\s\S]*?^enabled = true$/m);
  });

  it("holds no value that looks like a key or URL of an owner project", () => {
    expect(toml).not.toMatch(/sb_secret_|sb_publishable_|\.supabase\.co/);
  });
});

describe("playwright.config.ts — the required-projects gate cannot be dropped silently", () => {
  const config = read("playwright.config.ts");

  it("registers the reporter and the global teardown that fails a run in which it did not load", () => {
    expect(config).toContain(
      '["./tests/e2e/harness/required-projects-reporter.ts"]',
    );
    expect(config).toContain(
      'globalTeardown: "./tests/e2e/global-teardown.ts"',
    );
    expect(
      existsSync(path.join(ROOT, "tests", "e2e", "global-teardown.ts")),
    ).toBe(true);
    expect(config).toMatch(/^\s*retries: 0,$/m);
    expect(config).not.toMatch(/^\s*webServer:/m);
    for (const artifact of ["trace", "screenshot", "video"])
      expect(config).toMatch(new RegExp(`^\\s*${artifact}: "off",$`, "m"));
  });
});

describe(".github/workflows/morning-check.yml — committed disabled", () => {
  const yaml = read(".github/workflows/morning-check.yml");

  it("has no schedule, only workflow_dispatch, and an unconditionally disabled job", () => {
    expect(yaml).toMatch(/^on:\n  workflow_dispatch:\n/m);
    expect(yaml).not.toMatch(/^\s*schedule:/m);
    expect(yaml).not.toMatch(/^\s*- cron:/m);
    expect(yaml).toMatch(/^    if: \$\{\{ false \}\}$/m);
  });

  it("has no runnable test or secret-consuming path", () => {
    const active = yaml
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(active).not.toMatch(/secrets\./);
    expect(active).not.toMatch(/playwright test/);
    expect(active).not.toMatch(
      /PLAYWRIGHT_BASE_URL|VERCEL_AUTOMATION_BYPASS_SECRET|S0_2_PROOF_TOKEN/,
    );
  });

  it("pins the same toolchain convention as the Code Check", () => {
    expect(yaml).toContain("node-version-file: .nvmrc");
    expect(yaml).toContain(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    );
    expect(yaml).toContain(
      "pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413",
    );
    expect(yaml).toContain(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
    expect(yaml).not.toMatch(/node-version: 20/);
  });
});

describe(".github/workflows/code-check.yml — the required gates are unchanged", () => {
  const yaml = read(".github/workflows/code-check.yml");

  it("still runs the hermetic unit tests and never the integration, e2e or proof commands", () => {
    expect(yaml).toContain("run: pnpm test:unit");
    for (const forbidden of [
      "test:integration",
      "test:e2e",
      "preview-proof",
      "db:test",
      "secrets.",
      "pnpm test\n",
    ]) {
      expect(yaml, forbidden).not.toContain(forbidden);
    }
    expect(yaml).toContain("run: pnpm install --frozen-lockfile");
    expect(yaml).toContain("run: pnpm build");
    expect(yaml).toContain("run: pnpm audit --prod --audit-level=critical");
  });
});

describe("package.json — the S0.2 script contract", () => {
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it("defines the exact commands", () => {
    expect(pkg.scripts).toMatchObject({
      "test:unit": "vitest run",
      "test:integration": "vitest run --config vitest.integration.config.ts",
      test: "pnpm run test:unit && pnpm run test:integration",
      "test:e2e": "playwright test",
      "test:preview-proof": "node scripts/testing/preview-proof.mjs",
      "db:test:preflight": "node scripts/testing/preflight.mjs",
      "db:test:seed": "node scripts/testing/seed.mjs",
      "db:test:reset": "node scripts/testing/reset.mjs",
    });
    for (const script of Object.values(pkg.scripts)) {
      expect(script).not.toMatch(
        /passWithNoTests|--pass-with-no-tests|--if-present|--reporter/,
      );
    }
  });

  it("pins the three S0.2 additions exactly", () => {
    expect(pkg.dependencies["@supabase/supabase-js"]).toBe("2.117.1");
    expect(pkg.devDependencies["@playwright/test"]).toBe("1.63.0");
    expect(pkg.devDependencies["supabase"]).toBe("2.117.0");
  });
});
