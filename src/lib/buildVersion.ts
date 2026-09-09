/**
 * WHAT IS ACTUALLY SERVING — cortex-ui's half of the fleet version contract.
 *
 * ── THE QUESTION THIS ANSWERS ─────────────────────────────────────────────────────────────
 *
 * "Is the thing in front of me the thing that was pushed." It has cost real minutes and at
 * least one wrong answer, and until now the only way to ask was to open Rancher — which
 * reports what the orchestrator ASKED for, not what is being served.
 *
 * The mesh services answer it at `GET /version`. A static bundle behind nginx has no handler
 * to add one to, so the equivalent is a stamp baked into the bundle at build time and a
 * `version.json` written beside it, both from the same value.
 *
 * ── THE GOAL IS NOT ONE NUMBER EVERYWHERE ─────────────────────────────────────────────────
 *
 * cortex-ui is a SEPARATE REPOSITORY with its own head and its own roll. Its sha and the mesh's
 * are not comparable and must never be diffed against each other — "each thing is the thing
 * that was pushed" is the property, not "everything matches". That is why `repo` travels with
 * the sha: a reader (or a census) resolves each component against the head of ITS repo, and a
 * repo it has no path for is reported as unresolvable rather than judged.
 *
 * ── NULL, NEVER "unknown" ─────────────────────────────────────────────────────────────────
 *
 * An absent sha is `null`. The string "unknown" is truthy, renders in a monospace slot looking
 * exactly like a short hash, and would be compared, logged and pasted into tickets as though it
 * identified something. This is the same rule as the duration that renders absent rather than
 * zero, and the honest-default `"none"` on entitlement source: a placeholder that survives a
 * truthiness test is a value that will eventually be believed.
 */

/**
 * Injected by Vite at build time from the GIT_SHA build argument — see `vite.config.ts` and the
 * Dockerfile's `ARG GIT_SHA`. Declared here so the whole app reads one name.
 *
 * BAKED INTO THE IMAGE, never injected by the chart at runtime like the rest of
 * `window.__RUNTIME_CONFIG__`. A chart-injected sha describes what the deployment BELIEVES it
 * is running, which is precisely the claim under suspicion when somebody asks this question.
 */
declare const __CORTEX_GIT_SHA__: string | null;
declare const __CORTEX_BUILT_AT__: string | null;

/**
 * EXPORTED so the placeholder rejection can be asserted at its own surface.
 *
 * Left private, it was reachable only through the build-time inject, so no test could feed it
 * "unknown" and a mutation deleting the whole rejection list survived — the one guard here that
 * does the actual work. A predicate reachable only through a caller that cannot vary its input
 * is untested however green the file looks.
 */
export function readDefine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  // A build that ran outside a checkout substitutes nothing useful; those all mean "no sha".
  if (!v || v === "unknown" || v === "null" || v === "undefined") return null;
  return v;
}

export interface BuildVersion {
  component: "cortex-ui";
  /** Which repository the sha belongs to. Not decoration — see the header. */
  repo: "cortex-ui";
  /** The commit this bundle was built from, or null. NEVER a placeholder string. */
  git_sha: string | null;
  /** ISO timestamp of the build, or null. */
  built_at: string | null;
}

export function buildVersion(): BuildVersion {
  return {
    component: "cortex-ui",
    repo: "cortex-ui",
    git_sha: readDefine(typeof __CORTEX_GIT_SHA__ === "undefined" ? null : __CORTEX_GIT_SHA__),
    built_at: readDefine(typeof __CORTEX_BUILT_AT__ === "undefined" ? null : __CORTEX_BUILT_AT__),
  };
}

/**
 * The short form for a status line. Null in, null out — a caller must not be handed a dash or
 * an ellipsis it might render as though it were an identifier.
 */
export function shortSha(sha: string | null | undefined): string | null {
  if (typeof sha !== "string") return null;
  const v = sha.trim();
  if (!v) return null;
  return v.slice(0, 7);
}
