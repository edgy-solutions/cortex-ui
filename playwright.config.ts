import { defineConfig, devices } from "@playwright/test";

/**
 * The Friday walk as a dry run (order: "Approval card and ingest card: the Friday script as a
 * Playwright flow against fixtures").
 *
 * The app talks to `http://api.friday.test` — `.test` is a reserved TLD, so a call the route table
 * does not answer can never reach a real backend on localhost:8000. `ingestMock` is deliberately
 * NOT enabled: the walk must go through the real `src/api/client.ts` fetches.
 *
 * CONFIG PRECEDENCE: `src/config.ts` reads `window.__RUNTIME_CONFIG__` first. Dev serves
 * `public/config.js`, which sets it to `{}` — it names neither VITE_API_URL nor VITE_NO_AUTH, so
 * the env below wins and no config.js route is needed.
 */
const PORT = 5179;

export default defineConfig({
  testDir: "e2e",
  // The live walk targets a deployed sandbox (playwright.walk.config.ts); never run it from here.
  testIgnore: /pcnWalk.live.spec.ts$/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_NO_AUTH: "true",
      VITE_FEATURES: "ingest",
      VITE_API_URL: "http://api.friday.test",
      VITE_KEYCLOAK_REALM_URL: "http://auth.friday.test/realms/cortex",
      VITE_KEYCLOAK_CLIENT_ID: "cortex-ui",
    },
  },
});
