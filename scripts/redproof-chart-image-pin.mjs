#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// REDPROOF: prove the chart's image-pin guard can still REFUSE.
//
// ⛔ WHY THIS EXISTS. helm/cortex-ui/values.yaml carried "tag: latest" as its default until
// 2026-09-27. Nothing objected, and nothing could have: chart-releaser PACKAGES the chart and
// never templates it, so no CI job in this repo has ever rendered these templates. The guard in
// templates/frontend-deployment.yaml is the objection; this script is the only thing that proves
// the objection is reachable. A guard nobody renders is a comment.
//
// ⛔ THE CLEAN CASES RUN FIRST, AND ON THE RENDERED TEXT. A refusal script that only checks
// "helm exited non-zero" passes when the template is syntactically broken — every arm goes red for
// the same wrong reason and the run still looks like a thorough proof. So the accepted forms are
// asserted first, on the exact image line they must produce, and every refusal arm must name its
// OWN reason. The four reasons are deliberately distinct strings (NO PIN / TWO PINS / MALFORMED /
// NOT A PIN) so that one arm cannot be satisfied by another arm's message.
//
// ⛔ AND EVERY REFUSAL IS CHECKED AGAINST THE WRONG-REASON ERROR. This chart cannot render with
// its own values.yaml at all: templates/configmap.yaml:10 reads .Values.invincibleAgent.*, which
// values.yaml does not define, so a bare render dies with a nil-pointer BEFORE reaching the image.
// That is a real defect, it is not this ruling's, and it is why every case below passes
// CONFIGMAP_VALUES — and why each refusal additionally asserts the output is NOT the nil-pointer.
// Without that assertion this whole script would report green against a chart whose pin guard had
// been deleted outright.
//
// Run:  node scripts/redproof-chart-image-pin.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHART = join(dirname(dirname(fileURLToPath(import.meta.url))), "helm", "cortex-ui");
const REGISTRY = "ghcr.io/edgy-solutions/cortex-ui/frontend";
const GOOD_DIGEST = "sha256:692954e9aead0627303ef86199d3f4fff055452a1d022ef4695925b02c16a151";
const GOOD_SHA = "a2e7701fe3a98989365b6f751414b3aaaaa8b7e7";

// Only here to get PAST templates/configmap.yaml — see the header. Nothing below depends on these
// values, and no case varies them.
const CONFIGMAP_VALUES = [
  "--set", "invincibleAgent.namespace=ns",
  "--set", "invincibleAgent.releaseName=rel",
  "--set", "invincibleAgent.urls.ontologyService=http://o:8084",
];
const WRONG_REASON = "nil pointer";

function render(sets) {
  const args = ["template", "redproof", CHART, ...CONFIGMAP_VALUES];
  for (const s of sets) args.push("--set", s);
  let r = spawnSync("helm", args, { encoding: "utf8" });
  if (r.error && r.error.code === "ENOENT") r = spawnSync("helm.exe", args, { encoding: "utf8" });
  if (r.error && r.error.code === "ENOENT") {
    console.log("INSTRUMENT: helm is not on PATH — this script measured NOTHING. Install helm v3.");
    process.exit(2);
  }
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// The reference the chart actually emitted, read out of the render rather than eyeballed.
function imageLine(out) {
  const hit = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith("image:"));
  if (!hit) return null;
  return hit.slice("image:".length).trim().split('"').join("");
}

// ── ACCEPTED: these must RENDER, and render the reference shown. ─────────────
const ACCEPTED = [
  {
    name: "a digest — the preferred pin",
    sets: ["frontend.image.digest=" + GOOD_DIGEST],
    expect: REGISTRY + "@" + GOOD_DIGEST,
  },
  {
    name: "a full 40-char commit sha as tag — what build.yml pushes on master",
    sets: ["frontend.image.tag=" + GOOD_SHA],
    expect: REGISTRY + ":" + GOOD_SHA,
  },
  {
    name: "a release version tag",
    sets: ["frontend.image.tag=v0.2.0"],
    expect: REGISTRY + ":v0.2.0",
  },
  {
    name: "a chart-releaser style tag",
    sets: ["frontend.image.tag=cortex-ui-0.1.0"],
    expect: REGISTRY + ":cortex-ui-0.1.0",
  },
];

// ── REFUSED: each must fail, and must name ITS OWN reason. ───────────────────
const REFUSED = [
  {
    name: "no pin at all — the chart's own defaults, which is the whole point of the ruling",
    sets: [],
    reason: "NO PIN",
  },
  {
    name: "both a digest and a tag — two pins, one image",
    sets: ["frontend.image.digest=" + GOOD_DIGEST, "frontend.image.tag=v0.2.0"],
    reason: "TWO PINS",
  },
  {
    name: "a digest with no sha256: prefix",
    sets: ["frontend.image.digest=" + GOOD_DIGEST.slice(7)],
    reason: "MALFORMED",
  },
  {
    name: "a digest one hex character short",
    sets: ["frontend.image.digest=" + GOOD_DIGEST.slice(0, -1)],
    reason: "MALFORMED",
  },
  {
    name: "a digest in uppercase hex",
    sets: ["frontend.image.digest=sha256:" + GOOD_DIGEST.slice(7).toUpperCase()],
    reason: "MALFORMED",
  },
  {
    name: "an abbreviated digest",
    sets: ["frontend.image.digest=sha256:692954e9"],
    reason: "MALFORMED",
  },
  {
    name: "tag: latest — the default this ruling removed",
    sets: ["frontend.image.tag=latest"],
    reason: "NOT A PIN",
  },
  // ⛔ THE THREE ARMS THAT MATTER. If the guard were a blacklist of forbidden spellings — latest,
  // plus whatever else somebody remembered — these would sail through and the chart would ship a
  // floating alias while reporting success. They are refused here only because the rule enumerates
  // the ACCEPTED forms, so an alias nobody has thought of yet is refused by default. Delete these
  // arms and you delete the only evidence that the rule is keyed on the safe set rather than on a
  // list of names.
  {
    name: "tag: main — an alias no blacklist would have listed",
    sets: ["frontend.image.tag=main"],
    reason: "NOT A PIN",
  },
  {
    name: "tag: nightly — likewise",
    sets: ["frontend.image.tag=nightly"],
    reason: "NOT A PIN",
  },
  {
    name: "tag: demo-week — a human-named alias",
    sets: ["frontend.image.tag=demo-week"],
    reason: "NOT A PIN",
  },
  {
    name: "an abbreviated commit sha — the tag GHCR 404s on",
    sets: ["frontend.image.tag=" + GOOD_SHA.slice(0, 8)],
    reason: "NOT A PIN",
  },
  {
    name: "a two-part version, which is not a release",
    sets: ["frontend.image.tag=v0.2"],
    reason: "NOT A PIN",
  },
];

let failures = 0;
function fail(what, why) {
  failures++;
  console.log("  FAIL  " + what + "\n        " + why);
}

console.log("INSTRUMENT: chart = " + CHART);
if (!existsSync(CHART)) {
  console.log("INSTRUMENT: chart directory is ABSENT — this script measured nothing.");
  process.exit(2);
}
const v = spawnSync("helm", ["version", "--short"], { encoding: "utf8" });
console.log("INSTRUMENT: helm = " + ((v.stdout || v.stderr || "unknown").trim()));
console.log("INSTRUMENT: cases = " + ACCEPTED.length + " accepted + " + REFUSED.length + " refused");
if (ACCEPTED.length === 0 || REFUSED.length === 0) {
  console.log("INSTRUMENT: one side of this proof is EMPTY, so it proves nothing in that direction.");
  process.exit(2);
}

console.log("\nACCEPTED — must render, and render this exact reference:");
for (const c of ACCEPTED) {
  const { code, out } = render(c.sets);
  if (code !== 0) {
    fail(c.name, "helm refused a pin it must accept (exit " + code + "): " + out.trim().split("\n")[0]);
    continue;
  }
  const got = imageLine(out);
  if (got !== c.expect) fail(c.name, "rendered " + JSON.stringify(got) + ", wanted " + JSON.stringify(c.expect));
  else console.log("  ok    " + c.name + "\n        " + got);
}

console.log("\nREFUSED — must fail, and must say why:");
for (const c of REFUSED) {
  const { code, out } = render(c.sets);
  if (code === 0) {
    fail(c.name, "helm ACCEPTED it and rendered " + JSON.stringify(imageLine(out)) + " — the guard did not fire");
    continue;
  }
  if (out.includes(WRONG_REASON)) {
    fail(c.name, "refused for the WRONG REASON (" + WRONG_REASON + ") — this arm measured the configmap, not the pin");
    continue;
  }
  if (!out.includes(c.reason)) {
    fail(c.name, "refused, but not for its own reason: wanted " + JSON.stringify(c.reason) + " in: " + out.trim().split("\n").slice(-2).join(" "));
    continue;
  }
  console.log("  ok    " + c.name + "  [" + c.reason + "]");
}

console.log("\nINSTRUMENT: " + (ACCEPTED.length + REFUSED.length) + " cases, " + failures + " failed");
if (failures > 0) {
  console.log("RESULT: the chart's image-pin guard is NOT behaving as its values.yaml claims.");
  process.exit(1);
}
console.log("RESULT: the guard accepts every pin form it documents and refuses everything else, by reason.");
