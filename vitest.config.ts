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
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
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
