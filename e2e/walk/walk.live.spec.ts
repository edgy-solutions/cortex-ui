/**
 * The walks against the LIVE sandbox (PCN, HAZ, FRACAS, stale). Not part of `npm run e2e:friday`
 * (the normal config ignores *.live.spec.ts) - run with `npm run walk`; see e2e/walk/README.md.
 *
 * One Playwright invocation, one test per selected walk (WALK_ONLY, default all), each in its own
 * browser context. Credentials come ONLY from creds() and are never written to a result file.
 * Exit 0 only if every selected walk's every step passed.
 */
import { test, type Browser } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Walk, DEFAULT_KC, defaultQuestion, runWalk, type WalkConfig } from "./pcnWalk";
import { runHaz, runFracas, runStale } from "./answerWalk";
import { runBroker } from "./walkBroker";
import { WALK_PERSONAS, WALK_TITLES } from "./walkPersona";
import { creds, selectedWalks, summaryTable, walkPassed, type WalkName, type WalkOutcome } from "./walkEnv";

const env = process.env as Record<string, string | undefined>;
const baseURL = (env.WALK_BASE_URL ?? "").replace(/\/+$/, "");
const iso = new Date().toISOString().replace(/[:.]/g, "-");
const outRoot = path.resolve("walk-out");
const outcomes: WalkOutcome[] = [];

// A bad WALK_ONLY must fail the run, not select nothing.
let selected: WalkName[] = [];
let selectError: string | null = null;
try {
  selected = selectedWalks(env);
} catch (e) {
  selectError = e instanceof Error ? e.message : String(e);
}

function makeCfg(tag: string): WalkConfig {
  const notice = env.WALK_NOTICE || "PCN26-184";
  return {
    notice,
    expectParts: (env.WALK_EXPECT_PARTS || "5530-184,5530-185").split(",").map((s) => s.trim()).filter(Boolean),
    pdfPath: env.WALK_PCN_PDF ? path.resolve(env.WALK_PCN_PDF) : "",
    question: defaultQuestion(notice),
    baseURL,
    outDir: path.join(outRoot, `shots-${iso}`, tag),
    kc: {
      user: env.WALK_KC_USER_SELECTOR || DEFAULT_KC.user,
      password: env.WALK_KC_PASSWORD_SELECTOR || DEFAULT_KC.password,
      submit: env.WALK_KC_SUBMIT_SELECTOR || DEFAULT_KC.submit,
    },
    timeouts: { login: 60_000, drop: 60_000, stage: 240_000, promote: 60_000, promoted: 60_000, ask: 150_000 },
  };
}

/**
 * What the sandbox serves, read through a BROWSER context so the SPKI pin applies. An
 * APIRequestContext is Node and never receives the pin's launch flag (see readVersionJson in
 * answerWalk.ts), so it failed the handshake live. A fresh context has no cache to answer from.
 */
async function servedVersion(browser: Browser) {
  const ctx = await browser.newContext({ baseURL });
  try {
    const r = await (await ctx.newPage()).goto(`${baseURL}/version.json`);
    const body = r && r.ok() ? ((await r.json()) as { git_sha?: string }) : null;
    return { sha: body?.git_sha ?? null, body };
  } catch {
    return { sha: null, body: null };
  } finally {
    await ctx.close();
  }
}

/** Run one walk: always record an outcome + JSON file, then rethrow so the test (and exit code) fail. */
async function record(name: WalkName, walk: Walk, extra: Record<string, unknown>, body: () => Promise<void>) {
  mkdirSync(outRoot, { recursive: true });
  let error: string | null = null;
  try {
    await body();
  } catch (e) {
    error = e instanceof Error ? e.message.split("\n")[0]! : String(e);
  }
  const outcome: WalkOutcome = { walk: name, steps: walk.results, error };
  outcomes.push(outcome);
  const file = path.join(outRoot, name === "pcn" ? `pcn-walk-${iso}.json` : `${name}-walk-${iso}.json`);
  writeFileSync(file, JSON.stringify({ ok: walkPassed(outcome), baseURL, startedAt: iso, ...extra, steps: walk.results, error }, null, 2));
  console.log(`walk result: ${file} (ok=${walkPassed(outcome)})`);
  if (!walkPassed(outcome)) throw new Error(error ?? `${name}: a step failed`);
}

test.beforeAll(() => {
  if (selectError) throw new Error(selectError);
  if (!baseURL) throw new Error("walk: missing required environment variable WALK_BASE_URL (see e2e/walk/README.md)");
});

test.afterAll(() => {
  if (outcomes.length === 0) return;
  mkdirSync(outRoot, { recursive: true });
  console.log(`\n${summaryTable(outcomes)}\n`);
  writeFileSync(path.join(outRoot, `walk-summary-${iso}.json`), JSON.stringify({ baseURL, startedAt: iso, ok: outcomes.every(walkPassed), outcomes }, null, 2));
});

test("PCN walk: drop -> promote -> ask (live)", async ({ browser }) => {
  test.skip(!selected.includes("pcn"), "WALK_ONLY excludes pcn");
  const cfg = makeCfg("pcn");
  const walk = new Walk(cfg);
  const v = await servedVersion(browser);
  await record("pcn", walk, { servedGitSha: v.sha, servedVersion: v.body, notice: cfg.notice, expectParts: cfg.expectParts }, async () => {
    // The creds are the table's users and nobody else's: a missing WALK_<USER>_* fails THIS row naming the var.
    const a = creds(WALK_PERSONAS.pcn.dropper.user);
    const b = creds(WALK_PERSONAS.pcn.asker.user);
    if (!cfg.pdfPath) throw new Error("walk: missing required environment variable WALK_PCN_PDF");
    if (!existsSync(cfg.pdfPath)) throw new Error(`walk: WALK_PCN_PDF does not exist: ${cfg.pdfPath}`);
    const ca = await browser.newContext({ baseURL });
    const cb = await browser.newContext({ baseURL });
    try {
      await runWalk(walk, { alice: await ca.newPage(), bob: await cb.newPage(), aliceCreds: a, bobCreds: b });
    } finally {
      await ca.close();
      await cb.close();
    }
  });
});

for (const [name, title, run] of [
  ["haz", WALK_TITLES.haz, runHaz],
  ["fracas", WALK_TITLES.fracas, runFracas],
] as const) {
  test(title, async ({ browser }) => {
    test.skip(!selected.includes(name), `WALK_ONLY excludes ${name}`);
    const walk = new Walk(makeCfg(name));
    await record(name, walk, {}, async () => {
      const cb = await browser.newContext({ baseURL });
      try {
        await run(walk, await cb.newPage(), env);
      } finally {
        await cb.close();
      }
    });
  });
}

test(WALK_TITLES.broker, async ({ browser }) => {
  test.skip(!selected.includes("broker"), "WALK_ONLY excludes broker");
  const walk = new Walk(makeCfg("broker"));
  await record("broker", walk, {}, async () => {
    // A FRESH context: a leftover SSO session would skip the Keycloak broker screen this row checks.
    const cb = await browser.newContext({ baseURL });
    try {
      await runBroker(walk, await cb.newPage(), env);
    } finally {
      await cb.close();
    }
  });
});

test("stale walk:a fresh load shows no stale-bundle pill (live)", async ({ browser }) => {
  test.skip(!selected.includes("stale"), "WALK_ONLY excludes stale");
  const walk = new Walk(makeCfg("stale"));
  const v = await servedVersion(browser);
  await record("stale", walk, { servedGitSha: v.sha }, async () => {
    const cb = await browser.newContext({ baseURL });
    try {
      await runStale(walk, await cb.newPage(), env, baseURL);
    } finally {
      await cb.close();
    }
  });
});
