#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// REDPROOF: prove scripts/check-chart-renders.mjs can still FAIL, and fails for the right reason.
//
// That arm passes on the real chart. A render check that has only ever passed is indistinguishable
// from one that cannot fail, so each case below builds a broken COPY of the chart in a temp dir,
// aims the arm at it (CORTEX_CHART_DIR), and requires both the exit code and the MESSAGE — an arm
// that exits 1 for the wrong reason measures nothing. The real chart is never touched; its bytes
// are hashed before and after, and the run fails if they moved.
//
// ⛔ CASE R4 IS THE ONE THE ARM'S DISCRIMINATOR WAS TIGHTENED FOR. A nil-pointer on a value path
// containing "digest" must be filed as a render defect, not as the pin guard firing. The first
// draft of the arm matched the bare word "digest" and would have mis-filed it.
//
// Run:  node scripts/redproof-chart-renders.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHART = join(ROOT, "helm", "cortex-ui");
const ARM = join(ROOT, "scripts", "check-chart-renders.mjs");

function hashTree(dir) {
  const h = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p.slice(dir.length) + "\0").update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}

function copyChart() {
  const d = join(mkdtempSync(join(tmpdir(), "cortex-chart-")), "cortex-ui");
  cpSync(CHART, d, { recursive: true });
  return d;
}

function runArm(dir) {
  const env = { ...process.env };
  if (dir) env.CORTEX_CHART_DIR = dir;
  else delete env.CORTEX_CHART_DIR;
  const r = spawnSync(process.execPath, [ARM], { encoding: "utf8", env });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// Each case: build a copy (or not), say what must be true of the copy for the case to MEAN anything
// (`built`), and what the arm must say.
const CASES = [
  {
    name: "C0 the real chart renders (clean case, runs first)",
    make: () => null,
    built: () => true,
    code: 0,
    must: [/PASS: the chart renders/, /documents rendered = [1-9]/],
  },
  {
    name: "R1 a template reads an undeclared value (the 0.2.0 defect)",
    make: () => {
      const d = copyChart();
      writeFileSync(join(d, "templates", "undeclared.yaml"),
        "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: x\ndata:\n  K: {{ .Values.absent.key | quote }}\n");
      return d;
    },
    built: (d) => existsSync(join(d, "templates", "undeclared.yaml")),
    code: 1,
    must: [/cannot render for a caller/, /nil pointer/],
    mustNot: [/the pin guard/],
  },
  {
    name: "R2 no templates at all — exit 0, rendering nothing",
    make: () => {
      const d = copyChart();
      for (const f of readdirSync(join(d, "templates"))) rmSync(join(d, "templates", f));
      return d;
    },
    built: (d) => readdirSync(join(d, "templates")).length === 0,
    code: 1,
    must: [/rendered NOTHING/],
  },
  {
    name: "R3 the pin guard refuses a VALID digest",
    make: () => {
      const d = copyChart();
      const f = join(d, "templates", "frontend-deployment.yaml");
      writeFileSync(f, readFileSync(f, "utf8").replace('"^sha256:[0-9a-f]{64}$"', '"^sha256:[1-9a-f]{64}$"'));
      return d;
    },
    built: (d) => readFileSync(join(d, "templates", "frontend-deployment.yaml"), "utf8").includes("[1-9a-f]{64}"),
    code: 1,
    must: [/the pin guard, not a render defect/, /MALFORMED/],
  },
  {
    name: "R4 a nil-pointer whose text says 'digest' is still a RENDER defect",
    make: () => {
      const d = copyChart();
      writeFileSync(join(d, "templates", "digestish.yaml"),
        "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: y\ndata:\n  K: {{ .Values.mirror.digest | quote }}\n");
      return d;
    },
    built: (d) => existsSync(join(d, "templates", "digestish.yaml")),
    code: 1,
    must: [/cannot render for a caller/, /nil pointer evaluating interface \{\}\.digest/],
    mustNot: [/the pin guard/],
  },
];

const before = hashTree(CHART);
console.log("INSTRUMENT: arm = " + ARM);
console.log("INSTRUMENT: real chart hash before = " + before.slice(0, 16));
let failures = 0;
let ran = 0;
const fail = (n, why) => { failures++; console.log("  FAIL  " + n + "\n        " + why); };

for (const c of CASES) {
  const d = c.make();
  try {
    if (d && !c.built(d)) { fail(c.name, "UNBUILT — the copy does not carry the mutation, so this case measured nothing"); continue; }
    const { code, out } = runArm(d);
    ran++;
    if (code === 2) { fail(c.name, "the arm measured NOTHING (exit 2): " + out.trim().split("\n").pop()); continue; }
    if (code !== c.code) { fail(c.name, "exit " + code + ", wanted " + c.code + ": " + out.trim().split("\n").slice(-2).join(" | ")); continue; }
    const missing = c.must.filter((re) => !re.test(out));
    if (missing.length) { fail(c.name, "right exit, WRONG REASON — missing " + missing.join(", ")); continue; }
    const present = (c.mustNot || []).filter((re) => re.test(out));
    if (present.length) { fail(c.name, "right exit, WRONG REASON — said " + present.join(", ")); continue; }
    console.log("  ok    " + c.name);
  } finally {
    if (d) rmSync(dirname(d), { recursive: true, force: true });
  }
}

const after = hashTree(CHART);
console.log("INSTRUMENT: real chart hash after  = " + after.slice(0, 16) + (after === before ? "  (unchanged)" : "  ⛔ CHANGED"));
if (after !== before) fail("instrument", "the real chart's bytes moved during the proof");
console.log("INSTRUMENT: " + CASES.length + " cases, " + ran + " ran, " + failures + " failed");
if (ran !== CASES.length || failures > 0) {
  console.log("RESULT: check-chart-renders.mjs is NOT proven — see the failures above.");
  process.exit(1);
}
console.log("RESULT: the render arm passes the real chart and fails every broken copy, each for its own reason.");
