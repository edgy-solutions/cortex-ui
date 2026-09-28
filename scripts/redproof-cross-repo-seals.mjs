#!/usr/bin/env node
/**
 * ⛔ PROVE `check-cross-repo-seals.mjs` CAN FAIL.
 *
 * A guard that has only ever seen a good run has not been shown capable of indicting a bad one.
 * The thing this guard is against — a cross-repo seal skipping because the peer is absent — cannot
 * be staged by hiding a peer: the peer checkouts on this machine are READ-ONLY to this lane and
 * moving one would break every other session sharing it.
 *
 * So the REPORT is doctored instead, which is the same move `cardExport.test.tsx` uses on the
 * export document. The guard's input is a vitest JSON report; a report with one arm marked
 * `skipped` is exactly what an absent peer produces, and it is the one thing that must be rejected.
 *
 * ⛔ BOTH DIRECTIONS, AND THE CLEAN CASE FIRST. A pair of controls that fail identically means the
 * difference was never installed — so this asserts the guard ACCEPTS the clean report before it
 * asserts the guard REJECTS the doctored one. Without the first, a guard that rejects everything
 * scores a perfect redproof.
 *
 * ⚠ AND EACH REJECTION IS CHECKED FOR THE RIGHT REASON. A redproof that exits 1 because the script
 * crashed on a bad path measures nothing; this lane has paid for that once already. Every expected
 * failure is matched against the message it must carry.
 *
 * Usage: node scripts/redproof-cross-repo-seals.mjs [vitest-json-report]
 *   With no argument it runs the suite itself to produce one, which takes a few minutes.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GUARD = path.join(ROOT, "scripts/check-cross-repo-seals.mjs");
const tmp = mkdtempSync(path.join(tmpdir(), "redproof-xrepo-"));

let reportPath = process.argv[2];
if (!reportPath) {
  reportPath = path.join(tmp, "report.json");
  console.log("no report given — running the suite to produce one (this takes a few minutes)");
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`],
    { cwd: ROOT, stdio: "inherit" },
  );
}

/** Run the guard over a report. Returns {code, out} — the CODE is never the whole verdict. */
function runGuard(p) {
  try {
    const out = execFileSync(process.execPath, [GUARD, p], { cwd: ROOT, encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const results = [];
const check = (label, cond, detail) => {
  results.push([label, cond ? "PASS" : "FAIL", detail]);
  console.log(`${cond ? "  ok  " : "*FAIL*"} ${label}${cond ? "" : ` — ${detail}`}`);
};

// ── 1. THE CLEAN CASE, FIRST AND ON ITS OWN ───────────────────────────────────────────────────
const clean = runGuard(reportPath);
check("the guard ACCEPTS the real report", clean.code === 0, `exit ${clean.code}\n${clean.out}`);
check(
  "and it censused a non-empty population",
  /cross-repo seal files censused = [1-9]/.test(clean.out),
  clean.out,
);

// Which files the guard considers in scope, read back out of its own output rather than restated
// here — a redproof that doctors a file the guard does not look at proves nothing.
const inScope = [...clean.out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1].trim());
check("and it named the files it censused", inScope.length > 0, clean.out);

const norm = (p) => String(p).replace(/\\/g, "/");
const target = inScope[0];
const entry = (report.testResults ?? []).find((f) => norm(f.name).endsWith(target));
check(`and the first censused file ${target} is present in the report`, Boolean(entry), "not found");

// ── 2. ONE ARM MARKED SKIPPED — what an absent peer produces ──────────────────────────────────
if (entry) {
  const doctored = JSON.parse(JSON.stringify(report));
  const d = doctored.testResults.find((f) => norm(f.name).endsWith(target));
  const armTitle = d.assertionResults[0].title;
  d.assertionResults[0].status = "skipped";
  const p1 = path.join(tmp, "one-skipped.json");
  writeFileSync(p1, JSON.stringify(doctored));
  const r1 = runGuard(p1);
  check("REJECTS a report with one arm skipped", r1.code === 1, `exit ${r1.code}`);
  check(
    "  ...and names the skipped arm, so the message is actionable",
    r1.out.includes(armTitle),
    `the arm title "${armTitle}" is absent from the output`,
  );
  check(
    "  ...for the RIGHT reason (did not run), not a crash",
    /did not run/.test(r1.out),
    r1.out,
  );

  // ── 3. THE WHOLE FILE MISSING — an absent peer can also mean an unloaded file ───────────────
  const gone = JSON.parse(JSON.stringify(report));
  gone.testResults = gone.testResults.filter((f) => !norm(f.name).endsWith(target));
  const p2 = path.join(tmp, "file-missing.json");
  writeFileSync(p2, JSON.stringify(gone));
  const r2 = runGuard(p2);
  check("REJECTS a report with a censused seal file absent", r2.code === 1, `exit ${r2.code}`);
  check(
    "  ...and says so distinctly from a skip",
    /does not appear in the report/.test(r2.out),
    r2.out,
  );
}

// ── 4. AN EMPTY REPORT — the shape that would otherwise pass vacuously ────────────────────────
const empty = path.join(tmp, "empty.json");
writeFileSync(empty, JSON.stringify({ testResults: [] }));
const r3 = runGuard(empty);
check("REJECTS a report with no test files at all", r3.code === 1, `exit ${r3.code}`);
check("  ...for the right reason (nothing measured)", /nothing was measured/.test(r3.out), r3.out);

// ── 5. A MISSING/UNPARSEABLE REPORT must be an ERROR, not a pass ──────────────────────────────
const r4 = runGuard(path.join(tmp, "no-such-file.json"));
check("REJECTS a report path that does not exist", r4.code !== 0, `exit ${r4.code}`);

const failed = results.filter((r) => r[1] === "FAIL");
console.log(`\nINSTRUMENT: redproof checks = ${results.length}, failed = ${failed.length}`);
if (failed.length > 0) {
  console.error("the guard is NOT proven able to fail as intended:");
  for (const [l, , d] of failed) console.error(` - ${l}: ${d}`);
  process.exit(1);
}
console.log("OK: the guard accepts a clean report and rejects all four bad shapes.");
