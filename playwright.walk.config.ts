import { defineConfig, devices } from "@playwright/test";
import { spkiPinArg } from "./e2e/walk/walkEnv";

/**
 * The LIVE PCN walk (e2e/walk/walk.live.spec.ts), run by Lane 1 against the deployed sandbox
 * after every roll. No webServer: the target is WALK_BASE_URL. The repo's normal
 * playwright.config.ts ignores this spec (testIgnore), and this config runs ONLY it (PCN, HAZ, FRACAS, stale; WALK_ONLY selects).
 *
 * WALK_SPKI_PIN is REQUIRED here (the sandbox is a self-signed leaf; Chromium ignores PEM bundles).
 * spkiPinArg() throws naming the variable when it is absent or malformed, so loading this config
 * fails; it never skips and never falls back to ignoring certificate errors. Only THIS config
 * reads it: the mock specs (playwright.config.ts) are unaffected.
 */
const spkiArg = spkiPinArg();

export default defineConfig({
  testDir: "e2e/walk",
  testMatch: /walk\.live\.spec\.ts$/,
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
    launchOptions: { args: [spkiArg] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
