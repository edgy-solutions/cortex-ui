#!/usr/bin/env node
/**
 * RED-proof for the transport-declaration guard
 * ───────────────────────────────────────────────────────────────────────────
 * Establishes that the guard's GREEN is not decorative. Same role as
 * `tests/hop3/test_part2_red_proof_legB.mts` plays for the Part 2 probe.
 *
 * Plants an undeclared `fetch()` inside `src/`, runs the guard, and asserts it
 * FAILS naming that file — then removes the plant and asserts the guard is green
 * again. If either half does not hold, this exits non-zero.
 *
 * Run: `npm run check:transport:redproof`
 *
 * The guard's other three controls (missing scan root, absent allowlisted wrapper,
 * allowlisted wrapper containing no sites, min-site floor) were verified
 * break-on-purpose by hand on 2026-08-11 — each mutation produced a RED and the
 * script restored byte-identical. They are not automated here because doing so
 * would require the guard to read its own constants from the environment, and an
 * env-overridable guard is a guard with a documented bypass.
 */

import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const GUARD = join(ROOT, "scripts", "check-transport-declarations.mjs");
const PLANT = join(ROOT, "src", "__redproof_undeclared_call.ts");
const PLANT_REL = "src/__redproof_undeclared_call.ts";

const PLANT_SOURCE = `// Temporary file written by scripts/redproof-transport-guard.mjs.
// If you are reading this in a commit, the red-proof crashed mid-run — delete it.
export async function undeclaredCall(): Promise<unknown> {
  const res = await fetch("http://cortex-bff/graph/node/redproof");
  return res.json();
}
`;

function runGuard() {
  const r = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}`);
  if (!ok) { failures += 1; if (detail) console.log(detail.split("\n").map((l) => `        ${l}`).join("\n")); }
};

try {
  // ── Precondition: green before we touch anything ──
  const before = runGuard();
  check(before.code === 0, "guard is GREEN before the plant", before.out);

  // ── RED half ──
  if (existsSync(PLANT)) throw new Error(`${PLANT_REL} already exists — refusing to overwrite`);
  writeFileSync(PLANT, PLANT_SOURCE, "utf8");
  const red = runGuard();
  check(red.code !== 0, "guard FAILS with an undeclared fetch planted", red.out);
  check(red.out.includes(PLANT_REL), "the failure NAMES the planted file", red.out);

  // ── GREEN half ──
  unlinkSync(PLANT);
  const after = runGuard();
  check(after.code === 0, "guard is GREEN again once the plant is removed", after.out);
} finally {
  if (existsSync(PLANT)) unlinkSync(PLANT);
}

if (failures) {
  console.error(`\n✗ red-proof FAILED (${failures}) — the guard's green cannot be trusted.`);
  process.exit(1);
}
console.log("\n✓ red-proof passed — the guard detects an undeclared call and clears when it is removed.");
