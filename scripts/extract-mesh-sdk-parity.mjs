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
 * with an optional default — AND, since 2026-09-27, every `@field_validator` / `@model_validator`
 * the mirrored classes declare, verbatim. It said "not validators" until that date, and then the SDK
 * put a rule cortex's reader is written against into one: `(bound is None) == (bound_defaulted is
 * None)`. A fields-only snapshot could not see it, so bumping the pin to the commit that carries
 * the rule would have changed this file's output by a single line — the sha. See `extractValidators`
 * for why the population is validators rather than that one validator. Still not extracted: plain
 * methods, `model_config`, docstrings. The
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

/** A validator's opening decorator, at class-body indentation. Both kinds, deliberately. */
const VALIDATOR = /^ {4}@(field_validator|model_validator)\b/;

/**
 * Every validator of one class, in declaration order.
 *
 * ⛔ WHY THIS IS HERE AT ALL, WHEN THIS FILE USED TO SAY IT SKIPPED VALIDATORS. On 2026-09-27 the
 * SDK gained a `model_validator` requiring `(bound is None) == (bound_defaulted is None)`, and the
 * ruling was to bump the pin "so the XOR validator is what the mirror mirrors". Measured: bumping
 * the pin changed the snapshot by ONE LINE, the sha, because a fields-only snapshot cannot see a
 * validator. The pin would have named the commit that carries the rule while the mirror still said
 * nothing about it — compliance with the sentence, not with the thing it was for.
 *
 * ⛔ AND THE SUBJECT IS VALIDATORS, NOT THE ONE VALIDATOR THIS CAME FROM. Keyed on the XOR rule by
 * name, this would have captured one of the seven validators these two files declare and reported a
 * full green; the other six are constraints the producer enforces and the mirror was blind to. So it
 * keys on the DECORATOR, and both kinds count: a `field_validator` that starts rejecting a value
 * cortex sends is drift in exactly the same way.
 *
 * The block is captured VERBATIM, decorator through body. That is deliberately strict — a reworded
 * error message reddens the seal too — because this is a cross-repo contract and the seal exists to
 * make a one-sided change noisy rather than to be comfortable. The arm that reddens says which
 * class, and re-running the extractor is the fix when the change was intended.
 */
export function extractValidators(src, className) {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^class ${className}\\b`).test(l));
  if (start < 0) throw new Error(`class ${className} is not declared in this file`);

  const validators = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i]) && lines[i].trim()) break; // a new top-level statement ends the body
    const kind = VALIDATOR.exec(lines[i]);
    if (!kind) continue;

    // From this decorator to the end of the def it decorates. @classmethod and a multi-line
    // signature sit in between; the body is at 8 spaces or deeper, so the block ends at the first
    // non-blank line back at class-body indentation AFTER the def has been seen.
    const block = [];
    let sawDef = false;
    let j = i;
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      if (/^\S/.test(line) && line.trim()) break;
      if (sawDef && line.trim() && /^ {1,4}\S/.test(line)) break;
      if (/^ {4}def\s/.test(line)) sawDef = true;
      block.push(line);
    }
    while (block.length && !block[block.length - 1].trim()) block.pop();

    const defLine = block.find((l) => /^ {4}def\s/.test(l));
    if (!defLine) throw new Error(`a @${kind[1]} in ${className} decorates no def — the parser is broken`);
    const name = /^ {4}def\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(defLine)[1];
    validators.push({
      name,
      kind: kind[1],
      decorator: lines[i].trim(),
      source: block.join("\n"),
    });
    i = j - 1;
  }
  return validators;
}

export function extract(sdkRoot = DEFAULT_SDK) {
  const classes = {};
  for (const [file, className] of MIRRORED) {
    const full = path.join(sdkRoot, file);
    if (!existsSync(full)) throw new Error(`the SDK source is not here: ${full}`);
    const src = readFileSync(full, "utf8");
    classes[className] = {
      file,
      fields: extractClass(src, className),
      validators: extractValidators(src, className),
    };
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
    // ⛔ A PIN CI CANNOT CHECK OUT IS NOT A PIN.
    //
    // The sha above is whatever the SDK checkout on this disk happens to be standing on, and a
    // local lane branch is routinely AHEAD of what has been pushed. `build.yml` does not read your
    // disk: it checks this sha out of edgy-solutions/iagent-mesh-sdk on GitHub. Pin an unpushed sha
    // and CI goes red at the CHECKOUT — which reads as a parity failure and is not one, so the next
    // person debugs the mirror instead of the pin. Measured 2026-09-27: the local checkout was on
    // 5ef95b6, one commit past the remote tip of lane/ca, and unpushed.
    //
    // So the write path refuses a sha the remote cannot serve, and prints what it consulted rather
    // than asserting reachability in the abstract. To snapshot an unpushed tree anyway, drop --write
    // and redirect stdout: that keeps the escape hatch without letting it write the pin the seal is
    // sealed against.
    //
    // ⛔ AND IT ASKS THE NETWORK, NOT THE LOCAL TRACKING REFS. `git branch -r --contains` answers
    // from refs/remotes, which is a cached claim about the remote and is stale in both directions.
    // Measured 2026-09-27 within one session: 5ef95b6 was reported by NO remote branch, and twelve
    // minutes later by origin/lane/ca, because the SDK lane pushed in between — the same local
    // command gave opposite answers about the same sha. A guard that believes refs/remotes can pass
    // an unpushed sha whose tip was merely fetched earlier. So: read the tips from `ls-remote`, and
    // accept only a sha that is an ancestor of a tip the remote is serving RIGHT NOW. Nothing here
    // fetches — the SDK checkout belongs to another lane and this must not touch its refs.
    const sdkRoot = sdkAt >= 0 ? args[sdkAt + 1] : DEFAULT_SDK;
    const g = (...a) => execFileSync("git", ["-C", sdkRoot, ...a], { encoding: "utf8" }).trim();
    const sha = out.provenance.sdk_sha;
    let url = "(no origin remote)";
    try {
      url = g("remote", "get-url", "origin");
    } catch {
      /* reported below as the absence it is */
    }

    let tips = [];
    try {
      tips = g("ls-remote", "--heads", "--tags", "origin")
        .split("\n")
        .map((l) => l.trim().split(/\s+/))
        .filter((p) => p.length === 2 && /^[0-9a-f]{40}$/.test(p[0]))
        .map(([tip, ref]) => ({ tip, ref }));
    } catch {
      /* no network or no remote: reported as UNKNOWN below, and refused */
    }

    const serving = [];
    for (const { tip, ref } of tips) {
      try {
        g("cat-file", "-e", `${tip}^{commit}`); // a tip this disk has never seen proves nothing
        g("merge-base", "--is-ancestor", sha, tip);
        serving.push(ref);
      } catch {
        /* not an ancestor of this tip, or the tip is unknown locally */
      }
    }

    console.log(`INSTRUMENT: sdk root   = ${sdkRoot}`);
    console.log(`INSTRUMENT: origin     = ${url}`);
    console.log(`INSTRUMENT: sdk_sha    = ${sha}`);
    console.log(`INSTRUMENT: remote tips read = ${tips.length}${tips.length === 0 ? " — NONE, so nothing was verified" : ""}`);
    console.log(
      `INSTRUMENT: served by   = ${serving.length ? serving.join(", ") : "NOTHING the remote is serving right now"}`,
    );
    if (serving.length === 0) {
      console.log(
        "REFUSED: not writing the fixture. build.yml checks this sha out of edgy-solutions/iagent-mesh-sdk " +
          "on GitHub, so a sha the remote is not serving fails the CHECKOUT and reads as a mirror failure — " +
          "the next person debugs the parity seal instead of the pin. Push the SDK branch first, or run " +
          "without --write to inspect the snapshot on stdout.",
      );
      process.exit(1);
    }
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
