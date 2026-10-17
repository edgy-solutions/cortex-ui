/**
 * The PCN chain (drop -> promote -> ask) as functions over a Playwright `Page`.
 *
 * Two consumers drive the SAME functions: `pcnWalk.live.spec.ts` (the deployed sandbox, run by Lane 1
 * after every roll) and `pcnWalk.mock.spec.ts` (the dev server with mocked routes, which proves the
 * selectors offline). Nothing here knows which one it is in.
 *
 * Selectors come from the source, data-* first (src/components/ingest/*, ApprovalTask/ApprovalTaskCard,
 * ApprovalTask/PromotionReviewCard + PdfEvidencePane,
 * InstancesByProperty/InstancesByPropertyView, ingest/ProvenanceFloorLabel). Every step records
 * `{step, status, detail, ms}` and takes a screenshot.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { Page, Locator } from "@playwright/test";
import { WALK_PERSONAS, type WalkPersona } from "./walkPersona";

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
  /** The app's origin (WALK_BASE_URL). login() will not call the app ready on any other origin. */
  baseURL?: string;
  /** Directory for screenshots. */
  outDir: string;
  /** Keycloak form selectors; overridable by env in the live spec. */
  kc: { user: string; password: string; submit: string };
  timeouts: { login: number; drop: number; stage: number; promote: number; promoted: number; ask: number };
  /**
   * `WALK_REQUIRE_REVIEW=1`: the steward review FAILS where it would otherwise skip, either
   * because `/extraction` answers a plain 404 (the route is not served: 192, before 193 rolls)
   * or because the task names no ingest_id. Set it once 193 has rolled: from then on, either of
   * those is a regression, not the fleet's state.
   */
  requireReview?: boolean;
}

/**
 * Thrown by a step that does not apply to what the sandbox serves. It is recorded as `skipped`
 * with its message, never as `pass`, and the walk goes on.
 */
export class StepSkipped extends Error {}

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
      if (e instanceof StepSkipped) {
        this.results.push({ step: name, status: "skipped", detail, ms: Date.now() - t0 });
        await this.shot(page, `${name}-skipped`);
        return;
      }
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

/**
 * The app's own text input (InputBar). Present in both the HUD-pill and composer builds.
 * Scoped to `[data-ingest-composer]`, which only the app renders: a bare `form input[type="text"]`
 * also matches Keycloak's #username and made login() report a login page as "logged in".
 */
export const COMPOSER_INPUT_SELECTOR = '[data-ingest-composer] input[type="text"]';
const composerInput = (page: Page): Locator => page.locator(COMPOSER_INPUT_SELECTOR).first();

/** Keycloak's own error elements, shown when a submit re-renders the form with a 200. */
const KC_ERROR_SELECTOR = '#input-error, [id^="input-error"], .alert-error';

const originOf = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

/** The app's origin: cfg.baseURL, else WALK_BASE_URL; neither is an error, never a guess. */
function appOrigin(cfg: WalkConfig): string {
  const raw = cfg.baseURL || process.env.WALK_BASE_URL;
  const o = raw ? originOf(raw) : null;
  if (!o) throw new Error("login: no app origin to compare against (set cfg.baseURL or WALK_BASE_URL)");
  return o;
}

/**
 * Log in through the Keycloak form, or do nothing when the app is already authenticated (the
 * mock spec seeds a fake OIDC session). Flow: RequireAuth shows "Synchronize Identity" ->
 * signinRedirect -> Keycloak form -> redirect back.
 *
 * READY means something only the app renders (the composer input) AND the page is on the app's
 * origin. The return label says what actually happened: "already authenticated" only when the app
 * was ready on first sight and no Keycloak form was ever seen.
 */
export async function login(page: Page, cfg: WalkConfig, user: string, password: string): Promise<string> {
  const origin = appOrigin(cfg);
  await page.goto("/");
  const ready = composerInput(page);
  const syncBtn = page.getByRole("button", { name: /synchronize identity/i });
  const kcUser = page.locator(cfg.kc.user);
  const kcError = page.locator(KC_ERROR_SELECTOR).first();
  const deadline = Date.now() + cfg.timeouts.login;
  let clickedSync = false;
  let filledAt = 0;
  let sawForm = false;
  while (Date.now() < deadline) {
    if (originOf(page.url()) === origin && (await ready.isVisible().catch(() => false))) {
      if (filledAt) return "logged in via Keycloak form";
      if (clickedSync && !sawForm) return "logged in (SSO session)";
      if (!clickedSync && !sawForm) return "already authenticated";
      return "logged in via Keycloak form";
    }
    const formUp = await kcUser.isVisible().catch(() => false);
    if (formUp) {
      sawForm = true;
      if (!filledAt) {
        await kcUser.fill(user);
        await page.locator(cfg.kc.password).fill(password);
        await page.locator(cfg.kc.submit).click();
        filledAt = Date.now();
      } else if ((await kcError.isVisible().catch(() => false)) || Date.now() - filledAt > 5_000) {
        throw new Error("login: Keycloak re-showed the form after submit (bad credentials or realm)");
      }
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
    // PR #4 amendment 1: the composer infers the kind from extension + sniffed bytes and asks only
    // on ambiguity. A real PDF shows `[data-ingest-kind-inferred="pdf"]` and no picker; if the
    // picker appears instead (the bytes disagree, or an older bundle), pick `pdf` explicitly.
    const inferred = page.locator("[data-ingest-kind-inferred]");
    const picker = page.locator('[data-ingest-kind="pdf"] input');
    await inferred.or(picker).first().waitFor({ state: "visible", timeout: 10_000 });
    if (await inferred.isVisible().catch(() => false)) {
      const kind = await inferred.getAttribute("data-ingest-kind-inferred");
      if (kind !== "pdf") throw new Error(`drop (composer): kind inferred as "${kind}", expected "pdf"`);
    } else {
      await picker.click();
    }
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
    const railDup = page.locator('[data-ingest-stage="duplicate"]').first();
    if (await railDup.isVisible().catch(() => false)) {
      walk.dropOutcome = "duplicate";
      return `ui=${ui}; duplicate: rail entry badge`;
    }
    const card = page.locator("[data-ingest-id]").filter({ has: page.locator("[data-ingest-status]") }).first();
    if (ui === "composer") await openIngestEntry(page);
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

/**
 * A drop is a TURN on the answers rail; its status card is what the turn opens to. Open the newest
 * ingest entry when no card is on screen (the card carries the `data-ingest-id` and status the
 * readers below use). Returns whether a card is showing.
 */
export async function openIngestEntry(page: Page): Promise<boolean> {
  const showing = () => page.locator("[data-ingest-id]").filter({ has: page.locator("[data-ingest-status]") }).first().isVisible().catch(() => false);
  if (await showing()) return true;
  const entry = page.locator("[data-virtual-item]").filter({ has: page.locator("[data-ingest-stage]") }).first();
  if (!(await entry.isVisible().catch(() => false))) return false;
  await entry.click().catch(() => undefined);
  return showing();
}

/** Alice's ingest card reaches `stage` (the card polls every 2 s). */
export async function waitForStage(page: Page, ingestId: string | null, stage: string, timeoutMs: number): Promise<string> {
  if (!ingestId || (await page.locator(`[data-ingest-id="${ingestId}"]`).count()) === 0) await openIngestEntry(page);
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
const REVIEW_CARD = "[data-promotion-review]";

/** Open bob's Tasks panel, unless a task card is already on screen (the steward step opened it). */
async function openTasks(page: Page, timeout: number): Promise<void> {
  if (await page.locator(`${REVIEW_CARD}, [data-verb="promoted"]`).first().isVisible().catch(() => false)) return;
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
}

/**
 * Bob's card for this walk's drop. A `document_promotion` task whose payload names an ingest_id
 * draws the review card (titled by the notice id, the sha in its provenance line); one that names
 * none draws the generic card, titled "Promote document <sha>".
 */
async function findTaskCard(page: Page, walk: Walk): Promise<{ card: Locator; review: boolean; title: string }> {
  const timeout = walk.cfg.timeouts.promote;
  const id = walk.ingestId;
  const review = id ? page.locator(REVIEW_CARD).filter({ hasText: id }) : page.locator(REVIEW_CARD);
  const genericTitle = page.getByText(new RegExp(`Promote document ${esc(id ?? "sha256:")}`));
  await review.or(genericTitle).first().waitFor({ state: "visible", timeout });
  if ((await review.count()) > 0) {
    const card = review.last();
    return { card, review: true, title: (await card.locator("[data-review-title]").textContent())?.trim() ?? "" };
  }
  const withVerb = page.locator("div").filter({ has: page.locator('[data-verb="promoted"]') });
  const card = id ? withVerb.filter({ hasText: id }).last() : withVerb.last();
  return { card, review: false, title: (await genericTitle.first().textContent())?.trim() ?? "" };
}

/**
 * Step 3, the review standard's test (overnight directive 2026-10-17): bob opens the task and can
 * vet it: the notice id as the title, the extracted rows drawn, the source PDF loaded, and the
 * first row's evidence outlined on it. Nothing is clicked.
 *
 * Skipped, with the reason, in two cases unless `requireReview` is set:
 *   - the task names no ingest_id (the generic card draws);
 *   - `/extraction` answers a plain 404 (the route is not served: 192, before 193).
 * Every other miss fails, with the card's own words.
 */
export async function stewardReview(page: Page, walk: Walk): Promise<string> {
  const timeout = walk.cfg.timeouts.promote;
  const require = walk.cfg.requireReview === true;
  await openTasks(page, timeout);
  const { card, review, title } = await findTaskCard(page, walk);
  if (!review) {
    const why = "the task names no ingest_id, so the generic card draws: no rows, no source to vet";
    if (require) throw new Error(`steward-review: ${why}`);
    throw new StepSkipped(`skipped: ${why}`);
  }

  const rows = card.locator("[data-review-row]");
  const failed = card.locator("[data-extraction-failed]");
  await rows.first().or(failed).waitFor({ state: "visible", timeout });
  if ((await failed.count()) > 0) {
    const why = ((await failed.textContent()) ?? "").trim();
    if (!require && /not served here yet \(404\)/.test(why)) {
      throw new StepSkipped(`skipped: /extraction is not served (plain 404), expected before 193 - "${title}"`);
    }
    throw new Error(`steward-review: no rows - ${why.slice(0, 160)}`);
  }
  if ((await card.locator('[data-review-flag="no-notice-id"]').count()) > 0 || !title) {
    throw new Error(`steward-review: no notice id reached the card (title "${title.slice(0, 60)}")`);
  }
  const shaHex = (walk.ingestId ?? "").replace(/^sha256:/, "").slice(0, 8);
  if (shaHex && title.includes(shaHex)) throw new Error(`steward-review: the title is the sha ("${title.slice(0, 60)}"), not the notice id`);
  const n = await rows.count();

  const settled = card.locator('[data-pdf-state="ready"], [data-pdf-state="failed"]').first();
  try {
    await settled.waitFor({ state: "attached", timeout });
  } catch {
    throw new Error(`steward-review: ${n} rows drawn, but the source PDF did not settle in ${timeout} ms`);
  }
  if ((await settled.getAttribute("data-pdf-state")) === "failed") {
    const why = ((await card.locator("[data-pdf-failed]").first().textContent().catch(() => "")) ?? "").trim();
    throw new Error(`steward-review: ${n} rows drawn, but the source did not load - ${why.slice(0, 160)}`);
  }
  const outline = card.locator("[data-evidence-outline]");
  try {
    await outline.waitFor({ state: "visible", timeout });
  } catch {
    const flags = ((await card.locator("[data-review-flags]").textContent().catch(() => "")) ?? "").trim();
    throw new Error(`steward-review: the PDF loaded but row 1's evidence is not outlined${flags ? ` - ${flags.slice(0, 160)}` : ""}`);
  }
  const onPage = await outline.getAttribute("data-evidence-outline-page");
  const mpns = [...new Set((await card.locator('[data-cell="mpn"]').allTextContents()).map((s) => s.trim()))];
  return `"${title.slice(0, 60)}": ${n} rows (${mpns.join(", ").slice(0, 80)}), PDF ready, row 1 outlined on p${onPage}`;
}

export async function promote(page: Page, walk: Walk, reason: string): Promise<string> {
  const timeout = walk.cfg.timeouts.promote;
  await openTasks(page, timeout);
  const { card, review, title: titleText } = await findTaskCard(page, walk);
  // The review card's Promote carries no reason (Reject's code is its only reason); the generic
  // card's reason box is filled as before.
  if (!review) await card.locator("[data-reason-input]").fill(reason);
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
  return `"${titleText.slice(0, 80)}" (${review ? "review card" : "generic card"}); act promoted -> 200`;
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
      const i = document.querySelector('[data-ingest-composer] input[type="text"]') as HTMLInputElement | null;
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

// -- persona ------------------------------------------------------------------------------------

/**
 * Pick the declared persona in the PersonaPicker, then read the trigger back. bob's default is
 * DATA_STEWARD, so a walk that skips this asks as the wrong persona and answers for the wrong scope.
 * Hooks: `data-pp-trigger` (with `data-pp-active-persona` / `-domain`), `data-pp-persona`, `data-pp-domain`
 * (raw values, not the prettified text). Only `domains[0]` is clickable: the picker is single-select.
 * A role or domain the user is not offered is a FAILED step, never a skip.
 */
export async function selectPersona(page: Page, persona: WalkPersona, timeoutMs = 20_000): Promise<string> {
  const { user, role, domains } = persona;
  const domain = domains?.[0];
  if (!role || !domain) throw new Error(`walk: selectPersona called for ${user} with no role/domain declared`);
  const trigger = page.locator("[data-pp-trigger]").first();
  await trigger.waitFor({ state: "visible", timeout: timeoutMs }).catch(() => {
    throw new Error(`walk: ${user} has no persona picker within ${timeoutMs} ms (url ${page.url()}); entitlements may not have loaded`);
  });
  const attrs = (sel: string, attr: string) =>
    page.locator(sel).evaluateAll((els, a) => els.map((e) => e.getAttribute(a) ?? ""), attr);
  await trigger.click();
  await page.locator("[data-pp-persona]").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  const personas = await attrs("[data-pp-persona]", "data-pp-persona");
  if (!personas.includes(role)) {
    throw new Error(`walk: ${user} is not offered ${role}/${domain} (offered: ${personas.join(", ") || "nothing"})`);
  }
  await page.locator(`[data-pp-persona="${role}"]`).click();
  // One pickable domain closes the palette by itself; several leave it open for the domain click.
  const domainItems = await attrs("[data-pp-domain]", "data-pp-domain");
  if (domainItems.length > 0) {
    if (!domainItems.includes(domain)) {
      throw new Error(`walk: ${user} is not offered ${role}/${domain} (offered: ${domainItems.join(", ")})`);
    }
    await page.locator(`[data-pp-domain="${domain}"]`).click();
  }
  const gotRole = (await trigger.getAttribute("data-pp-active-persona")) ?? "";
  const gotDomain = (await trigger.getAttribute("data-pp-active-domain")) ?? "";
  if (gotRole !== role || gotDomain !== domain) {
    throw new Error(`walk: ${user} picked ${role}/${domain} but the picker reads ${gotRole || "-"}/${gotDomain || "-"}`);
  }
  return `${user} answers as ${gotRole}/${gotDomain}`;
}

export interface WalkPages {
  alice: Page;
  bob: Page;
  aliceCreds?: { user: string; password: string };
  bobCreds?: { user: string; password: string };
  /** Who asks and as what. Default: the row declared in walkPersona.ts. */
  asker?: WalkPersona;
}

/**
 * Steps 1-8. A `duplicate` drop passes step 1 and skips 2-5; the ask always runs. Step 3 (the
 * steward review) may itself record `skipped`, with why, and the walk goes on to promote.
 * The ask is BOB's (census: `sustainment-which-parts-does-pcn26-182-affect` = bob / SAFETY_ENGINEER /
 * SUSTAINMENT): after login he picks that persona, then asks, and steps 7-8 read his page.
 */
export async function runWalk(walk: Walk, p: WalkPages): Promise<void> {
  const { cfg } = walk;
  const a = p.aliceCreds ?? { user: "", password: "" };
  const b = p.bobCreds ?? { user: "", password: "" };
  await walk.step(p.alice, "login-alice", () => login(p.alice, cfg, a.user, a.password));
  await walk.step(p.alice, "1-drop", () => drop(p.alice, walk));

  if (walk.dropOutcome === "duplicate") {
    for (const s of ["2-extracting-review", "3-steward-review", "4-bob-promote", "5-promoted"]) {
      walk.skip(s, "skipped: duplicate - PCN is already promoted on this sandbox; the drop path works");
    }
  } else {
    await walk.step(p.alice, "2-extracting-review", () => waitForStage(p.alice, walk.ingestId, "review", cfg.timeouts.stage));
    await walk.step(p.bob, "login-bob", () => login(p.bob, cfg, b.user, b.password));
    await walk.step(p.bob, "3-steward-review", () => stewardReview(p.bob, walk));
    await walk.step(p.bob, "4-bob-promote", () =>
      promote(p.bob, walk, `Walk: ${cfg.notice} checked against the drawing register`),
    );
    await walk.step(p.alice, "5-promoted", () => waitForStage(p.alice, walk.ingestId, "promoted", cfg.timeouts.promoted));
  }

  // A duplicate drop never reached the promote path, so bob has not logged in yet.
  if (walk.dropOutcome === "duplicate") await walk.step(p.bob, "login-bob", () => login(p.bob, cfg, b.user, b.password));
  const asker = p.asker ?? WALK_PERSONAS.pcn.asker;
  if (asker.user !== "bob") throw new Error(`walk: the PCN ask runs on bob's page; the table declares ${asker.user}`);
  await walk.step(p.bob, `persona-${asker.user}`, () => selectPersona(p.bob, asker));
  await walk.step(p.bob, "6-ask", () => ask(p.bob, cfg.question));
  await walk.step(p.bob, "7-parts-table", () => assertPartsTable(p.bob, cfg));
  await walk.step(p.bob, "8-provenance", () => assertProvenance(p.bob));
}
