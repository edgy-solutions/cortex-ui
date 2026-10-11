/**
 * Environment plumbing for `npm run walk`: credentials, walk selection, the summary table.
 * No Playwright import, so it is trivially unit-reachable and nothing here can touch a page.
 */
import type { StepResult } from "./pcnWalk";

export type Env = Record<string, string | undefined>;

export const WALK_NAMES = ["pcn", "haz", "fracas", "stale"] as const;
export type WalkName = (typeof WALK_NAMES)[number];

export interface UserCreds {
  user: string;
  password: string;
}

/**
 * The ONE place a credential is read: `WALK_<NAME>_USER` / `WALK_<NAME>_PASSWORD`, NAME uppercased.
 *
 * Throws a message naming the MISSING VARIABLE(S) - never a value - so a walk that needs bob and
 * has no bob can only FAIL, never skip, and a missing credential can never read as a pass.
 */
export function creds(name: string, env: Env = process.env): UserCreds {
  const key = name.trim().toUpperCase();
  const userVar = `WALK_${key}_USER`;
  const passVar = `WALK_${key}_PASSWORD`;
  const user = env[userVar];
  const password = env[passVar];
  const missing = [userVar, passVar].filter((v) => !env[v]);
  if (missing.length > 0 || !user || !password) {
    throw new Error(`creds: missing environment variable${missing.length > 1 ? "s" : ""} ${missing.join(", ")} (needed to log in as ${name})`);
  }
  return { user, password };
}

/** `WALK_ONLY=pcn,haz,fracas,stale` (default: all). An unknown name is an error, not a no-op. */
export function selectedWalks(env: Env = process.env): WalkName[] {
  const raw = (env.WALK_ONLY ?? "").trim();
  if (!raw) return [...WALK_NAMES];
  const asked = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = asked.filter((a) => !(WALK_NAMES as readonly string[]).includes(a));
  if (unknown.length > 0) {
    throw new Error(`WALK_ONLY: unknown walk ${unknown.join(", ")} (known: ${WALK_NAMES.join(", ")})`);
  }
  return WALK_NAMES.filter((w) => asked.includes(w));
}

export interface WalkOutcome {
  walk: WalkName;
  steps: StepResult[];
  /** The first failure's one-line message, or null. */
  error: string | null;
}

/** pass = no `fail` step AND a step list that is not empty. Skipped steps (a PCN duplicate) are not failures. */
export function walkPassed(o: WalkOutcome): boolean {
  return o.error === null && o.steps.length > 0 && o.steps.every((s) => s.status !== "fail");
}

export function summaryTable(outcomes: WalkOutcome[]): string {
  const rows: string[][] = [["walk", "step", "status", "detail"]];
  for (const o of outcomes) {
    if (o.steps.length === 0) rows.push([o.walk, "(none ran)", "fail", o.error ?? "no steps recorded"]);
    for (const s of o.steps) rows.push([o.walk, s.step, s.status, s.detail.replace(/\s+/g, " ").slice(0, 110)]);
  }
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => `${r[0]!.padEnd(w[0]!)}  ${r[1]!.padEnd(w[1]!)}  ${r[2]!.padEnd(w[2]!)}  ${r[3]}`;
  const bad = outcomes.filter((o) => !walkPassed(o)).map((o) => o.walk);
  return [
    line(rows[0]!),
    line(rows[0]!.map((_c, i) => "-".repeat(i < 3 ? w[i]! : 6))),
    ...rows.slice(1).map(line),
    "",
    bad.length === 0 ? "WALK RESULT: PASS (exit 0)" : `WALK RESULT: FAIL (${bad.join(", ")})`,
  ].join("\n");
}
