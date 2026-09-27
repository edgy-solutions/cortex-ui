#!/usr/bin/env node
/**
 * EXTRACT THE iagent-mesh-sdk FIELD DECLARATIONS THAT CORTEX MIRRORS.
 *
 * `src/api/meshSdkTypes.ts` is a TS mirror of pydantic models that live in another repo. A mirror
 * drifts silently: nothing in either repo fails when one side gains a field, changes a `bool` to a
 * tri-state, or turns an omitted key into a null one. The parity seal exists to make that noisy,
 * and THIS is what it reads — the Python declarations themselves, not a table anybody typed.
 *
 * ⛔ THE PACKET IS NOT THE SOURCE OF TRUTH AND NEITHER IS THIS FILE'S OUTPUT.
 * `sessions/2026-09-26-packet-from-ca-*.md` carries a reading of these models, and its own §5 says
 * a seal built from the table would measure consistency with the table. The source of truth is
 * `iagent_mesh/models.py` and `iagent_mesh/enumeration.py`. This script reads them and writes
 * `src/api/meshSdkParity.json`, which exists for ONE reason: CI checks out cortex alone, so
 * without a committed snapshot the cross-repo half of the seal would be the only half and would
 * skip in the only place that gates a merge.
 *
 * WHAT IS EXTRACTED: pydantic field declarations at class-body indentation — `name: annotation`
 * with an optional default. Not methods, not validators, not `model_config`, not docstrings. The
 * ANNOTATION IS KEPT VERBATIM and is not interpreted here: mapping Python to TS is a judgment, and
 * it lives in the seal where a reader can disagree with it. A shape this script cannot parse is
 * reported as an error rather than skipped — a field silently missed is a field the seal then
 * cannot see drift in, which is the failure this whole apparatus is against.
 *
 * Usage:  node scripts/extract-mesh-sdk-parity.mjs [--write] [--sdk <path>]
 *         --write   overwrite src/api/meshSdkParity.json (otherwise prints to stdout)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Sibling checkout, the same convention `boundSlots.test.ts` uses for the gateway. */
export const DEFAULT_SDK = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../iagent-mesh-sdk",
);

/**
 * The classes cortex mirrors, and the file each is declared in.
 *
 * Listed rather than discovered, because "every class in the module" is not the subject: cortex
 * mirrors the four objects the overnight order named and their one member type. A class added to
 * the SDK that cortex does not consume is not drift.
 */
export const MIRRORED = [
  ["iagent_mesh/models.py", "MethodInput"],
  ["iagent_mesh/models.py", "MethodBlock"],
  ["iagent_mesh/models.py", "ToolOutput"],
  ["iagent_mesh/enumeration.py", "InstanceOption"],
  ["iagent_mesh/enumeration.py", "EnumerateInstancesResponse"],
];

/** Field-body lines only: exactly one indent level, a name, an annotation, an optional default. */
const FIELD = /^ {4}([a-z_][a-z0-9_]*)\s*:\s*([^=\n]+?)\s*(?:=\s*(.+?))?\s*$/;
/** Anything at class-body indentation that is NOT a field: decorators, defs, docstring openers. */
const NOT_A_FIELD = /^ {4}(@|def |class |"""|'''|#|pass\b|\.\.\.)/;

/**
 * Every field of one class, in declaration order.
 *
 * Indent-driven: the body runs from the `class X` line to the next line at column 0 that starts a
 * new top-level statement. Method bodies sit at 8 spaces or deeper and cannot match `FIELD`.
 */
export function extractClass(src, className) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^class ${className}\\b`).test(l));
  if (start < 0) throw new Error(`class ${className} is not declared in this file`);

  const fields = [];
  let inDocstring = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\S/.test(line) && line.trim()) break; // a new top-level statement ends the body
    // Docstrings, including the per-field ones the SDK uses heavily. Tracked rather than skipped
    // by indentation, because a docstring's CONTINUATION lines are arbitrary text and one of them
    // ("    completeness: Literal[...]" inside a table, say) would otherwise read as a field.
    const fences = (line.match(/"""/g) || []).length;
    if (inDocstring) {
      if (fences % 2 === 1) inDocstring = false;
      continue;
    }
    if (fences % 2 === 1) {
      inDocstring = true;
      continue;
    }
    if (fences >= 2) continue; // a one-line docstring
    if (!line.trim() || NOT_A_FIELD.test(line)) continue;
    const m = FIELD.exec(line);
    if (!m) continue;
    const [, name, annotation, dflt] = m;
    if (name === "model_config") continue;
    fields.push({ name, annotation: annotation.trim(), default: dflt === undefined ? null : dflt.trim() });
  }
  if (fields.length === 0) throw new Error(`class ${className} yielded NO fields — the parser is broken`);
  return fields;
}

export function extract(sdkRoot = DEFAULT_SDK) {
  const classes = {};
  for (const [file, className] of MIRRORED) {
    const full = path.join(sdkRoot, file);
    if (!existsSync(full)) throw new Error(`the SDK source is not here: ${full}`);
    classes[className] = { file, fields: extractClass(readFileSync(full, "utf8"), className) };
  }
  let sha = "unknown";
  let ref = "unknown";
  try {
    const git = (...a) => execFileSync("git", ["-C", sdkRoot, ...a], { encoding: "utf8" }).trim();
    sha = git("rev-parse", "HEAD");
    ref = git("rev-parse", "--abbrev-ref", "HEAD");
  } catch {
    // Provenance the seal asserts is present; an un-gitted checkout is recorded as such rather
    // than guessed at, and the seal's provenance arm says what is missing.
  }
  return {
    provenance: {
      sdk_repo: "iagent-mesh-sdk",
      sdk_ref: ref,
      sdk_sha: sha,
      sdk_release: "UNRELEASED — the newest tag (v0.9.3) contains neither MethodBlock nor completeness; HEAD is past it and pyproject is unbumped, so a SHA is the only honest pin",
      extractor: "scripts/extract-mesh-sdk-parity.mjs",
      sources: MIRRORED.map(([f]) => f).filter((f, i, a) => a.indexOf(f) === i),
    },
    classes,
  };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("extract-mesh-sdk-parity.mjs");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const sdkAt = args.indexOf("--sdk");
  const out = extract(sdkAt >= 0 ? args[sdkAt + 1] : DEFAULT_SDK);
  const json = JSON.stringify(out, null, 2) + "\n";
  if (args.includes("--write")) {
    const dest = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
      "../src/api/meshSdkParity.json",
    );
    writeFileSync(dest, json);
    console.log(`wrote ${dest} from ${out.provenance.sdk_ref}@${out.provenance.sdk_sha.slice(0, 7)}`);
  } else {
    process.stdout.write(json);
  }
}
