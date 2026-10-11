import { defineConfig, devices } from "@playwright/test";

/**
 * The answers-at-scale TTI harness (e2e/perf/answersTti.spec.ts). Run by hand: `npm run test:perf`.
 * It is NOT part of `npm run test` or `npm run build`, and the default playwright.config.ts
 * ignores e2e/perf.
 *
 * Unlike the Friday walk this runs WITHOUT VITE_NO_AUTH: the Electric subscription starts only
 * with a non-null access token and a non-empty VITE_API_URL (src/App.tsx useArtifactSync,
 * src/lib/electric.ts), and VITE_NO_AUTH leaves the token null. The spec seeds a react-oidc-context
 * user in sessionStorage instead, so the REAL subscription runs against a routed snapshot.
 * `.test` is a reserved TLD, so nothing the route table misses can reach a real backend.
 *
 * Env knobs (read by the spec): PERF_N="1000,10000"  PERF_RUNS=3  PERF_LABEL=before
 *                               PERF_SUMMARY_ONLY=1  PERF_OUT=e2e/perf/results-before.json
 */
const PORT = Number(process.env.PERF_PORT ?? "5181");
/** PERF_DIST: serve a PRODUCTION build (vite preview of that dir) instead of the dev server. */
const DIST = process.env.PERF_DIST;

export default defineConfig({
  testDir: "e2e/perf",
  timeout: 15 * 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: DIST
      ? `npx vite preview --outDir "${DIST}" --port ${PORT} --strictPort`
      : `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_FEATURES: "ingest",
      VITE_API_URL: "http://api.perf.test",
      VITE_KEYCLOAK_REALM_URL: "http://auth.perf.test/realms/cortex",
      VITE_KEYCLOAK_CLIENT_ID: "cortex-ui",
    },
  },
});
