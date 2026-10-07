#!/usr/bin/env node
/**
 * EXTRACT iagent-mesh-sdk's `maintenance_bridge.py` FIELD DECLARATIONS — the parity seal's other
 * half, for `src/api/maintenanceBridgeTypes.ts`.
 *
 * Reuses `extractClass`/`extractValidators` from `extract-mesh-sdk-parity.mjs` rather than
 * re-deriving the same indentation-driven parser: the question "what fields does this pydantic
 * class declare" does not change because the module is a different file.
 *
 * ── WHY THIS DOES NOT ALSO REUSE `pinFor` ───────────────────────────────────────────────────
 * `extract-mesh-sdk-parity.mjs`'s `pinFor` walks every tag looking for one whose blobs are
 * byte-identical to what is on disk, because `models.py`/`enumeration.py` are mirrored against a
 * RELEASED SDK and a sha-pin on an unreleased commit is a liability that corrects itself the
 * moment a release catches up (see that function's own header, and the night it did). This
 * module is different in the one way that matters here: `maintenance_bridge.py` lives on
 * `origin/lane/ca-0.9.8`, a lane branch for a cross-repo integration that is not slated to ship
 * as a tagged SDK release at all — walking tags looking for a match would run to the end of the
 * list every single time and report "UNRELEASED" for a reason that will never stop being true.
 * So the pin here is simply the full sha, asserted against the ref it was read from (below), and
 * SHA-pinned is stated as the permanent state of this mirror, not a placeholder for a tag.
 *
 * ── WHY THIS READS VIA `git show <ref>:<path>`, NEVER THE SDK CHECKOUT'S WORKING TREE ────────
 * The sibling repo's disk is dirty (another lane's WIP) and is read-only from here. `git show`
 * reads the committed blob at the pinned ref regardless of what the working tree currently holds.
 *
 * Usage:  node scripts/extract-maintenance-bridge-parity.mjs [--write] [--sdk <path>] [--ref <ref>]
 *         --write   overwrite src/api/maintenanceBridgeParity.json (otherwise prints to stdout)
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { extractClass, extractValidators } from "./extract-mesh-sdk-parity.mjs";

export const DEFAULT_SDK = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../iagent-mesh-sdk",
);

export const SOURCE_FILE = "iagent_mesh/maintenance_bridge.py";

/** The ref the SDK order named, and the full sha it was confirmed to resolve to — both recorded,
 *  because a branch ref moves and a reader of the snapshot should be able to tell which one was
 *  actually read. */
export const PINNED_REF = "origin/lane/ca-0.9.8";
export const PINNED_SHA = "e7db4752fac33f03fa8e4f0ff082616f3a716dd1";

/** Every model `maintenanceBridgeTypes.ts` mirrors, in the module's own declaration order. */
export const MIRRORED = [
  "ReleasabilityLabel",
  "Fault",
  "EventSource",
  "SpareRow",
  "BattleConditionBasis",
  "BattleCondition",
  "Picture",
  "EventProvenanceRow",
  "MaintenanceEvent",
  "TaskRef",
  "PartRow",
  "WorkOrder",
  "ApprovalChainEntry",
  "ActionProvenance",
  "ActionRecord",
];

function git(sdkRoot, ...args) {
  return execFileSync("git", ["-C", sdkRoot, ...args], { encoding: "utf8", maxBuffer: 16e6 }).trim();
}

/** The committed blob at `ref` — never the working tree, per this script's own header. */
export function showAt(sdkRoot, ref, file) {
  return execFileSync("git", ["-C", sdkRoot, "show", `${ref}:${file}`], { encoding: "utf8", maxBuffer: 16e6 });
}

export function extractAtRef(sdkRoot = DEFAULT_SDK, ref = PINNED_REF) {
  const sha = git(sdkRoot, "rev-parse", ref);
  const src = showAt(sdkRoot, ref, SOURCE_FILE);
  const classes = {};
  for (const className of MIRRORED) {
    classes[className] = {
      file: SOURCE_FILE,
      fields: extractClass(src, className),
      validators: extractValidators(src, className),
    };
  }
  return {
    provenance: {
      sdk_repo: "iagent-mesh-sdk",
      sdk_ref: ref,
      sdk_sha: sha,
      // Permanent, not a placeholder: see this file's header on why `pinFor`'s tag walk is not
      // reused here.
      sdk_release: "UNRELEASED BY DESIGN — origin/lane/ca-0.9.8 is a cross-repo integration lane, not slated for a tagged SDK release; the sha is the permanent pin, not a stand-in for one.",
      extractor: "scripts/extract-maintenance-bridge-parity.mjs",
      sources: [SOURCE_FILE],
    },
    classes,
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("extract-maintenance-bridge-parity.mjs");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const sdkAt = args.indexOf("--sdk");
  const refAt = args.indexOf("--ref");
  const sdkRoot = sdkAt >= 0 ? args[sdkAt + 1] : DEFAULT_SDK;
  const ref = refAt >= 0 ? args[refAt + 1] : PINNED_REF;
  const out = extractAtRef(sdkRoot, ref);

  if (out.provenance.sdk_sha !== PINNED_SHA) {
    console.log(
      `REFUSED: ${ref} resolves to ${out.provenance.sdk_sha}, not the pinned ${PINNED_SHA}. ` +
        `The order pinned an exact sha; a branch ref that has since moved is not that commit. ` +
        `Pass --ref ${PINNED_SHA} directly to extract from the pinned commit regardless of where ` +
        `the branch head now points, or update PINNED_SHA in this file if the pin itself moved.`,
    );
    process.exit(1);
  }

  const json = JSON.stringify(out, null, 2) + "\n";
  if (args.includes("--write")) {
    const dest = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
      "../src/api/maintenanceBridgeParity.json",
    );
    writeFileSync(dest, json);
    console.log(`wrote ${dest} from ${out.provenance.sdk_ref}@${out.provenance.sdk_sha}`);
  } else {
    process.stdout.write(json);
  }
}
