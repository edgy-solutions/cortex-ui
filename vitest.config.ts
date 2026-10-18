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
 */
export const SOURCE_SCANS = [
  "src/lib/sessionIsolation.test.ts",
  "src/lib/askFold.test.ts",
  "src/components/registry/projectedTupleParity.test.ts",
];

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
          testTimeout: 30_000,
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
