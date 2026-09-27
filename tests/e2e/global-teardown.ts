import { assertReporterLoaded } from "./harness/required-projects-reporter";

/**
 * After every run: the required-projects gate must actually have been loaded. A `--reporter` flag on the
 * command line replaces the configured reporters; this teardown turns that into a failed run instead of a
 * silent loss of the desktop + mobile-390 gate.
 */
export default async function globalTeardown(): Promise<void> {
  assertReporterLoaded(globalThis, process.argv);
}
