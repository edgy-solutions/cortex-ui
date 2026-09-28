#!/usr/bin/env node
/**
 * ⛔ THE CROSS-REPO SEALS MUST HAVE RUN — not merely passed.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
 *
 * Nine test files in this repo read a PEER repo off the filesystem: the gateway, the producer's
 * declarations, the mesh SDK's pydantic models. Every one of them is gated on the peer being
 * present, because a developer without the peer checked out must still be able to run the suite.
 * That gate is `it.skipIf(!HAVE_X)`, and a skipped arm is GREEN.
 *
 * So the whole cross-repo half of this suite has exactly one failure mode, and it is silent: the
 * peer is absent, every arm skips, the run passes, and the build reports coverage it does not have.
 * This has already happened here — `build.yml` records it: "A single `actions/checkout` meant the
 * producer was absent on every build since the seal landed, so all 28 parity assertions silently
 * skipped and every green build appeared to carry coverage it did not have."
 *
 * ⚠ AND IT HAPPENED AGAIN, IN THE INSTRUMENT, THE DAY THIS FILE WAS WRITTEN. A mutant survey over
 * these same seals called a baseline GREEN on `vitest run -t "<name>"` exiting 0 — but a `-t`
 * filter matching NO test exits 0 and prints "56 skipped". One arm's filter had a capital letter
 * the title did not, so nothing ran, the baseline read green, and the mutant "survived" while the
 * code was never exercised. The exit code is not the instrument. A COUNT is.
 *
 * ── WHAT IT ASSERTS ───────────────────────────────────────────────────────────────────────────
 *
 * Given vitest's JSON report, that no arm in any cross-repo seal file was skipped. Not "the run
 * passed" — that is the claim that cannot fail.
 *
 * ⛔ THE POPULATION IS CENSUSED, NOT LISTED. A hand-written list of seal files cannot notice a
 * TENTH one added next month, and a seal nobody added to the list is exactly the seal that will
 * skip unnoticed. So the population is every test file that reaches outside this repo — keyed on
 * the path traversal and on `CANDIDATE_ROOTS`, not on the peer's NAME, because a dozen files
 * mention `invincible-agent` inside a mesh URI (`http://invincible-agent/mesh#...`) and none of
 * those reads a peer.
 *
 * ⛔ AND AN EMPTY CENSUS IS A FAILURE, NOT A PASS. A grep that matches nothing is a claim about the
 * grep. If the traversal spelling changes, this must go red rather than congratulate itself on
 * zero skipped arms out of zero files.
 *
 * Usage: node scripts/check-cross-repo-seals.mjs <vitest-json-report>
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

/**
 * How a seal reaches a peer. Both spellings in use today:
 *   - `path.join(__dirname, "../../../invincible-agent/src/iagent/gateway.py")` — a literal
 *     traversal out of `src/`, three or more levels up.
 *   - `CANDIDATE_ROOTS = ["invincible-agent", "ia-01"]` — the form used where this machine carries
 *     the producer twice and either checkout will do.
 * Keyed on the REACH, not on the peer's name. See the header.
 */
const REACHES_A_PEER = [/"\.\.\/\.\.\/\.\.\//, /CANDIDATE_ROOTS/];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const census = walk(SRC).filter((f) => {
  const src = readFileSync(f, "utf8");
  return REACHES_A_PEER.some((re) => re.test(src));
});

console.log(`INSTRUMENT: cross-repo seal files censused = ${census.length}`);
for (const f of census) console.log(`  - ${path.relative(ROOT, f).replace(/\\/g, "/")}`);

if (census.length === 0) {
  console.error(
    "::error::the census found NO cross-repo seal file. That is a claim about the pattern in this\n" +
      "script, not about the repo — the traversal spelling has probably changed. Fix the census\n" +
      "rather than trusting a zero.",
  );
  process.exit(1);
}

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("::error::usage: node scripts/check-cross-repo-seals.mjs <vitest-json-report>");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  console.error(`::error::cannot read the vitest json report at ${reportPath}: ${e.message}`);
  process.exit(2);
}

const files = report.testResults ?? [];
if (files.length === 0) {
  console.error("::error::the vitest report contains no test files at all — nothing was measured.");
  process.exit(1);
}

const norm = (p) => String(p).replace(/\\/g, "/");
let skipped = 0;
let missing = 0;
let ran = 0;

for (const seal of census) {
  const rel = norm(path.relative(ROOT, seal));
  const entry = files.find((f) => norm(f.name).endsWith(rel));
  if (!entry) {
    // A censused seal absent from the report never ran at all — a different failure from skipping,
    // and the one a `--reporter=json` over a FILTERED run would produce. Named separately so the
    // message says which mistake was made.
    console.error(`::error::${rel} is a cross-repo seal but does not appear in the report at all.`);
    missing++;
    continue;
  }
  const arms = entry.assertionResults ?? [];
  const notRun = arms.filter((a) => a.status !== "passed" && a.status !== "failed");
  ran += arms.length - notRun.length;
  if (notRun.length > 0) {
    skipped += notRun.length;
    console.error(
      `::error::${rel}: ${notRun.length} of ${arms.length} arms did not run — the peer repo is` +
        ` absent, so these assertions were GREEN WITHOUT BEING MADE:`,
    );
    for (const a of notRun) console.error(`    [${a.status}] ${a.title}`);
  }
}

console.log(`INSTRUMENT: cross-repo arms that ran = ${ran}, did not run = ${skipped}, files missing from report = ${missing}`);

if (skipped > 0 || missing > 0) {
  console.error(
    "\n::error::A cross-repo seal was skipped. This is not a flake and not a warning: the peer\n" +
      "checkout is what these arms measure, and without it the build reports coverage it does not\n" +
      "have. Check out the peer beside cortex-ui (see build.yml) rather than relaxing this guard.",
  );
  process.exit(1);
}

console.log("OK: every cross-repo seal arm ran.");
