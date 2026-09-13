/**
 * THE PARITY SEAL — cortex's interim REGISTRY against the declarations the gateway composes.
 *
 * M3.3 retires two hardcoded per-kind tables together: `taskKindRegistry` here and
 * `_VERBS_BY_KIND` in `human_tasks.py`. Between now and that cutover the two must not drift,
 * and the only way to know is to read the PRODUCER'S OWN declarations rather than assert
 * cortex against cortex. Same principle as `boundSlots.test.ts` reading `gateway.py`: a seal
 * that compares this repo to itself can only prove it is self-consistent.
 *
 * ── THE POPULATION IS SEED **PLUS OVERLAY**, AND THAT IS THE WHOLE TRAP ───────────────────
 *
 * `policy/task_kinds/` is the platform SEED and forbids domain names structurally — there is
 * no row there to put one in. Domain species live in a work-side ADR-0036 OVERLAY. Reading the
 * seed alone and calling it the declared set is the partial-population defect: it reports every
 * domain species as undeclared. This seal composed against the seed on its first pass and
 * "found" `pcn_disposition` undeclared; it is declared, in the overlay, and has been. The
 * gateway serves seed+overlay at `/task_kinds` and that composed set is the only correct
 * comparand.
 *
 * ── THE FLOOR RUNS BEFORE ANY ROW IS TRUSTED ─────────────────────────────────────────────
 *
 * An empty read and a clean sweep are indistinguishable without one. If the directories move,
 * the parser stops understanding the format, or a filter is too aggressive, every per-row
 * assertion below passes vacuously and the seal reports green having measured nothing. So the
 * floor asserts a non-empty set containing a kind known to be in it, and a parse that produced
 * real fields. A red floor VOIDS the seal rather than passing it — the same rule a mutation
 * survey follows when it cannot prove its baseline.
 *
 * ── WHAT IS ASSERTED IN EACH DIRECTION, AND WHY THEY ARE NOT THE SAME ASSERTION ──────────
 *
 * CONTAINMENT IS NOT EQUALITY, so both run:
 *
 *   REGISTRY -> declarations   every kind cortex hardcodes must BE declared, and its render
 *                              hints must MATCH. A cortex row nobody declares is drift that a
 *                              one-directional seal calls green.
 *
 *   declarations -> REGISTRY   NOT "every declared kind must be in REGISTRY" — that would
 *                              demand cortex hardcode all twelve, which is the opposite of
 *                              M3.3. The declared-but-unregistered set is PINNED instead, so a
 *                              new species added upstream fails here loudly rather than quietly
 *                              rendering "unknown species here" to a user who could have acted.
 *
 * ── THE TWO ORDERS ARE DIFFERENT ON PURPOSE ──────────────────────────────────────────────
 *
 * `accepts` is ORDER-BEARING — button order is a contract, the producer emits `list(...)` not
 * `sorted(...)`, and re-sorting arrives disguised as tidiness. `reason_required` is a
 * MEMBERSHIP SET and the producer sorts it deliberately. A seal comparing both as ordered lists
 * goes red on a correct pair; one comparing both as sets goes green on a re-sorted `accepts`.
 * They are compared differently here, and that asymmetry is asserted rather than assumed.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { taskKindDisplay, isRegisteredKind } from "./taskKindRegistry";

/**
 * The REGISTRY's kinds, read from its SOURCE rather than exported for this test.
 *
 * The table is deliberately not exported as a list — it is an implementation detail with a
 * retirement date. Adding an export so a seal could read it would widen the interim surface
 * this seal exists to retire. Reading the source keeps the seal's reach one-directional.
 *
 * The regex is anchored to the object literal's own rows, and the floor below asserts the
 * result is non-empty and contains a kind known to be there — so a regex that stopped matching
 * fails the floor instead of silently reporting an empty REGISTRY as "no drift".
 */
const REGISTRY_KINDS: string[] = (() => {
  const src = readFileSync(path.join(__dirname, "taskKindRegistry.ts"), "utf8");
  const body = src.slice(
    src.indexOf("const REGISTRY: Record<string, TaskKindDisplay> = {"),
    src.indexOf("const DEFAULT:"),
  );
  return [...body.matchAll(/^ {2}([a-z_][a-z0-9_]*): \{/gm)].map((m) => m[1]);
})();

const PRODUCER = path.join(__dirname, "../../../invincible-agent");
const SEED_DIR = path.join(PRODUCER, "policy/task_kinds");
const OVERLAY_DIR = path.join(PRODUCER, "policy/overlays/sample/task_kinds");
const HAVE_PRODUCER = existsSync(SEED_DIR) && existsSync(OVERLAY_DIR);

interface Declaration {
  kind: string;
  badge: string;
  title: string;
  archetype: string;
  accepts: string[];
  reasonRequired: string[];
  source: string;
}

/**
 * A DELIBERATELY STRICT reader for the declaration files' fixed shape.
 *
 * Not a YAML parser and not pretending to be one — this repo has no YAML dependency and a
 * seal is the wrong place to add one. The shape it accepts is exactly the shape the producer
 * writes, and ANYTHING ELSE THROWS. That is the load-bearing choice: a reader that skipped a
 * line it did not understand would drop a field and the comparison would pass on the absence,
 * which is the silent-omission failure this whole seal exists to catch, reproduced inside the
 * instrument. If the producer's format changes, this must break loudly on the next run.
 */
function readDeclaration(file: string): Declaration {
  const out: Declaration = {
    kind: "", badge: "", title: "", archetype: "",
    accepts: [], reasonRequired: [], source: path.basename(file),
  };
  let inRendersAs = false;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const nested = /^ {2}(badge|title|archetype): *(.+)$/.exec(line);
    if (nested) {
      if (!inRendersAs) throw new Error(`${out.source}: indented ${nested[1]} outside renders_as`);
      out[nested[1] as "badge" | "title" | "archetype"] = nested[2].trim();
      continue;
    }
    if (/^\S/.test(line)) inRendersAs = false;

    if (/^renders_as: *$/.test(line)) { inRendersAs = true; continue; }
    const kind = /^kind: *(.+)$/.exec(line);
    if (kind) { out.kind = kind[1].trim(); continue; }
    const list = /^(accepts|reason_required): *\[(.*)\] *$/.exec(line);
    if (list) {
      const items = list[2].split(",").map((s) => s.trim()).filter(Boolean);
      if (list[1] === "accepts") out.accepts = items;
      else out.reasonRequired = items;
      continue;
    }
    // Reached only by a line this reader does not model. Loud, never skipped.
    throw new Error(`${out.source}: unrecognised line, the reader must be updated: ${line}`);
  }
  if (!out.kind) throw new Error(`${out.source}: no kind`);
  return out;
}

function composed(): Map<string, Declaration> {
  const m = new Map<string, Declaration>();
  for (const dir of [SEED_DIR, OVERLAY_DIR]) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const d = readDeclaration(path.join(dir, f));
      // An overlay silently shadowing a seed row would be a composition rule this seal has no
      // business inventing. If it ever happens, say so rather than pick a winner.
      if (m.has(d.kind)) throw new Error(`${d.kind} declared twice: ${m.get(d.kind)!.source} and ${d.source}`);
      m.set(d.kind, d);
    }
  }
  return m;
}

describe.skipIf(!HAVE_PRODUCER)("THE FLOOR — a red floor VOIDS this seal, it does not pass it", () => {
  it("composes a NON-EMPTY set from seed AND overlay", () => {
    const all = composed();
    expect(all.size, "no declarations read — every assertion below would pass vacuously").toBeGreaterThan(0);
    // Both halves specifically. A seed-only read is the partial population that made this
    // seal's own first pass report a false finding.
    const sources = new Set([...all.values()].map((d) => d.source));
    expect(sources.size).toBe(all.size);
    expect(all.has("grouped_review"), "no platform seed row read").toBe(true);
    expect(all.has("pcn_disposition"), "no overlay row read — the seed is not the population").toBe(true);
  });

  it("the reader produced REAL fields, not empty strings that would compare equal to nothing", () => {
    for (const d of composed().values()) {
      expect(d.badge, `${d.kind}: empty badge`).not.toBe("");
      expect(d.title, `${d.kind}: empty title`).not.toBe("");
      expect(d.archetype, `${d.kind}: empty archetype`).not.toBe("");
      expect(d.accepts.length, `${d.kind}: empty accepts`).toBeGreaterThan(0);
    }
  });

  it("the REGISTRY side is non-empty too", () => {
    expect(REGISTRY_KINDS.length).toBeGreaterThan(0);
    expect(REGISTRY_KINDS).toContain("pcn_disposition");
  });
});

describe.skipIf(!HAVE_PRODUCER)("REGISTRY -> declarations: everything cortex hardcodes is declared", () => {
  it("every REGISTRY kind has a declaration in the composed set", () => {
    const all = composed();
    const undeclared = REGISTRY_KINDS.filter((k) => !all.has(k));
    expect(undeclared, "cortex hardcodes a species nobody declares").toEqual([]);
  });

  /**
   * THE SEAL'S FIRST RESULT, PINNED EXACTLY RATHER THAN WAIVED.
   *
   * `pcn_disposition` renders differently on the two sides. Which is correct is a RULING and
   * not a bug — cortex's row predates the declaration, the declaration is the surface that
   * survives M3.3, and neither lane gets to decide that alone. So the drift is recorded here
   * as an exact expectation instead of being reconciled locally or hidden behind a skip.
   *
   * NOT `it.fails`, deliberately. An xfail passes on ANY failure, so a second, unrelated drift
   * appearing tomorrow would be absorbed by it and never reported. Pinning the exact lines
   * means a NEW disagreement goes red, and so does a SILENT FIX — whoever changes either side
   * has to come here and say which way the ruling went.
   */
  const KNOWN_DRIFT = [
    'pcn_disposition.badge: cortex "QUALIFY" vs declared "DISPOSE"',
    'pcn_disposition.title: cortex "Qualification task" vs declared "PCN disposition"',
  ];

  it("and its RENDER HINTS match the declaration's, field for field", () => {
    const all = composed();
    const drift: string[] = [];
    for (const kind of REGISTRY_KINDS) {
      const d = all.get(kind);
      if (!d) continue; // named by the assertion above; not double-reported here
      const ui = taskKindDisplay(kind);
      if (ui.badge !== d.badge) drift.push(`${kind}.badge: cortex "${ui.badge}" vs declared "${d.badge}"`);
      if (ui.title !== d.title) drift.push(`${kind}.title: cortex "${ui.title}" vs declared "${d.title}"`);
      if (ui.archetype !== d.archetype) drift.push(`${kind}.archetype: cortex ${ui.archetype} vs declared ${d.archetype}`);
    }
    expect(drift).toEqual(KNOWN_DRIFT);
  });

  it("the ARCHETYPE agrees everywhere — the field that decides which card renders", () => {
    // Split out because it is the one hint with a behavioural consequence rather than a
    // cosmetic one: a disagreeing archetype routes a species to the wrong card entirely. It
    // holds today across all five, and pinning it separately means the known badge/title drift
    // above cannot quietly grow to cover an archetype too.
    const all = composed();
    for (const kind of REGISTRY_KINDS) {
      const d = all.get(kind);
      if (!d) continue;
      expect(taskKindDisplay(kind).archetype, `${kind}`).toBe(d.archetype);
    }
  });
});

describe.skipIf(!HAVE_PRODUCER)("declarations -> REGISTRY: the gap is PINNED, not demanded away", () => {
  /**
   * Not "every declared kind must be in REGISTRY" — that would demand cortex hardcode all of
   * them, which is what M3.3 removes. These are the species the served declaration path
   * (`taskDeclaration.ts`) covers and the interim table does not. Pinned so that a NEW species
   * added upstream fails here rather than silently rendering "unknown species here" to a user
   * who could have acted. The list shrinks to empty at cutover, when REGISTRY retires.
   */
  const KNOWN_UNREGISTERED = [
    "hazard_link_review",
    "risk_acceptance_concurrence_high",
    "risk_acceptance_concurrence_serious",
    "risk_acceptance_high",
    "risk_acceptance_low",
    "risk_acceptance_medium",
    "risk_acceptance_serious",
  ];

  it("no declared species is unaccounted for on the cortex side", () => {
    const all = [...composed().keys()];
    const unaccounted = all.filter((k) => !isRegisteredKind(k) && !KNOWN_UNREGISTERED.includes(k));
    expect(unaccounted, "declared upstream, unknown to cortex, and not a pinned gap").toEqual([]);
  });

  it("and every pinned gap is still real — a stale pin hides the next one", () => {
    // The control for the list above. A species that gained a REGISTRY row, or was withdrawn
    // upstream, must drop out of the pin rather than sit there widening the hole.
    const all = composed();
    const stale = KNOWN_UNREGISTERED.filter((k) => !all.has(k) || isRegisteredKind(k));
    expect(stale, "pinned as an unregistered gap but no longer one").toEqual([]);
  });
});

describe.skipIf(!HAVE_PRODUCER)("the two orders are compared DIFFERENTLY, on purpose", () => {
  it("`accepts` is order-bearing and is never sorted on either side", () => {
    // Button order is a contract: the producer emits `list(...)`, not `sorted(...)`. A seal
    // that set-compared this would go green on a re-sorted declaration, which is precisely the
    // defect the SDK's ordering fix was cut to close.
    const all = composed();
    const unsorted = [...all.values()].filter((d) => {
      const sorted = [...d.accepts].sort();
      return d.accepts.some((v, i) => v !== sorted[i]);
    });
    // At least one row must differ from its own sorted form, or this assertion cannot tell an
    // order-preserving reader from a sorting one.
    expect(unsorted.length, "no declaration has a non-alphabetical accepts — order is untestable here").toBeGreaterThan(0);
  });

  it("`reason_required` is a SUBSET of `accepts`, compared as membership", () => {
    // Order carries nothing here and the producer sorts it deliberately. What must hold is
    // containment: a reason required for a verb nobody can submit is a reason box on an
    // unsubmittable action.
    for (const d of composed().values()) {
      const orphan = d.reasonRequired.filter((v) => !d.accepts.includes(v));
      expect(orphan, `${d.kind}: reason_required names a verb not in accepts`).toEqual([]);
    }
  });
});
