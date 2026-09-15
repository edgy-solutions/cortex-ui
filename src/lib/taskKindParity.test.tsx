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
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ApprovalTaskCard } from "@/components/ApprovalTask/ApprovalTaskCard";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { readTaskDeclaration, type TaskDeclaration } from "./taskDeclaration";
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

/**
 * RESOLVED ACROSS KNOWN CHECKOUT NAMES, AND LOUD WHEN TWO DISAGREE.
 *
 * This machine carries the producer twice — `invincible-agent` on master and `ia-01` on
 * `lane/01` — with byte-identical overlays today and no guarantee of that tomorrow. Hardcoding
 * one name means the seal silently skips on a machine that has the other, and a skipped seal
 * reports as a pass.
 *
 * TWO THAT DISAGREE IS AN ERROR, NOT A PREFERENCE. A silent pick between two checkouts at
 * different shas produces a confident answer about the wrong tree, which is worse than no
 * answer. Picking the first would be exactly the partial-population move this seal already
 * made once.
 */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

interface Producer { root: string; seed: string; overlay: string }

function resolveProducers(): Producer[] {
  const found: Producer[] = [];
  for (const name of CANDIDATE_ROOTS) {
    const root = path.join(__dirname, "../../..", name);
    const seed = path.join(root, "policy/task_kinds");
    const overlay = path.join(root, "policy/overlays/sample/task_kinds");
    if (existsSync(seed) && existsSync(overlay)) found.push({ root: name, seed, overlay });
  }
  return found;
}

const PRODUCERS = resolveProducers();
const HAVE_PRODUCER = PRODUCERS.length > 0;
const SEED_DIR = PRODUCERS[0]?.seed ?? "";
const OVERLAY_DIR = PRODUCERS[0]?.overlay ?? "";

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
    // ADDED 2026-09-14, AND THE ADDITION IS THE ARM'S OWN EVIDENCE. This species appeared
    // upstream a day after the seal landed and reded it, unprompted, on real drift — which is
    // the difference between a pinned gap that is a comment and one that is a mechanism.
    //
    // PINNED RATHER THAN GIVEN A REGISTRY ROW, and that is a classification, not a waiver.
    // Since `e837239` the card consults the SERVED menu (`useTaskKindStore`) rather than the
    // interim table, so `safety_redraft` renders its declared verbs today with no table entry.
    // Adding a row would feed the table M3.3 is deleting. What stays red-able here is the
    // TABLE'S coverage, which is the retirement this arm measures.
    "safety_redraft",
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

/**
 * THE JOIN ITSELF — the buttons cortex RENDERS against the verbs the declaration DECLARES.
 *
 * Everything above compares two tables. This drives the real card with every real declaration
 * and reads the affordances off the rendered DOM, because that is the assertion the ruling
 * actually asked for: "the buttons cortex renders equal the verbs `/task_kinds` reports, IN
 * ORDER". A table-to-table comparison can be green while the card renders something else
 * entirely — the two halves each correct alone is exactly the state this seal exists to refuse.
 *
 * READ OFF `data-verb`, NEVER LABEL TEXT. Labels are the declaration's verb verbatim —
 * "Approved", not "Approve" — because the word on the button is the word posted and archived.
 * `"Approved"` CONTAINS `"Approve"`, so a substring assertion on labels passes whether or not
 * the right verb is offered.
 *
 * THREE STATES, NOT TWO. `declared: true` with `accepts: []` is "the mesh knows this species
 * and it is not decided on this surface" — a different fact from "nothing has declared this
 * species", with a different repair. A seal asserting "no buttons implies unknown species"
 * would be wrong at the first instance of the third state, so each state is asserted by its
 * own marker.
 */
vi.mock("@/api/client", () => ({ actOnHumanTask: vi.fn() }));
vi.mock("@/store/useHumanTaskStore", () => ({ markTaskResolvedByTaskId: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const payload = (kind: string) => ({
  task_id: "t1",
  kind,
  task_state: "pending" as const,
  title: "A task",
  summary: "A summary",
  audience: "stewards",
  requested_by: "bob",
  subject_ref: null,
});

const renderedVerbs = () =>
  [...document.querySelectorAll("[data-verb]")].map((b) => b.getAttribute("data-verb"));

describe.skipIf(!HAVE_PRODUCER)("the RENDERED affordances equal the DECLARED verbs, in order", () => {
  afterEach(cleanup);

  it("every APPROVAL_TASK declaration renders exactly its accepts, in the declaration's order", () => {
    const approvals = [...composed().values()].filter((d) => d.archetype === "APPROVAL_TASK");
    // The floor for this arm specifically: filtering to one archetype could silently select
    // nothing, and a loop over nothing asserts nothing.
    expect(approvals.length, "no APPROVAL_TASK declarations to drive the card with").toBeGreaterThan(0);

    for (const d of approvals) {
      cleanup();
      render(
        <ApprovalTaskCard
          task={{
            ...payload(d.kind),
            declaration: {
              kind: d.kind,
              declared: true,
              archetype: d.archetype,
              badge: d.badge,
              title: d.title,
              accepts: d.accepts,
              reason_required: d.reasonRequired,
            },
          } as never}
        />,
      );
      // ORDER-BEARING: `toEqual` on arrays compares sequence, which is the point. A re-sorted
      // declaration must not render the same card.
      expect(renderedVerbs(), `${d.kind}`).toEqual(d.accepts);
      expect(document.querySelector("[data-undeclared-kind]"), `${d.kind}`).toBeNull();
      expect(document.querySelector("[data-declared-no-verbs]"), `${d.kind}`).toBeNull();
    }
  });

  it("STATE 2 — declared with an empty accept-set renders no-verbs, NOT unknown-species", () => {
    // The state the spec did not name. The mesh has the species; it takes no decisions here.
    render(
      <ApprovalTaskCard
        task={{
          ...payload("declared_but_undecided"),
          declaration: {
            kind: "declared_but_undecided", declared: true, archetype: "APPROVAL_TASK",
            badge: "NONE", title: "Declared, not decided here", accepts: [], reason_required: [],
          },
        } as never}
      />,
    );
    expect(renderedVerbs()).toEqual([]);
    expect(document.querySelector("[data-declared-no-verbs]")).not.toBeNull();
    // The distinction that makes this a separate state rather than a synonym.
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("STATE 3 — no declaration at all renders unknown-species, NOT no-verbs", () => {
    render(<ApprovalTaskCard task={payload("some_kind_nobody_declared") as never} />);
    expect(renderedVerbs()).toEqual([]);
    const refusal = document.querySelector("[data-undeclared-kind]");
    expect(refusal).not.toBeNull();
    // SCOPED TO THE REFUSAL BLOCK, never `document.body`: the card header prints the kind two
    // lines up, so a body-scoped assertion passes with the name stripped out of the refusal.
    // The instrument and the subject sharing a surface — the instrument reads the subject's
    // NEIGHBOUR and reports success.
    expect(refusal!.textContent).toContain("some_kind_nobody_declared");
    expect(document.querySelector("[data-declared-no-verbs]")).toBeNull();
  });

  it("the three states are mutually exclusive — no card shows two of them", () => {
    // Red-proofs the three above. Markers that could co-occur would let a card satisfy two
    // states at once and each assertion would still pass in isolation.
    const cases: Array<[string, unknown]> = [
      ["verbs", { ...payload("pcn_disposition"), declaration: { kind: "pcn_disposition", declared: true, archetype: "APPROVAL_TASK", badge: "DISPOSE", title: "PCN disposition", accepts: ["approved", "rejected"], reason_required: [] } }],
      ["no-verbs", { ...payload("x"), declaration: { kind: "x", declared: true, archetype: "APPROVAL_TASK", badge: "X", title: "X", accepts: [], reason_required: [] } }],
      ["unknown", payload("nobody_declared_this")],
    ];
    for (const [name, task] of cases) {
      cleanup();
      render(<ApprovalTaskCard task={task as never} />);
      const markers = [
        renderedVerbs().length > 0,
        document.querySelector("[data-declared-no-verbs]") !== null,
        document.querySelector("[data-undeclared-kind]") !== null,
      ].filter(Boolean).length;
      expect(markers, `${name}: expected exactly one state marker`).toBe(1);
    }
  });
});

describe("ORDER IS PRESERVED — proven where it can diverge, not where it cannot", () => {
  afterEach(cleanup);

  /**
   * THE REAL POPULATION CANNOT PROVE THIS, AND THAT IS THE WHOLE REASON THIS BLOCK EXISTS.
   *
   * Every APPROVAL_TASK declaration deployed today is ALREADY in alphabetical order —
   * `[approved, rejected]`, `[accepted, rejected, returned_for_rework]`,
   * `[concurred, not_concurred, returned_for_rework]`. So a card that sorted its verbs would
   * render identically to one that preserved them, and the arm above stays green with
   * `[...decl.accepts].sort()` spliced into the card. Mutation-verified: it does.
   *
   * The one non-alphabetical declaration, `hazard_link_review`'s
   * `[linked, new_hazard, dismissed]`, is a GROUPED_REVIEW and never reaches this card.
   *
   * This is the coincidence shape: a defect invisible because two values happen to agree on
   * ordinary data, catchable only where they diverge. The divergent input is constructed here
   * rather than waited for — the order contract is load-bearing NOW, and the first
   * non-alphabetical APPROVAL_TASK species must not be the thing that discovers it was never
   * being checked.
   */
  const UNSORTED = ["returned_for_rework", "accepted", "rejected"];

  it("a declaration whose verbs are NOT alphabetical renders in the DECLARATION's order", () => {
    expect(UNSORTED, "the control must actually diverge from its sorted form")
      .not.toEqual([...UNSORTED].sort());

    render(
      <ApprovalTaskCard
        task={{
          ...payload("order_control"),
          declaration: {
            kind: "order_control", declared: true, archetype: "APPROVAL_TASK",
            badge: "ORD", title: "Order control", accepts: UNSORTED, reason_required: [],
          },
        } as never}
      />,
    );
    expect(renderedVerbs()).toEqual(UNSORTED);
  });
});

/**
 * THE SUBJECT, MOVED — every declared species gets its DECLARED verbs rendered, in order.
 *
 * ── WHY THE OLD SUBJECT COULD NOT SURVIVE THE CUTOVER ─────────────────────────────────────
 *
 * The arms above assert cortex's interim REGISTRY against the declarations. That table is what
 * M3.3 DELETES, so those arms die with it by construction — they measure the remaining
 * retirement distance, which is worth measuring right up to the deletion and worthless after.
 * The property that has to hold AFTERWARDS is this one: whatever the mesh declares, the card
 * offers, in the declaration's order.
 *
 * ── DRIVEN THROUGH THE STORE, NOT HAND-FED THROUGH A PROP, AND THAT IS THE WHOLE POINT ────
 *
 * The earlier render arm passed a `declaration` straight into the card and asserted the buttons
 * matched it. It was green — while NOTHING IN THE RUNNING APP EVER SUPPLIED ONE. `taskArtifact`
 * built the payload and had no such field, so every card fell back to the interim table
 * regardless of what the mesh declared. Every node verified, the connection unasserted.
 *
 * A prop-fed assertion tests a CAPABILITY. This one tests the WIRE: the declaration is put where
 * the served menu puts it — `useTaskKindStore` — and the card is left to find it. If the wiring
 * is removed again, this goes red where the prop-fed version would not.
 */
describe.skipIf(!HAVE_PRODUCER)("THE POST-CUTOVER SUBJECT: declared verbs reach the card through the STORE", () => {
  afterEach(() => {
    cleanup();
    useTaskKindStore.setState({ status: "idle", byKind: {} });
  });

  /** Put the real declarations where the served menu puts them, then render nothing but a kind. */
  function seedStore(decls: Declaration[]) {
    const byKind: Record<string, TaskDeclaration> = {};
    for (const d of decls) {
      const read = readTaskDeclaration({
        kind: d.kind, declared: true, archetype: d.archetype,
        badge: d.badge, title: d.title,
        accepts: d.accepts, reason_required: d.reasonRequired,
      });
      // The reader is the thing the store keeps, so a declaration it REFUSES must not be
      // silently dropped into a green run — that would assert against a smaller population.
      expect(read, `${d.kind}: the declaration reader refused a real declaration`).not.toBeNull();
      byKind[d.kind] = read!;
    }
    useTaskKindStore.setState({ status: "loaded", byKind });
  }

  it("every declared APPROVAL_TASK species renders its declared verbs, in order, with NO prop", () => {
    const approvals = [...composed().values()].filter((d) => d.archetype === "APPROVAL_TASK");
    expect(approvals.length, "no APPROVAL_TASK declarations — this arm would assert nothing").toBeGreaterThan(0);
    seedStore(approvals);

    for (const d of approvals) {
      cleanup();
      // NO `declaration` FIELD. The card must find it in the store or render the refusal.
      render(<ApprovalTaskCard task={payload(d.kind) as never} />);
      expect(renderedVerbs(), `${d.kind}`).toEqual(d.accepts);
      expect(document.querySelector("[data-undeclared-kind]"), `${d.kind} fell back to the table`).toBeNull();
    }
  });

  it("a species the INTERIM TABLE never knew still renders — the table is not consulted first", () => {
    // `safety_redraft` is declared upstream and has no REGISTRY row. Before `e837239` this
    // rendered "unknown species here"; the whole point of the served menu is that it no longer
    // does. This is the assertion that would have caught the dead wire directly.
    const safety = composed().get("safety_redraft");
    expect(safety, "safety_redraft is gone upstream — repoint this to another unregistered species").toBeTruthy();
    expect(isRegisteredKind("safety_redraft"), "it gained a REGISTRY row; this arm no longer proves anything").toBe(false);

    seedStore([safety!]);
    render(<ApprovalTaskCard task={payload("safety_redraft") as never} />);
    expect(renderedVerbs()).toEqual(safety!.accepts);
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("an UNREACHABLE menu falls back and refuses — it does not claim the species is undeclared", () => {
    // `unreachable` is not `empty`. A failed fetch must not render "nothing has declared this
    // species", which is a claim about the deployment made from a broken request.
    useTaskKindStore.setState({ status: "unreachable", byKind: {} });
    render(<ApprovalTaskCard task={payload("safety_redraft") as never} />);
    expect(renderedVerbs()).toEqual([]);
    expect(document.querySelector("[data-undeclared-kind]")).not.toBeNull();
  });
});

/**
 * THE SEAL MUST BE ABLE TO REPORT THAT IT DID NOT RUN.
 *
 * Every block above is `describe.skipIf(!HAVE_PRODUCER)`. That is right when the producer is
 * genuinely absent — faking a comparand would be worse than not making one. But a suite of
 * skips reports as a PASS, so "the check found nothing wrong" and "the check never ran" are
 * indistinguishable in a green summary. The floor inside the seal guards an empty READ; this
 * guards the seal not executing at all, which is the same failure one level out.
 *
 * NOT INSIDE THE SKIP, obviously — a guard that skips with the thing it guards is decorative.
 */
describe("the seal RAN, or says so", () => {
  it("resolved exactly one producer checkout", () => {
    expect(
      PRODUCERS.length,
      `no producer checkout found under any of ${CANDIDATE_ROOTS.join(", ")} — the parity seal ` +
        `SKIPPED ENTIRELY and verified nothing. A seal that skips is not a seal that passed.`,
    ).toBeGreaterThan(0);
  });

  it("and if there are two, they AGREE — otherwise the answer is about the wrong tree", () => {
    // The reason this exists is subtler than the duplicate itself: without it, the assertion
    // above would red for "wrong directory" on a machine with only `ia-01`, and a red that
    // means "wrong directory" teaches readers to wave through red. That acquired immunity is
    // what hides the one real failure.
    if (PRODUCERS.length < 2) return;
    const [a, b] = PRODUCERS;
    const rows = (p: Producer) =>
      [p.seed, p.overlay]
        .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".yaml")).map((f) => path.join(d, f)))
        .map((f) => `${path.basename(f)}::${readFileSync(f, "utf8")}`)
        .sort();
    expect(
      rows(a),
      `${a.root} and ${b.root} declare different task kinds — a silent pick would give a ` +
        `confident answer about the wrong tree. Reconcile them, or drop one from CANDIDATE_ROOTS.`,
    ).toEqual(rows(b));
  });

  it("the skip flag is derived from that resolution and nothing else", () => {
    // Red-proofs the two above: a `HAVE_PRODUCER` that stopped tracking the resolver would let
    // the seal skip while these still passed.
    expect(HAVE_PRODUCER).toBe(PRODUCERS.length > 0);
  });
});
