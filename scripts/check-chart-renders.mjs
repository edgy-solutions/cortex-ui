#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Does this chart render for a real caller? One arm: the image pin, and NOTHING else.
//
// ⛔ WHY THIS EXISTS. cortex-ui-0.2.0 was published unable to render for anyone:
// templates/configmap.yaml read .Values.invincibleAgent.*, which values.yaml never declared, so
// every `helm template`/`helm install` died with `nil pointer evaluating interface {}.namespace`.
// Every frontend roll carried three `--set invincibleAgent.*` values by hand to get past it.
//
// CI was green the whole time, because the one job that rendered the chart —
// redproof-chart-image-pin.mjs — passed those same three values itself, purely to reach the
// template it was testing, and said so in its header. Its green was a fact about its fixture.
//
//     A fixture that reaches further than the artifact does cannot report that the artifact is
//     broken. The only arm that measures what a caller gets is the arm that supplies what a caller
//     supplies — here, the image digest and nothing else.
//
// 0.2.1 deleted that template (nothing read it: not the frontend deployment, not cortex's runtime,
// not the platform chart, which deploys this image through its own templates/frontend.yaml). This
// arm is what stops the next undeclared `.Values` read from shipping the same way.
//
// ⛔ THE PIN IS SUPPLIED, AND A PIN REFUSAL IS TOLD APART BY ITS OWN WORDS. frontend.image.digest
// is `required`, so a render with no values at all SHOULD fail, and that failure is the guard
// working. So this arm passes the one value every caller passes, and if the render still fails it
// reads the MESSAGE: the pin guard spells exactly four reasons (NO PIN / TWO PINS / MALFORMED /
// NOT A PIN), and matching those — not the bare word "digest" — keeps a nil-pointer on
// `.Values.frontend.image.digest` from being mis-filed as the guard firing.
//
// Its own proof that it can still fail: scripts/redproof-chart-renders.mjs, run beside it in
// helm-release.yml before chart-releaser.
//
// Run:  node scripts/check-chart-renders.mjs            (npm run check:chart)
//       CORTEX_CHART_DIR=<dir> node scripts/check-chart-renders.mjs   — aim it at another copy
// Exit: 0 renders, 1 the chart cannot render for a caller, 2 measured nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHART =
  process.env.CORTEX_CHART_DIR ||
  join(dirname(dirname(fileURLToPath(import.meta.url))), "helm", "cortex-ui");
// Any syntactically valid digest. This arm is not about WHICH image, so it must not go stale when
// the pin moves — a hard-coded real digest would rot into a second, unrelated failure mode.
const DIGEST = "sha256:" + "0".repeat(64);
// The pin guard's own reasons, as frontend-deployment.yaml spells them. Enumerated, not guessed.
const PIN_REFUSAL = /frontend\.image(\.digest|\.tag)?: (NO PIN|TWO PINS|MALFORMED|NOT A PIN)/;

function helm(args) {
  let r = spawnSync("helm", args, { encoding: "utf8" });
  if (r.error && r.error.code === "ENOENT") r = spawnSync("helm.exe", args, { encoding: "utf8" });
  return r;
}

console.log("INSTRUMENT: chart = " + CHART);
if (!existsSync(join(CHART, "Chart.yaml"))) {
  console.log("INSTRUMENT: no Chart.yaml there — this script measured NOTHING.");
  process.exit(2);
}
const v = helm(["version", "--short"]);
if (v.error || v.status !== 0) {
  console.log("INSTRUMENT: helm is not on PATH — this script measured NOTHING. Install helm v3.");
  process.exit(2);
}
console.log("INSTRUMENT: helm = " + (v.stdout || "").trim());

const args = ["template", "caller", CHART, "--set", "frontend.image.digest=" + DIGEST];
console.log("INSTRUMENT: helm " + args.join(" "));
const r = helm(args);
const out = ((r.stdout || "") + (r.stderr || "")).trim();
console.log("INSTRUMENT: exit = " + r.status + ", output bytes = " + out.length);

if (r.status === 0) {
  // Rendering is necessary, not sufficient — a chart with no templates also exits 0.
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
if (PIN_REFUSAL.test(out)) {
  // The pin guard refused a valid digest. A real bug, but a DIFFERENT one — reporting it as a
  // render defect would send whoever reads this to the wrong template.
  console.log("FAIL: refused over the image PIN despite a valid digest — the pin guard, not a render defect.");
  console.log("      " + first);
  process.exit(1);
}
console.log("FAIL: the chart cannot render for a caller — `helm install` fails for everyone.");
console.log("      " + first);
console.log("      A template reads a value that values.yaml does not declare, or is otherwise");
console.log("      broken. Declare the value with a working default, or `required` it with a");
console.log("      message. Do not fix this by adding --set to a caller: that is how 0.2.0 shipped.");
process.exit(1);
