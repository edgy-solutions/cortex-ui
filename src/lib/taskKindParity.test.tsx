/**
 * THE PARITY SEAL — cortex's UI against the declarations the gateway composes.
 *
 * ── ⚠ RUN THIS FILE WITH `npm run test`, NEVER WITH BARE `npx vitest run` ────────────────
 *
 *   npm run test -- src/lib/taskKindParity.test.tsx   ->  PASSES, 21/21
 *   npx vitest run src/lib/taskKindParity.test.tsx    ->  FAILS TO COLLECT, 0 tests run
 *       "Cannot read properties of undefined (reading 'config')"
 *
 * THE SECOND IS A FALSE RED AND THE CODE IS FINE. Under vitest 4 the bare invocation loads
 * none of this project's config, so `describe.skipIf` below evaluates against an undefined
 * config and the FILE never collects — which surfaces as a failure of the seal rather than as
 * a failure to run it. Nothing here is broken when you see it.
 *
 * It is written at the top of the seal because this is where the next reader meets it: someone
 * narrowing to one file reaches for `npx` first. A false red is expensive out of proportion to
 * its cause — it is what teaches a person to retry a TRUE red away, and this seal exists to be
 * believed when it goes red. Recorded a second time in `.github/workflows/build.yml` beside
 * the PRODUCER_REF pin, for the reader who arrives from the bump procedure instead.
 *
 * Cortex's per-kind badge/title table is retired; `_VERBS_BY_KIND` in `human_tasks.py` is the
 * producer's half. The only way to know the UI and the producer agree is to read the PRODUCER'S OWN declarations rather than assert
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
 * ── WHAT IS ASSERTED, NOW THAT THE TABLE IS RETIRED ─────────────────────────────────────
 *
 * Cortex's interim badge/title table is RETIRED (architect, relayed 2026-10-30): display hints
 * are the served declaration's, so there is no REGISTRY side to compare and no
 * declarations -> REGISTRY gap to pin. What is asserted instead:
 *
 *   ARCHETYPE     every composed declaration's archetype survives the resolver the canvas uses.
 *   DISPLAY       every declared kind's badge/title reach the UI through the store, and the
 *                 DOM shows the producer's title (the `pcn_disposition` drift is closed).
 *   VERBS         declared verbs reach the card through the store, with no cortex code.
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
import { taskKindDisplay } from "./taskKindRegistry";
import { WorkflowLens } from "@/components/AgenticCanvas/WorkflowLens";
import { taskArchetype } from "./taskArtifact";

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

/**
 * WHICH PRODUCER STATE THIS SEAL WAS MEASURED AGAINST.
 *
 * A two-repo seal has a BASELINE, and an unnamed baseline makes every red unattributable: a
 * drift between cortex and the producer says nothing about WHICH SIDE MOVED unless the reader
 * knows where the other side was standing. CI pins the producer to a sha and passes it here, so
 * a failure reads "producer at <sha>" rather than leaving the reader to guess at a moving
 * master.
 *
 * Locally there is no pin — the checkout is whatever the developer has — and that is said
 * plainly rather than dressed as a version. ⛔ An unpinned baseline is not a defect locally and
 * IS one in CI, which is why the string differs instead of defaulting to something tidy.
 */
const PRODUCER_REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const PRODUCER_AT = PRODUCER_REF
  ? `producer at ${PRODUCER_REF.slice(0, 7)}`
  : "producer at the local checkout (UNPINNED — this is CI-pinned only)";

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
});

describe.skipIf(!HAVE_PRODUCER)("the ARCHETYPE agrees everywhere — the field that decides which card renders", () => {
  it("every composed declaration's archetype survives the resolver the canvas uses", () => {
    // The one hint with a behavioural consequence rather than a cosmetic one: a disagreeing
    // archetype routes a species to the wrong card entirely.
    const all = composed();
    expect(all.size, "no declarations read — this arm would assert nothing").toBeGreaterThan(0);
    for (const [kind, d] of all) {
      // SERVED: the declared archetype, run through the resolver the canvas uses, must come out unchanged.
      // A producer archetype cortex has no card for resolves to the generic fallback and reds here.
      const served = { [kind]: { kind, declared: true, archetype: d.archetype, badge: d.badge, title: d.title, accepts: [], reasonRequired: new Set<string>() } };
      expect(taskArchetype({ kind, declaration: undefined }, served), `${kind}`).toBe(d.archetype);
    }
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
    // Unknown species is claimed only off a LOADED menu lacking the kind (architect 2026-10-30).
    useTaskKindStore.setState({ status: "loaded", byKind: {} });
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
    // Unknown species is claimed only off a LOADED menu lacking the kind (architect 2026-10-30).
    useTaskKindStore.setState({ status: "loaded", byKind: {} });
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
 * The old arms asserted cortex's interim REGISTRY against the declarations. That table is now
 * RETIRED, so those arms are gone with it.
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

  it("a species with no cortex code still renders its verbs through the store", () => {
    // `safety_redraft` is declared upstream and cortex holds no code for it. Before `e837239` this
    // rendered "unknown species here"; the whole point of the served menu is that it no longer
    // does. This is the assertion that would have caught the dead wire directly.
    const safety = composed().get("safety_redraft");
    expect(safety, "safety_redraft is gone upstream — repoint this to another unregistered species").toBeTruthy();

    seedStore([safety!]);
    render(<ApprovalTaskCard task={payload("safety_redraft") as never} />);
    expect(renderedVerbs()).toEqual(safety!.accepts);
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("an UNREACHABLE menu refuses without verbs — it does not claim the species is undeclared", () => {
    // `unreachable` is not `empty`. A failed fetch must not render "nothing has declared this
    // species", which is a claim about the deployment made from a broken request.
    useTaskKindStore.setState({ status: "unreachable", byKind: {} });
    render(<ApprovalTaskCard task={payload("safety_redraft") as never} />);
    expect(renderedVerbs()).toEqual([]);
    // 2026-10-30: fails closed ("no declaration served") but makes NO claim about the species.
    expect(document.querySelector("[data-no-declaration]")).not.toBeNull();
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
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
        `SKIPPED ENTIRELY and verified nothing. A seal that skips is not a seal that passed. ` +
        `In CI the producer is checked out beside cortex-ui at a pinned sha (see ` +
        `.github/workflows/build.yml); locally, clone it as a sibling of this repo.`,
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

describe.skipIf(!HAVE_PRODUCER)("display hints are the SERVED ones: every declared kind's badge/title reach the UI", () => {
  afterEach(() => {
    cleanup();
    useTaskKindStore.setState({ status: "idle", byKind: {} });
  });

  /** Built from the composed declarations exactly as the STORE describe does. */
  function composedByKind(): Record<string, TaskDeclaration> {
    const byKind: Record<string, TaskDeclaration> = {};
    for (const d of composed().values()) {
      const read = readTaskDeclaration({
        kind: d.kind, declared: true, archetype: d.archetype,
        badge: d.badge, title: d.title,
        accepts: d.accepts, reason_required: d.reasonRequired,
      });
      expect(read, `${d.kind}: the declaration reader refused a real declaration`).not.toBeNull();
      byKind[d.kind] = read!;
    }
    return byKind;
  }

  it("taskKindDisplay returns the declared badge/title for EVERY declared kind", () => {
    const byKind = composedByKind();
    expect(Object.keys(byKind).length, "no declarations — this arm would assert nothing").toBeGreaterThan(0);
    const drift: string[] = [];
    for (const d of composed().values()) {
      const ui = taskKindDisplay(d.kind, byKind);
      if (ui.badge !== d.badge) drift.push(`${d.kind}.badge: ui "${ui.badge}" vs declared "${d.badge}"`);
      if (ui.title !== d.title) drift.push(`${d.kind}.title: ui "${ui.title}" vs declared "${d.title}"`);
    }
    expect(drift, `served display hints did not reach the UI — ${PRODUCER_AT}`).toEqual([]);
  });

  it("pcn_disposition shows the PRODUCER's title in the DOM (the drift the old table pinned, closed)", () => {
    const d = composed().get("pcn_disposition");
    expect(d, "pcn_disposition is gone upstream — repoint this to another declared kind").toBeTruthy();
    useTaskKindStore.setState({ status: "loaded", byKind: composedByKind() });
    const { container } = render(
      <WorkflowLens
        taskRef={{ taskId: "t1", workflowId: null, kind: "pcn_disposition", task_state: "pending", audience: "", requestedBy: "", subjectRef: null } as never}
      />,
    );
    expect(container.textContent).toContain(d!.title);
    expect(container.textContent).not.toContain("Qualification task");
  });
});
