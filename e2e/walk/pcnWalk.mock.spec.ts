/**
 * The PCN walk against the dev server with mocked routes: proves the SAME walk functions' selectors
 * offline (drop -> promote -> ask), a duplicate-drop variant, and a negative control.
 *
 * The drop UI exercised here is the composer (PR #4): a real PDF is inferred as `pdf`, no picker.
 * The HUD-pill branch of `drop()` is kept for an older bundle and is not run here.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import {
  Walk,
  DEFAULT_KC,
  defaultQuestion,
  runWalk,
  login,
  drop,
  ask,
  assertPartsTable,
  assertProvenance,
  waitForStage,
  stewardReview,
  promote,
  type WalkConfig,
} from "./pcnWalk";
import { installWalkRoutes, newWalkMock, type WalkMock, type DropMode, type AnswerMode, type ReviewMode } from "./walkRoutes";

test.describe.configure({ timeout: 120_000 });

function makeCfg(): WalkConfig {
  const pdfPath = test.info().outputPath("PCN26-184.pdf");
  writeFileSync(pdfPath, "%PDF-1.4 walk stand-in\n");
  return {
    notice: "PCN26-184",
    expectParts: ["5530-184", "5530-185"],
    pdfPath,
    question: defaultQuestion("PCN26-184"),
    baseURL: test.info().project.use.baseURL,
    outDir: test.info().outputPath("shots"),
    kc: DEFAULT_KC,
    timeouts: { login: 20_000, drop: 20_000, stage: 40_000, promote: 20_000, promoted: 20_000, ask: 20_000 },
  };
}

async function twoUsers(browser: Browser, m: WalkMock): Promise<{ alice: Page; bob: Page; close: () => Promise<void> }> {
  const baseURL = test.info().project.use.baseURL;
  const ca = await browser.newContext({ baseURL });
  const cb = await browser.newContext({ baseURL });
  const alice = await ca.newPage();
  const bob = await cb.newPage();
  await installWalkRoutes(alice, m, "alice");
  await installWalkRoutes(bob, m, "bob");
  return {
    alice,
    bob,
    close: async () => {
      await ca.close();
      await cb.close();
    },
  };
}

async function setup(browser: Browser, dropMode: DropMode, answer: AnswerMode, answerTo: "alice" | "bob" = "bob", review?: ReviewMode) {
  const m = newWalkMock({ drop: dropMode, answer, answerTo, review });
  const u = await twoUsers(browser, m);
  return { m, ...u, walk: new Walk(makeCfg()) };
}

test("walk: fresh drop -> review -> bob promotes -> promoted -> ask -> parts table -> user-drop", async ({ browser }) => {
  const { m, alice, bob, walk, close } = await setup(browser, "new", "parts-table");
  try {
    await runWalk(walk, { alice, bob });
  } finally {
    console.log(JSON.stringify(walk.results));
    await close();
  }
  expect(walk.results.map((r) => `${r.step}:${r.status}`)).toEqual([
    "login-alice:pass",
    "1-drop:pass",
    "2-extracting-review:pass",
    "login-bob:pass",
    "3-steward-review:pass",
    "4-bob-promote:pass",
    "5-promoted:pass",
    "persona-bob:pass",
    "6-ask:pass",
    "7-parts-table:pass",
    "8-provenance:pass",
  ]);
  expect(walk.dropOutcome).toBe("received");
  expect(walk.dropUi).toBe("composer");
  expect(m.actBodies).toHaveLength(1);
  expect((m.actBodies[0] as { decision: string }).decision).toBe("promoted");
  expect(m.askBodies).toHaveLength(1);
  expect(m.unrouted).toEqual([]);
});

test("walk: duplicate drop passes step 1, skips 2-5, and the ask still runs", async ({ browser }) => {
  const { m, alice, bob, walk, close } = await setup(browser, "duplicate", "parts-table");
  try {
    await runWalk(walk, { alice, bob });
  } finally {
    await close();
  }
  expect(walk.results.map((r) => `${r.step}:${r.status}`)).toEqual([
    "login-alice:pass",
    "1-drop:pass",
    "2-extracting-review:skipped",
    "3-steward-review:skipped",
    "4-bob-promote:skipped",
    "5-promoted:skipped",
    "login-bob:pass",
    "persona-bob:pass",
    "6-ask:pass",
    "7-parts-table:pass",
    "8-provenance:pass",
  ]);
  expect(walk.dropOutcome).toBe("duplicate");
  expect(walk.results.find((r) => r.step === "2-extracting-review")!.detail).toMatch(/^skipped: duplicate/);
  expect(m.actBodies).toEqual([]);
  expect(m.askBodies).toHaveLength(1);
  expect(m.unrouted).toEqual([]);
});

test("negative control: a KNOWLEDGE_DOCUMENT answer fails assertPartsTable naming the roll-23 symptom", async ({ browser }) => {
  const { alice, walk, close } = await setup(browser, "duplicate", "knowledge-document", "alice");
  try {
    await login(alice, walk.cfg, "", "");
    await drop(alice, walk);
    await ask(alice, walk.cfg.question);
    const err = await assertPartsTable(alice, walk.cfg, 8_000).then(
      () => null,
      (e: Error) => e,
    );
    expect(err, "assertPartsTable must FAIL on a plain-document answer").not.toBeNull();
    console.log(`negative-control message: ${err!.message}`);
    expect(err!.message).toMatch(/ROLL-23 SYMPTOM/);
    expect(err!.message).toMatch(/plain document \(knowledge document\)/);
    // The knowledge document still carries the floor chip, so only the table assertion guards roll-23.
    await assertProvenance(alice);
  } finally {
    await close();
  }
});

/**
 * The steward review (step 3) on its own: alice drops, the drop reaches review, bob opens the task.
 * Each arm names what the card served and what step 3 must record for it.
 */
async function toStewardReview(browser: Browser, review: ReviewMode, requireReview = false) {
  const s = await setup(browser, "new", "parts-table", "bob", review);
  if (requireReview) (s.walk.cfg as { requireReview?: boolean }).requireReview = true;
  await s.walk.step(s.alice, "login-alice", () => login(s.alice, s.walk.cfg, "", ""));
  await s.walk.step(s.alice, "1-drop", () => drop(s.alice, s.walk));
  await s.walk.step(s.alice, "2-extracting-review", () => waitForStage(s.alice, s.walk.ingestId, "review", s.walk.cfg.timeouts.stage));
  await s.walk.step(s.bob, "login-bob", () => login(s.bob, s.walk.cfg, "", ""));
  const err = await s.walk.step(s.bob, "3-steward-review", () => stewardReview(s.bob, s.walk)).then(
    () => null,
    (e: Error) => e,
  );
  return { ...s, err, step3: s.walk.results.find((r) => r.step === "3-steward-review")! };
}

test("steward review: rows, the PDF and row 1's outline are all on screen; the title is the notice id", async ({ browser }) => {
  const { step3, err, close } = await toStewardReview(browser, "served");
  try {
    expect(err).toBeNull();
    expect(step3.status).toBe("pass");
    // The task payload is the 3-key one (no notice_id): the title came from /extraction.
    expect(step3.detail).toMatch(/^"EOL-36_BYV34-400,-BYV34-500": 6 rows \(BYV34-400, BYV34-500\), PDF ready, row 1 outlined on p1$/);
  } finally {
    await close();
  }
});

test("steward review before 193: /extraction is a plain 404, so step 3 is SKIPPED with why, and promote still works", async ({ browser }) => {
  const { m, bob, walk, step3, err, close } = await toStewardReview(browser, "pre193");
  try {
    expect(err).toBeNull();
    expect(step3.status).toBe("skipped");
    expect(step3.detail).toMatch(/^skipped: \/extraction is not served \(plain 404\), expected before 193/);
    await walk.step(bob, "4-bob-promote", () => promote(bob, walk, "unused by the review card"));
    expect(walk.results.at(-1)!.status).toBe("pass");
    expect(walk.results.at(-1)!.detail).toMatch(/\(review card\); act promoted -> 200$/);
    expect((m.actBodies[0] as { decision: string }).decision).toBe("promoted");
  } finally {
    await close();
  }
});

test("negative control: with WALK_REQUIRE_REVIEW, the same plain 404 FAILS step 3", async ({ browser }) => {
  const { step3, err, close } = await toStewardReview(browser, "pre193", true);
  try {
    expect(err, "step 3 must throw").not.toBeNull();
    expect(step3.status).toBe("fail");
    expect(step3.detail).toMatch(/^steward-review: no rows - The extraction route is not served here yet \(404\)/);
  } finally {
    await close();
  }
});

test("negative control: rows drawn but the source refused FAILS step 3, naming the server's code", async ({ browser }) => {
  const { step3, err, close } = await toStewardReview(browser, "source-absent");
  try {
    expect(err, "step 3 must throw").not.toBeNull();
    expect(step3.status).toBe("fail");
    expect(step3.detail).toMatch(/^steward-review: 6 rows drawn, but the source did not load - .*404 source_absent/);
  } finally {
    await close();
  }
});
