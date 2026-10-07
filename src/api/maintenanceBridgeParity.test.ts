/**
 * THE MAINTENANCE-BRIDGE MIRROR, SEALED THE SAME WAY `meshSdkParity.test.ts` SEALS THE OTHER ONE.
 *
 * Read that file's header first; this one is the same shape, simplified for a module with no
 * custom serializer and no `BUILT_BY_HAND_UPSTREAM` producer (see `maintenanceBridgeTypes.ts`'s
 * header for why every `Optional[X] = None` field here is nullable-not-optional, uniformly).
 *
 * ── THE PIN, AND WHY IT IS A SHA RATHER THAN A RELEASE ───────────────────────────────────────
 * `origin/lane/ca-0.9.8` carries no tag at `e7db4752fac33f03fa8e4f0ff082616f3a716dd1` (or at all,
 * as of writing) — see `scripts/extract-maintenance-bridge-parity.mjs`'s header for why this
 * module's pin does not walk tags the way `models.py`/`enumeration.py`'s does. That existing pin
 * (currently `v0.9.5`) is NOT moved by anything in this file.
 *
 * ⛔ THE BRANCH HAS ALREADY MOVED PAST THE PIN. Measured when this seal was written: `origin/
 * lane/ca-0.9.8` resolves to `ced61339cb8636c4b9d2042e364c0f7590c15651`, not the spec's named
 * `e7db475...`. `e7db475` is still an ancestor of that tip (`git merge-base --is-ancestor`
 * confirmed it), so the pin names a real, reachable commit — just not the branch's current head.
 * The cross-repo arms below read the PINNED SHA directly, never the branch ref, for exactly this
 * reason: a ref that moved out from under a test would make it compare against the wrong module.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { MIRRORED_FIELDS, type MirroredField } from "./maintenanceBridgeTypes";
import SNAPSHOT from "./maintenanceBridgeParity.json";

const SDK = path.join(__dirname, "../../../iagent-mesh-sdk");
const HAVE_SDK = existsSync(path.join(SDK, "iagent_mesh/maintenance_bridge.py"));
const PINNED_SHA = "e7db4752fac33f03fa8e4f0ff082616f3a716dd1";

type PyField = { name: string; annotation: string; default: string | null };
type PyValidator = { name: string; kind: string; decorator: string; source: string };
type PyClass = { file: string; fields: PyField[]; validators: PyValidator[] };
const SNAP = SNAPSHOT as { provenance: Record<string, unknown>; classes: Record<string, PyClass> };

/** Same mapping rule as `meshSdkParity.test.ts`'s `tsTypeOf`, plus `tuple[X, ...]` — this
 *  module's sequences are frozen tuples, never `list[X]`, and the mirror uses `readonly X[]`
 *  accordingly (see `maintenanceBridgeTypes.ts`'s header). */
const SCALARS: Record<string, string> = { str: "string", int: "number", float: "number", bool: "boolean" };

/**
 * The module's four `Literal[...]` TYPE ALIASES (`LeadTimeSource`, `EventSourceKind`, `EventKind`,
 * `ApprovalOutcome`) are not pydantic models — they resolve to the literal union itself, never to
 * a `WireX` model reference. Keyed here rather than guessed by the bare-class-name rule below,
 * because that rule cannot tell a type alias from a model by spelling alone.
 */
const TYPE_ALIASES: Record<string, string> = {
  LeadTimeSource: '"stand-in" | "supply-system"',
  EventSourceKind: '"maintainer_report" | "bit_telemetry"',
  EventKind: '"cm_discrepancy" | "lifecycle_transition"',
  ApprovalOutcome: '"approved" | "rejected"',
};

function tsTypeOf(annotation: string): string {
  // `mypy`'s own escape hatch for a `Literal[...]`-backed alias used bare (not `Optional`-wrapped)
  // shows up as a trailing `# type: ignore[valid-type]` on five fields in this module — a Python
  // comment, not part of the type, stripped here rather than taught to every branch below it.
  const a = annotation.replace(/#.*$/, "").trim();
  const inner = (open: string) => a.slice(open.length, -1);

  if (SCALARS[a]) return SCALARS[a];
  if (TYPE_ALIASES[a]) return TYPE_ALIASES[a];
  if (a.startsWith("Optional[") && a.endsWith("]")) return tsTypeOf(inner("Optional["));

  if (a.startsWith("Literal[") && a.endsWith("]")) {
    const members = splitTop(inner("Literal[")).map((m) => m.trim().replace(/^'(.*)'$/, '"$1"'));
    expect(members.length, `Literal with no members: ${a}`).toBeGreaterThan(0);
    return members.join(" | ");
  }

  // `tuple[X, ...]` is this module's only sequence shape; the trailing `, ...` marks it frozen
  // on the Python side and `readonly` on this one.
  if (a.startsWith("tuple[") && a.endsWith("]")) {
    const parts = splitTop(inner("tuple["));
    expect(parts.length, `tuple[...] with an unexpected arity: ${a}`).toBe(2);
    expect(parts[1].trim(), `tuple[...] is not variable-length: ${a}`).toBe("...");
    return `readonly ${tsTypeOf(parts[0])}[]`;
  }

  if (/^[A-Z][A-Za-z0-9]*$/.test(a)) return `Wire${a}`;

  throw new Error(
    `no TS mapping for the annotation \`${a}\` — add a rule rather than letting the field go unchecked`,
  );
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[") depth += 1;
    if (ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** No `out.pop(...)` anywhere in `maintenance_bridge.py` (confirmed by reading it whole — it is
 *  small) and no field here is built by a hand-assembling producer upstream of the SDK model:
 *  this whole module serializes itself, uniformly. So, unlike `meshSdkParity.test.ts`, there is
 *  no per-class exception table — every `Optional[X] = None` field is nullable, never optional. */
function expectedFromPython(f: PyField): MirroredField {
  const nullableByAnnotation = f.annotation.startsWith("Optional[") || /\|\s*None\b/.test(f.annotation);
  return { ts: tsTypeOf(f.annotation), optional: false, nullable: nullableByAnnotation };
}

const CLASSES = Object.keys(MIRRORED_FIELDS) as (keyof typeof MIRRORED_FIELDS)[];

describe("the maintenance-bridge snapshot the mirror is sealed against", () => {
  it("names where it came from, so its age is readable", () => {
    const p = SNAP.provenance as Record<string, string | string[]>;
    expect(p.sdk_repo).toBe("iagent-mesh-sdk");
    expect(p.extractor).toBe("scripts/extract-maintenance-bridge-parity.mjs");
    expect(p.sdk_sha).toBe(PINNED_SHA);
    // Extracted BY SHA, not by branch: origin/lane/ca-0.9.8 moved on to ced6133 (2026-10-06) with
    // maintenance_bridge.py byte-unchanged — a branch name here would silently re-aim the seal.
    expect(p.sdk_ref).toBe(PINNED_SHA);
    expect(p.sources).toEqual(["iagent_mesh/maintenance_bridge.py"]);
  });

  it("holds every class the mirror describes, and no stragglers", () => {
    expect(Object.keys(SNAP.classes).sort()).toEqual([...CLASSES].sort());
  });

  /**
   * ⛔ THE CONTROL INDEPENDENT OF THE EXTRACTOR. These counts come from reading
   * `maintenance_bridge.py` directly (it is small — read whole, not sampled), not from running
   * the same parser twice and comparing it with itself.
   */
  it("extracted the field counts read by hand off the module", () => {
    const counts = Object.fromEntries(Object.entries(SNAP.classes).map(([k, v]) => [k, v.fields.length]));
    expect(counts).toEqual({
      ReleasabilityLabel: 2,
      Fault: 3,
      EventSource: 4,
      SpareRow: 5,
      BattleConditionBasis: 2,
      BattleCondition: 2,
      Picture: 6,
      EventProvenanceRow: 2,
      MaintenanceEvent: 9,
      TaskRef: 2,
      PartRow: 8,
      WorkOrder: 4,
      ApprovalChainEntry: 6,
      ActionProvenance: 4,
      ActionRecord: 8,
    });
  });

  it("extracted the trap annotations by hand off the module", () => {
    const ann = (cls: string, name: string) => SNAP.classes[cls].fields.find((f) => f.name === name)?.annotation;
    expect(ann("Picture", "nearest_spare")).toBe("Optional[SpareRow]");
    expect(ann("PartRow", "icn")).toBe("Optional[str]");
    expect(ann("PartRow", "lead_time_source")).toBe("Optional[LeadTimeSource]");
    expect(ann("SpareRow", "lead_time_source")).toBe("LeadTimeSource  # type: ignore[valid-type]");
    expect(ann("MaintenanceEvent", "sources")).toBe("tuple[EventSource, ...]");
    expect(ann("ReleasabilityLabel", "releasable_to")).toBe("tuple[str, ...]");
  });
});

describe("the TS mirror agrees with the Python, field for field", () => {
  for (const cls of CLASSES) {
    it(`${cls} — same fields, in the same order`, () => {
      const py = SNAP.classes[cls].fields.map((f) => f.name);
      expect(Object.keys(MIRRORED_FIELDS[cls])).toEqual(py);
    });

    it(`${cls} — same type, same nullability, same optionality`, () => {
      const declared = MIRRORED_FIELDS[cls] as Record<string, MirroredField>;
      for (const f of SNAP.classes[cls].fields) {
        expect(declared[f.name], `${cls}.${f.name} is not described`).toBeDefined();
        expect(declared[f.name], `${cls}.${f.name}`).toEqual(expectedFromPython(f));
      }
    });
  }

  it("refuses an annotation it has no rule for, rather than passing it", () => {
    expect(() => tsTypeOf("dict[str, Any]")).toThrow(/no TS mapping/);
    expect(() => tsTypeOf("list[int]")).toThrow(/no TS mapping/); // this module uses tuple, never list
    expect(tsTypeOf("Optional[int]")).toBe("number");
    expect(tsTypeOf("tuple[SpareRow, ...]")).toBe("readonly WireSpareRow[]");
    expect(tsTypeOf('Literal["stand-in", "supply-system"]')).toBe('"stand-in" | "supply-system"');
  });
});

describe("the maintenance-bridge snapshot still matches the live Python at the pinned sha", () => {
  it.skipIf(!HAVE_SDK)("re-extracts, at the pinned sha, to exactly what is committed", async () => {
    const { extractAtRef } = await import("../../scripts/extract-maintenance-bridge-parity.mjs");
    const live = extractAtRef(SDK, PINNED_SHA) as typeof SNAP;
    // The declarations, not the provenance timestamp-shaped fields — a comparison keyed on
    // sdk_sha would trivially agree since both sides pin the exact same literal.
    expect(live.classes).toEqual(SNAP.classes);
  });

  it.skipIf(!HAVE_SDK)("the pinned sha is reachable from the branch the order named — positive control", () => {
    // Not asserting the branch HEAD equals the pin (it has moved, see this file's header) — only
    // that the pinned commit is still real history on that branch, not an orphan or a typo.
    const git = (...a: string[]) => execFileSync("git", ["-C", SDK, ...a], { encoding: "utf8" }).trim();
    expect(() => git("cat-file", "-e", `${PINNED_SHA}^{commit}`)).not.toThrow();
    expect(() =>
      git("merge-base", "--is-ancestor", PINNED_SHA, "origin/lane/ca-0.9.8"),
    ).not.toThrow();
  });
});
