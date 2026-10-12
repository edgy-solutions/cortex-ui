/**
 * The stale-tab pill, end to end through the dev server: a tab whose bundle sha differs from the
 * served /version.json shows the pill (App.tsx's opening registration runs checkBundleFreshness);
 * the same sha shows nothing.
 *
 * "MINE": the dev server stamps the bundle from the GIT_SHA env (vite.config.ts gitSha()), which
 * playwright.config.ts sets to STALE_TEST_BUNDLE_SHA on the webServer ONLY. Without it the dev
 * bundle would carry whatever `git rev-parse HEAD` says, and the same-sha arm could not be written.
 * The opening check fires once per load; the FLIP arm proves the window-focus re-check (pill only, no reload).
 *
 * Session: VITE_NO_AUTH alone leaves a blank page, so seedFakeOidcSession (via installWalkRoutes)
 * gives App a user; registration needs auth.isAuthenticated.
 */
import { test, expect } from "@playwright/test";
import { installWalkRoutes, newWalkMock } from "./walk/walkRoutes";
import { STALE_TEST_BUNDLE_SHA } from "./bundleSha";

const OTHER_SHA = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";

async function open(page: import("@playwright/test").Page, servedSha: string | null) {
  await installWalkRoutes(page, newWalkMock({ drop: "new", answer: "parts-table" }), "bob");
  // Registered AFTER the walk routes, so it wins for this path only.
  await page.route("**/version.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(servedSha === null ? {} : { git_sha: servedSha, built_at: "2026-10-11T00:00:00Z" }),
    }),
  );
  await page.goto("/");
  await expect(page.locator("[data-build-stamp-ui]").first()).toBeVisible({ timeout: 30_000 });
}

test("stale: a served sha that differs from this bundle's shows the pill, naming both", async ({ page }) => {
  await open(page, OTHER_SHA);
  const pill = page.locator("[data-stale-bundle]");
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await expect(pill).toHaveAttribute("data-stale-served", OTHER_SHA);
  await expect(pill).toHaveAttribute("data-stale-mine", STALE_TEST_BUNDLE_SHA);
});

test("stale: the same sha shows no pill", async ({ page }) => {
  await open(page, STALE_TEST_BUNDLE_SHA);
  // The check is one fetch at opening; give it ample time to have run, then assert absence.
  await page.waitForTimeout(4000);
  await expect(page.locator("[data-stale-bundle]")).toHaveCount(0);
});

test("stale: a version.json with no sha is undecidable, not stale (no pill)", async ({ page }) => {
  await open(page, null);
  await page.waitForTimeout(4000);
  await expect(page.locator("[data-stale-bundle]")).toHaveCount(0);
});

function routeVersion(page: import("@playwright/test").Page, sha: string) {
  return page.route("**/version.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({ git_sha: sha, built_at: "2026-10-11T00:00:00Z" }),
    }),
  );
}

test("stale: FLIP - a roll after load shows the pill on window focus, with no reload", async ({ page }) => {
  await open(page, STALE_TEST_BUNDLE_SHA);
  await page.waitForTimeout(2000);
  await expect(page.locator("[data-stale-bundle]")).toHaveCount(0);
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  await page.unroute("**/version.json");
  await routeVersion(page, OTHER_SHA);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const pill = page.locator("[data-stale-bundle]");
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await expect(pill).toHaveAttribute("data-stale-served", OTHER_SHA);
  await expect(pill).toHaveAttribute("data-stale-refused", "false");
  await expect(pill).toContainText("reload to update");
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
});

test("stale: FLIP - the 5-minute interval re-check shows the pill", async ({ page }) => {
  await page.clock.install();
  await open(page, STALE_TEST_BUNDLE_SHA);
  await page.waitForTimeout(2000);
  await expect(page.locator("[data-stale-bundle]")).toHaveCount(0);
  await page.unroute("**/version.json");
  await routeVersion(page, OTHER_SHA);
  await page.clock.fastForward(300_000);
  const pill = page.locator("[data-stale-bundle]");
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await expect(pill).toHaveAttribute("data-stale-refused", "false");
});
