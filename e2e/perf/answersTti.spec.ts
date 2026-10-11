/**
 * TTI harness for the answers list at scale.
 *
 * TTI DEFINITION
 *   The clock starts at `page.goto` (navigation start; long-task timestamps share that origin).
 *   TTI is the first moment when BOTH hold:
 *     (a) the answers list shows at least one answer row (a PERF-ANS-nnnnn title is in the DOM);
 *         if the panel is not open by default it is opened first and the click's time is part of
 *         the measured interval;
 *     (b) a 2 s window follows with no `longtask` entry (PerformanceObserver registered via
 *         addInitScript, buffered).
 *   TTI is the end of the last long task before that quiet window, or the moment (a) became true
 *   if that is later. The run is capped at 90 s; a run that has not reached TTI reports ">90s".
 *   Also recorded: long-task count, total and max duration, DOM node count at TTI
 *   (document.getElementsByTagName('*').length) and the JS heap if Chromium exposes it.
 *
 * THE REAL PATH. The page is not given its data by a hook. A react-oidc-context user is seeded in
 * sessionStorage (so `auth.user.access_token` is non-null), and `**\/electric/shape` is routed to a
 * synthetic Electric shape log, so the real ShapeStream -> rowToArtifact -> electricUpsertArtifact
 * path runs. Every other call to the (reserved-TLD) API host is answered with a minimal 200.
 *
 * ENV: PERF_N="1000,10000"  PERF_RUNS=3  PERF_LABEL=before  PERF_SUMMARY_ONLY=1
 *      PERF_OUT=e2e/perf/results-before.json
 * A (label, N) entry in PERF_OUT is replaced on each run; other entries are kept.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test, type Page, type Route } from "@playwright/test";
import { buildRows, medianRowBytes, PERF_PREFIX, PERF_USER, SCHEMA } from "./syntheticAnswers";

const API_HOST = "api.perf.test";
const AUTH_HOST = "auth.perf.test";
const REALM_URL = `http://${AUTH_HOST}/realms/cortex`;
const CLIENT_ID = "cortex-ui";

const NS = (process.env.PERF_N ?? "1000,10000").split(",").map((s) => Number(s.trim()));
const RUNS = Number(process.env.PERF_RUNS ?? "3");
const LABEL = process.env.PERF_LABEL ?? "before";
const SUMMARY_ONLY = process.env.PERF_SUMMARY_ONLY === "1";
const OUT = path.resolve(process.env.PERF_OUT ?? `e2e/perf/results-${LABEL}.json`);
const CAP_MS = Number(process.env.PERF_CAP_MS ?? "90000");
const QUIET_MS = 2_000;

const TASK_KINDS = (
  JSON.parse(readFileSync(path.resolve("sessions/2026-10-02-payload-task-kinds-rev-165-bob.json"), "utf8")) as { body: unknown }
).body;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
};

interface LongTask {
  start: number;
  end: number;
}

interface RunResult {
  run: number;
  n: number;
  ttiMs: number | null;
  ttiLabel: string;
  rowSeenMs: number | null;
  /** When Electric's client held the parsed snapshot (Response.json() of /electric/shape resolved). */
  firstBatchMs: number | null;
  /** When the shape response body finished arriving (wire), before parsing. */
  bodyMs: number | null;
  panelOpenClickMs: number | null;
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  domNodes: number | null;
  jsHeapMB: number | null;
  registerPosts: number;
  notes: string[];
}

async function seedOidc(page: Page) {
  await page.addInitScript(
    ({ key, sub }) => {
      const user = {
        access_token: "perf-not-a-real-token",
        token_type: "Bearer",
        scope: "openid",
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        profile: { sub, email: sub, iss: "http://auth.perf.test/realms/cortex", aud: "cortex-ui", exp: 4102444800, iat: 1 },
      };
      sessionStorage.setItem(key, JSON.stringify(user));
    },
    { key: `oidc.user:${REALM_URL}:${CLIENT_ID}`, sub: PERF_USER },
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: Array<{ start: number; end: number }>; __rowSeen: number | null; __batchAt: number | null; __bodyAt: number | null };
    w.__batchAt = null;
    w.__bodyAt = null;
    // Separates wire (fetch + JSON parse) from our work: stamped when the shape body is parsed,
    // i.e. when the Electric client is about to hand the rows to subscribers. Patches a built-in only.
    const origText = Response.prototype.text;
    Response.prototype.text = function (this: Response) {
      return origText.call(this).then((v: string) => {
        if (w.__bodyAt == null && this.url.includes("/electric/shape") && v.length > 20_000) w.__bodyAt = performance.now();
        return v;
      });
    };
    // parse done: the Electric client holds the messages and is about to call subscribers
    const origParse = JSON.parse;
    JSON.parse = function (text: string, reviver?: (k: string, v: unknown) => unknown) {
      const v = origParse.call(JSON, text, reviver);
      if (w.__batchAt == null && w.__bodyAt != null && Array.isArray(v) && v.length > 20) w.__batchAt = performance.now();
      return v;
    } as typeof JSON.parse;
    w.__lt = [];
    w.__rowSeen = null;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push({ start: e.startTime, end: e.startTime + e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* longtask unsupported: the run will report zero tasks and say so */
    }
    // Condition (a): a list row is in the DOM. Cheap probe, every 50 ms, stops at first hit.
    const timer = setInterval(() => {
      if (document.body && document.body.textContent && document.body.textContent.includes("PERF-ANS-")) {
        w.__rowSeen = performance.now();
        clearInterval(timer);
      }
    }, 50);
  });
}

function shapeBody(rows: Array<Record<string, unknown>>): string {
  // Electric shape-log: insert messages, then the up-to-date control.
  const msgs = rows.map((r) => ({ key: `"public"."answer_artifact_projection"/"${r.id}"`, value: r, headers: { operation: "insert" } }));
  msgs.push({ headers: { control: "up-to-date" } } as never);
  return JSON.stringify(msgs);
}

const STATIC = process.env.PERF_STATIC === "1";

/** PERF_STATIC=1: the snapshot is served by a real http server, not route.fulfill (which copies 75MB through the CDP pipe). */
function serveStatic(body: string): Promise<{ url: string; close: () => void }> {
  const buf = Buffer.from(body);
  return new Promise((resolve) => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, {
        ...CORS,
        "content-type": "application/json",
        "electric-handle": "perf-handle-1",
        "electric-schema": JSON.stringify(SCHEMA),
        "electric-up-to-date": "",
        "electric-offset": "100_0",
      });
      res.end(buf);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/snap.json`, close: () => srv.close() }));
  });
}

async function routeAll(page: Page, snapshot: string, counters: { registerPosts: number; unrouted: string[] }, staticUrl?: string) {
  // Anything off-box is aborted: a font or CDN fetch must never reach the network.
  await page.route(
    (u) => !["localhost", "127.0.0.1", API_HOST, AUTH_HOST].includes(u.hostname),
    (route) => route.abort(),
  );
  await page.route(
    (u) => u.hostname === AUTH_HOST,
    (route) => route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "{}" }),
  );
  await page.route(
    (u) => u.hostname === API_HOST,
    async (route: Route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (req.method() === "OPTIONS") {
        return route.fulfill({
          status: 204,
          headers: { ...CORS, "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "*" },
        });
      }
      if (u.pathname === "/electric/shape") {
        const live = u.searchParams.get("live") === "true";
        const isAnswers = u.searchParams.get("table") === "answer_artifact_projection";
        const base = {
          ...CORS,
          "content-type": "application/json",
          "electric-handle": "perf-handle-1",
          "electric-schema": JSON.stringify(isAnswers ? SCHEMA : {}),
          "electric-up-to-date": "",
        };
        if (!live && isAnswers && staticUrl) return route.continue({ url: staticUrl });
        if (!live) {
          return route.fulfill({
            status: 200,
            headers: { ...base, "electric-offset": "100_0" },
            body: isAnswers ? snapshot : JSON.stringify([{ headers: { control: "up-to-date" } }]),
          });
        }
        // Live long-poll: park, then answer up-to-date with no rows. A closed page rejects the
        // fulfil; that is the end of the run, not a failure.
        await new Promise((r) => setTimeout(r, 20_000));
        return route
          .fulfill({
            status: 200,
            headers: { ...base, "electric-offset": "100_0", "electric-cursor": "1" },
            body: JSON.stringify([{ headers: { control: "up-to-date" } }]),
          })
          .catch(() => {});
      }
      const json = (body: unknown) => route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
      if (req.method() === "GET" && u.pathname === "/me/human_tasks") return json({ email: PERF_USER, tasks: [] });
      if (req.method() === "GET" && u.pathname === "/me/entitlements") {
        const cell = { persona: "PROGRAM_FINANCE_ANALYST", domain: "PROGRAM_FINANCE" };
        return json({ user_id: PERF_USER, email: PERF_USER, cells: [cell], default: cell, source: "topaz" });
      }
      if (req.method() === "GET" && u.pathname === "/task_kinds") return json(TASK_KINDS);
      if (req.method() === "POST" && u.pathname === "/register_frontend_capabilities") counters.registerPosts += 1;
      else if (!["/health", "/fleet/version", "/plan/state_version", "/me/canvases", "/mesh/config"].includes(u.pathname))
        counters.unrouted.push(`${req.method()} ${u.pathname}`);
      return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "{}" });
    },
  );
}

/** First t >= rowSeen such that no long task starts in [t, t + QUIET_MS); t advances past tasks. */
function computeTti(tasks: LongTask[], rowSeen: number): { tti: number; settledBy: number } {
  const sorted = [...tasks].sort((a, b) => a.start - b.start);
  let t = rowSeen;
  for (const task of sorted) {
    if (task.end <= t) continue;
    if (task.start >= t + QUIET_MS) break;
    t = task.end;
  }
  return { tti: t, settledBy: t + QUIET_MS };
}

async function oneRun(page: Page, n: number, run: number): Promise<RunResult> {
  const notes: string[] = [];
  const wall0 = Date.now();
  let crashedAt = null as number | null;
  page.on("crash", () => {
    crashedAt = Date.now() - wall0;
  });
  await page.goto("/", { waitUntil: "commit" });

  const ev = <T,>(fn: () => T, ms = 5_000): Promise<T | undefined> =>
    Promise.race([page.evaluate(fn).catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

  let panelOpenClickMs: number | null = null;
  let rowSeen: number | null = null;
  let tti: number | null = null;
  let ttiLabel = ">90s";
  let openTried = false;

  while (Date.now() - wall0 < CAP_MS) {
    await new Promise((r) => setTimeout(r, 250));
    if (crashedAt != null) {
      ttiLabel = `>90s (renderer crashed at ${Math.round(crashedAt)}ms)`;
      notes.push(ttiLabel);
      break;
    }
    const state = await ev(() => {
      const w = window as unknown as { __lt: LongTask[]; __rowSeen: number | null };
      return { lt: w.__lt ?? [], rowSeen: w.__rowSeen, now: performance.now() };
    });
    if (!state) continue; // main thread busy: that is the finding, keep waiting up to the cap
    if (state.rowSeen == null) {
      // Condition (a) not met. If the panel is closed by default, open it once and include the click.
      if (!openTried && state.now > 8_000) {
        openTried = true;
        const opener = page.getByRole("button", { name: /answers/i }).first();
        if (await opener.isVisible().catch(() => false)) {
          panelOpenClickMs = (await ev(() => performance.now())) ?? null;
          await opener.click({ timeout: 2_000 }).catch(() => notes.push("open click failed"));
        } else notes.push("panel not open and no opener found");
      }
      continue;
    }
    rowSeen = state.rowSeen;
    const c = computeTti(state.lt, rowSeen);
    if (state.now >= c.settledBy) {
      tti = c.tti;
      ttiLabel = `${Math.round(c.tti)}ms`;
      break;
    }
  }

  const final = await ev(() => {
    const w = window as unknown as { __lt: LongTask[]; __batchAt: number | null; __bodyAt: number | null };
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      batchAt: w.__batchAt,
      bodyAt: w.__bodyAt,
      lt: w.__lt ?? [],
      dom: document.getElementsByTagName("*").length,
      heap: mem ? mem.usedJSHeapSize / 1048576 : null,
    };
  }, 15_000);
  const lts = (final?.lt ?? []).filter((t) => tti == null || t.start <= tti + QUIET_MS);
  if (!final) notes.push("final evaluate timed out (main thread saturated)");
  if (tti == null) {
    await page.screenshot({ path: `test-results/perf-n${n}-run${run}.png`, timeout: 10_000 }).catch(() => {});
    notes.push(`body: ${((await ev(() => document.body.innerText.slice(0, 200))) ?? "").replace(/s+/g, " ")}`);
  }
  return {
    run,
    n,
    ttiMs: tti == null ? null : Math.round(tti),
    ttiLabel,
    rowSeenMs: rowSeen == null ? null : Math.round(rowSeen),
    bodyMs: final?.bodyAt == null ? null : Math.round(final.bodyAt),
    firstBatchMs: final?.batchAt == null ? null : Math.round(final.batchAt),
    panelOpenClickMs: panelOpenClickMs == null ? null : Math.round(panelOpenClickMs),
    longTaskCount: lts.length,
    longTaskTotalMs: Math.round(lts.reduce((s, t) => s + (t.end - t.start), 0)),
    longTaskMaxMs: Math.round(lts.reduce((m, t) => Math.max(m, t.end - t.start), 0)),
    domNodes: final?.dom ?? null,
    jsHeapMB: final?.heap == null ? null : Math.round(final.heap),
    registerPosts: 0,
    notes,
  };
}

const median = (xs: Array<number | null>): number | string => {
  if (xs.some((x) => x == null)) return ">90s";
  const s = (xs as number[]).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

for (const n of NS) {
  test(`answers TTI ${LABEL} N=${n}${SUMMARY_ONLY ? " summary-only" : ""}`, async ({ browser }) => {
    const rows = buildRows({ n, summaryOnly: SUMMARY_ONLY });
    const snapshot = shapeBody(rows);
    const medianBytes = medianRowBytes(rows);
    const runs: RunResult[] = [];
    const stat = STATIC ? await serveStatic(snapshot) : null;
    for (let i = 1; i <= RUNS; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const counters = { registerPosts: 0, unrouted: [] as string[] };
      page.on("pageerror", (e) => counters.unrouted.push(`pageerror: ${String(e.stack).replace(/s+/g, " ").slice(0, 600)}`));
      page.on("console", (m) => { if (m.type() === "error") counters.unrouted.push(`console.error: ${m.text().slice(0, 160)}`); });
      await seedOidc(page);
      await routeAll(page, snapshot, counters, stat?.url);
      const r = await oneRun(page, n, i);
      r.registerPosts = counters.registerPosts;
      if (counters.unrouted.length) r.notes.push(`unrouted: ${[...new Set(counters.unrouted)].join(", ")}`);
      runs.push(r);
      console.log(`[perf] ${LABEL} N=${n} run ${i}: TTI ${r.ttiLabel}, longtasks ${r.longTaskCount} (max ${r.longTaskMaxMs}ms), dom ${r.domNodes}, heap ${r.jsHeapMB}MB, registerPOSTs ${r.registerPosts} ${r.notes.join("; ")}`);
      await context.close().catch(() => {});
      if (r.ttiMs == null) {
        // A saturated page can take the browser down with it; one unreached run is the answer.
        console.log(`[perf] ${LABEL} N=${n}: run ${i} did not reach TTI in the cap; remaining runs skipped`);
        break;
      }
    }
    stat?.close();
    const entry = {
      n,
      summaryOnly: SUMMARY_ONLY,
      rowCount: rows.length,
      medianRowBytes: medianBytes,
      median: {
        ttiMs: median(runs.map((r) => r.ttiMs)),
        longTaskMaxMs: median(runs.map((r) => r.longTaskMaxMs)),
        longTaskCount: median(runs.map((r) => r.longTaskCount)),
        longTaskTotalMs: median(runs.map((r) => r.longTaskTotalMs)),
        domNodes: median(runs.map((r) => r.domNodes)),
        jsHeapMB: median(runs.map((r) => r.jsHeapMB)),
        firstBatchMs: median(runs.map((r) => r.firstBatchMs)),
        bodyMs: median(runs.map((r) => r.bodyMs)),
      },
      firstRun: runs[0],
      runs,
    };
    const file = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, unknown>) : {};
    file[`${LABEL}${SUMMARY_ONLY ? "-summary" : ""}:N=${n}`] = entry;
    writeFileSync(OUT, JSON.stringify(file, null, 2));
    void PERF_PREFIX;
  });
}
