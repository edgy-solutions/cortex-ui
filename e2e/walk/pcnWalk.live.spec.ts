/**
 * The PCN walk against the LIVE sandbox. Not part of `npm run e2e:friday` (the normal config
 * ignores it) - run it with `npm run walk:pcn`; see e2e/walk/README.md.
 *
 * Credentials come ONLY from the environment and are never written to the result file.
 */
import { test } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Walk, DEFAULT_KC, defaultQuestion, runWalk, type WalkConfig } from "./pcnWalk";

const REQUIRED = ["WALK_BASE_URL", "WALK_ALICE_USER", "WALK_ALICE_PASSWORD", "WALK_BOB_USER", "WALK_BOB_PASSWORD", "WALK_PCN_PDF"] as const;

test("PCN walk: drop -> promote -> ask (live)", async ({ browser, playwright }) => {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) throw new Error(`walk: missing required env vars: ${missing.join(", ")} (see e2e/walk/README.md)`);
  const env = process.env as Record<string, string>;
  const pdfPath = path.resolve(env.WALK_PCN_PDF!);
  if (!existsSync(pdfPath)) throw new Error(`walk: WALK_PCN_PDF does not exist: ${pdfPath}`);

  const baseURL = env.WALK_BASE_URL!.replace(/\/+$/, "");
  const notice = env.WALK_NOTICE || "PCN26-184";
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const outRoot = path.resolve("walk-out");
  mkdirSync(outRoot, { recursive: true });

  const cfg: WalkConfig = {
    notice,
    expectParts: (env.WALK_EXPECT_PARTS || "5530-184,5530-185").split(",").map((s) => s.trim()).filter(Boolean),
    pdfPath,
    question: defaultQuestion(notice),
    outDir: path.join(outRoot, `shots-${iso}`),
    kc: {
      user: env.WALK_KC_USER_SELECTOR || DEFAULT_KC.user,
      password: env.WALK_KC_PASSWORD_SELECTOR || DEFAULT_KC.password,
      submit: env.WALK_KC_SUBMIT_SELECTOR || DEFAULT_KC.submit,
    },
    timeouts: { login: 60_000, drop: 60_000, stage: 240_000, promote: 60_000, promoted: 60_000, ask: 150_000 },
  };
  const walk = new Walk(cfg);

  // Which bundle did we walk? Read first, so the result names it even when login fails.
  let servedSha: string | null = null;
  let servedVersion: unknown = null;
  try {
    const api = await playwright.request.newContext();
    const r = await api.get(`${baseURL}/version.json`, { headers: { "cache-control": "no-store" } });
    if (r.ok()) {
      servedVersion = await r.json();
      servedSha = (servedVersion as { git_sha?: string }).git_sha ?? null;
    }
    await api.dispose();
  } catch {
    /* recorded as null */
  }

  const ca = await browser.newContext({ baseURL });
  const cb = await browser.newContext({ baseURL });
  const alice = await ca.newPage();
  const bob = await cb.newPage();
  let error: string | null = null;
  try {
    await runWalk(walk, {
      alice,
      bob,
      aliceCreds: { user: env.WALK_ALICE_USER!, password: env.WALK_ALICE_PASSWORD! },
      bobCreds: { user: env.WALK_BOB_USER!, password: env.WALK_BOB_PASSWORD! },
    });
  } catch (e) {
    error = e instanceof Error ? e.message.split("\n")[0]! : String(e);
  } finally {
    const result = {
      ok: !walk.failed,
      baseURL,
      servedGitSha: servedSha,
      servedVersion,
      notice,
      expectParts: cfg.expectParts,
      dropUi: walk.dropUi,
      dropOutcome: walk.dropOutcome,
      ingestId: walk.ingestId,
      startedAt: iso,
      steps: walk.results,
      error,
    };
    const file = path.join(outRoot, `pcn-walk-${iso}.json`);
    writeFileSync(file, JSON.stringify(result, null, 2));
    console.log(`walk result: ${file} (ok=${result.ok}, bundle ${servedSha ?? "unknown"}, drop ui ${walk.dropUi ?? "n/a"})`);
    await ca.close();
    await cb.close();
  }
  if (error) throw new Error(error);
});
