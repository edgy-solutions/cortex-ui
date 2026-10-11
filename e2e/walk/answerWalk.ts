/**
 * The HAZ and FRACAS walks (both asked as bob) and the stale-tab check, as functions over a Page.
 * Same shape as pcnWalk.ts: the live spec and the mock spec drive these SAME functions.
 *
 * WHAT THE TWO ANSWER WALKS ASSERT
 * The architect has not ruled what these answers should be, so each step asserts only what is
 * certain. PASS is a card or a NAMED refusal. FAIL is an abstain, a not-grounded answer, a failed
 * attempt, or nothing arriving. `classifyAnswer` is pure over a DOM snapshot, so the mock spec can
 * mutate its detectors.
 *
 * DOM MARKERS (data-* first)
 *   refusal         [data-refusal][data-refusal-outcome]        RefusalCard.tsx
 *   abstain         [data-ask-abstained]                        elicitation/AskCard.tsx
 *   not grounded    [data-fallback-disclosure] (+ -reason)      AgenticCanvas/AnswerBody.tsx
 *   failed attempt  [data-attempt-failed]                       AgenticCanvas/AttemptFailed.tsx
 *   TEXT FALLBACK   /I could not find anything called/          the abstain prose; used where the
 *                   abstain is not drawn as an AskCard, so no attribute carries it.
 *   a card          NO data-* names the mounted archetype: SemanticInterpreter's per-component
 *                   wrapper carries none, and the per-archetype parity baselines freeze that DOM,
 *                   so adding one is a src change plus baseline regeneration. A card is therefore
 *                   "the new answer tile drew a heading, table or canvas and no marker above
 *                   fired". A FRACAS card is further recognised by its archetype heading
 *                   (TEXT FALLBACK): CONTRIBUTION_RANKING draws <h3>Ranking</h3>, MULTI_SERIES
 *                   draws <h3>Trends</h3>.
 */
import type { Page } from "@playwright/test";
import { ask, login, type Walk, type WalkConfig } from "./pcnWalk";
import { creds, type Env } from "./walkEnv";

export const HAZ_PROMPT = "draft a risk assessment for HAZ-1004";
export const FRACAS_PROMPT = "what failures are recorded for part 5530-184";

export type AnswerKind = "haz" | "fracas";

export interface AnswerSnapshot {
  /** `data-answer-id` of every answer tile (task cards excluded). */
  tileIds: string[];
  abstainedAttr: number;
  abstainText: number;
  disclosures: string[];
  failedAttempts: number;
  refusals: { outcome: string; reason: string }[];
  /** Per tile: the headings it drew and whether it drew a table or canvas. */
  tiles: { id: string; headings: string[]; drawsData: boolean; text: string }[];
}

export type Outcome =
  | { kind: "pending" }
  | { kind: "card"; label: string }
  | { kind: "refusal"; label: string; outcome: string; reason: string }
  | { kind: "abstain"; label: string }
  | { kind: "not-grounded"; label: string }
  | { kind: "attempt-failed"; label: string }
  | { kind: "wrong-card"; label: string };

const ABSTAIN_TEXT_SRC = "I could not find anything called";

export async function snapshot(page: Page): Promise<AnswerSnapshot> {
  return page.evaluate((abstainSrc) => {
    const q = (s: string) => Array.from(document.querySelectorAll(s));
    const tileEls = q("[data-answer-id]").filter((e) => !(e.getAttribute("data-answer-id") ?? "").startsWith("task:"));
    return {
      tileIds: tileEls.map((e) => e.getAttribute("data-answer-id") ?? ""),
      abstainedAttr: q("[data-ask-abstained]").length,
      abstainText: (document.body.innerText.match(new RegExp(abstainSrc, "gi")) ?? []).length,
      disclosures: q("[data-fallback-disclosure]").map((e) => e.getAttribute("data-fallback-reason") ?? ""),
      failedAttempts: q("[data-attempt-failed]").length,
      refusals: q("[data-refusal]").map((e) => ({
        outcome: e.getAttribute("data-refusal-outcome") ?? "",
        // The whole card text: the envelope's reason is one <p> among headline, gap and source.
        reason: ((e as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim(),
      })),
      tiles: tileEls.map((t) => ({
        id: t.getAttribute("data-answer-id") ?? "",
        headings: Array.from(t.querySelectorAll("h1,h2,h3,h4")).map((h) => (h.textContent ?? "").trim()),
        drawsData: t.querySelector("table, canvas") !== null,
        // The card's own text WITHOUT the tile's echo of the question: StageCard draws question_text
        // in an element titled with itself, and the FRACAS prompt says "failures", so leaving it in
        // lets any card pass the failures check.
        text: (() => {
          const c = t.cloneNode(true) as HTMLElement;
          c.querySelectorAll("[title]").forEach((e) => {
            if ((e.textContent ?? "").trim() === (e.getAttribute("title") ?? "").trim()) e.remove();
          });
          return (c.textContent ?? "").replace(/s+/g, " ").trim().slice(0, 4000);
        })(),
      })),
    };
  }, ABSTAIN_TEXT_SRC);
}

/** The abstain detector. Mutated in the mock spec (always false) to prove the abstain arm is guarded. */
export function detectAbstain(before: AnswerSnapshot, after: AnswerSnapshot): boolean {
  return after.abstainedAttr > before.abstainedAttr || after.abstainText > before.abstainText;
}

/** PURE. `before` is the snapshot taken just before the ask; only what is NEW after it counts. */
export function classifyAnswer(kind: AnswerKind, before: AnswerSnapshot, after: AnswerSnapshot): Outcome {
  if (detectAbstain(before, after)) return { kind: "abstain", label: "abstained (nothing was run)" };
  if (after.disclosures.length > before.disclosures.length) {
    const reason = after.disclosures[after.disclosures.length - 1] ?? "";
    return { kind: "not-grounded", label: `not grounded (fallback_reason ${reason || "none recorded"})` };
  }
  if (after.failedAttempts > before.failedAttempts) return { kind: "attempt-failed", label: "the attempt failed" };
  if (after.refusals.length > before.refusals.length) {
    const r = after.refusals[after.refusals.length - 1]!;
    if (r.outcome.trim() !== "") return { kind: "refusal", label: `named refusal "${r.outcome}"`, outcome: r.outcome, reason: r.reason };
    return { kind: "abstain", label: "a refusal with no outcome name (unnamed)" };
  }
  const fresh = after.tiles.filter((t) => !before.tileIds.includes(t.id));
  const drawn = fresh.find((t) => t.headings.length > 0 || t.drawsData);
  if (!drawn) return { kind: "pending" };
  if (kind === "fracas") {
    const arch = drawn.headings.find((h) => /^(Ranking|Trends)$/.test(h));
    if (!arch) return { kind: "wrong-card", label: `a card drew, but not a FRACAS card (headings: ${drawn.headings.join(" | ").slice(0, 80)})` };
    // A Ranking/Trends heading alone passes ANY ranking or trend card (a cost ranking too), so the
    // card's own text (the question echo is already excluded, see snapshot) must speak of failures.
    // It cannot be checked for the PART: both archetypes draw scope_label only on their empty
    // path, so a populated card never says which part it covers.
    if (!/failure/i.test(drawn.text)) {
      return { kind: "wrong-card", label: `a ${arch} card drew, but it is not about failures (text: ${drawn.text.slice(0, 80)})` };
    }
    return { kind: "card", label: `FRACAS card (${arch === "Ranking" ? "CONTRIBUTION_RANKING" : "MULTI_SERIES"})` };
  }
  return { kind: "card", label: `domain card (heading "${drawn.headings[0] ?? "table"}")` };
}

async function awaitOutcome(page: Page, kind: AnswerKind, before: AnswerSnapshot, timeoutMs: number): Promise<Outcome> {
  const deadline = Date.now() + timeoutMs;
  let last: Outcome = { kind: "pending" };
  while (Date.now() < deadline) {
    last = classifyAnswer(kind, before, await snapshot(page));
    if (last.kind !== "pending") {
      // A card can land a frame before its abstain/fallback disclosure: look again after a beat.
      await page.waitForTimeout(400);
      return classifyAnswer(kind, before, await snapshot(page));
    }
    await page.waitForTimeout(300);
  }
  return last;
}

/** Ask, then PASS (returning the detail) on a card or a named refusal; throw on anything else. */
export async function assertAnswer(page: Page, kind: AnswerKind, prompt: string, timeoutMs: number): Promise<string> {
  const before = await snapshot(page);
  await ask(page, prompt);
  const o = await awaitOutcome(page, kind, before, timeoutMs);
  switch (o.kind) {
    case "card":
      return `(a) ${o.label}`;
    case "refusal": {
      const unknownPart = kind === "fracas" && /unknown part '5530-184'/i.test(o.reason) ? "; reason names unknown part '5530-184'" : "";
      return `(b) ${o.label}${unknownPart}${o.reason ? `: ${o.reason.slice(0, 100)}` : ""}`;
    }
    case "pending":
      throw new Error(`${kind}: no answer drawn within ${timeoutMs} ms (no card, no refusal, no abstain)`);
    default:
      throw new Error(`${kind}: ${o.label} - expected a card or a named refusal`);
  }
}

/** Log in as `who` through creds(): a missing variable is a FAILED step, never a skip. */
async function asUser(walk: Walk, page: Page, who: string, env: Env, name: string, work: () => Promise<string>): Promise<void> {
  let c: { user: string; password: string } | null = null;
  await walk.step(page, `creds-${who}`, async () => {
    c = creds(who, env);
    return `WALK_${who.toUpperCase()}_USER and WALK_${who.toUpperCase()}_PASSWORD are set`;
  });
  await walk.step(page, `login-${who}`, () => login(page, walk.cfg, c!.user, c!.password));
  await walk.step(page, name, work);
}

export const runHaz = (walk: Walk, bob: Page, env: Env): Promise<void> =>
  asUser(walk, bob, "bob", env, "haz-draft-risk-assessment", () => assertAnswer(bob, "haz", HAZ_PROMPT, walk.cfg.timeouts.ask));

export const runFracas = (walk: Walk, bob: Page, env: Env): Promise<void> =>
  asUser(walk, bob, "bob", env, "fracas-failures-for-part", () => assertAnswer(bob, "fracas", FRACAS_PROMPT, walk.cfg.timeouts.ask));

// -- the stale-tab check (live: the NO-FALSE-POSITIVE half) --------------------------------------

/**
 * On a FRESH load the pill must be absent and `/version.json`'s sha must be the bundle's own.
 * The bundle's sha is read from the header build stamp (`[data-build-stamp-ui]`, "ui <7 chars>").
 * The flip half (pill APPEARS) needs a tab left open across a roll: see the README.
 */
export async function assertNotStale(page: Page, cfg: WalkConfig, baseURL: string): Promise<string> {
  const stamp = page.locator("[data-build-stamp-ui]").first();
  await stamp.waitFor({ state: "visible", timeout: cfg.timeouts.login });
  const mine = ((await stamp.textContent()) ?? "").replace(/^\s*ui\s+/, "").trim();
  if (!mine || mine === "no sha") throw new Error("stale: this bundle carries no sha, so freshness is undecidable (a dev/unstamped build)");
  const res = await page.context().request.get(`${baseURL.replace(/\/+$/, "")}/version.json`, { headers: { "cache-control": "no-store" } });
  if (!res.ok()) throw new Error(`stale: /version.json answered HTTP ${res.status()}`);
  const served = ((await res.json().catch(() => ({}))) as { git_sha?: unknown }).git_sha;
  if (typeof served !== "string" || !served) throw new Error("stale: /version.json carries no git_sha");
  // Give the opening registration (which checks freshness) time to run before declaring the pill absent.
  await page.waitForTimeout(3000);
  if ((await page.locator("[data-stale-bundle]").count()) > 0) {
    throw new Error(`stale: FALSE POSITIVE - the pill shows on a fresh load (served ${served.slice(0, 7)}, this tab ${mine})`);
  }
  if (!served.startsWith(mine)) throw new Error(`stale: /version.json says ${served.slice(0, 7)} but this bundle's stamp says ${mine}`);
  return `no pill; bundle ${mine} == served ${served.slice(0, 7)}`;
}

export const runStale = (walk: Walk, bob: Page, env: Env, baseURL: string): Promise<void> =>
  asUser(walk, bob, "bob", env, "stale-fresh-load-no-pill", () => assertNotStale(bob, walk.cfg, baseURL));
