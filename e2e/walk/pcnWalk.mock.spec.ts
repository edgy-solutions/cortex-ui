/**
 * The PCN walk against the dev server with mocked routes: proves the SAME walk functions' selectors
 * offline (drop -> promote -> ask), a duplicate-drop variant, and a negative control.
 *
 * The drop UI exercised here is whichever this branch ships (HUD pill on master); the composer
 * branch of `drop()` is selector-checked against origin/feat/ingest-composer's source, not run.
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
  type WalkConfig,
} from "./pcnWalk";
import { installWalkRoutes, newWalkMock, type WalkMock, type DropMode, type AnswerMode } from "./walkRoutes";

test.describe.configure({ timeout: 120_000 });

function makeCfg(): WalkConfig {
  const pdfPath = test.info().outputPath("PCN26-184.pdf");
  writeFileSync(pdfPath, "%PDF-1.4 walk stand-in\n");
  return {
    notice: "PCN26-184",
    expectParts: ["5530-184", "5530-185"],
    pdfPath,
    question: defaultQuestion("PCN26-184"),
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

async function setup(browser: Browser, dropMode: DropMode, answer: AnswerMode) {
  const m = newWalkMock({ drop: dropMode, answer });
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
    "3-4-bob-promote:pass",
    "5-promoted:pass",
    "6-ask:pass",
    "7-parts-table:pass",
    "8-provenance:pass",
  ]);
  expect(walk.dropOutcome).toBe("received");
  expect(walk.dropUi).toBe("hud-pill");
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
    "3-4-bob-promote:skipped",
    "5-promoted:skipped",
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
  const { alice, walk, close } = await setup(browser, "duplicate", "knowledge-document");
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
