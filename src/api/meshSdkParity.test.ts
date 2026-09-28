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
type PyValidator = { name: string; kind: string; decorator: string; source: string };
type PyClass = { file: string; fields: PyField[]; validators: PyValidator[] };
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

  it.skipIf(!HAVE_SDK)("the pin names a RELEASE, and the release is what was extracted", async () => {
    /*
      ⛔ THIS ARM REPLACES ITS OWN OPPOSITE, WHICH EXPIRED IN UNDER FOUR HOURS. Until 2026-09-27 it
      read "no released version contains these FIELDS, which is why it pins a SHA", and it was
      right: the newest tag was v0.9.3, whose `models.py` is 600 bytes and declares no `MethodBlock`
      at all, so a version pin would have named a file where the mirrored classes do not exist. It
      went RED the same night when v0.9.4 was cut carrying every mirrored field and the
      bound/bound_defaulted XOR, and its own failure message said what to do — "pin the mirror to
      that version instead of a SHA". That is the arm working, not the arm having been wrong.

      ⛔ AND THE LESSON IS ABOUT THE FIXTURE, NOT THE TAG. The reason to pin a sha lived in
      `meshSdkParity.json` as a SENTENCE: "UNRELEASED — the newest tag (v0.9.3) contains neither
      MethodBlock nor completeness ... so a SHA is the only honest pin". A justification in prose
      does not expire when its premise does, it just keeps reading as current — and this one was the
      standing reason the mirror pinned a commit on a lane branch, which is a ref that can be
      rebased or deleted, instead of a tag anyone can fetch. So `sdk_release` is now COMPUTED by the
      extractor from the bytes it read (`pinFor`), and this arm checks that computation against an
      independent one.

      ⛔ RECOMPUTED HERE, NOT ASKED OF `pinFor`. The extractor decides by walking tags
      newest-by-creatordate and comparing blobs. Calling that same function for the expectation
      would make this arm agree with it by construction and indict nothing, which is the hollow-green
      shape this repo has paid for before. So the tag comes from `describe --abbrev=0` — newest
      REACHABLE, a different question with a different answer when tags are cut off-trunk — and the
      byte comparison is written out below rather than borrowed.
    */
    const git = (...a: string[]) =>
      execFileSync("git", ["-C", SDK, ...a], { encoding: "utf8", maxBuffer: 64e6 });
    const t = (...a: string[]) => git(...a).trim();
    const newest = t("describe", "--tags", "--abbrev=0");
    expect(newest, "positive control: no tag was read at all").toMatch(/^v[0-9]+[.][0-9]+[.][0-9]+/);

    const sources = SNAP.provenance.sources as string[];
    expect(
      sources.length,
      "positive control: no sources to compare, so the filter below proves nothing",
    ).toBeGreaterThan(0);
    const mismatched = sources.filter((f) => {
      let atTag: string | null = null;
      try {
        atTag = git("show", `${newest}:${f}`);
      } catch {
        atTag = null; // the file postdates the tag, which is a mismatch and not an error
      }
      // Line endings only. Whitespace inside a declaration IS drift worth refusing a tag over.
      const onDisk = readFileSync(path.join(SDK, f), "utf8").replace(/\r\n/g, "\n");
      return atTag === null || onDisk !== atTag.replace(/\r\n/g, "\n");
    });

    if (mismatched.length === 0) {
      /*
        The near branch, and the one that ran when this was written: the newest release IS the
        content the mirror was extracted from, so the pin must name it — not a sha, and not a
        sentence about why a sha was necessary.
      */
      expect(
        SNAP.provenance.sdk_ref,
        `${newest} matches the mirrored sources byte for byte, so the pin must name the release`,
      ).toBe(newest);
      expect(
        SNAP.provenance.sdk_release,
        "sdk_release must BE the tag; prose here is what went stale last time",
      ).toBe(newest);
      expect(
        SNAP.provenance.sdk_sha,
        "the sha must be the tag's COMMIT — an annotated tag's own object is not what CI checks out",
      ).toBe(t("rev-parse", `${newest}^{commit}`));
    } else {
      /*
        The far branch: the SDK has moved past its newest release in a way that touches what is
        mirrored, so a sha is the honest pin again. The claim it holds is that the REASON is
        recomputed — a sha pin has to name the release it could not use, so it cannot inherit the
        reason from the last time this happened, which is exactly how the last one went stale.

        ⛔ AND THIS BRANCH DOES NOT RUN AGAINST THE REAL CHECKOUT TODAY, so it is stated where it can
        be checked rather than trusted. Reaching it needs the disk to differ from the newest tag, and
        the SDK belongs to another lane — nothing here may write to it. `npm run check:parity:redproof`
        reaches it from THIS side instead: the branch turns on `provenance.sources`, which is the
        fixture's own claim about which files it mirrors, so a mutant that adds a path no release
        carries sends the arm down here. Two cases do that, one aimed at each assertion below. An
        accepting branch nothing exercises is where a defect lives rent-free.
      */
      expect(
        String(SNAP.provenance.sdk_release),
        "a sha pin must state which release it could not use, and name it",
      ).toContain(newest);
      expect(String(SNAP.provenance.sdk_sha)).toMatch(/^[0-9a-f]{40}$/);
      expect(SNAP.provenance.sdk_ref, "a sha pin must not also claim to be a release").not.toBe(newest);
    }
  });

  it.skipIf(!HAVE_SDK)("the pinned ref CONTAINS every mirrored field, and the XOR rule", async () => {
    /*
      The expired arm's inverse, kept on the same three subjects so the reversal is legible:
      `MethodBlock`'s fields and `EnumerateInstancesResponse.completeness` / `total_available` were
      the three the overnight order named by hand as unreleased. They are asserted PRESENT here.

      ⛔ WHY THIS IS NOT THE ARM ABOVE AGAIN. That one compares the newest TAG to the disk; this one
      reads whatever `sdk_ref` actually names, which in the far branch is a sha and not a tag at all.
      The claim is the one a consumer of the fixture depends on and neither the live arms nor the
      snapshot arms make: the thing the mirror PINS contains what the mirror says it does. When the
      near branch above holds, this follows from it — that is the cheap day, not the reason it exists.
    */
    const ref = String(SNAP.provenance.sdk_ref);
    const git = (...a: string[]) =>
      execFileSync("git", ["-C", SDK, ...a], { encoding: "utf8", maxBuffer: 64e6 });
    const { extractClass } = await import("../../scripts/extract-mesh-sdk-parity.mjs");

    const missing: string[] = [];
    let counted = 0;
    for (const [cls, entry] of Object.entries(SNAP.classes)) {
      // No try/catch on the read or the parse. At a ref the mirror PINS, a missing file or a class
      // the extractor cannot parse is the finding, and swallowing it would report it as zero fields.
      const atRef = git("show", `${ref}:${entry.file}`);
      const there = new Set(extractClass(atRef, cls).map((f) => f.name));
      for (const f of entry.fields) {
        counted++;
        if (!there.has(f.name)) missing.push(`${cls}.${f.name}`);
      }
    }
    /*
      ⛔ TIED TO THE POPULATION, NOT TO A NUMBER I GUESSED. The first draft of this control said
      `toBeGreaterThan(20)` and went RED at 15 — the control doing its job, but a threshold picked
      without measuring the population is a number that can only fail LOUDLY once and then sit
      there passing forever while the real count halves. The honest control is that the loop visited
      EVERY field the snapshot declares: a class silently skipped drops the count, and `missing`
      being empty can never see that, because a containment check is blind to what was never looked
      at. This is the cardinality assertion beside the membership one.
    */
    const declaredFieldCount = Object.values(SNAP.classes).reduce((n, e) => n + e.fields.length, 0);
    expect(declaredFieldCount, "positive control: the snapshot declares no fields at all").toBeGreaterThan(0);
    expect(counted, "the census skipped a class the snapshot describes").toBe(declaredFieldCount);
    /*
      ⛔ THE SUBJECTS GO IN THE MESSAGE, BECAUSE THE VALUE IS ABBREVIATED. Measured 2026-09-28: the
      redproof case that pins v0.9.3 and narrows the census to the one class that release declares
      reddened HERE, correctly, and reported `expected [ …(2) ] to deeply equal []` — two missing
      fields, neither of them named. A reader of that line cannot tell `completeness` absent from a
      release from a typo in the snapshot, and a redproof cannot tell this assertion from any other
      `toEqual([])` in the file. Naming them here is what makes the red attributable.
    */
    expect(missing, `fields the pinned ref ${ref} does not carry: ${missing.join(", ") || "(none)"}`).toEqual([]);
    // Named, so this cannot read as satisfied by some other class's fields happening to be there.
    expect(
      SNAP.classes.MethodBlock.fields.map((f) => f.name),
      "positive control: MethodBlock contributes nothing to the census above",
    ).not.toEqual([]);
    for (const named of ["completeness", "total_available"]) {
      expect(
        SNAP.classes.EnumerateInstancesResponse.fields.map((f) => f.name),
        `${named} is what the overnight order named; the mirror has stopped describing it`,
      ).toContain(named);
    }
    // The rule ruling 2 was about, read at the pinned ref rather than off the disk.
    const modelsAtRef = git("show", `${ref}:${SNAP.classes.MethodBlock.file}`);
    expect(
      modelsAtRef,
      "the pinned ref does not carry the bound/bound_defaulted XOR, so the pin predates the rule again",
    ).toContain("(self.bound is None) != (self.bound_defaulted is None)");
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

describe("the rules the producer ENFORCES, which a fields-only mirror could not see", () => {
  /*
    ⛔ WHY THESE ARMS EXIST, AND WHAT THEY CAUGHT BEFORE THEY WERE WRITTEN.

    The ruling of 2026-09-27 was to bump the SDK pin "past 7e429d5 so the XOR validator is what the
    mirror mirrors". Bumping it changed this snapshot by ONE LINE — the sha — because the extractor
    took fields and explicitly not validators. The pin would have named the commit that carries the
    rule while the mirror still said nothing about it: a stale-sha fix that leaves the mirror exactly
    as blind as it was, and reports done.

    So the snapshot now carries every validator the mirrored classes declare, and the drift arm in
    "the snapshot still matches the live Python" covers them for free — a validator added, removed or
    reworded upstream reddens that comparison. These arms are here for the part a diff cannot say:
    WHICH rule mattered and why cortex cares.

    That these arms can still FAIL is proven by `scripts/redproof-sdk-parity.mjs`
    (`npm run check:parity:redproof`): mutants applied to the fixture, each required to redden the
    arm it was aimed at, scored on the failed arm NAME and never on the exit code or the log. The
    count is deliberately not written here — it grew when the pin arms were added, and a number in
    prose is one more thing that can quietly stop being true. It found one hole on the day it was
    written, noted at the raise assertion below.
  */

  it("captured validators at all, across more than one class", () => {
    /*
      ⛔ THE POSITIVE CONTROL FOR EVERY OTHER VALIDATOR ASSERTION IN THIS FILE, INCLUDING THE DRIFT
      ARM. If `extractValidators` returned [] for everything — a decorator regex that stopped
      matching, a body-slicer that fell off the end — then `expect(live.classes).toEqual(SNAP.classes)`
      compares [] to [] for all five classes and passes, reporting that the mirror tracks validators
      when it tracks nothing. That is a hollow green that never self-corrects, so the population is
      asserted here rather than assumed by the arms that read it.
    */
    const perClass = Object.entries(SNAP.classes).map(([c, e]) => [c, e.validators.length] as const);
    const total = perClass.reduce((n, [, k]) => n + k, 0);
    expect(total, "no validator was captured at all, so every validator arm here is vacuous").toBeGreaterThan(0);
    expect(
      perClass.filter(([, k]) => k > 0).length,
      "validators came from a single class, which is what a parser that only matches one shape looks like",
    ).toBeGreaterThan(1);
  });

  it("every captured validator carries the def it decorates", () => {
    // A decorator captured with no body would be a validator the snapshot claims to track and
    // cannot see inside — drift in the CONDITION would then be invisible while the name sat still.
    for (const [cls, entry] of Object.entries(SNAP.classes)) {
      for (const v of entry.validators) {
        expect(v.kind, `${cls}.${v.name} has no decorator kind`).toMatch(/^(field|model)_validator$/);
        expect(v.decorator, `${cls}.${v.name} lost its decorator line`).toContain("@" + v.kind);
        expect(v.source, `${cls}.${v.name} was captured without its def`).toContain("def " + v.name);
        expect(
          v.source.split("\n").length,
          `${cls}.${v.name} was captured as a decorator with no body`,
        ).toBeGreaterThan(2);
      }
    }
  });

  it("MethodBlock enforces the bound/bound_defaulted XOR, which is the rule cortex's reader is written against", () => {
    /*
      The rule: `(bound is None) == (bound_defaulted is None)`. Ruled 2026-09-27, reconciling the
      model with the fleet producer that was already checking it.

      ⛔ AND CORTEX'S READER DELIBERATELY DOES NOT ENFORCE IT — see the paragraph in
      `src/lib/cardExport.ts`. The combinations this validator forbids are exactly what an older or
      off-contract producer emits, and a reader that assumed the pair agreed would draw a confident
      half-statement instead of showing the halves. So this arm seals that the PRODUCER enforces it,
      which is what makes the reader's tolerance a deliberate choice rather than a gap. If ca ever
      drops the validator, this reddens and that tolerance stops being belt-and-braces.
    */
    const v = SNAP.classes.MethodBlock.validators.find((x) => x.kind === "model_validator");
    expect(v, "MethodBlock declares no model_validator at the pinned sha").toBeDefined();
    expect(v!.decorator).toContain('mode="after"');
    // Keyed on the FIELDS and the raise, not on the method's name: a rename is not a weakening, and
    // a rule that still mentions only one of the two fields is.
    expect(v!.source, "the rule does not mention bound").toContain("self.bound");
    expect(v!.source, "the rule does not mention bound_defaulted").toContain("self.bound_defaulted");
    // ⛔ ANCHORED TO A LINE THAT STARTS WITH THE RAISE, not to the substring. Measured 2026-09-27:
    // a mutant that replaced the raise with `pass  # was: raise ValueError` left the substring in
    // place and this arm stayed GREEN on a rule that had stopped forbidding anything. A commented-out
    // or renamed-away raise is exactly how a validator gets defanged without losing its name.
    expect(
      /^\s*raise ValueError/m.test(v!.source),
      "the rule no longer RAISES on a line of its own, so it forbids nothing",
    ).toBe(true);
    expect(
      v!.source.replace(/\s+/g, " "),
      "the rule is no longer the XOR: it must compare both is-None tests against each other",
    ).toContain("(self.bound is None) != (self.bound_defaulted is None)");
  });
});
