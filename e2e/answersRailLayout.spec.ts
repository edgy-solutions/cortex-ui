/**
 * Real-layout proof for the windowed ANSWERS rail (TIME view). jsdom cannot measure, so this runs
 * in Chromium. The rail is virtualised with MEASURED heights (estimates only for never-mounted
 * items); a fixed slot per row produced large empty gaps between short rows and clipped long ones.
 *
 * Seeding: the real Electric path (same synthetic shape log the perf harness uses), 40 answers,
 * every 3rd with a title long enough to wrap to 2-3 lines, every 7th long enough to wrap to 4+.
 *
 * BOUND: pre-perf (3fa6fcb^1) rows were natural height and stacked directly (no inter-row margin),
 * so the visible gap between consecutive rows' content is 0; MAX_GAP_PX = 16 is a generous cap
 * that still fails the old 76px slot (short rows are ~44px natural, so the slot leaves ~32px).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";
import { buildRows, PERF_USER, SCHEMA } from "./perf/syntheticAnswers";

const API_HOST = "api.friday.test";
const AUTH_HOST = "auth.friday.test";
const REALM_URL = `http://${AUTH_HOST}/realms/cortex`;
const MAX_GAP_PX = 16;
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
};
const TASK_KINDS = (
  JSON.parse(readFileSync(path.resolve("sessions/2026-10-02-payload-task-kinds-rev-165-bob.json"), "utf8")) as { body: unknown }
).body;

function seededRows() {
  const rows = buildRows({ n: 40, summaryOnly: true });
  rows.forEach((r, i) => {
    const base = String(r.summary);
    if (i % 7 === 0) r.summary = `${base} ${"a very long wrapping answer title that keeps going ".repeat(6)}`;
    else if (i % 3 === 0) r.summary = `${base} ${"a long wrapping answer title ".repeat(3)}`;
  });
  return rows;
}

async function setup(page: Page) {
  await page.addInitScript(
    ({ key, sub }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          access_token: "t",
          token_type: "Bearer",
          scope: "openid",
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          profile: { sub, email: sub, iss: "http://auth.friday.test/realms/cortex", aud: "cortex-ui", exp: 4102444800, iat: 1 },
        }),
      );
    },
    { key: `oidc.user:${REALM_URL}:cortex-ui`, sub: PERF_USER },
  );
  const rows = seededRows();
  const msgs: unknown[] = rows.map((r) => ({ key: `"public"."answer_artifact_projection"/"${r.id}"`, value: r, headers: { operation: "insert" } }));
  msgs.push({ headers: { control: "up-to-date" } });
  const snapshot = JSON.stringify(msgs);
  await page.route((u) => !["localhost", "127.0.0.1", API_HOST, AUTH_HOST].includes(u.hostname), (r) => r.abort());
  await page.route((u) => u.hostname === AUTH_HOST, (r) => r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "{}" }));
  await page.route(
    (u) => u.hostname === API_HOST,
    async (route: Route) => {
      const req = route.request();
      const u = new URL(req.url());
      const json = (b: unknown) => route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(b) });
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "*" } });
      if (u.pathname === "/electric/shape") {
        const isAnswers = u.searchParams.get("table") === "answer_artifact_projection";
        const base = { ...CORS, "content-type": "application/json", "electric-handle": "h1", "electric-schema": JSON.stringify(isAnswers ? SCHEMA : {}), "electric-up-to-date": "" };
        if (u.searchParams.get("live") === "true") {
          await new Promise((r) => setTimeout(r, 20_000));
          return route.fulfill({ status: 200, headers: { ...base, "electric-offset": "100_0", "electric-cursor": "1" }, body: JSON.stringify([{ headers: { control: "up-to-date" } }]) }).catch(() => {});
        }
        return route.fulfill({ status: 200, headers: { ...base, "electric-offset": "100_0" }, body: isAnswers ? snapshot : JSON.stringify([{ headers: { control: "up-to-date" } }]) });
      }
      if (u.pathname === "/me/human_tasks") return json({ email: PERF_USER, tasks: [] });
      if (u.pathname === "/me/entitlements") {
        const cell = { persona: "PROGRAM_FINANCE_ANALYST", domain: "PROGRAM_FINANCE" };
        return json({ user_id: PERF_USER, email: PERF_USER, cells: [cell], default: cell, source: "topaz" });
      }
      if (u.pathname === "/task_kinds") return json(TASK_KINDS);
      return json({});
    },
  );
}

interface Box { key: string; top: number; bottom: number; contentTop: number; contentBottom: number; clipped: boolean }

async function boxes(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-virtual-item]")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const c = (el.firstElementChild as HTMLElement).getBoundingClientRect();
        return {
          key: el.dataset.vkey ?? "",
          top: r.top,
          bottom: r.bottom,
          contentTop: c.top,
          contentBottom: c.bottom,
          clipped: el.scrollHeight > el.clientHeight + 1 || c.bottom > r.bottom + 1 || c.top < r.top - 1,
        };
      })
      .sort((a, b) => a.top - b.top),
  );
}

async function assertLayout(page: Page, label: string) {
  // let measurement settle (RO -> version bump -> re-render)
  await page.waitForTimeout(400);
  const bs = await boxes(page);
  expect(bs.length, `${label}: items mounted`).toBeGreaterThan(3);
  let maxGap = 0;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!;
    expect(b.clipped, `${label}: item ${b.key} content is clipped by its slot`).toBe(false);
    const n = bs[i + 1];
    if (!n) continue;
    expect(n.top, `${label}: ${b.key} overlaps ${n.key}`).toBeGreaterThanOrEqual(b.bottom - 1);
    if (!b.key.startsWith("day:") && !n.key.startsWith("day:")) {
      const gap = n.contentTop - b.contentBottom;
      maxGap = Math.max(maxGap, gap);
      expect(gap, `${label}: gap between ${b.key} and ${n.key} is ${gap.toFixed(1)}px > ${MAX_GAP_PX}`).toBeLessThanOrEqual(MAX_GAP_PX);
    }
  }
  console.log(`${label}: ${bs.length} items, max row gap ${maxGap.toFixed(1)}px`);
}

test("answers rail: measured rows, no big gaps, no clipping, no overlap", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  const scroll = page.locator("[data-answers-scroll]");
  if (!(await scroll.isVisible({ timeout: 10_000 }).catch(() => false))) {
    await page.getByRole("button", { name: /answers/i }).first().click();
  }
  await expect(page.locator("[data-virtual-item][data-vkey^='perf-']").first()).toBeVisible({ timeout: 30_000 });
  await assertLayout(page, "top");
  const sizes = await page.evaluate(() => {
    const m: Record<string, number[]> = {};
    for (const el of document.querySelectorAll<HTMLElement>("[data-virtual-item]")) {
      const k = el.dataset.vkey!.startsWith("day:") ? "day" : "row";
      (m[k] ??= []).push(el.offsetHeight);
    }
    return m;
  });
  console.log("natural heights", JSON.stringify(sizes));
  const total = await scroll.evaluate((e) => e.scrollHeight - e.clientHeight);
  await scroll.evaluate((e, y) => (e.scrollTop = y), Math.floor(total / 2));
  await assertLayout(page, "middle");
  await scroll.evaluate((e) => (e.scrollTop = e.scrollHeight));
  await assertLayout(page, "end");
});
