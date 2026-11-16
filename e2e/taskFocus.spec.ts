/**
 * A task opened from the answers list is drawn WHOLE and CENTRED on the stage, with the canvas bar
 * at the bottom (demo blocker, rehearsal on ui 6a441d9, 2026-11-15).
 *
 * The rehearsal shapes, both `grouped_review` ("Disposition review" in the served /task_kinds):
 *   - PCN#20210316000.1 with ONE part: the stage was empty, the bar floated mid-stage.
 *   - PCN-2683 with 402 parts: the card was clipped at the top-left, the bar floated mid-stage.
 *
 * The cause (reproduced here, red on 6a441d9, on 4cbe5e8 before 0.4.87, and on 52cc9a6): the card selects
 * its first row on mount and called `scrollIntoView({block:"nearest"})` (16c3e90, 10-27) while the camera
 * was still travelling. With that row past the stage's bottom-right edge, the browser scrolled every
 * scrollable ancestor, the overflow:hidden stage root and scroller included: a scroll the viewer cannot
 * undo. Before fb8f58f the root moved, so the bar rode up; since, the inner scroller moves, so the card
 * alone is displaced (98 px to 7576 px measured: clipped, or off the stage entirely).
 *
 * Real app, real fetches, a route table: /me/queue serves the task rows, /reviews/{wf}/batch their
 * batches (fetched lazily when the card is selected, after BATCH_MS), /notices/{id}/provenance a page
 * per 40 parts, /task_kinds the rev-165 capture. jsdom cannot see this fault (no layout, and no
 * scrollIntoView), so this runs in Chromium, by hand: `npx playwright test e2e/taskFocus.spec.ts`.
 * CI runs no Playwright; the CI tripwires are src/lib/noScrollIntoView.census.test.ts,
 * src/lib/scrollWithinPane.test.ts and GlobalCanvasStage.scrollPin.test.tsx.
 * `TF_TRACE=1` logs every scrollIntoView call with its target's rect and the ancestors it scrolled.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page, type Route } from "@playwright/test";
import { API_HOST, AUTH_HOST, KNOWN_UNSERVED, seedFakeOidcSession } from "./fridayRoutes";

const CAPTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/captures");
const VIEWER = "alice@example.com";
/** Under the camera's 620 ms transition, so the first row is selected mid-flight. */
const BATCH_MS = 300;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
};
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });

interface Case {
  label: string;
  notice: string;
  parts: number;
  wf: string;
  title: string;
  /** Parts with an uncertain MPN. They put the "N unverified" badge on the card's title row, which
   *  takes width from the title: the case where a truncating title lost the notice number. */
  unverified: number;
}
const CASES: Case[] = [
  { label: "one part", notice: "PCN#20210316000.1", parts: 1, wf: "wf-pcn-20210316000-1", title: "PCN#20210316000.1 disposition review", unverified: 1 },
  { label: "402 parts", notice: "PCN-2683", parts: 402, wf: "wf-pcn-2683", title: "PCN-2683 disposition review", unverified: 12 },
];

/** The rest of the viewer's queue: the rehearsal queue was long, and the fault needs the stage's world to
 *  reach past the focused card (right and below), or the browser clamps the stray scroll back to 0. */
const FILL: Case[] = Array.from({ length: 24 }, (_, i) => ({
  label: `filler ${i}`,
  notice: `PCN-F${String(i).padStart(3, "0")}`,
  parts: 3 + (i % 5),
  wf: `wf-fill-${i}`,
  title: `PCN-F${String(i).padStart(3, "0")} disposition review`,
  unverified: i % 3,
}));
const QUEUE: Case[] = [...FILL.slice(0, FILL.length >> 1), ...CASES, ...FILL.slice(FILL.length >> 1)];

function row(c: Case, i: number) {
  return {
    id: `row-${c.wf}`,
    kind: "grouped_review",
    task_id: `task-${c.wf}`,
    workflow_id: c.wf,
    audience: VIEWER,
    status: "pending",
    title: c.title,
    summary: `${c.parts} affected part(s) on ${c.notice}`,
    requested_by: "svc:doc-tools",
    subject_ref: c.notice,
    payload: {},
    created_at: 1_763_000_000_000 + i * 1000,
  };
}

function batch(c: Case) {
  return {
    batch_id: `task-${c.wf}`,
    notice_id: c.notice,
    notice_type: "PCN",
    notice_fingerprint: `fp-${c.wf}`,
    approver: VIEWER,
    items: Array.from({ length: c.parts }, (_, k) => ({
      mpn: `FJ33300${String(13 + k).padStart(3, "0")}`,
      proposed_disposition: "accept",
      needs_review: k < c.unverified,
    })),
  };
}

const PAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100">' +
  '<rect width="850" height="1100" fill="#fff"/><text x="60" y="80" font-size="28">notice page</text></svg>';
const PER_PAGE = 40;

/** One provenance record per part, PER_PAGE to a page, each with a box: the in-card source pane draws
 *  the page image (max-h 70vh), so the card GROWS after the camera has framed it. */
function provenance(c: Case) {
  return {
    notice_id: c.notice,
    page_image_url: null,
    items: Array.from({ length: c.parts }, (_, k) => {
      const page = 1 + Math.floor(k / PER_PAGE);
      const y = 120 + (k % PER_PAGE) * 24;
      return {
        field_path: "affected_parts[].mpn",
        mpn: `FJ33300${String(13 + k).padStart(3, "0")}`,
        value: `FJ33300${String(13 + k).padStart(3, "0")}`,
        source_snippet: "",
        page_number: page,
        bboxes: [[60, y, 300, y + 18]],
        page_dims: { width: 850, height: 1100 },
        region: "table",
        match_method: "unique",
        match_confidence: 1,
        needs_review: false,
        review_reason: null,
        page_image_url: `http://${API_HOST}/pages/${encodeURIComponent(c.notice)}/${page}.svg`,
      };
    }),
  };
}

async function installRoutes(page: Page): Promise<{ unrouted: string[] }> {
  const out = { unrouted: [] as string[] };
  const taskKinds = (
    JSON.parse(readFileSync(path.join(CAPTURES, "2026-10-02-payload-task-kinds-rev-165-bob.json"), "utf8")) as {
      body: unknown;
    }
  ).body;
  await page.route((u) => !["localhost", API_HOST, AUTH_HOST].includes(u.hostname), (r) => r.abort());
  await page.route(
    (u) => u.hostname === API_HOST || u.hostname === AUTH_HOST,
    (r) => {
      const req = r.request();
      if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
      const u = new URL(req.url());
      out.unrouted.push(`${req.method()} ${u.host}${u.pathname}${u.search}`);
      return json(r, 599, { error: "unrouted" });
    },
  );
  await page.route(
    (u) => u.hostname === API_HOST,
    (r) => {
      const req = r.request();
      const method = req.method();
      if (method === "OPTIONS") return r.fallback();
      const u = new URL(req.url());
      const p = decodeURIComponent(u.pathname);
      if (method === "GET" && p === "/ingest/mine") return json(r, 200, { items: [], next: null });
      if (method === "GET" && p === "/me/queue") return json(r, 200, { email: VIEWER, tasks: QUEUE.map(row), delegated: null });
      if (method === "GET" && p === "/me/needs_you") return json(r, 200, { counts: {}, total: QUEUE.length, delegated: null });
      if (method === "GET" && p === "/task_kinds") return json(r, 200, taskKinds);
      const m = /^\/reviews\/([^/]+)\/batch$/.exec(p);
      if (method === "GET" && m) {
        const c = QUEUE.find((x) => x.wf === m[1]);
        // The batch arrives while the camera is still travelling, as it does over the wire.
        const send = () => (c ? json(r, 200, batch(c)) : json(r, 404, { error: "not_found" }));
        return new Promise<void>((res) => setTimeout(() => void send().then(res), BATCH_MS));
      }
      const pm = /^\/notices\/(.+)\/provenance$/.exec(p);
      if (method === "GET" && pm) {
        const c = QUEUE.find((x) => x.notice === pm[1]);
        if (!c) return json(r, 404, { error: "not_found" });
        return json(r, 200, provenance(c));
      }
      if (method === "GET" && p.startsWith("/pages/"))
        return r.fulfill({ status: 200, headers: CORS, contentType: "image/svg+xml", body: PAGE_SVG });
      if (KNOWN_UNSERVED.some((k) => k.method === method && k.match(u))) return json(r, 503, { error: "not_captured" });
      return r.fallback();
    },
  );
  return out;
}

/** Everything the order names, measured in one pass. */
/** A narrow pane's width, at which the card title must still show the whole notice number. */
const NARROW_PX = 300;

async function measure(page: Page, notice: string) {
  return page.evaluate(({ notice, NARROW_PX }) => {
    // The stage root holds the bar; before fb8f58f there is no inner scroller.
    const dockEl = document.querySelector('[data-canvas-chip="global"]')?.closest<HTMLElement>("[data-overlay]") ?? null;
    const scroller = document.querySelector<HTMLElement>("[data-stage-scroll]") ?? dockEl!.parentElement!;
    const root = dockEl!.parentElement!;
    const sameRoot = !document.querySelector("[data-stage-scroll]") || scroller.parentElement === root;
    const rr = root.getBoundingClientRect();
    const topline =
      Array.from(document.querySelectorAll("[data-review-topline]")).find(
        (t) => t.querySelector("[data-topline='notice']")?.textContent?.includes(notice),
      ) ?? null;
    const card = topline?.closest<HTMLElement>("[data-stage-card]") ?? null;
    const cr = card?.getBoundingClientRect() ?? null;
    const dock = document.querySelector('[data-canvas-chip="global"]')?.closest<HTMLElement>("[data-overlay]") ?? null;
    const dr = dock?.getBoundingClientRect() ?? null;
    // Every element that is scrolled although the viewer cannot scroll it (overflow hidden or clip on
    // the scrolled axis). A list the viewer scrolls (overflow auto) is not a fault.
    const scrolled: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const cs = getComputedStyle(el);
      const locked = (v: string) => v === "hidden" || v === "clip";
      if ((el.scrollTop && locked(cs.overflowY)) || (el.scrollLeft && locked(cs.overflowX))) {
        const tag = el.tagName.toLowerCase();
        const attrs = Array.from(el.attributes)
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => a.name)
          .join(",");
        const ov = getComputedStyle(el);
        scrolled.push(`${tag}[${attrs}] ov=${ov.overflowX}/${ov.overflowY} top=${el.scrollTop} left=${el.scrollLeft}`);
      }
    }
    const box = (r: DOMRect | null) => (r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null);
    // THE TITLE (Chris, 2026-11-16: "do not truncate a notice number in the card title").
    // On the stage the table is laid out 640 wide by FitBox, which leaves room for the whole title.
    // Measured there, the old `truncate` cut nothing, and this arm could not fail. So the table is
    // also measured at NARROW_PX, the width of a narrow pane, and then restored. Clipped means the
    // line is wider than its own box (an ellipsis or a nowrap cut), or the notice runs past the
    // table's right edge.
    const nEl = topline?.querySelector<HTMLElement>("[data-topline='notice']") ?? null;
    const tl = topline as HTMLElement | null;
    const table = tl?.closest<HTMLElement>(".glass-panel") ?? null;
    const at = (px: number | null) => {
      if (!tl || !nEl || !table) return null;
      const prev = table.style.width;
      if (px !== null) table.style.width = `${px}px`;
      const r = {
        // Layout px: the screen rect carries the stage's transform scale.
        width: table.offsetWidth,
        lineOverflow: tl.scrollWidth - tl.clientWidth,
        noticePast: Math.round(nEl.getBoundingClientRect().right - table.getBoundingClientRect().right),
      };
      table.style.width = prev;
      return r;
    };
    const title = tl && nEl && table
      ? { text: nEl.textContent ?? "", onStage: at(null)!, narrow: at(NARROW_PX)! }
      : null;
    return {
      title,
      sameRoot,
      root: box(rr),
      rootScroll: { top: root.scrollTop, left: root.scrollLeft },
      scrollerScroll: { top: scroller.scrollTop, left: scroller.scrollLeft },
      card: box(cr),
      dock: box(dr),
      scrolled,
    };
  }, { notice, NARROW_PX });
}

type M = Awaited<ReturnType<typeof measure>>;

/** The order's claim, as one list of failures (empty = whole, centred, bar at the bottom). */
function faults(m: M): string[] {
  const out: string[] = [];
  if (m.scrolled.length) out.push(`scrolled: ${m.scrolled.join(" | ")}`);
  if (!m.card) return [...out, "no card drawn"];
  const r = m.root!;
  const k = m.card;
  const d = m.dock!;
  const tol = 40;
  if (k.x < r.x - 1) out.push("card clipped at the left");
  if (k.y < r.y - 1) out.push("card clipped at the top");
  if (k.x + k.w > r.x + r.w + 1) out.push("card clipped at the right");
  if (k.y + k.h > d.y + 1) out.push("card runs under the bar");
  if (Math.abs(k.x + k.w / 2 - (r.x + r.w / 2)) > tol) out.push("card not centred horizontally");
  if (Math.abs(k.y + k.h / 2 - (r.y + (d.y - r.y) / 2)) > tol) out.push("card not centred vertically");
  if (Math.abs(d.y + d.h - (r.y + r.h)) > 1) out.push(`bar not at the stage bottom (bar bottom ${d.y + d.h}, stage bottom ${r.y + r.h})`);
  if (Math.abs(d.x - r.x) > 1) out.push(`bar clipped at the left (bar x ${d.x}, stage x ${r.x})`);
  const t = m.title;
  if (!t) out.push("no title measured");
  else
    for (const [where, w] of [["on the stage", t.onStage], [`at ${NARROW_PX}px`, t.narrow]] as const) {
      if (w.lineOverflow > 1 || w.noticePast > 1)
        out.push(`title clipped ${where}: "${t.text}" (table ${w.width}px, line overflow ${w.lineOverflow}px, notice past the edge ${w.noticePast}px)`);
    }
  // The narrow measurement must actually be narrow, or it proves nothing.
  if (t && t.narrow.width !== NARROW_PX) out.push(`narrow title measured at ${t.narrow.width}px, not ${NARROW_PX}px`);
  return out;
}

async function boot(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const routes = await installRoutes(page);
  await seedFakeOidcSession(page, VIEWER);
  if (process.env.TF_TRACE) {
    await page.addInitScript(() => {
      const orig = Element.prototype.scrollIntoView;
      const w = window as unknown as { __siv: string[] };
      w.__siv = [];
      Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
        const r = this.getBoundingClientRect();
        orig.call(this, arg);
        const scrolled: string[] = [];
        for (let el = this.parentElement; el; el = el.parentElement)
          if (el.scrollTop || el.scrollLeft) scrolled.push(`${el.tagName}${el.hasAttribute("data-stage-scroll") ? "[stage-scroll]" : ""} ${el.scrollTop}/${el.scrollLeft}`);
        w.__siv.push(`${performance.now() | 0}ms ${this.tagName} y=${r.y | 0} x=${r.x | 0} h=${r.height | 0} -> ${scrolled.join(", ") || "none"}`);
      };
    });
  }
  await page.goto("/");
  return routes;
}

/** Open a task from the answers list and let the camera settle. */
async function open(page: Page, c: Case) {
  const item = page.locator("[data-virtual-item]").filter({ hasText: c.title }).first();
  await expect(page.locator("[data-virtual-item]").first()).toBeVisible({ timeout: 20_000 });
  // The list is virtualised: walk its scroller until the row is drawn.
  for (let step = 0; step < 80 && (await item.count()) === 0; step++) {
    await page.locator("[data-answers-scroll]").evaluate((el, s) => {
      el.scrollTop = s === 0 ? 0 : el.scrollTop + el.clientHeight / 2;
    }, step);
    await page.waitForTimeout(50);
  }
  await item.scrollIntoViewIfNeeded();
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await expect(
    page.locator("[data-review-topline] [data-topline='notice']").filter({ hasText: c.notice }).first(),
  ).toBeVisible({ timeout: 10_000 });
  // The camera's transform transition (CAM_MS 620) plus the batch's arrival and the row-0 select.
  await page.waitForTimeout(1500);
  const m = await measure(page, c.notice);
  console.log(`[taskFocus] ${c.notice} ${JSON.stringify(m)}`);
  if (process.env.TF_TRACE)
    console.log(`[siv] ${JSON.stringify(await page.evaluate(() => (window as unknown as { __siv: string[] }).__siv.splice(0)))}`);
  return m;
}

for (const c of CASES) {
  test(`a ${c.label} task opened from the answers list is drawn whole and centred, the bar at the bottom (${c.notice})`, async ({
    page,
  }) => {
    const routes = await boot(page);
    // Straight from the overview, then from the first and the last task in the queue: the fault needs
    // the camera to be travelling when the card selects its first row, and from one end of the board
    // that row is past the stage's bottom-right edge, where an overflow:hidden box can still scroll.
    const seen: string[] = [];
    for (const from of [null, QUEUE[0]!, QUEUE[QUEUE.length - 1]!]) {
      if (from) await open(page, from);
      const f = faults(await open(page, c));
      seen.push(`${from ? `from ${from.notice}` : "from the overview"}: ${f.length ? f.join("; ") : "ok"}`);
    }
    console.log(`[taskFocus] ${c.notice} ${JSON.stringify(seen, null, 1)}`);
    expect(seen).toEqual(["from the overview: ok", `from ${QUEUE[0]!.notice}: ok`, `from ${QUEUE[QUEUE.length - 1]!.notice}: ok`]);
    expect(routes.unrouted).toEqual([]);
  });
}

test("iterating the tasks from the list: every one is drawn whole and centred, the bar at the bottom", async ({ page }) => {
  const routes = await boot(page);
  const walk = [...CASES, ...CASES, ...CASES.slice().reverse()];
  const seen: string[] = [];
  for (const c of walk) {
    const f = faults(await open(page, c));
    seen.push(`${c.notice}: ${f.length ? f.join("; ") : "ok"}`);
  }
  console.log(`[taskFocus] walk ${JSON.stringify(seen, null, 1)}`);
  expect(seen).toEqual(walk.map((c) => `${c.notice}: ok`));
  expect(routes.unrouted).toEqual([]);
});
