/**
 * The PCN chain (drop -> promote -> ask) as functions over a Playwright `Page`.
 *
 * Two consumers drive the SAME functions: `pcnWalk.live.spec.ts` (the deployed sandbox, run by Lane 1
 * after every roll) and `pcnWalk.mock.spec.ts` (the dev server with mocked routes, which proves the
 * selectors offline). Nothing here knows which one it is in.
 *
 * Selectors come from the source, data-* first (src/components/ingest/*, ApprovalTask/ApprovalTaskCard,
 * InstancesByProperty/InstancesByPropertyView, ingest/ProvenanceFloorLabel). Every step records
 * `{step, status, detail, ms}` and takes a screenshot.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { Page, Locator } from "@playwright/test";

export type StepStatus = "pass" | "fail" | "skipped";
export interface StepResult {
  step: string;
  status: StepStatus;
  detail: string;
  ms: number;
}
export type DropUi = "composer" | "hud-pill";
export type DropOutcome = "received" | "duplicate";

export interface WalkConfig {
  notice: string;
  expectParts: string[];
  /** Path of the PCN PDF on disk (the bytes the sandbox already knows decide `duplicate`). */
  pdfPath: string;
  question: string;
  /** Directory for screenshots. */
  outDir: string;
  /** Keycloak form selectors; overridable by env in the live spec. */
  kc: { user: string; password: string; submit: string };
  timeouts: { login: number; drop: number; stage: number; promote: number; promoted: number; ask: number };
}

export const DEFAULT_KC = { user: "#username", password: "#password", submit: "#kc-login" };

export const defaultQuestion = (notice: string) => `which parts does ${notice} affect`;

export class Walk {
  readonly results: StepResult[] = [];
  dropUi: DropUi | null = null;
  dropOutcome: DropOutcome | null = null;
  ingestId: string | null = null;
  private shotN = 0;
  readonly cfg: WalkConfig;
  constructor(cfg: WalkConfig) {
    this.cfg = cfg;
    mkdirSync(cfg.outDir, { recursive: true });
  }

  async shot(page: Page, label: string): Promise<void> {
    const f = path.join(this.cfg.outDir, `${String(++this.shotN).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "-")}.png`);
    await page.screenshot({ path: f, fullPage: true }).catch(() => undefined);
  }

  /** Run one step: pass with the returned detail, or fail with the thrown message (and rethrow). */
  async step(page: Page, name: string, fn: () => Promise<string>): Promise<void> {
    const t0 = Date.now();
    try {
      const detail = await fn();
      this.results.push({ step: name, status: "pass", detail, ms: Date.now() - t0 });
      await this.shot(page, `${name}-pass`);
    } catch (e) {
      const detail = e instanceof Error ? e.message.split("\n")[0]! : String(e);
      this.results.push({ step: name, status: "fail", detail, ms: Date.now() - t0 });
      await this.shot(page, `${name}-FAIL`);
      throw e;
    }
  }

  skip(name: string, detail: string): void {
    this.results.push({ step: name, status: "skipped", detail, ms: 0 });
  }

  get failed(): boolean {
    return this.results.some((r) => r.status === "fail");
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// -- login --------------------------------------------------------------------------------------

/** The app's own text input (InputBar). Present in both the HUD-pill and composer builds. */
const composerInput = (page: Page): Locator => page.locator('form input[type="text"]').first();

/**
 * Log in through the Keycloak form, or do nothing when the app is already authenticated (the
 * mock spec seeds a fake OIDC session). Flow: RequireAuth shows "Synchronize Identity" ->
 * signinRedirect -> Keycloak form -> redirect back.
 */
export async function login(page: Page, cfg: WalkConfig, user: string, password: string): Promise<string> {
  await page.goto("/");
  const ready = composerInput(page);
  const syncBtn = page.getByRole("button", { name: /synchronize identity/i });
  const kcUser = page.locator(cfg.kc.user);
  const deadline = Date.now() + cfg.timeouts.login;
  let clickedSync = false;
  let filled = false;
  while (Date.now() < deadline) {
    if (await ready.isVisible().catch(() => false)) {
      return filled ? "logged in via Keycloak form" : clickedSync ? "logged in (SSO session)" : "already authenticated";
    }
    if (!filled && (await kcUser.isVisible().catch(() => false))) {
      await kcUser.fill(user);
      await page.locator(cfg.kc.password).fill(password);
      await page.locator(cfg.kc.submit).click();
      filled = true;
    } else if (!clickedSync && (await syncBtn.isVisible().catch(() => false))) {
      clickedSync = true;
      await syncBtn.click();
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`login: the app did not become ready within ${cfg.timeouts.login} ms (url ${page.url()})`);
}

// -- drop ---------------------------------------------------------------------------------------

/** Which drop UI is deployed: the composer's paperclip (PR #4) or the HUD pill (master). */
export async function detectDropUi(page: Page, timeoutMs = 15_000): Promise<DropUi> {
  const attach = page.locator("[data-ingest-attach]");
  const pill = page.locator("[data-ingest-trigger]");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await attach.first().isVisible().catch(() => false)) return "composer";
    if (await pill.first().isVisible().catch(() => false)) return "hud-pill";
    await page.waitForTimeout(200);
  }
  throw new Error("drop: neither [data-ingest-attach] (composer) nor [data-ingest-trigger] (HUD pill) is on the page - is VITE_FEATURES=ingest on?");
}

/**
 * Drop the PDF with kind `pdf` and wait for the outcome: `received` (a fresh ingest card) or
 * `duplicate` (HUD `[data-ingest-duplicate]` / composer `[data-ingest-turn-result="duplicate"]`).
 */
export async function drop(page: Page, walk: Walk): Promise<string> {
  const ui = await detectDropUi(page);
  walk.dropUi = ui;
  if (ui === "hud-pill") {
    await page.locator("[data-ingest-trigger]").first().click();
    await page.locator("[data-ingest-file-input]").setInputFiles(walk.cfg.pdfPath);
    await page.locator('[data-ingest-kind="pdf"]').click();
    await page.locator("[data-ingest-kind-confirm]").click();
  } else {
    await page.locator("[data-ingest-file-input]").setInputFiles(walk.cfg.pdfPath);
    await page.locator("[data-ingest-chip]").waitFor({ state: "visible", timeout: 10_000 });
    // Inline kind picker: the radio inside the label. Click it explicitly even if preselected.
    await page.locator('[data-ingest-kind="pdf"] input').click();
    await page.getByRole("button", { name: "Send" }).click();
  }

  const t = walk.cfg.timeouts.drop;
  const deadline = Date.now() + t;
  while (Date.now() < deadline) {
    const err = page.locator("[data-ingest-upload-error]").first();
    if (await err.isVisible().catch(() => false)) {
      throw new Error(`drop (${ui}): upload refused - ${(await err.textContent())?.trim()}`);
    }
    const dup = page.locator('[data-ingest-duplicate], [data-ingest-turn-result="duplicate"]').first();
    if (await dup.isVisible().catch(() => false)) {
      walk.dropOutcome = "duplicate";
      return `ui=${ui}; duplicate: ${(await dup.textContent())?.trim().slice(0, 160)}`;
    }
    const card = page.locator("[data-ingest-id]").filter({ has: page.locator("[data-ingest-status]") }).first();
    if (await card.isVisible().catch(() => false)) {
      // The duplicate notice can land between the two checks above; re-check before calling it fresh.
      if ((await page.locator("[data-ingest-duplicate]").count()) > 0) continue;
      walk.dropOutcome = "received";
      walk.ingestId = await card.getAttribute("data-ingest-id");
      const stage = await card.locator("[data-ingest-status]").first().getAttribute("data-ingest-status");
      return `ui=${ui}; stage=${stage}; ingest id ${walk.ingestId}`;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`drop (${ui}): neither an ingest card nor a duplicate notice appeared within ${t} ms`);
}

/** Alice's ingest card reaches `stage` (the card polls every 2 s). */
export async function waitForStage(page: Page, ingestId: string | null, stage: string, timeoutMs: number): Promise<string> {
  const card = ingestId ? page.locator(`[data-ingest-id="${ingestId}"]`) : page.locator("[data-ingest-id]");
  const loc = card.locator(`[data-ingest-status="${stage}"]`).first();
  try {
    await loc.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    const now = await card.locator("[data-ingest-status]").first().getAttribute("data-ingest-status").catch(() => null);
    throw new Error(`waitForStage: stage "${stage}" not reached in ${timeoutMs} ms (card shows ${now ?? "no status"})`);
  }
  const detail = await card.locator("[data-ingest-detail]").first().textContent({ timeout: 500 }).catch(() => null);
  return `stage=${stage}${detail ? `; ${detail.trim().slice(0, 120)}` : ""}`;
}

// -- promote (bob) ------------------------------------------------------------------------------

/**
 * Bob opens his task queue (the HumanTaskInboxBadge "Tasks" button jumps to the next pending task),
 * finds the document_promotion task, and acts `promoted` (NOT `approved`) with a reason.
 */
export async function promote(page: Page, walk: Walk, reason: string): Promise<string> {
  const timeout = walk.cfg.timeouts.promote;
  const tasks = page.getByRole("button", { name: /tasks/i }).first();
  await tasks.waitFor({ state: "visible", timeout });
  // The badge is disabled until a pending task has synced in.
  try {
    await page.waitForFunction(
      () => {
        const b = Array.from(document.querySelectorAll("button")).find((x) => /tasks/i.test(x.textContent ?? ""));
        return !!b && !(b as HTMLButtonElement).disabled;
      },
      undefined,
      { timeout },
    );
  } catch {
    throw new Error(`promote: bob's Tasks badge stayed disabled for ${timeout} ms - no pending task reached his queue`);
  }
  await tasks.click();

  const idPart = walk.ingestId ?? "sha256:";
  const title = page.getByText(new RegExp(`Promote document ${esc(idPart)}`)).first();
  await title.waitFor({ state: "visible", timeout });
  const titleText = (await title.textContent())?.trim() ?? "";

  const withVerb = page.locator("div").filter({ has: page.locator('[data-verb="promoted"]') });
  const card = walk.ingestId ? withVerb.filter({ hasText: walk.ingestId }).last() : withVerb.last();
  await card.locator("[data-reason-input]").fill(reason);
  const act = page.waitForResponse(
    (r) => /\/human_tasks\/[^/]+\/act$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
    { timeout },
  );
  await card.locator('[data-verb="promoted"]').click();
  const res = await act;
  if (res.status() !== 200) {
    const refusal = await page.locator("[data-act-refusal]").first().textContent({ timeout: 1000 }).catch(() => null);
    throw new Error(`promote: act returned ${res.status()}${refusal ? ` - ${refusal.trim().slice(0, 160)}` : ""}`);
  }
  return `"${titleText.slice(0, 80)}"; act promoted -> 200`;
}

// -- ask (alice) --------------------------------------------------------------------------------

export async function ask(page: Page, text: string): Promise<string> {
  // The HUD pill's slide-in is modal and overlays the canvas; close it so the answer is visible.
  const slide = page.locator("[data-ingest-slide-in]").first();
  if (await slide.isVisible().catch(() => false)) {
    await page.locator("[data-ingest-close]").first().click();
    await slide.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  }
  const input = composerInput(page);
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const i = document.querySelector('form input[type="text"]') as HTMLInputElement | null;
      return !!i && !i.disabled;
    },
    undefined,
    { timeout: 30_000 },
  );
  await input.fill(text);
  await input.press("Enter");
  return `asked "${text}"`;
}

/**
 * The answer is an INSTANCES_BY_PROPERTY table titled "Parts affected by <notice>" with one row
 * per expected part. The roll-23 regression this guards: the same question drawn as a plain
 * knowledge document (no table) because a stale menu was registered.
 */
export async function assertPartsTable(page: Page, cfg: WalkConfig, timeoutMs = cfg.timeouts.ask): Promise<string> {
  const heading = page.getByRole("heading", { name: new RegExp(`Parts affected by ${esc(cfg.notice)}`, "i") }).first();
  try {
    await heading.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    const hasTable = (await page.locator("table").count()) > 0;
    const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const mentions = body.includes(cfg.notice);
    throw new Error(
      `assertPartsTable: no parts table titled "Parts affected by ${cfg.notice}" within ${timeoutMs} ms` +
        ` (table on page: ${hasTable}; notice mentioned in text: ${mentions}).` +
        (mentions && !hasTable
          ? " This is the ROLL-23 SYMPTOM: the ask was drawn as a plain document (knowledge document) instead of an INSTANCES_BY_PROPERTY table - a stale archetype menu is registered."
          : " The answer never arrived or was drawn as something else."),
    );
  }
  const panel = page.locator("div.glass-panel").filter({ has: heading }).last();
  const rowsText = (await panel.locator("table tbody tr").allInnerTexts().catch(() => [])).join(" | ");
  const missing = cfg.expectParts.filter((p) => !rowsText.includes(p));
  if (missing.length > 0) {
    throw new Error(`assertPartsTable: table drawn but rows missing ${missing.join(", ")} (rows: ${rowsText.slice(0, 200) || "none"})`);
  }
  return `table "Parts affected by ${cfg.notice}" with rows ${cfg.expectParts.join(", ")}`;
}

/** The provenance floor chip reads `user-drop` (ProvenanceFloorLabel, `data-provenance-floor`). */
export async function assertProvenance(page: Page, expected = "user-drop", timeoutMs = 15_000): Promise<string> {
  const chip = page.locator("[data-provenance-floor]").first();
  try {
    await chip.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    const unverified = await page.locator("[data-provenance-floor-unverified]").count();
    throw new Error(
      "assertProvenance: no [data-provenance-floor] chip" +
        (unverified > 0 ? " - the UNVERIFIED banner is showing instead (the drop was never promoted, or the floor is unidentified)" : ""),
    );
  }
  const got = await chip.getAttribute("data-provenance-floor");
  if (got !== expected) throw new Error(`assertProvenance: obtained_via is "${got}", expected "${expected}"`);
  return `obtained_via: ${got}`;
}

// -- the whole chain ----------------------------------------------------------------------------

export interface WalkPages {
  alice: Page;
  bob: Page;
  aliceCreds?: { user: string; password: string };
  bobCreds?: { user: string; password: string };
}

/** Steps 1-8. A `duplicate` drop passes step 1 and skips 2-5; the ask always runs. */
export async function runWalk(walk: Walk, p: WalkPages): Promise<void> {
  const { cfg } = walk;
  const a = p.aliceCreds ?? { user: "", password: "" };
  const b = p.bobCreds ?? { user: "", password: "" };
  await walk.step(p.alice, "login-alice", () => login(p.alice, cfg, a.user, a.password));
  await walk.step(p.alice, "1-drop", () => drop(p.alice, walk));

  if (walk.dropOutcome === "duplicate") {
    for (const s of ["2-extracting-review", "3-4-bob-promote", "5-promoted"]) {
      walk.skip(s, "skipped: duplicate - PCN is already promoted on this sandbox; the drop path works");
    }
  } else {
    await walk.step(p.alice, "2-extracting-review", () => waitForStage(p.alice, walk.ingestId, "review", cfg.timeouts.stage));
    await walk.step(p.bob, "login-bob", () => login(p.bob, cfg, b.user, b.password));
    await walk.step(p.bob, "3-4-bob-promote", () =>
      promote(p.bob, walk, `Walk: ${cfg.notice} checked against the drawing register`),
    );
    await walk.step(p.alice, "5-promoted", () => waitForStage(p.alice, walk.ingestId, "promoted", cfg.timeouts.promoted));
  }

  await walk.step(p.alice, "6-ask", () => ask(p.alice, cfg.question));
  await walk.step(p.alice, "7-parts-table", () => assertPartsTable(p.alice, cfg));
  await walk.step(p.alice, "8-provenance", () => assertProvenance(p.alice));
}
