#!/usr/bin/env node
/**
 * RED-proof for the contract test suite
 * ───────────────────────────────────────────────────────────────────────────
 * Establishes that the contract tests' GREEN is not decorative — same role
 * `redproof-transport-guard.mjs` plays for the transport guard.
 *
 * Mutates ONE threshold in ChartWidget.contract.ts (minNumericColumns 1 -> 0),
 * runs the suite, and asserts it FAILS. Then restores the file BYTE-IDENTICAL and
 * asserts the suite is green again. If either half does not hold, exits non-zero.
 *
 * Why THIS mutation: `normalizeChartData` reads its thresholds FROM the contract
 * (slice 1's binding). Loosening the numeric-column floor makes the component stop
 * refusing a payload it should refuse — exactly the failure the suite exists to
 * catch, and exactly what slice 2c will delete 194 lines of backend compensation
 * on the strength of.
 *
 * Run: `npm run test:redproof`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "src", "components", "mesh", "ChartWidget.contract.ts");
const original = readFileSync(target, "utf8");

const NEEDLE = "minNumericColumns: 1,";
const MUTANT = "minNumericColumns: 0,";

function runSuite() {
  try {
    execSync("npx vitest run --reporter=dot", { cwd: root, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (!original.includes(NEEDLE)) {
  console.error(`RED-PROOF ABORTED: anchor ${NEEDLE} not found in ${target}.`);
  console.error("The contract changed shape; update this red-proof rather than deleting it.");
  process.exit(2);
}

let restored = false;
try {
  writeFileSync(target, original.replace(NEEDLE, MUTANT), "utf8");
  const greenUnderMutation = runSuite();
  writeFileSync(target, original, "utf8");
  restored = true;

  if (greenUnderMutation) {
    console.error("RED-PROOF FAILED: the suite stayed GREEN with minNumericColumns loosened to 0.");
    console.error("The contract tests do not actually execute the threshold they claim to pin.");
    process.exit(1);
  }
  if (readFileSync(target, "utf8") !== original) {
    console.error("RED-PROOF FAILED: the contract file was not restored byte-identical.");
    process.exit(1);
  }
  if (!runSuite()) {
    console.error("RED-PROOF FAILED: the suite is RED after restoration — the mutation leaked.");
    process.exit(1);
  }
  console.log("RED-PROOF OK: mutation -> RED, restoration -> GREEN, file byte-identical.");
} finally {
  if (!restored) writeFileSync(target, original, "utf8");
}
