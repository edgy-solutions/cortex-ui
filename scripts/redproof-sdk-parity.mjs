#!/usr/bin/env node
/**
 * RED-proof for the mesh-SDK parity mirror's validator arms AND its PIN arms
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
 * ⛔ AND THE PIN ARMS ARE HERE BECAUSE ONE OF THEM HAS A BRANCH NO FIXTURE CAN REACH. On
 * 2026-09-27 the seal's release arm was rewritten into its own opposite: it had said "no released
 * version contains these FIELDS, which is why it pins a SHA", and v0.9.4 was cut the same night
 * carrying all of them, so the arm went red and the pin moved from a lane-branch commit to the tag.
 * The replacement holds an invariant with two branches — the pin is a RELEASE whose blobs are the
 * extracted bytes, or it is a sha whose recorded REASON names the release it could not use. Only
 * the first branch runs against the real checkout, and an unexercised accepting branch is where a
 * defect lives rent-free. Cases 7-11 below reach both, the far one by making the fixture claim a
 * source the release does not carry — which is itself a drift worth reddening on.
 *
 * ⛔ THE REASON IS NOW COMPUTED, WHICH IS THE POINT. The old pin's justification sat in the fixture
 * as a SENTENCE about v0.9.3, and a sentence does not expire when its premise does. `pinFor` in the
 * extractor derives `sdk_release` from the bytes it read; case 8 puts that sentence back and
 * requires the arm to refuse it.
 *
 * Every mutation is applied to the committed FIXTURE and the fixture is restored byte-for-byte
 * afterwards, which the last line asserts. The SDK checkout belongs to another lane and is never
 * written to, not even to mutate it for a proof.
 *
 * Run: `npm run check:parity:redproof`
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "src", "api", "meshSdkParity.json");
const TEST = "src/api/meshSdkParity.test.ts";
const SAVED = readFileSync(FIXTURE, "utf8");

/**
 * ⛔ AND THE ARM NAME IS NOT ENOUGH EITHER — WHICH ASSERTION REDDENED IS PART OF THE CLAIM.
 *
 * Measured 2026-09-27, after the pin mutants were added: both far-branch cases were scored "RED as
 * required" on the arm name while reaching nothing they were aimed at. They add a source path to the
 * fixture to force the arm down its else; the arm reads each source OFF THE DISK first, so a path
 * that exists in no release does not exist on disk either and the read threw ENOENT. Arm red, branch
 * never entered — a mutant standing in for the easy variant of its own defect, which is the shape
 * this repo keeps paying for.
 *
 * So a mutant may name the MESSAGE it must trip. That is checked with a run filtered to the one arm,
 * because with several arms red there is no reliable way to attribute an AssertionError to one of
 * them. The filter is passed as a single quoted argument: under `shell: true` an unquoted pattern
 * with spaces splits into extra positional args, which vitest reads as more FILE filters — that was
 * measured too, as a filtered run that somehow failed six arms.
 */
function runFiltered(arm) {
  const r = spawnSync("npx", ["vitest", "run", TEST, "-t", `"${arm}"`], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // "N passed" is absent entirely when the filter leaves nothing passing, so failed is read alone.
  const failed = /Tests\s+(\d+) failed/.exec(out);
  /*
    ⛔ A THROW IS A REASON, AND THE FIRST DRAFT COULD NOT READ ONE. This matched `AssertionError:`
    only, so the v0.9.3 case below — whose honest verdict is the extractor REFUSING a ref where the
    mirrored classes are not declared — reported "the arm died before asserting" and was scored NOT
    RED. The arm was behaving exactly as written; the instrument could not see it. An arm that
    reddens by refusing is not a lesser red, and a matcher that only understands assertions quietly
    turns every refusing arm into an unproven one.
  */
  const msg = /(?:AssertionError|Error): ([^\n]+)/.exec(out);
  return { failed: failed ? Number(failed[1]) : 0, message: msg ? msg[1] : null };
}

function run() {
  const r = spawnSync("npx", ["vitest", "run", TEST], { cwd: ROOT, encoding: "utf8", shell: true });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(out);
  // The arm NAMES, taken from the reporter's failure lines. Nothing else is allowed to score.
  const names = [...out.matchAll(/(?:×|✗|FAIL).*?>\s*(.+?)\s*(?:\d+ms)?$/gm)].map((x) => x[1].trim());
  return { failed: m?.[1] ? Number(m[1]) : 0, passed: m ? Number(m[2]) : null, names, out };
}

const modelValidator = (j) => j.classes.MethodBlock.validators.find((v) => v.kind === "model_validator");

/**
 * A path that is ON DISK in the SDK and NOT in its newest release — the only lever this side has for
 * driving the seal's release arm down its far branch, since that branch turns on the extracted bytes
 * differing from the tag and the SDK checkout must never be written to.
 *
 * Computed, not written down: a hardcoded path would rot the first time the SDK tidied up, and would
 * rot by making these two cases pass for the wrong reason. If nothing qualifies the cases are
 * reported as UNBUILT and counted against the proof, because a mutant that could not be constructed
 * is not a mutant that passed.
 */
const divergent = (() => {
  const sdk = join(ROOT, "..", "iagent-mesh-sdk");
  const g = (...a) => spawnSync("git", ["-C", sdk, ...a], { encoding: "utf8" });
  const newest = g("describe", "--tags", "--abbrev=0");
  if (newest.status !== 0) return null;
  const tag = newest.stdout.trim();
  /*
    ⛔ COMMITTED DIVERGENCE FIRST, THE WORKING TREE ONLY AS A FALLBACK — AND THE INSTRUMENT SAYS WHICH.
    Both answer "differs from the tag", but they differ in how long the answer lasts. A path in HEAD
    and not in the tag lasts as long as the SDK is past its release, which is the same condition the
    far branch is about; a path that differs only because a sibling lane's tree is dirty disappears
    the moment that lane commits or discards, taking these two cases to UNBUILT on a day when nothing
    about cortex changed.

    The first version asked only `git diff --name-only <tag>` — the working tree against the tag,
    which INCLUDES committed changes and cannot report which kind it found. I read its answer,
    `iagent_mesh/write_results.py`, as dirty-state-dependent and wrote that down. It is not: that path
    is in `v0.9.4..HEAD`, and the SDK's only dirty path is `.claude/settings.local.json`. So the
    fragility was never measured, it was inferred from a query that could not distinguish the two —
    which is the whole reason `kind` is printed now. The ordering is still the right preference; the
    diagnosis that motivated it was wrong, and an unlabelled answer is how it stayed wrong.
  */
  for (const [kind, ...args] of [
    ["committed", "diff", "--name-only", `${tag}..HEAD`],
    ["working tree (fragile — another lane's uncommitted state)", "diff", "--name-only", tag],
  ]) {
    const diff = g(...args);
    if (diff.status !== 0) continue;
    for (const f of diff.stdout.split("\n").map((x) => x.trim()).filter(Boolean)) {
      if (existsSync(join(sdk, f)) && g("cat-file", "-e", `${tag}:${f}`).status !== 0) {
        return { path: f, kind };
      }
    }
  }
  return null;
})();
console.log(
  "INSTRUMENT: far-branch lever (on disk, absent from the newest release) = " +
    (divergent ? `${divergent.path}  [${divergent.kind}]` : "NONE FOUND"),
);

const MUTANTS = [
  {
    name: "every validator list emptied — the hollow-green case",
    arm: "captured validators at all",
    message: /no validator was captured at all/,
    mutate(j) {
      for (const e of Object.values(j.classes)) e.validators = [];
    },
  },
  {
    name: "MethodBlock's model_validator deleted outright",
    arm: "XOR",
    message: /declares no model_validator at the pinned sha/,
    mutate(j) {
      j.classes.MethodBlock.validators = j.classes.MethodBlock.validators.filter((v) => v.kind !== "model_validator");
    },
  },
  {
    name: "the raise commented out — the words survive, the rule does not",
    arm: "XOR",
    // The same message as the case below ON PURPOSE: they are two spellings of one defect, and the
    // reason they are separate cases is that this one passed the arm's old substring check.
    message: /no longer RAISES on a line of its own/,
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.source.replace("raise ValueError", "pass  # was: raise ValueError");
    },
  },
  {
    name: "the raise removed outright",
    arm: "XOR",
    message: /no longer RAISES on a line of its own/,
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.source.replace(/^\s*raise ValueError.*$/m, "        pass");
    },
  },
  {
    name: "the rule tests only bound, dropping the other half of the XOR",
    arm: "XOR",
    message: /no longer the XOR/,
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
    message: /was captured without its def/,
    mutate(j) {
      const v = modelValidator(j);
      v.source = v.decorator;
    },
  },

  // ── THE PIN, NEAR BRANCH: the newest tag matches the disk, so the pin must name it ────────
  {
    name: "the pin reverts to a sha while the release still matches the disk",
    arm: "names a RELEASE",
    message: /so the pin must name the release/,
    mutate(j) {
      j.provenance.sdk_ref = j.provenance.sdk_sha;
    },
  },
  {
    name: "sdk_release is prose about the tag instead of the tag — the exact shape that went stale",
    arm: "names a RELEASE",
    message: /sdk_release must BE the tag/,
    mutate(j) {
      j.provenance.sdk_release =
        "UNRELEASED — the newest tag (v0.9.3) contains neither MethodBlock nor completeness; HEAD is past it and pyproject is unbumped, so a SHA is the only honest pin";
    },
  },
  {
    name: "the sha is 40 hex and wrong — a tag named next to a commit that is not its own",
    arm: "names a RELEASE",
    message: /the sha must be the tag's COMMIT/,
    mutate(j) {
      // Deliberately a real-looking sha: the arm must compare it to the PEELED tag, not pattern-match it.
      j.provenance.sdk_sha = "0000000000000000000000000000000000000000";
    },
  },

  // ── THE PIN, FAR BRANCH: a source the release does not carry sends the arm down the else ──
  {
    name: "far branch, and the sha pin's reason names no release at all",
    arm: "names a RELEASE",
    message: /must state which release it could not use/,
    needs: "divergentSource",
    mutate(j) {
      j.provenance.sources.push(divergent.path);
      j.provenance.sdk_ref = j.provenance.sdk_sha;
      j.provenance.sdk_release = "UNRELEASED — a SHA is the only honest pin";
    },
  },
  {
    name: "far branch, and the pin claims to be the release it just failed to match",
    arm: "names a RELEASE",
    message: /must not also claim to be a release/,
    needs: "divergentSource",
    mutate(j) {
      j.provenance.sources.push(divergent.path);
    },
  },

  // ── WHAT THE EXPIRED ARM WAS ACTUALLY FOR, now asserted in the positive ───────────────────
  {
    name: "the pin moved back to v0.9.3, where the mirrored classes are not declared at all",
    arm: "CONTAINS every mirrored field",
    // The extractor REFUSES the ref rather than reporting an empty field set, which is the arm's
    // deliberate design: at a ref the mirror PINS, a class it cannot parse is the finding. So the
    // reason to require is the refusal, not a missing-field list — see the next case for that.
    message: /class MethodInput is not declared in this file/,

    mutate(j) {
      j.provenance.sdk_ref = "v0.9.3";
    },
  },
  {
    name: "v0.9.3, narrowed to the one class it declares — the FIELD half of the same defect",
    arm: "CONTAINS every mirrored field",
    /*
      ⛔ WHY THIS IS NOT THE CASE ABOVE AGAIN. That one reddens on a REFUSAL and never reaches the
      field comparison; this one reaches it. v0.9.3 declares `EnumerateInstancesResponse` with
      `instances` and `scoped_by` and without `completeness` or `total_available` — which are two of
      the three subjects the expired arm named by hand as unreleased. Firing only the refusal would
      leave the census itself unexercised, and a subset that is never compared is a subset nobody
      is checking.
    */
    message: /EnumerateInstancesResponse\.completeness/,
    mutate(j) {
      j.provenance.sdk_ref = "v0.9.3";
      j.classes = { EnumerateInstancesResponse: j.classes.EnumerateInstancesResponse };
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
  if (m.needs === "divergentSource" && !divergent) {
    bad++;
    console.log(`\n⛔ UNBUILT  ${m.name}`);
    console.log("   no on-disk source is absent from the newest release, so this case could not be");
    console.log("   constructed. Counted against the proof: a mutant that was never fired proves nothing,");
    console.log("   and silently skipping it is how a redproof stops being one.");
    continue;
  }
  const j = JSON.parse(SAVED);
  m.mutate(j);
  writeFileSync(FIXTURE, `${JSON.stringify(j, null, 2)}\n`);
  const r = run();
  // The reason, from a run filtered to the one arm, written while the fixture is still mutated.
  const why = m.message ? runFiltered(m.arm) : null;
  writeFileSync(FIXTURE, SAVED);

  const named = r.failed > 0 && r.names.some((n) => n.includes(m.arm));
  const reasoned = !m.message || (why.failed === 1 && why.message !== null && m.message.test(why.message));
  const ok = named && reasoned;
  if (!ok) bad++;
  console.log(`\n${ok ? "RED as required" : "⛔ NOT RED"}  ${m.name}`);
  console.log(`   failed=${r.failed} passed=${r.passed}  required an arm matching ${JSON.stringify(m.arm)}`);
  if (r.failed > 0) console.log(`   arms that failed: ${r.names.join(" | ") || "(names not parsed — check the reporter)"}`);
  if (m.message) {
    console.log(`   required message ${m.message} -> ${reasoned ? "matched" : "⛔ NOT MATCHED"}`);
    console.log(`   filtered run: failed=${why.failed}, message=${why.message ?? "(none — the arm died before asserting)"}`);
  }
}

const restored = readFileSync(FIXTURE, "utf8") === SAVED;
console.log(`\nINSTRUMENT: fixture restored byte-for-byte: ${restored}`);
console.log(`INSTRUMENT: ${MUTANTS.length} mutants, ${bad} failed to redden the arm they were for`);
if (!restored) {
  console.error("REFUSED: the fixture was NOT restored. Restore it from git before committing anything.");
  process.exit(3);
}
process.exit(bad === 0 ? 0 : 1);
