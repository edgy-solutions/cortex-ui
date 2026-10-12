/**
 * HAZ and FRACAS walks against the dev server with mocked routes. Four arms each, driven through
 * the SAME runHaz / runFracas / runStale the live spec runs:
 *   card -> pass; named refusal -> pass; abstain -> the STEP FAILS; not grounded -> the STEP FAILS.
 * For the failing arms the Playwright test passes: it asserts the walk's computed result is `fail`.
 * Plus: a missing credential FAILS (naming the variable) and never skips.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { Walk, DEFAULT_KC, defaultQuestion, type WalkConfig } from "./pcnWalk";
import { runHaz, runFracas, HAZ_PROMPT, FRACAS_PROMPT } from "./answerWalk";
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
