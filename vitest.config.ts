/// <reference types="vitest" />
import { defineConfig } from "vite";
import path from "node:path";

/**
 * Test runner, added 2026-08-20 — see docs/plans/cortex-ui-no-test-runner.md in the
 * invincible-agent repo. Until now this project had NO runner at all, which is why ten
 * hand-copied capability contracts could drift with nothing pinning them: the defect was
 * not overlooked, it was UNOBSERVABLE from this side.
 *
 * Placed immediately before the presentation build's dissolution slice, deliberately.
 * That slice deletes 194 lines of backend compensation on the claim that
 * `normalizeChartData`'s acceptance conditions ARE the contract — and deleting a safety net
 * while the thing defining its replacement is pinned only by `tsc` is the riskiest moment
 * in the build.
 *
 * `environment: "jsdom"` is set now rather than later so component tests (Testing-Library
 * is installed) need no config change to start.
 */

/**
 * The files that walk the whole source tree. Under full-suite load they hit the 5 s default
 * and fail as timeouts, not assertions (10-17: 85/85 alone, four timeouts in the full run), and
 * the tree grows every beat. Architect, 10-17: they "run serial with their own timeout", so they
 * are their own project, run AFTER the parallel suite (groupOrder 1), one file at a time.
 *
 * Architect, 10-27: "Whole-tree checks get a 30 s limit, marked as such; nothing else changes."
 * Of the eleven below the line, six timed out at 5 s in a 306 s full run on 10-25 and passed
 * alone, 42/42. A WHOLE-TREE CHECK here is a test that walks every file under
 * `src/` (or `sessions/`) recursively, so its cost grows with the repo, not with the code
 * under test. A walk of ONE directory is not one, and neither is `featureFlags` (it spawns a
 * shell). Both stay in `unit` at the 5 s default.
 */
export const SOURCE_SCANS = [
  "src/lib/sessionIsolation.test.ts",
  "src/lib/askFold.test.ts",
  "src/components/registry/projectedTupleParity.test.ts",
  "src/lib/nginxModuleMime.test.ts",
  // ── whole-tree walkers, 10-27 ──
  "src/api/taskState.test.ts",
  "src/components/registry/RefusalOrChoice.test.tsx",
  "src/components/tables/ExtractedTableView.test.tsx",
  "src/hooksAfterEarlyReturn.test.ts",
  "src/lib/cases.test.ts",
  "src/lib/deepLink.test.ts",
  "src/lib/documentReviewContainment.test.ts",
  "src/lib/drawnLineage.test.ts",
  "src/lib/noNodeBuiltinsInTheBundle.test.ts",
  "src/lib/seedPortfolioCanvas.reachability.test.ts",
  "src/runtimeConfig.guard.test.ts",
];

/** The limit for a whole-tree check (the `source-scans` project). Everything else keeps 5 s. */
export const WHOLE_TREE_TIMEOUT_MS = 30_000;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    globals: true,
    projects: [
      // `include` lives on each project, not the root: `extends: true` CONCATENATES include
      // arrays, so a root include would hand source-scans all 234 files (measured 10-17).
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: SOURCE_SCANS,
          groupOrder: 0,
        },
      },
      {
        extends: true,
        test: {
          name: "source-scans",
          include: SOURCE_SCANS,
          groupOrder: 1,
          fileParallelism: false,
          testTimeout: WHOLE_TREE_TIMEOUT_MS,
        },
      },
    ],
    // Only active under `--coverage`, so the normal run stays fast. `all: true` is the
    // load-bearing setting: without it the report covers only files a test already
    // imports, which flatters the number by hiding every untouched module — the exact
    // shape of "114 green" concealing four behaviourally-tested modules out of 130.
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/__spike__/**", "src/main.tsx"],
      reporter: ["text-summary", "json-summary"],
    },
  },
});
