import type {
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import { REQUIRED_PROJECTS } from "./target";

/**
 * No silent omission (docs/ENVIRONMENT-PARITY.md §10): the run fails unless every required project ran at
 * least one test and every executed test passed — a `--project` filter that drops one, zero tests or a
 * skipped test can never read as green. A CLI `--reporter` flag replaces the configured reporters, so the
 * reporter also leaves a marker on `globalThis` that tests/e2e/global-teardown.ts checks: a run in which
 * this reporter did not load fails there. `--list` runs no test and is exempt.
 */

export const REPORTER_MARKER: unique symbol = Symbol.for(
  "aalishaan.s0-2.required-projects-reporter",
);

type MarkerScope = { [REPORTER_MARKER]?: boolean };

/** Throws unless the reporter announced itself in this process (or the run only listed tests). */
export function assertReporterLoaded(
  scope: object,
  argv: readonly string[],
): void {
  if (argv.includes("--list")) return;
  if ((scope as MarkerScope)[REPORTER_MARKER] === true) return;
  throw new Error(
    "the required-projects reporter did not run: a --reporter flag replaced the configured reporters, so the desktop + mobile-390 gate was not enforced — run `pnpm test:e2e` without --reporter (use --add-reporter to add one)",
  );
}

class RequiredProjectsReporter implements Reporter {
  private readonly counts = new Map<
    string,
    { run: number; passed: number; skipped: number }
  >();

  onBegin(): void {
    (globalThis as MarkerScope)[REPORTER_MARKER] = true;
    for (const name of REQUIRED_PROJECTS)
      this.counts.set(name, { run: 0, passed: 0, skipped: 0 });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const name = projectNameOf(test);
    const entry = this.counts.get(name) ?? { run: 0, passed: 0, skipped: 0 };
    entry.run += 1;
    if (result.status === "passed") entry.passed += 1;
    if (result.status === "skipped") entry.skipped += 1;
    this.counts.set(name, entry);
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult["status"] }> {
    if (process.argv.includes("--list")) return { status: result.status };
    const problems: string[] = [];
    let total = 0;
    for (const name of REQUIRED_PROJECTS) {
      const entry = this.counts.get(name);
      const run = entry?.run ?? 0;
      const passed = entry?.passed ?? 0;
      total += run;
      if (run === 0) problems.push(`required project "${name}" ran no test`);
      else if (passed !== run)
        problems.push(
          `required project "${name}": ${passed}/${run} passed (${entry?.skipped ?? 0} skipped)`,
        );
    }
    if (total === 0) problems.push("zero tests ran");
    if (problems.length > 0) {
      console.error(`[required-projects] FAIL: ${problems.join("; ")}`);
      return { status: "failed" };
    }
    console.log(
      `[required-projects] ${REQUIRED_PROJECTS.map((name) => `${name} ${this.counts.get(name)?.passed ?? 0}/${this.counts.get(name)?.run ?? 0}`).join(", ")}`,
    );
    return { status: result.status };
  }

  printsToStdio(): boolean {
    return false;
  }
}

function projectNameOf(test: TestCase): string {
  let suite: Suite | undefined = test.parent;
  while (suite) {
    const project = suite.project();
    if (project) return project.name;
    suite = suite.parent;
  }
  return "(no project)";
}

export default RequiredProjectsReporter;
