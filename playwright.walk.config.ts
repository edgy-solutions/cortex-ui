import { defineConfig, devices } from "@playwright/test";

/**
 * The LIVE PCN walk (e2e/walk/pcnWalk.live.spec.ts), run by Lane 1 against the deployed sandbox
 * after every roll. No webServer: the target is WALK_BASE_URL. The repo's normal
 * playwright.config.ts ignores this spec (testIgnore), and this config runs ONLY it.
 */
export default defineConfig({
  testDir: "e2e/walk",
  testMatch: /pcnWalk\.live\.spec\.ts$/,
  outputDir: "walk-out/",
  timeout: 15 * 60_000, // two logins + drop + ~100 s of ingest stages + 150 s ask, with headroom
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.WALK_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
