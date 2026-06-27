#!/usr/bin/env node
/**
 * Hop 3 Part 1 — Artifact type byte-identical-diff probe
 * docs/plans/projector-build-plan.md commit 0eda9f7 §4 Hop 3.
 *
 * Baseline reference: commit 496fd8c — "hop1: Artifact gains
 * durability_status + watermark fields". The architect's guardrail:
 *
 *   Baselining against pre-Hop-1 (4f359dc, Phase 1) would diff
 *   `durability_status` + `watermark` as drift and fail the gate
 *   forever. The Part 1 probe MUST baseline against the post-Hop-1
 *   commit (496fd8c) which is where the architect-approved
 *   additions ALREADY landed. The audit trail comment immediately
 *   below this header records this guardrail.
 *
 * What this probe protects:
 *
 *   Hop 3 / Electric did not drift the `Artifact` interface beyond
 *   Hop 1's deliberate `durability_status` + `watermark` additions.
 *   If Electric's row-shape needs a new field on Artifact, that is a
 *   PREMISE-SHIFT requiring its own architect ruling and must NOT
 *   slip in silently. The diff probe HALTS the hop if the Artifact
 *   interface body diverges from baseline.
 *
 * RED-first verification (per [[pre-written-fixtures-must-fail-first]]):
 *   1. Write the probe.
 *   2. Add a junk field to the Artifact interface (e.g.,
 *      `__hop3_junk: string;`).
 *   3. Run: expect RED with the predicted reason "Artifact
 *      interface body differs from 496fd8c baseline (junk field
 *      added)".
 *   4. Revert the junk field.
 *   5. Run: expect GREEN.
 *
 * The probe runs under `node`; no test framework needed.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

// === BASELINE REFERENCE — load-bearing comment ===
//
// 496fd8c is the post-Hop-1 commit that added durability_status +
// watermark to the Artifact interface. The Part 1 byte-identical-diff
// probe baselines against THIS commit, not against pre-Hop-1
// (4f359dc, Phase 1). The architect specifically flagged this:
// baselining against pre-Hop-1 would diff durability_status + watermark
// as drift and fail forever; baselining against the working tree
// would dissolve the gate entirely (no fixed reference).
//
// If a future revision of the plan or a future hop adds more fields
// to the Artifact interface that should join the baseline (e.g.,
// Hop 4 might add a `published_at` field), the baseline commit SHIFTS
// to that hop's closing commit and this constant updates with it.
// Until that happens, 496fd8c is THE baseline.
const BASELINE_REF = "496fd8c";

const TARGET_FILE = "src/api/types.ts";
const INTERFACE_NAME = "Artifact";

/**
 * Extract the body of `export interface Artifact { … }` from a
 * TypeScript source. We string-bracket on the opening declaration
 * and balance braces. AST parsing would be more robust but adds a
 * dependency for a one-off probe; balanced-brace works for this
 * shape and is auditable line-by-line per
 * [[verify-subtle-acceptance-by-inspection]].
 */
function extractInterfaceBlock(source, name) {
  const startPattern = new RegExp(
    `^export\\s+interface\\s+${name}\\s*\\{`,
    "m"
  );
  const startMatch = source.match(startPattern);
  if (!startMatch) {
    throw new Error(`Could not find 'export interface ${name} {' in source`);
  }
  const startIdx = startMatch.index;
  const openBraceIdx = source.indexOf("{", startIdx);
  let depth = 1;
  let i = openBraceIdx + 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  if (depth !== 0) {
    throw new Error(`Unbalanced braces extracting ${name} interface`);
  }
  return source.slice(startIdx, i);
}

/**
 * Normalize trivial whitespace: collapse multiple blank lines to one,
 * strip trailing whitespace. Do NOT normalize JSDoc content — content
 * drift in the doc comments IS drift we want to catch.
 */
function normalize(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function read(ref) {
  if (ref === "WORKTREE") {
    return readFileSync(join(repoRoot, TARGET_FILE), "utf8");
  }
  return execSync(`git show ${ref}:${TARGET_FILE}`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function main() {
  const baselineSrc = read(BASELINE_REF);
  const worktreeSrc = read("WORKTREE");

  const baselineBlock = normalize(
    extractInterfaceBlock(baselineSrc, INTERFACE_NAME)
  );
  const worktreeBlock = normalize(
    extractInterfaceBlock(worktreeSrc, INTERFACE_NAME)
  );

  if (baselineBlock === worktreeBlock) {
    console.log(
      `[GREEN] ${TARGET_FILE} \`interface ${INTERFACE_NAME}\` matches baseline ${BASELINE_REF}`
    );
    process.exit(0);
  }

  console.error(
    `[RED] ${TARGET_FILE} \`interface ${INTERFACE_NAME}\` differs from baseline ${BASELINE_REF}`
  );
  console.error("");
  console.error("=== Baseline (post-Hop-1, commit " + BASELINE_REF + ") ===");
  console.error(baselineBlock.slice(0, 400));
  console.error("...");
  console.error("");
  console.error("=== Worktree ===");
  console.error(worktreeBlock.slice(0, 400));
  console.error("...");
  console.error("");
  // First diverging line — for fast triage.
  const baseLines = baselineBlock.split("\n");
  const workLines = worktreeBlock.split("\n");
  const len = Math.min(baseLines.length, workLines.length);
  for (let i = 0; i < len; i++) {
    if (baseLines[i] !== workLines[i]) {
      console.error(`First divergence at line ${i + 1}:`);
      console.error(`  baseline: ${baseLines[i]}`);
      console.error(`  worktree: ${workLines[i]}`);
      break;
    }
  }
  if (baseLines.length !== workLines.length) {
    console.error(
      `Length differs: baseline=${baseLines.length} worktree=${workLines.length}`
    );
  }
  process.exit(1);
}

main();
