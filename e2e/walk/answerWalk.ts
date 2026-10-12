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
import type { Page, Request } from "@playwright/test";
import { ask, login, DEFAULT_KC, type Walk, type WalkConfig } from "./pcnWalk";
import { creds, type Env } from "./walkEnv";

export const HAZ_PROMPT = "draft a risk assessment for HAZ-1004";
export const FRACAS_PROMPT = "what failures are recorded for part 5530-184";

export type AnswerKind = "haz" | "fracas";

/**
 * EVERY MARKER CARRIES ITS OWNER: the id of the artifact it was drawn for — the enclosing
 * `[data-answer-id]` tile, else the enclosing `[data-canvas-artifact-id]` pane, else null (a pinned
 * card, a rail entry: nothing that can be this ask's answer). The walk used to compare marker COUNTS
 * before and after the ask, and a historical answer's `[data-attempt-failed]` entering the DOM
 * after the before-snapshot (the canvas mounting an old tile, the pane opening an old artifact)
 * was read as THIS ask failing. Keying on tile ids absent from the before-snapshot does not close
 * that: a historical tile mounted later is absent from it too. Only the ask's OWN id does.
 */
export interface AnswerSnapshot {
  /** `data-answer-id` of every answer tile (task cards excluded). */
  tileIds: string[];
  /** Owner of each `[data-ask-abstained]`. */
  abstainedAttr: (string | null)[];
  /** Owner of each match of the abstain prose (per tile/pane; text outside both is not counted). */
  abstainText: string[];
  disclosures: { owner: string | null; reason: string }[];
  /** Owner of each `[data-attempt-failed]`. */
  failedAttempts: (string | null)[];
  refusals: { owner: string | null; outcome: string; reason: string }[];
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

/** Why the page is not the app: its url, and whether a Keycloak form is showing. Never page text. */
async function whereAmI(page: Page): Promise<string> {
  const kc = await page.locator(DEFAULT_KC.user).first().isVisible().catch(() => false);
  return `url ${page.url()}${kc ? "; a Keycloak login form is visible" : ""}`;
}

/**
 * Read the page. A page that is not the app (Keycloak after a login that did not take, an error
 * page, an XML document with no <body>) is a NAMED error, never a TypeError out of evaluate().
 * `baseURL` is the app's origin; when given, any other origin is refused.
 */
export async function snapshot(page: Page, baseURL?: string, bodyWaitMs = 10_000): Promise<AnswerSnapshot> {
  await page.waitForFunction(() => !!document.body, undefined, { timeout: bodyWaitMs }).catch(() => undefined);
  let wrongOrigin = false;
  if (baseURL) {
    try {
      wrongOrigin = new URL(page.url()).origin !== new URL(baseURL).origin;
    } catch {
      wrongOrigin = true;
    }
  }
  const hasBody = await page.evaluate(() => !!document.body).catch(() => false);
  if (wrongOrigin || !hasBody) throw new Error(`snapshot: not on the app (url ${page.url()})`);
  return page.evaluate((abstainSrc) => {
    const q = (s: string) => Array.from(document.querySelectorAll(s));
    const tileEls = q("[data-answer-id]").filter((e) => !(e.getAttribute("data-answer-id") ?? "").startsWith("task:"));
    // The artifact a marker was drawn FOR (see AnswerSnapshot). Tile first: a tile is never inside
    // a pane, and a pane's markers are never inside a tile.
    const owner = (e: Element): string | null =>
      e.closest("[data-answer-id]")?.getAttribute("data-answer-id") ??
      e.closest("[data-canvas-artifact-id]")?.getAttribute("data-canvas-artifact-id") ??
      null;
    const holders = [
      ...tileEls.map((e) => ({ id: e.getAttribute("data-answer-id") ?? "", el: e })),
      ...q("[data-canvas-artifact-id]").map((e) => ({ id: e.getAttribute("data-canvas-artifact-id") ?? "", el: e })),
    ];
    return {
      tileIds: tileEls.map((e) => e.getAttribute("data-answer-id") ?? ""),
      abstainedAttr: q("[data-ask-abstained]").map(owner),
      abstainText: holders.flatMap(({ id, el }) =>
        (((el as HTMLElement).innerText ?? "").match(new RegExp(abstainSrc, "gi")) ?? []).map(() => id),
      ),
      disclosures: q("[data-fallback-disclosure]").map((e) => ({ owner: owner(e), reason: e.getAttribute("data-fallback-reason") ?? "" })),
      failedAttempts: q("[data-attempt-failed]").map(owner),
      refusals: q("[data-refusal]").map((e) => ({
        owner: owner(e),
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
          return (c.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
        })(),
      })),
    };
  }, ABSTAIN_TEXT_SRC);
}

/** The abstain detector. Mutated in the mock spec (always false) to prove the abstain arm is guarded. */
export function detectAbstain(askId: string, after: AnswerSnapshot): boolean {
  return after.abstainedAttr.includes(askId) || after.abstainText.includes(askId);
}

/**
 * PURE. `askId` is the artifact id THIS ask minted (read off its `/interview/stream` request); only
 * markers drawn for that artifact count, and only its tile can be the card. A historical answer's
 * markers, however recently they entered the DOM, are not this ask's outcome.
 */
export function classifyAnswer(kind: AnswerKind, askId: string, after: AnswerSnapshot): Outcome {
  if (detectAbstain(askId, after)) return { kind: "abstain", label: "abstained (nothing was run)" };
  const disclosure = after.disclosures.find((d) => d.owner === askId);
  if (disclosure) {
    return { kind: "not-grounded", label: `not grounded (fallback_reason ${disclosure.reason || "none recorded"})` };
  }
  if (after.failedAttempts.includes(askId)) return { kind: "attempt-failed", label: "the attempt failed" };
  const r = after.refusals.find((x) => x.owner === askId);
  if (r) {
    if (r.outcome.trim() !== "") return { kind: "refusal", label: `named refusal "${r.outcome}"`, outcome: r.outcome, reason: r.reason };
    return { kind: "abstain", label: "a refusal with no outcome name (unnamed)" };
  }
  const drawn = after.tiles.find((t) => t.id === askId && (t.headings.length > 0 || t.drawsData));
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

async function awaitOutcome(page: Page, kind: AnswerKind, askId: string, timeoutMs: number, baseURL?: string): Promise<Outcome> {
  const deadline = Date.now() + timeoutMs;
  let last: Outcome = { kind: "pending" };
  while (Date.now() < deadline) {
    last = classifyAnswer(kind, askId, await snapshot(page, baseURL));
    if (last.kind !== "pending") {
      // A card can land a frame before its abstain/fallback disclosure: look again after a beat.
      await page.waitForTimeout(400);
      return classifyAnswer(kind, askId, await snapshot(page, baseURL));
    }
    await page.waitForTimeout(300);
  }
  return last;
}

/** True for the ask's stream request. Matched on the path's END: the live API sits under a prefix. */
const isAskRequest = (r: Request): boolean => r.method() === "POST" && new URL(r.url()).pathname.endsWith("/interview/stream");

/**
 * The id this ask's artifact will carry. The client mints it and sends it as `artifact_id`
 * (useInterviewAgent.ts, the stream body), so it is known before anything is drawn. A request
 * with no such id is a NAMED failure: classifying without it would fall back to "anything new".
 */
export function askIdOf(body: unknown): string {
  const id = (body as { artifact_id?: unknown } | null)?.artifact_id;
  if (typeof id !== "string" || id.trim() === "") throw new Error("ask: the /interview/stream request carried no artifact_id, so this ask's answer cannot be told from an older one");
  return id;
}

/** Ask, then PASS (returning the detail) on a card or a named refusal; throw on anything else. */
export async function assertAnswer(page: Page, kind: AnswerKind, prompt: string, timeoutMs: number, baseURL?: string): Promise<string> {
  await snapshot(page, baseURL); // still refuses a page that is not the app, before asking anything
  const sent = page.waitForRequest(isAskRequest, { timeout: timeoutMs });
  await ask(page, prompt);
  const askId = askIdOf((await sent.catch(() => {
    throw new Error(`${kind}: no /interview/stream request within ${timeoutMs} ms of asking`);
  })).postDataJSON());
  const o = await awaitOutcome(page, kind, askId, timeoutMs, baseURL);
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
  asUser(walk, bob, "bob", env, "haz-draft-risk-assessment", () => assertAnswer(bob, "haz", HAZ_PROMPT, walk.cfg.timeouts.ask, walk.cfg.baseURL));

export const runFracas = (walk: Walk, bob: Page, env: Env): Promise<void> =>
  asUser(walk, bob, "bob", env, "fracas-failures-for-part", () => assertAnswer(bob, "fracas", FRACAS_PROMPT, walk.cfg.timeouts.ask, walk.cfg.baseURL));

// -- the stale-tab check (live: the NO-FALSE-POSITIVE half) --------------------------------------

/**
 * `/version.json`, read BY THE PAGE. The sandbox serves a self-signed leaf that Chromium accepts
 * only through the walk's SPKI pin (`--ignore-certificate-errors-spki-list`, a LAUNCH flag). An
 * APIRequestContext is Node, not Chromium: the flag never reaches it, so it failed the handshake on
 * the live run, and the ruled-out escape (`ignoreHTTPSErrors`) would accept ANY certificate. A
 * fetch from inside the page goes through the pinned browser, same-origin, and `no-store` keeps a
 * cached copy from answering for the server.
 */
export async function readVersionJson(page: Page, baseURL: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${baseURL.replace(/\/+$/, "")}/version.json`;
  return page
    .evaluate(async (u) => {
      const r = await fetch(u, { cache: "no-store" });
      let body: unknown = null;
      try {
        body = await r.json();
      } catch {
        body = null;
      }
      return { ok: r.ok, status: r.status, body };
    }, url)
    .catch((e: unknown) => {
      throw new Error(`stale: /version.json could not be read from the page (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
    });
}

/**
 * On a FRESH load the pill must be absent and `/version.json`'s sha must be the bundle's own.
 * The bundle's sha is read from the header build stamp (`[data-build-stamp-ui]`, "ui <7 chars>").
 * The flip half (pill APPEARS) needs a tab left open across a roll: see the README.
 */
export async function assertNotStale(page: Page, cfg: WalkConfig, baseURL: string): Promise<string> {
  const stamp = page.locator("[data-build-stamp-ui]").first();
  await stamp.waitFor({ state: "visible", timeout: cfg.timeouts.login }).catch(async () => {
    throw new Error(`stale: the build stamp never appeared within ${cfg.timeouts.login} ms (${await whereAmI(page)})`);
  });
  const mine = ((await stamp.textContent()) ?? "").replace(/^\s*ui\s+/, "").trim();
  if (!mine || mine === "no sha") throw new Error("stale: this bundle carries no sha, so freshness is undecidable (a dev/unstamped build)");
  const res = await readVersionJson(page, baseURL);
  if (!res.ok) throw new Error(`stale: /version.json answered HTTP ${res.status}`);
  const served = (res.body as { git_sha?: unknown } | null)?.git_sha;
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
