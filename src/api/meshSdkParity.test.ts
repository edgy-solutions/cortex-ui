/**
 * TWO SDKs DESCRIBE ONE WIRE, AND NOTHING MADE THEM AGREE.
 *
 * `iagent-mesh-sdk/iagent_mesh/` declares these models in pydantic; cortex has no Python and reads
 * the same wire through hand-written types in `meshSdkTypes.ts`. Drift between them has NO
 * SYMPTOM on either side: a field added upstream simply never reaches a reader, a `bool` promoted
 * to a tri-state silently rewrites "the producer did not say" as "the caller chose it", a key that
 * stops being omitted starts arriving as `null` into a reader that never expected one. Nothing
 * throws. Somebody sees a wrong screen months later.
 *
 * ── WHAT THIS SEAL READS, AND WHY IT IS NOT THE PACKET ────────────────────────────────────────
 *
 * Lane ca's 2026-09-26 packet carries a table of these models, and its own §5 says a seal built
 * from the table would measure consistency WITH THE TABLE. So the reference is the Python: the
 * live source where the sibling checkout exists, and a committed extraction of it
 * (`meshSdkParity.json`, written by `scripts/extract-mesh-sdk-parity.mjs`) everywhere else.
 *
 * ⚠ AND THE TWO HALVES ARE NOT EQUALLY COVERED. CI checks out cortex alone, so on a merge only
 * `mirror == snapshot` runs; `snapshot == live Python` runs on a box with both repos, which is
 * this lane and a developer's machine. That is a real gap and it is NAMED rather than papered
 * over: closing it needs a CI job that checks out both repos, which is the architect's call, not
 * this lane's. What keeps the gap bounded is that the snapshot records the SDK ref and SHA it was
 * taken at, so its age is always readable, and that re-taking it is a command rather than an edit.
 *
 * ── THE EXTRACTOR CANNOT BE ITS OWN CONTROL ───────────────────────────────────────────────────
 *
 * The live half compares the snapshot against a FRESH extraction by the same code, so a broken
 * extractor would produce the same wrong answer twice and agree with itself. The controls below
 * are therefore independent of it: exact field counts, and specific annotations quoted from the
 * packet's EXECUTED dump. A parser that silently stopped seeing fields fails those, not the
 * comparison.
 *
 * ── STATUS OF THE SOURCE: UNRELEASED ──────────────────────────────────────────────────────────
 *
 * SDK branch `lane/ca`; v0.9.4 is not cut and nobody pins a version. A mirror of an unreleased
 * model is also the case where drift is fastest, which is why this exists before a release.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { MIRRORED_FIELDS, type MirroredField } from "./meshSdkTypes";
import SNAPSHOT from "./meshSdkParity.json";

const SDK = path.join(__dirname, "../../../iagent-mesh-sdk");
const HAVE_SDK = existsSync(path.join(SDK, "iagent_mesh/models.py"));

type PyField = { name: string; annotation: string; default: string | null };
type PyClass = { file: string; fields: PyField[] };
const SNAP = SNAPSHOT as { provenance: Record<string, unknown>; classes: Record<string, PyClass> };

/**
 * ── THE ONE PLACE A PYTHON ANNOTATION BECOMES A TS TYPE ──────────────────────────────────────
 *
 * The mapping is the judgment in this seal, so it is here where a reader can disagree with it
 * rather than buried in a fixture. It ENUMERATES THE SAFE SET: an annotation with no rule is a
 * THROWN ERROR and not a skip, because a field the mapper quietly passes over is a field the seal
 * can no longer see drift in — which is the exact failure the whole apparatus is against.
 *
 * Class references map by the naming convention (`MethodInput` → `WireMethodInput`), applied
 * mechanically, so a class RENAMED upstream fails here instead of resolving to a stale name.
 */
const SCALARS: Record<string, string> = { str: "string", int: "number", float: "number", bool: "boolean" };

function tsTypeOf(annotation: string): string {
  const a = annotation.trim();
  const inner = (open: string) => a.slice(open.length, -1);

  if (SCALARS[a]) return SCALARS[a];

  if (a.startsWith("Optional[") && a.endsWith("]")) return tsTypeOf(inner("Optional["));

  if (a.startsWith("Literal[") && a.endsWith("]")) {
    const members = splitTop(inner("Literal[")).map((m) => m.trim().replace(/^'(.*)'$/, '"$1"'));
    expect(members.length, `Literal with no members: ${a}`).toBeGreaterThan(0);
    return members.join(" | ");
  }

  if (a.startsWith("Union[") && a.endsWith("]")) {
    // DEDUPED, because `int` and `float` both land on `number` and TS has one numeric type. The
    // first run of this seal produced `boolean | number | number | string` and indicted the mapper
    // rather than the mirror — which is the arm doing its job on the half nobody suspects.
    const members = splitTop(inner("Union[")).map((m) => tsTypeOf(m));
    return [...new Set(members)].join(" | ");
  }

  for (const seq of ["list[", "Sequence[", "tuple[", "Iterable["]) {
    if (a.startsWith(seq) && a.endsWith("]")) return `${tsTypeOf(a.slice(seq.length, -1))}[]`;
  }

  // A bare class name is a model reference; cortex's mirror prefixes them.
  if (/^[A-Z][A-Za-z0-9]*$/.test(a)) return `Wire${a}`;

  throw new Error(
    `no TS mapping for the annotation \`${a}\` — add a rule rather than letting the field go unchecked`,
  );
}

/** Split on top-level commas, so `Union[bool, int]` inside a `list[...]` does not break apart. */
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

/**
 * ── WHERE OPTIONALITY COMES FROM, WHICH IS NOT THE ANNOTATION ────────────────────────────────
 *
 * `Optional[X] = None` in pydantic says the value may be None. It says NOTHING about whether the
 * KEY reaches the wire, and those are different facts that a mirror must keep apart: `method` is
 * absent-not-null, `total_available` is null-not-absent. Conflating them turns "not reported" into
 * "not sent" — and the tempting mechanical rule (`Optional[...]` ⇒ `?:`) gets one of the two wrong
 * whichever way it is written.
 *
 * So optionality is DERIVED from two measured facts rather than tabulated per field:
 *
 *   POPPED — the model's own serializer removes the key when unset. `ToolOutput` does exactly
 *     that for `method`, to keep the field additive on the wire: an output that sets no method
 *     dumps byte-identically to before. A popped field is optional and is NEVER null.
 *
 *   BUILT BY HAND UPSTREAM — the object reaching cortex was assembled by a producer that does not
 *     import the SDK model. `cost_agent/measures.py` builds the method dict itself and MAY OMIT
 *     `unit` entirely (its docs: "absent `unit` means NOT STATED"), where the SDK would dump
 *     `"unit": null`. Both are the same state, so cortex accepts absent AND null for those. The
 *     enumeration response, by contrast, is dumped by the SDK model itself, so its keys always
 *     arrive and `total_available: null` is what "not reported" looks like.
 *
 * The second fact is a claim about the PRODUCER, which no file in this repo can check. It is
 * asserted per class below with the reason attached, so a reader can contest it — and it is a
 * per-class fact rather than a per-field exception, because an exception list keyed on field names
 * excuses whatever gets added to it.
 */
const BUILT_BY_HAND_UPSTREAM: Record<string, boolean> = {
  // The producer builds the method dict itself and never imports `MethodBlock`.
  MethodInput: true,
  MethodBlock: true,
  // `ToolOutput` IS the SDK model, and its own serializer decides what reaches the wire.
  ToolOutput: false,
  // Dumped by `EnumerateInstancesResponse` itself: every key arrives.
  InstanceOption: false,
  EnumerateInstancesResponse: false,
};

/**
 * WHICH FIELDS THE MODEL'S OWN SERIALIZER POPS — per class, because it is a per-class serializer.
 *
 * Declared here and CHECKED AGAINST THE LIVE PYTHON below, rather than derived from the snapshot:
 * a snapshot of field declarations cannot carry serializer behaviour, and the day the pop is
 * removed `method: null` starts arriving at a reader whose type says it never can. So the fact is
 * written where it can be contested and then verified where the source exists.
 */
const POPPED: Record<string, string[]> = {
  MethodInput: [],
  MethodBlock: [],
  // `@model_serializer(mode="wrap")` removes the key when no method was set, to keep the field
  // additive: an output with no method dumps byte-identically to one from before the field existed.
  ToolOutput: ["method"],
  InstanceOption: [],
  EnumerateInstancesResponse: [],
};

/** The same fact, read out of Python source, so the declaration above can be confronted with it. */
function poppedFields(pySource: string): string[] {
  return [...pySource.matchAll(/out\.pop\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
}

function expectedFromPython(cls: string, f: PyField, popped: string[]): MirroredField {
  const nullableByAnnotation = f.annotation.startsWith("Optional[") || /\|\s*None\b/.test(f.annotation);
  const isPopped = popped.includes(f.name);
  return {
    ts: tsTypeOf(f.annotation),
    optional: isPopped || (nullableByAnnotation && BUILT_BY_HAND_UPSTREAM[cls] === true),
    // A popped key never arrives as null — that is the whole point of popping it.
    nullable: nullableByAnnotation && !isPopped,
  };
}

const CLASSES = Object.keys(MIRRORED_FIELDS) as (keyof typeof MIRRORED_FIELDS)[];

describe("the snapshot the mirror is sealed against", () => {
  it("names where it came from, so its age is readable", () => {
    // A snapshot with no provenance is a hand-written table with extra steps — the copy lane ca
    // declined to produce for exactly this reason. Each field is asserted because a partially
    // filled provenance block reads as a full one.
    const p = SNAP.provenance as Record<string, string | string[]>;
    expect(p.sdk_repo).toBe("iagent-mesh-sdk");
    expect(p.extractor).toBe("scripts/extract-mesh-sdk-parity.mjs");
    expect(p.sdk_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(p.sdk_ref, "an un-gitted checkout produced this").not.toBe("unknown");
    expect(p.sources).toEqual(["iagent_mesh/models.py", "iagent_mesh/enumeration.py"]);
  });

  it("holds every class the mirror describes, and no stragglers", () => {
    // Both directions. A snapshot missing a class leaves that class unchecked; a class in the
    // snapshot that cortex no longer mirrors is a stale reference that reads as coverage.
    expect(Object.keys(SNAP.classes).sort()).toEqual([...CLASSES].sort());
  });

  /**
   * ⛔ THE CONTROL THAT IS INDEPENDENT OF THE EXTRACTOR.
   *
   * Everything else here compares two things the same parser produced. These counts and
   * annotations come from the packet's EXECUTED dump (`model_dump(mode="json")`, not typed by
   * hand), so a parser that silently stopped seeing fields — or saw a docstring line as one —
   * fails HERE rather than agreeing with itself.
   */
  it("extracted the field counts and the four annotations that carry the traps", () => {
    const counts = Object.fromEntries(Object.entries(SNAP.classes).map(([k, v]) => [k, v.fields.length]));
    expect(counts).toEqual({
      MethodInput: 3,
      MethodBlock: 5,
      ToolOutput: 1,
      InstanceOption: 2,
      EnumerateInstancesResponse: 4,
    });
    const ann = (cls: string, name: string) =>
      SNAP.classes[cls].fields.find((f) => f.name === name)?.annotation;
    expect(ann("EnumerateInstancesResponse", "completeness")).toBe(
      'Literal["complete", "truncated", "unknown"]',
    );
    expect(ann("MethodBlock", "bound_defaulted")).toBe("Optional[bool]");
    expect(ann("MethodInput", "value")).toBe("Union[bool, int, float, str]");
    expect(ann("ToolOutput", "method")).toBe("Optional[MethodBlock]");
  });
});

describe("the TS mirror agrees with the Python, field for field", () => {
  for (const cls of CLASSES) {
    it(`${cls} — same fields, in the same order`, () => {
      // ORDER TOO, because the mirror is read by a person against the Python beside it, and a
      // reordered interface is where a reader stops checking line by line and starts assuming.
      const py = SNAP.classes[cls].fields.map((f) => f.name);
      expect(Object.keys(MIRRORED_FIELDS[cls])).toEqual(py);
    });

    it(`${cls} — same type, same nullability, same optionality`, () => {
      const declared = MIRRORED_FIELDS[cls] as Record<string, MirroredField>;
      for (const f of SNAP.classes[cls].fields) {
        expect(declared[f.name], `${cls}.${f.name} is not described`).toBeDefined();
        expect(declared[f.name], `${cls}.${f.name}`).toEqual(expectedFromPython(cls, f, POPPED[cls]));
      }
    });
  }

  it("refuses an annotation it has no rule for, rather than passing it", () => {
    // The mapper's own control. A mapper that returned a default for anything unrecognised would
    // make every future field green by construction — the shape that makes an allow-list useless.
    expect(() => tsTypeOf("dict[str, Any]")).toThrow(/no TS mapping/);
    expect(() => tsTypeOf("Optional[SomeFutureModel[int]]")).toThrow(/no TS mapping/);
    // And the near side: the rules it does have resolve.
    expect(tsTypeOf("Optional[bool]")).toBe("boolean");
    expect(tsTypeOf("Sequence[InstanceOption]")).toBe("WireInstanceOption[]");
    expect(tsTypeOf('Literal["a", "b"]')).toBe('"a" | "b"');
  });
});

/**
 * ── THE CROSS-REPO HALF ───────────────────────────────────────────────────────────────────────
 *
 * Runs only where the SDK is checked out beside cortex — the same convention
 * `boundSlots.test.ts` uses for the gateway. On CI it skips, which is stated in this file's header
 * as a named gap with an owner rather than left to be discovered.
 */
describe("the snapshot still matches the live Python", () => {
  it.skipIf(!HAVE_SDK)("re-extracts to exactly what is committed", async () => {
    const { extract } = await import("../../scripts/extract-mesh-sdk-parity.mjs");
    const live = extract(SDK) as typeof SNAP;
    // The DECLARATIONS, not the provenance: a new SDK commit that does not touch these models is
    // not drift, and asserting the SHA would make this cry wolf on every unrelated push — which
    // is how a seal gets loosened instead of read.
    expect(live.classes).toEqual(SNAP.classes);
  });

  it.skipIf(!HAVE_SDK)("pops exactly the keys `POPPED` claims, across both source files", () => {
    /*
      The one fact the snapshot cannot carry, read live rather than trusted — and over the WHOLE
      population rather than the single field I happened to know about. Both directions matter and
      for different reasons: a pop REMOVED means `method: null` starts arriving at a type that says
      it never can, and a pop ADDED somewhere else means a key cortex types as always-present
      silently stops being sent. Only one of those is the one I went looking for.
    */
    const declared = [...new Set(Object.values(POPPED).flat())].sort();
    const live = [
      ...new Set(
        (SNAP.provenance.sources as string[]).flatMap((f) =>
          poppedFields(readFileSync(path.join(SDK, f), "utf8")),
        ),
      ),
    ].sort();
    expect(declared, "positive control: nothing claims to be popped, so this compares [] to []")
      .not.toEqual([]);
    expect(live).toEqual(declared);
  });

  it.skipIf(!HAVE_SDK)("no released version contains these FIELDS, which is why it pins a SHA", async () => {
    /*
      ⛔ THIS ARM WAS WRONG ON ITS FIRST RUN AND SAID SO. It asserted the SDK had no tags at all;
      the repo is tagged to v0.9.3 and HEAD is 21 commits past it. The fact worth sealing is not
      "there are no releases" but "no RELEASE CONTAINS WHAT IS MIRRORED" — the newest tag has
      neither `MethodBlock` nor `completeness`, so a version pin would point at a file where these
      classes do not exist. That is the whole reason the snapshot records a SHA.

      When a tag finally carries them, this goes red and the decision to pin a version instead
      becomes a task rather than a stale sentence in a JSON file.
    */
    const git = (...a: string[]) => execFileSync("git", ["-C", SDK, ...a], { encoding: "utf8" }).trim();
    const newest = git("describe", "--tags", "--abbrev=0");
    expect(newest, "positive control: no tag was read at all").toMatch(/^v[0-9]+[.][0-9]+[.][0-9]+/);
    /*
      ⛔ AND THE SUBJECT IS THE FIELDS, NOT THE CLASSES — this arm's SECOND wrong premise, also
      caught by running it. `EnumerateInstancesResponse` has existed since long before v0.9.3; what
      is unreleased is `completeness` and `total_available` ON it. Keyed on the class name the arm
      read as satisfied while saying nothing about the thing the mirror actually describes, which is
      a field set. A class can sit still for releases while its fields drift underneath.
    */
    const { extractClass } = await import("../../scripts/extract-mesh-sdk-parity.mjs");
    const missing: string[] = [];
    for (const [cls, entry] of Object.entries(SNAP.classes)) {
      let released = "";
      try {
        released = git("show", `${newest}:${entry.file}`);
      } catch {
        // The whole FILE postdates the tag: every field in it is unreleased.
      }
      if (!released.includes(`class ${cls}`)) {
        missing.push(...entry.fields.map((f) => `${cls}.${f.name}`));
        continue;
      }
      let there = new Set<string>();
      try {
        there = new Set(extractClass(released, cls).map((f) => f.name));
      } catch {
        /*
          The extractor THROWS on a class with no fields, because on the live read that means its
          parser broke. Read historically it can be the truth instead: at v0.9.3 `ToolOutput` is
          literally `class ToolOutput(BaseModel): """...""" ; pass` — a bare base class. So the hard
          guard stays hard where it belongs and an empty set is the right reading here, which is
          why this catch is in THIS arm and not in the extractor.
        */
      }
      for (const f of entry.fields) if (!there.has(f.name)) missing.push(`${cls}.${f.name}`);
    }
    // The two the overnight order named by hand, so this cannot go green by finding some other gap.
    expect(missing).toContain("EnumerateInstancesResponse.completeness");
    expect(missing).toContain("EnumerateInstancesResponse.total_available");
    expect(
      missing.filter((m) => m.startsWith("MethodBlock.")).length,
      `${newest} now ships MethodBlock — pin the mirror to that version instead of a SHA`,
    ).toBe(SNAP.classes.MethodBlock.fields.length);
    // And HEAD really is ahead of it, so "a SHA past the newest tag" is the honest description.
    expect(git("describe", "--tags")).toMatch(/-[0-9]+-g[0-9a-f]+$/);
  });
});

/**
 * ── THE EXTRACTOR'S OWN GUARDS, ON FIXTURES, BECAUSE THE LIVE SDK CANNOT REACH THEM ───────────
 *
 * ⛔ THESE ARMS EXIST BECAUSE A MUTANT SURVIVED. Disabling the extractor's docstring tracking
 * changed its output on the real SDK NOT AT ALL — byte-identical JSON — so every arm above passed
 * with the guard destroyed. That is not a hole in the seal; it is a guard whose defect no current
 * input can express. The mutation that reaches it needs a docstring containing a FIELD-SHAPED LINE,
 * which is a fixture and not a source edit — and lane ca's packet shows these models' docstrings
 * already carry indented tables, so the input is a matter of when, not whether.
 *
 * Deleting the guard instead was the other option and is the wrong one: an unparsed docstring line
 * enters the snapshot as a field that does not exist, and then the seal reports drift forever
 * against a phantom. So the guard stays and is made reachable here.
 */
describe("the extractor refuses the shapes that would put phantom fields in the snapshot", () => {
  const load = () => import("../../scripts/extract-mesh-sdk-parity.mjs");

  it("does not read a field-shaped line INSIDE a docstring as a field", async () => {
    const { extractClass } = await load();
    const src = [
      "class Thing(BaseModel):",
      '    """One line, then a table that looks exactly like a field body:',
      "",
      '    completeness: Literal["complete", "truncated"]  # documented, not declared',
      "    total_available: Optional[int]",
      '    """',
      "    real_field: str",
      "",
    ].join("\n");
    expect(extractClass(src, "Thing").map((f) => f.name)).toEqual(["real_field"]);
  });

  it("still reads the per-field docstrings the SDK actually uses, between declarations", async () => {
    // The near side. A guard that swallowed everything after the first docstring would pass the
    // arm above and lose every field declared below one — and the SDK documents field by field.
    const { extractClass } = await load();
    const src = [
      "class Thing(BaseModel):",
      '    """The class."""',
      "    first: str",
      '    """What first means."""',
      "    second: Optional[int] = None",
      '    """What second means."""',
      "    third: bool = False",
      "",
    ].join("\n");
    const got = await extractClass(src, "Thing");
    expect(got.map((f) => f.name)).toEqual(["first", "second", "third"]);
    expect(got[1]).toEqual({ name: "second", annotation: "Optional[int]", default: "None" });
  });

  it("refuses a class it cannot find, and a class it finds nothing in", async () => {
    // Both failure modes are LOUD by design: a silent empty result becomes a snapshot with a class
    // that has no fields, which every parity arm below then agrees with.
    const { extractClass } = await load();
    expect(() => extractClass("class Other(BaseModel):\n    x: str\n", "Thing")).toThrow(
      /class Thing is not declared/,
    );
    expect(() => extractClass('class Thing(BaseModel):\n    """Doc."""\n    pass\n', "Thing")).toThrow(
      /yielded NO fields — the parser is broken/,
    );
  });

  it("ignores methods, decorators and model_config, which sit in the same class body", async () => {
    const { extractClass } = await load();
    const src = [
      "class Thing(BaseModel):",
      "    model_config = ConfigDict(extra='forbid')",
      "    kept: str",
      "    @model_serializer(mode='wrap')",
      "    def _dump(self, handler):",
      "        out: dict = handler(self)",
      '        out.pop("kept", None)',
      "        return out",
      "",
    ].join("\n");
    // `out: dict` sits at 8 spaces inside the method and must not be mistaken for a declaration —
    // it is annotated, lower-case and looks like a field in every way except its indentation.
    expect(extractClass(src, "Thing").map((f) => f.name)).toEqual(["kept"]);
  });
});
