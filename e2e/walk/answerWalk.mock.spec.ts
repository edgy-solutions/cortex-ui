/**
 * HAZ and FRACAS walks against the dev server with mocked routes. Four arms each, driven through
 * the SAME runHaz / runFracas / runStale the live spec runs:
 *   card -> pass; named refusal -> pass; abstain -> the STEP FAILS; not grounded -> the STEP FAILS.
 * For the failing arms the Playwright test passes: it asserts the walk's computed result is `fail`.
 * Plus: a missing credential FAILS (naming the variable) and never skips.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { Walk, DEFAULT_KC, defaultQuestion, type WalkConfig } from "./pcnWalk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHaz, runFracas, HAZ_PROMPT, FRACAS_PROMPT, classifyAnswer, askIdOf, readVersionJson, type AnswerSnapshot } from "./answerWalk";
import { installWalkRoutes, newWalkMock, type AnswerMode } from "./walkRoutes";
import { creds, walkPassed, type Env } from "./walkEnv";

test.describe.configure({ timeout: 120_000 });

const BOB_ENV: Env = { WALK_BOB_USER: "bob@example.com", WALK_BOB_PASSWORD: "mock-not-a-secret" };

function makeCfg(): WalkConfig {
  return {
    notice: "PCN26-184",
    expectParts: [],
    pdfPath: "",
    question: defaultQuestion("PCN26-184"),
    baseURL: test.info().project.use.baseURL,
    outDir: test.info().outputPath("shots"),
    kc: DEFAULT_KC,
    timeouts: { login: 20_000, drop: 20_000, stage: 20_000, promote: 20_000, promoted: 20_000, ask: 12_000 },
  };
}

async function bobPage(browser: Browser, mode: AnswerMode, question: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await installWalkRoutes(page, newWalkMock({ drop: "new", answer: mode, answerTo: "bob", question }), "bob");
  return { page, close: () => ctx.close() };
}

type Run = typeof runHaz;
const ARMS: { walk: string; run: Run; prompt: string; step: string; arms: { mode: AnswerMode; want: "pass" | "fail"; detail: RegExp }[] }[] = [
  {
    walk: "haz",
    run: runHaz,
    prompt: HAZ_PROMPT,
    step: "haz-draft-risk-assessment",
    arms: [
      { mode: "haz-card", want: "pass", detail: /^\(a\) domain card/ },
      { mode: "haz-refusal", want: "pass", detail: /^\(b\) named refusal "unknown_hazard"/ },
      { mode: "abstain-haz", want: "fail", detail: /abstained/ },
      { mode: "not-grounded", want: "fail", detail: /not grounded \(fallback_reason no_verb_classified\)/ },
    ],
  },
  {
    walk: "fracas",
    run: runFracas,
    prompt: FRACAS_PROMPT,
    step: "fracas-failures-for-part",
    arms: [
      { mode: "fracas-card", want: "pass", detail: /^\(a\) FRACAS card \(CONTRIBUTION_RANKING\)/ },
      { mode: "fracas-trend-card", want: "pass", detail: /^\(a\) FRACAS card \(MULTI_SERIES\)/ },
      { mode: "ranking-not-fracas", want: "fail", detail: /Ranking card drew, but it is not about failures/ },
      { mode: "fracas-refusal", want: "pass", detail: /^\(b\) named refusal .*reason names unknown part '5530-184'/ },
      { mode: "abstain-fracas", want: "fail", detail: /abstained/ },
      { mode: "not-grounded", want: "fail", detail: /not grounded/ },
    ],
  },
];

for (const w of ARMS) {
  for (const arm of w.arms) {
    test(`${w.walk}: ${arm.mode} -> walk ${arm.want}`, async ({ browser }) => {
      const { page, close } = await bobPage(browser, arm.mode, w.prompt);
      const walk = new Walk(makeCfg());
      let thrown = false;
      try {
        await w.run(walk, page, BOB_ENV);
      } catch {
        thrown = true;
      } finally {
        console.log(JSON.stringify(walk.results.map((r) => `${r.step}:${r.status}:${r.detail.slice(0, 90)}`)));
        await close();
      }
      const last = walk.results[walk.results.length - 1]!;
      expect(last.step).toBe(w.step);
      expect(last.status).toBe(arm.want);
      expect(last.detail).toMatch(arm.detail);
      expect(thrown).toBe(arm.want === "fail");
      expect(walkPassed({ walk: w.walk as "haz", steps: walk.results, error: thrown ? "x" : null })).toBe(arm.want === "pass");
      if (arm.want === "pass") expect(walk.results.map((r) => r.status)).toEqual(["pass", "pass", "pass"]);
    });
  }
}

test("missing creds: unset bob FAILS naming WALK_BOB_USER (never skips, never prints a value)", async ({ browser }) => {
  const { page, close } = await bobPage(browser, "haz-card", HAZ_PROMPT);
  const walk = new Walk(makeCfg());
  let thrown = false;
  try {
    await runHaz(walk, page, {});
  } catch {
    thrown = true;
  } finally {
    await close();
  }
  expect(thrown).toBe(true);
  expect(walk.results).toHaveLength(1);
  expect(walk.results[0]!.step).toBe("creds-bob");
  expect(walk.results[0]!.status).toBe("fail");
  expect(walk.results[0]!.detail).toContain("WALK_BOB_USER");
  expect(walk.results[0]!.detail).toContain("WALK_BOB_PASSWORD");
});

test("creds(): throws naming the variable; a half-set pair names only the missing one", () => {
  expect(() => creds("bob", {})).toThrow(/WALK_BOB_USER, WALK_BOB_PASSWORD/);
  expect(() => creds("bob", { WALK_BOB_USER: "u" })).toThrow(/WALK_BOB_PASSWORD/);
  expect(() => creds("bob", { WALK_BOB_USER: "u", WALK_BOB_PASSWORD: "p" })).not.toThrow();
  let msg = "";
  try {
    creds("bob", { WALK_BOB_USER: "secret-user-value" });
  } catch (e) {
    msg = (e as Error).message;
  }
  expect(msg).not.toContain("secret-user-value");
});

// -- whose outcome is it (Lane 1 walk defect §5.1) ----------------------------------------------

const ASK = "art-this-ask";
const OLD = "art-historical";
const snap = (over: Partial<AnswerSnapshot> = {}): AnswerSnapshot => ({
  tileIds: [],
  abstainedAttr: [],
  abstainText: [],
  disclosures: [],
  failedAttempts: [],
  refusals: [],
  tiles: [],
  ...over,
});
const card = (id: string) => ({ id, headings: ["Risk assessment"], drawsData: true, text: "risk" });

test("classifyAnswer: a HISTORICAL tile's failed attempt entering the DOM is not this ask's outcome", () => {
  // The live false positive: an old answer's [data-attempt-failed] mounted after the ask. Its tile
  // id is absent from any before-snapshot too, so only the ask's own id tells them apart.
  const after = snap({ tileIds: [OLD, ASK], failedAttempts: [OLD], tiles: [card(OLD), card(ASK)] });
  expect(classifyAnswer("haz", ASK, after)).toEqual({ kind: "card", label: 'domain card (heading "Risk assessment")' });
});

test("classifyAnswer: every marker arm counts only the ask's own artifact (and never an unowned one)", () => {
  const others = [OLD, null];
  for (const o of others) {
    expect(classifyAnswer("haz", ASK, snap({ abstainedAttr: [o] })).kind).toBe("pending");
    expect(classifyAnswer("haz", ASK, snap({ disclosures: [{ owner: o, reason: "no_verb_classified" }] })).kind).toBe("pending");
    expect(classifyAnswer("haz", ASK, snap({ failedAttempts: [o] })).kind).toBe("pending");
    expect(classifyAnswer("haz", ASK, snap({ refusals: [{ owner: o, outcome: "unknown_hazard", reason: "r" }] })).kind).toBe("pending");
  }
  expect(classifyAnswer("haz", ASK, snap({ abstainText: [OLD] })).kind).toBe("pending");
  expect(classifyAnswer("haz", ASK, snap({ tileIds: [OLD], tiles: [card(OLD)] })).kind).toBe("pending");
  // ...and the same markers on the ask's own artifact each decide it.
  expect(classifyAnswer("haz", ASK, snap({ abstainedAttr: [ASK] })).kind).toBe("abstain");
  expect(classifyAnswer("haz", ASK, snap({ abstainText: [ASK] })).kind).toBe("abstain");
  expect(classifyAnswer("haz", ASK, snap({ disclosures: [{ owner: OLD, reason: "x" }, { owner: ASK, reason: "no_verb_classified" }] }))).toEqual({
    kind: "not-grounded",
    label: "not grounded (fallback_reason no_verb_classified)",
  });
  expect(classifyAnswer("haz", ASK, snap({ failedAttempts: [ASK] })).kind).toBe("attempt-failed");
  expect(classifyAnswer("haz", ASK, snap({ refusals: [{ owner: OLD, outcome: "other", reason: "" }, { owner: ASK, outcome: "unknown_hazard", reason: "r" }] }))).toMatchObject({
    kind: "refusal",
    outcome: "unknown_hazard",
  });
});

test("askIdOf: the stream body's artifact_id, or a NAMED failure", () => {
  expect(askIdOf({ artifact_id: ASK, prompt: "x" })).toBe(ASK);
  for (const bad of [null, {}, { artifact_id: "" }, { artifact_id: "  " }, { artifact_id: 7 }]) {
    expect(() => askIdOf(bad)).toThrow(/carried no artifact_id/);
  }
});

// -- /version.json through the pinned browser (Lane 1 walk defect §5.2) --------------------------

test("readVersionJson: reads through the PAGE (its routes answer, so no Node request context is used)", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  const base = test.info().project.use.baseURL!;
  let served = 0;
  await page.route("**/version.json", (r) => {
    served++;
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ git_sha: "abc1234def" }) });
  });
  try {
    await page.goto(base);
    expect(await readVersionJson(page, base)).toEqual({ ok: true, status: 200, body: { git_sha: "abc1234def" } });
    expect(served).toBe(1);
  } finally {
    await ctx.close();
  }
});

test("the walk never opens a Node request context nor waives certificate errors", () => {
  // A source seal: an APIRequestContext never receives the SPKI launch flag, and
  // ignoreHTTPSErrors would accept ANY certificate (ruled out). Comments are stripped first.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = ["answerWalk.ts", "pcnWalk.ts", "walk.live.spec.ts", "walkEnv.ts", "../../playwright.walk.config.ts"];
  for (const f of files) {
    const code = readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect.soft(code, f).not.toMatch(/\.request\.(get|post|fetch|newContext)\(|context\(\)\.request|APIRequestContext|ignoreHTTPSErrors/);
  }
});
