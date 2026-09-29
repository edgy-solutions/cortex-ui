#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Does this chart render for a real caller? One arm, no --set beyond the pin.
//
// ⛔ WHY THIS IS SEPARATE FROM redproof-chart-image-pin.mjs. That script renders this chart four
// times and is green. It is green because it passes CONFIGMAP_VALUES — three values that
// values.yaml does not declare and no caller supplies — purely to get past templates/configmap.yaml.
// Its header says so plainly. So its green is a fact about its fixture, and the one question a
// caller cares about ("does `helm install` work?") had no arm at all.
//
//     A fixture that reaches further than the artifact does cannot report that the artifact is
//     broken. The only arm that measures what a caller gets is the arm that supplies what a caller
//     supplies — here, the image digest and nothing else.
//
// ⛔ AND THE REFUSAL MUST BE TOLD APART FROM RULING 1'S. b7e365e made frontend.image.digest
// `required`, so a render with NO values SHOULD fail, and that failure is correct. If this script
// asserted only "exit 0 with no --set" it would report the working guard as the defect. So the
// digest IS supplied — it is the one value every real caller passes — and the message is read, not
// just the exit code.
//
// Run:  node scripts/check-chart-renders.mjs
// Exit: 0 renders, 1 the chart cannot render (the finding), 2 measured nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHART = join(dirname(dirname(fileURLToPath(import.meta.url))), "helm", "cortex-ui");
// Any syntactically valid digest. This arm is not about WHICH image, so it must not go stale when
// the pin moves — a hard-coded real digest would rot into a second, unrelated failure mode.
const DIGEST = "sha256:" + "0".repeat(64);
const PIN_REASON = "digest";

function helm(args) {
  let r = spawnSync("helm", args, { encoding: "utf8" });
  if (r.error && r.error.code === "ENOENT") r = spawnSync("helm.exe", args, { encoding: "utf8" });
  return r;
}

console.log("INSTRUMENT: chart = " + CHART);
if (!existsSync(CHART)) {
  console.log("INSTRUMENT: chart directory is absent — this script measured NOTHING.");
  process.exit(2);
}
const v = helm(["version", "--short"]);
if (v.error || (v.status !== 0 && !v.stdout)) {
  console.log("INSTRUMENT: helm is not on PATH — this script measured NOTHING. Install helm v3.");
  process.exit(2);
}
console.log("INSTRUMENT: helm = " + (v.stdout || v.stderr || "unknown").trim());

const args = ["template", "caller", CHART, "--set", "frontend.image.digest=" + DIGEST];
console.log("INSTRUMENT: helm " + args.join(" "));
const r = helm(args);
const out = ((r.stdout || "") + (r.stderr || "")).trim();
const code = r.status;
console.log("INSTRUMENT: exit = " + code + ", output bytes = " + out.length);

if (code === 0) {
  // Rendering is necessary, not sufficient — an empty render also exits 0.
  const docs = (out.match(/^# Source:/gm) || []).length;
  console.log("INSTRUMENT: documents rendered = " + docs);
  if (docs === 0) {
    console.log("FAIL: helm exited 0 and rendered NOTHING, which is not a working chart.");
    process.exit(1);
  }
  console.log("PASS: the chart renders for a caller who supplies only the image pin.");
  process.exit(0);
}

const first = out.split("\n").find((l) => l.includes("Error:")) || out.split("\n")[0] || "(no output)";
if (out.includes(PIN_REASON)) {
  // The pin guard fired even though a valid digest was supplied — that is a DIFFERENT bug from the
  // one this arm looks for, and naming it as the render defect would be a wrong diagnosis.
  console.log("FAIL: refused over the image PIN despite a valid digest — not the render defect.");
  console.log("      " + first);
  process.exit(1);
}
console.log("FAIL: the chart cannot render for a caller. `helm install` fails for everyone.");
console.log("      " + first);
console.log("      This is the finding in sessions/2026-09-28-packet-to-lane-1-the-chart-cannot-");
console.log("      render-at-all-and-the-configmap-came-from-another-project.md — a template reads");
console.log("      .Values the chart never declares. NOT WIRED INTO CI: see that packet's question 1,");
console.log("      because declaring the values and deleting the template are opposite fixes and the");
console.log("      choice is the deploy surface's, not this lane's.");
process.exit(1);
