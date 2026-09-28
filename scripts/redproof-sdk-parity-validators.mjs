#!/usr/bin/env node
/**
 * RED-proof for the validator arms of the mesh-SDK parity mirror
 * ───────────────────────────────────────────────────────────────────────────
 * Same role `redproof-transport-guard.mjs` plays for the transport guard and
 * `redproof-chart-image-pin.mjs` plays for the chart's image pin: it establishes that the
 * validator arms in `src/api/meshSdkParity.test.ts` can still FAIL.
 *
 * ⛔ WHY IT EXISTS. Until 2026-09-27 the parity snapshot carried fields and, by an explicit
 * decision in the extractor's header, NOT validators. The ruling that day was to move the pin past
 * the commit carrying the MethodBlock bound/bound_defaulted XOR, "so the XOR validator is what the
 * mirror mirrors". Bumping the pin changed the snapshot by ONE LINE — the sha — because a
 * fields-only mirror cannot see a rule. Compliance with the sentence, nothing for the thing it was
 * for. So the extractor now captures validators, and these arms read them.
 *
 * ⛔ AND A VALIDATOR ARM IS THE EASIEST KIND TO HOLLOW OUT. If `extractValidators` returned [] for
 * every class, the drift arm compares [] to [] across all five classes and passes, reporting that
 * the mirror tracks validators while it tracks nothing. That is why mutant 1 exists and why it is
 * fired at the population rather than at one rule.
 *
 * ⛔ THE INSTRUMENT IS THE FAILED ARM'S NAME, NEVER THE EXIT CODE AND NEVER THE LOG. Two traps,
 * both walked into on the day this was written:
 *   - a vitest run filtered to nothing exits 0 and prints "N skipped", which reads as a green;
 *   - scoring on `stdout.includes("XOR")` matched the describe block's own title, so a mutant whose
 *     XOR arm stayed GREEN was reported as "RED as required". That mutant — a raise replaced by
 *     `pass  # was: raise ValueError` — is case 3 below, and it is the one that found the hole: the
 *     arm asserted the SUBSTRING "raise ValueError", which a commented-out raise satisfies. The arm
 *     is now anchored to a line that starts with the raise. A control that can pass under the drift
 *     it names is not a control.
 *
 * Every mutation is applied to the committed FIXTURE and the fixture is restored byte-for-byte
 * afterwards, which the last line asserts. The SDK checkout belongs to another lane and is never
 * written to, not even to mutate it for a proof.
 *
 * Run: `npm run check:parity:redproof`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "src", "api", "meshSdkParity.json");
const TEST = "src/api/meshSdkParity.test.ts";
const SAVED = readFileSync(FIXTURE, "utf8");

function run() {
  const r = spawnSync("npx", ["vitest", "run", TEST], { cwd: ROOT, encoding: "utf8", shell: true });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(out);
  // The arm NAMES, taken from the reporter's failure lines. Nothing else is allowed to score.
  const names = [...out.matchAll(/(?:×|✗|FAIL).*?>\s*(.+?)\s*(?:\d+ms)?$/gm)].map((x) => x[1].trim());
  return { failed: m?.[1] ? Number(m[1]) : 0, passed: m ? Number(m[2]) : null, names, out };
}

const modelValidator = (j) => j.classes.MethodBlock.validators.find((v) => v.kind === "model_validator");

const MUTANTS = [
  {
    name: "every validator list emptied — the hollow-green case",
    arm: "captured validators at all",
    mutate(j) {
      for (const e of Object.values(j.classes)) e.validators = [];
    },
  },
  {
    name: "MethodBlock's model_validator deleted outright",
    arm: "XOR",
    mutate(j) {
      j.classes.MethodBlock.validators = j.classes.MethodBlock.validators.filter((v) => v.kind !== "model_validator");
    },
  },
  {
    name: "the raise commented out — the words survive, the rule does not",
    arm: "XOR",
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.source.replace("raise ValueError", "pass  # was: raise ValueError");
    },
  },
  {
    name: "the raise removed outright",
    arm: "XOR",
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.source.replace(/^\s*raise ValueError.*$/m, "        pass");
    },
  },
  {
    name: "the rule tests only bound, dropping the other half of the XOR",
    arm: "XOR",
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.source.replace(
        "(self.bound is None) != (self.bound_defaulted is None)",
        "self.bound is None and self.bound_defaulted is None",
      );
    },
  },
  {
    name: "a validator captured as a bare decorator, no body",
    arm: "carries the def",
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.decorator;
    },
  },
];

console.log("INSTRUMENT: baseline first — the committed fixture must be GREEN, or every red below is noise.");
const base = run();
console.log(`  baseline: ${base.passed} passed, ${base.failed} failed`);
if (base.failed !== 0 || !base.passed) {
  writeFileSync(FIXTURE, SAVED);
  console.error("REFUSED: the baseline is not green. Fix that before reading this proof.");
  process.exit(2);
}

let bad = 0;
for (const m of MUTANTS) {
  const j = JSON.parse(SAVED);
  m.mutate(j);
  writeFileSync(FIXTURE, `${JSON.stringify(j, null, 2)}\n`);
  const r = run();
  writeFileSync(FIXTURE, SAVED);

  const ok = r.failed > 0 && r.names.some((n) => n.includes(m.arm));
  if (!ok) bad++;
  console.log(`\n${ok ? "RED as required" : "⛔ NOT RED"}  ${m.name}`);
  console.log(`   failed=${r.failed} passed=${r.passed}  required an arm matching ${JSON.stringify(m.arm)}`);
  if (r.failed > 0) console.log(`   arms that failed: ${r.names.join(" | ") || "(names not parsed — check the reporter)"}`);
}

const restored = readFileSync(FIXTURE, "utf8") === SAVED;
console.log(`\nINSTRUMENT: fixture restored byte-for-byte: ${restored}`);
console.log(`INSTRUMENT: ${MUTANTS.length} mutants, ${bad} failed to redden the arm they were for`);
if (!restored) {
  console.error("REFUSED: the fixture was NOT restored. Restore it from git before committing anything.");
  process.exit(3);
}
process.exit(bad === 0 ? 0 : 1);
