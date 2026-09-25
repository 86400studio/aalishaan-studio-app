// @ts-check
/**
 * Loads the operator's git-ignored `.env.local` into the current process — the "authorized trusted local
 * process" of docs/ENVIRONMENT-PARITY.md §10 — without ever printing a value. Variables already set in the
 * environment win over the file. Nothing here is imported by the application.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const LOCAL_ENV_FILE = ".env.local";

/**
 * @param {string} [file]
 * @param {string} [cwd]
 * @returns {{ loaded: boolean, file: string, names: number }}
 */
export function loadLocalEnv(file = LOCAL_ENV_FILE, cwd = process.cwd()) {
  const target = path.resolve(cwd, file);
  if (!existsSync(target)) return { loaded: false, file, names: 0 };
  const parsed = parseEnv(readFileSync(target, "utf8"));
  let names = 0;
  for (const [name, value] of Object.entries(parsed)) {
    if (process.env[name] === undefined) {
      process.env[name] = value;
      names += 1;
    }
  }
  return { loaded: true, file, names };
}

/**
 * The names among `names` that are unset or blank — never their values.
 * @param {readonly string[]} names
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function missingNames(names, env = process.env) {
  return names.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}
