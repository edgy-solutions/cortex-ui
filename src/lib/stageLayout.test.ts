/**
 * CHARACTERIZATION of the camera-stage LAYOUT ENGINE.
 *
 * The load-bearing property is not arithmetic. It is AGREEMENT: the map is grouped by the
 * SAME helpers the sidebar list groups by, so switching the list tab re-lays-out the canvas
 * into the same buckets in the same order, and clicking a list header zooms to a group that
 * actually exists. A test that pinned coordinates (`x === 90`) would stay green while the
 * two surfaces silently disagreed — which is the defect that matters, because a disagreeing
 * map is not obviously broken, it is quietly wrong, and it is the surface an executive reads.
 *
 * So the assertions here are stated against the helpers themselves — `answerArchetype`,
 * `answerTopic`, `connectedComponents`, the day key — never against literals. A layout that
 * bands by `status`, or by an archetype it derives its own way, fails them; a layout whose
 * spacing constants were retuned does not, and should not.
 *
 * Three structural invariants are swept across ALL FOUR modes, because a mode is easy to add
 * and easy to leave half-finished: every artifact gets exactly one position, every card sits
 * inside its own group's bbox and no other's, and the reported world contains everything
 * drawn in it. Each sweep carries a POSITIVE CONTROL — a derivation that returns nothing
 * passes vacuously and reads as coverage while being none.
 *
 * The day key is the one grouping the list does NOT share by import: `dayOf` in
 * AnswersPanel.tsx and `dayKey` here are the same expression written twice. That duplication
 * is pinned at the source level, since a divergence there produces group ids the list's zoom
 * can never resolve, with nothing throwing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Artifact, RouteDecision } from "@/api/types";
import { STAGE_CARD } from "@/lib/stageConstants";
import { computeStageEdges, connectedComponents, type StageEdge } from "@/lib/stageEdges";
import { answerArchetype, answerTopic, archetypeLabel } from "./answerDisplay";
import { computeStageLayout, type StageLayoutResult, type StageMode } from "./stageLayout";

const W = STAGE_CARD.w;
const H = STAGE_CARD.h;
const MODES: StageMode[] = ["TIME", "TYPE", "TOPIC", "GRAPH"];

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCED_FOR: Artifact["produced_for"] = {
  user_id: "alice",
  is_authenticated: true,
  entitlement_source: "none",
};

/** Local-time construction on purpose: the day key is computed from LOCAL calendar fields,
 *  so a UTC-epoch fixture would bucket differently depending on the runner's timezone. */
const at = (day: number, hour: number) => new Date(2026, 6, day, hour, 0, 0, 0).getTime();

const route = (
  classLabel: string,
  instance?: { label: string; id: string },
  fallback = false,
): RouteDecision => ({
  about: {
    label: classLabel,
    uri: `urn:x:${classLabel}`,
    confidence: 0.9,
    ...(instance
      ? { instance_resolved: true, instance_identifier: instance.id, instance_label: instance.label }
      : {}),
  },
  action: {
    label: "Look up ownership",
    iri: "mesh:lookupOwnership",
    confidence: 0.9,
    classify_called: true,
    candidate_count: 1,
  },
  handled_by: { engine_name: "Engine A", provider: "engine_a_lookup_ownership" },
  ...(fallback ? { fallback: true } : {}),
});

const answer = (
  id: string,
  created_at: number,
  archetype: string | null,
  routing: RouteDecision | null,
): Artifact => ({
  id,
  created_at,
  updated_at: created_at,
  valid_as_of: created_at,
  valid_until: null,
  question_text: `question for ${id}`,
  summary: `summary for ${id}`,
  resolved_intent: {},
  message_id: `msg-${id}`,
  status: "complete",
  rendered_output: archetype ? { components: [], archetype } : null,
  produced_by: { actor_type: "agent", actor_id: "engine_a_lookup_ownership" },
  produced_for: PRODUCED_FOR,
  routing,
  sources: [],
  graph_trace: [],
  graph_trace_alternates: [],
  derived_from_artifact_id: null,
  durability_status: "durable",
  watermark: 1,
});

const C360 = { label: "Customer 360", id: "urn:x:dash:c360" };
const DS1 = { label: "Orders Gold", id: "urn:x:dataset:orders_gold" };

/**
 * Seven answers spanning four days, four archetypes, four topics and four connected
 * components — so no mode's grouping is degenerate and no two modes partition the corpus the
 * same way. Declared NEWEST FIRST purely for readability; the layout sorts for itself, and a
 * shuffled-input test below proves it does not depend on this order.
 */
const CORPUS: Artifact[] = [
  answer("a1", at(20, 12), "KNOWLEDGE_DOCUMENT", route("Dashboard", C360)),
  answer("a2", at(20, 9), "TABLE", route("Dataset", DS1)),
  answer("a3", at(19, 15), "BAR_CHART", route("Dashboard", C360)),
  answer("a4", at(19, 8), "KNOWLEDGE_DOCUMENT", route("Runbook")),
  answer("a5", at(18, 11), null, route("Dashboard", undefined, true)),
  answer("a6", at(18, 10), "ASSET_STATE_METRIC", route("Dataset", DS1)),
  answer("a7", at(17, 9), "CHART_WIDGET", route("Dashboard", C360)),
];
const CORPUS_EDGES: StageEdge[] = computeStageEdges(CORPUS);

// ── Geometry helpers (property-shaped, never coordinate-shaped) ────────────────

const EPS = 0.001; // ring positions go through cos/sin; exact containment is float-exact ± this
type Rect = { x: number; y: number; w: number; h: number };
const cardOf = (r: StageLayoutResult, id: string): Rect => ({ ...r.positions[id], w: W, h: H });
const contains = (box: Rect, r: Rect) =>
  r.x >= box.x - EPS &&
  r.y >= box.y - EPS &&
  r.x + r.w <= box.x + box.w + EPS &&
  r.y + r.h <= box.y + box.h + EPS;
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - EPS &&
  b.x < a.x + a.w - EPS &&
  a.y < b.y + b.h - EPS &&
  b.y < a.y + a.h - EPS;

/** The group an artifact's card actually landed in, found geometrically rather than by id —
 *  so the assertion is "the card is where the group says", not "the code agrees with itself". */
const groupHolding = (r: StageLayoutResult, id: string) =>
  r.groups.filter((g) => contains(g.bbox, cardOf(r, id)));

/** The list's day key, written out as AnswersPanel's `dayOf` writes it. Restated rather than
 *  imported because AnswersPanel does not export it — which is exactly the drift risk the
 *  source-level guard below covers. */
const listDayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const newestOf = (items: Artifact[]) => Math.max(...items.map((a) => a.created_at));

/** Bucket the corpus by a key fn, ordered newest-bucket-first — the order the list produces
 *  by grouping a recency-sorted array in first-appearance order. */
const bucketsNewestFirst = (items: Artifact[], keyFn: (a: Artifact) => string) => {
  const m = new Map<string, Artifact[]>();
  for (const a of items) {
    if (!m.has(keyFn(a))) m.set(keyFn(a), []);
    m.get(keyFn(a))!.push(a);
  }
  return [...m.entries()].sort((x, y) => newestOf(y[1]) - newestOf(x[1]));
};

// ── The population under sweep ────────────────────────────────────────────────

describe("computeStageLayout — the sweep's population", () => {
  it("every mode lays out the whole corpus non-trivially — positive control", () => {
    // Asserted first and alone. Every sweep below iterates MODES and reads `groups`,
    // `labels` and `positions`; a mode that silently returned an empty layout would satisfy
    // all of them by having nothing to violate.
    expect(MODES).toHaveLength(4);
    expect(CORPUS.length).toBeGreaterThanOrEqual(7);

    for (const mode of MODES) {
      const r = computeStageLayout(CORPUS, mode, CORPUS_EDGES);
      expect(Object.keys(r.positions), mode).toHaveLength(CORPUS.length);
      expect(r.groups.length, mode).toBeGreaterThan(0);
      expect(r.world.w, mode).toBeGreaterThan(0);
    }
  });

  it("the corpus actually spans four days, four archetypes, four topics and four components", () => {
    // The second half of the positive control: a corpus whose every answer shared a day
    // would make the TIME ordering assertions pass over a single column, and the same for
    // every other mode. Each mode has to have something to get wrong.
    expect(new Set(CORPUS.map((a) => listDayKey(a.created_at))).size).toBe(4);
    expect(new Set(CORPUS.map((a) => answerArchetype(a))).size).toBe(4);
    expect(new Set(CORPUS.map((a) => answerTopic(a))).size).toBe(4);
    expect(connectedComponents(CORPUS.map((a) => a.id), CORPUS_EDGES)).toHaveLength(4);
  });
});

// ── Structural invariants, all four modes ─────────────────────────────────────

describe("computeStageLayout — structure that must hold in every mode", () => {
  it("gives EVERY artifact exactly one position — none dropped, none duplicated", () => {
    // A dropped card does not render an error; it renders nothing, and the answer is simply
    // absent from the map while still sitting in the list. This is the single cheapest guard
    // against a grouping bug that loses a bucket.
    for (const mode of MODES) {
      const r = computeStageLayout(CORPUS, mode, CORPUS_EDGES);
      expect(Object.keys(r.positions).sort(), mode).toEqual(CORPUS.map((a) => a.id).sort());
      for (const a of CORPUS) {
        expect(Number.isFinite(r.positions[a.id].x), `${mode} ${a.id}`).toBe(true);
        expect(Number.isFinite(r.positions[a.id].y), `${mode} ${a.id}`).toBe(true);
      }
    }
  });

  it("every card sits INSIDE its own group's bbox and touches no other group's", () => {
    // The bbox is what the camera zooms to when a label is clicked. A card outside it is a
    // card the zoom-to-group flies away from; overlapping bboxes make the zoom ambiguous.
    // Positive control: each mode must actually place cards in groups, or "no card is in a
    // foreign box" is satisfied by no card being in any box.
    for (const mode of MODES) {
      const r = computeStageLayout(CORPUS, mode, CORPUS_EDGES);
      let placed = 0;

      for (const a of CORPUS) {
        const card = cardOf(r, a.id);
        const owners = groupHolding(r, a.id);
        expect(owners.length, `${mode} ${a.id} is in ${owners.length} groups`).toBeLessThanOrEqual(1);
        if (owners.length === 1) placed++;
        for (const g of r.groups) {
          if (g.id === owners[0]?.id) continue;
          expect(intersects(g.bbox, card), `${mode} ${a.id} overlaps ${g.id}`).toBe(false);
        }
      }

      expect(placed, `${mode} placed no card in any group`).toBeGreaterThan(0);
    }
  });

  it("the reported WORLD contains every card and every label", () => {
    // The camera fits this rectangle. Anything outside it is unreachable by fit-to-world:
    // the user sees the map settle with an answer just off-screen and no way to find it.
    for (const mode of MODES) {
      const r = computeStageLayout(CORPUS, mode, CORPUS_EDGES);
      const world = { x: 0, y: 0, w: r.world.w, h: r.world.h };

      for (const a of CORPUS) {
        expect(contains(world, cardOf(r, a.id)), `${mode} ${a.id}`).toBe(true);
      }
      for (const l of r.labels) {
        expect(contains(world, { x: l.x, y: l.y, w: 0, h: 0 }), `${mode} ${l.id}`).toBe(true);
      }
    }
  });

  it("every label has a group and every group has a label — a headless bbox is unclickable", () => {
    // The two arrays are joined by id: the label is the click target, the bbox is what it
    // zooms to. A group with no label can never be focused; a label with no group focuses
    // nothing. GRAPH is the deliberate exception, characterized separately below.
    for (const mode of MODES.filter((m) => m !== "GRAPH")) {
      const r = computeStageLayout(CORPUS, mode, CORPUS_EDGES);
      expect(r.labels.map((l) => l.id), mode).toEqual(r.groups.map((g) => g.id));
      for (const l of r.labels) expect(l.text.length, `${mode} ${l.id}`).toBeGreaterThan(0);
    }
  });

  it("TIME, TYPE and TOPIC are INDEPENDENT of input order — they sort, they do not inherit", () => {
    // The caller passes `useCanvasStore.getState().artifacts` raw, so the array order is
    // whatever Electric last wrote. These three modes key off content (day / archetype /
    // topic) and re-sort by recency, so an unrelated upsert cannot move a card.
    const reversed = [...CORPUS].reverse();

    for (const mode of MODES.filter((m) => m !== "GRAPH")) {
      const a = computeStageLayout(CORPUS, mode, CORPUS_EDGES);
      const b = computeStageLayout(reversed, mode, computeStageEdges(reversed));
      expect(a.positions, mode).toEqual(b.positions);
      expect(a.labels, mode).toEqual(b.labels);
    }
  });

  it("an EMPTY world is the exact 1200x800 sentinel, in every mode", () => {
    // Exact values because this IS the contract: with nothing to fit, the camera still needs
    // a finite viewport to sit in. A 0x0 world divides by zero in the fit computation and a
    // NaN transform blanks the canvas entirely.
    for (const mode of MODES) {
      expect(computeStageLayout([], mode), mode).toEqual({
        positions: {},
        labels: [],
        groups: [],
        world: { w: 1200, h: 800 },
      });
    }
  });
});

// ── Agreement: TIME ───────────────────────────────────────────────────────────

describe("TIME — the same day buckets, in the same order, as the list", () => {
  it("groups by the LIST's day key — the id the list's header zooms to", () => {
    // The agreement assertion. `zoomToGroup(\`time-${key}\`)` in AnswersPanel resolves
    // against exactly these ids, and nothing at runtime checks that it resolves: a mismatch
    // is a click that does nothing, forever, with no error anywhere.
    const r = computeStageLayout(CORPUS, "TIME");
    const expected = bucketsNewestFirst(CORPUS, (a) => listDayKey(a.created_at));

    expect(r.groups.map((g) => g.id)).toEqual(expected.map(([key]) => `time-${key}`));
    for (const a of CORPUS) {
      expect(groupHolding(r, a.id)[0]?.id, a.id).toBe(`time-${listDayKey(a.created_at)}`);
    }
  });

  it("the day-key expression is IDENTICAL in the list and the layout — the one un-shared helper", () => {
    // Every other grouping is shared by import; this one is written twice because
    // AnswersPanel's `dayOf` also computes a header label. Two copies of a formula drift.
    // Positive control: both extractions must actually find something, or "equal" is
    // "null === null" and this test defends nothing.
    const expr = (src: string) => src.match(/`(\$\{d\.getFullYear\(\)\}[^`]*)`/)?.[1] ?? null;
    const layout = expr(readFileSync(path.join(__dirname, "stageLayout.ts"), "utf8"));
    const list = expr(
      readFileSync(path.join(__dirname, "../components/NeuralStream/AnswersPanel.tsx"), "utf8"),
    );

    expect(layout).toContain("getFullYear");
    expect(list).toContain("getFullYear");
    expect(layout).toBe(list);
  });

  it("one column per day, NEWEST DAY LEFTMOST", () => {
    // Reading order. The list puts today at the top; a map that put today on the right would
    // be internally consistent and still contradict the surface beside it.
    const r = computeStageLayout(CORPUS, "TIME");
    const days = bucketsNewestFirst(CORPUS, (a) => listDayKey(a.created_at));
    const xs = days.map(([, items]) => r.positions[items[0].id].x);

    expect(xs.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i], `column ${i}`).toBeGreaterThan(xs[i - 1]);
  });

  it("every card in a day column shares that column's x", () => {
    // Stated as a property, not as a coordinate: it survives a spacing change and still
    // catches a card that escaped its column.
    const r = computeStageLayout(CORPUS, "TIME");

    for (const [key, items] of bucketsNewestFirst(CORPUS, (a) => listDayKey(a.created_at))) {
      const xs = new Set(items.map((a) => r.positions[a.id].x));
      expect(xs.size, key).toBe(1);
    }
  });

  it("within a column the NEWEST answer is on top", () => {
    // The list's within-day order is newest-first too. Positive control: at least one column
    // must hold more than one card, or "ordered" is a statement about singletons.
    const r = computeStageLayout(CORPUS, "TIME");
    const multi = bucketsNewestFirst(CORPUS, (a) => listDayKey(a.created_at)).filter(
      ([, items]) => items.length > 1,
    );
    expect(multi.length).toBeGreaterThanOrEqual(3);

    for (const [key, items] of multi) {
      const ys = [...items]
        .sort((a, b) => b.created_at - a.created_at)
        .map((a) => r.positions[a.id].y);
      for (let i = 1; i < ys.length; i++) expect(ys[i], key).toBeGreaterThan(ys[i - 1]);
    }
  });

  it("labels the column from the day it holds", () => {
    // Characterized as found: the canvas label is a bare padded date ("JUL 20"), while the
    // list header for the same bucket reads "TODAY · JUL 20". Same bucket, same id, DIFFERENT
    // wording — pinned so the divergence is a decision, not a discovery.
    const r = computeStageLayout(CORPUS, "TIME");
    const newest = new Date(newestOf(CORPUS));

    expect(r.labels[0].text).toBe(`JUL ${String(newest.getDate()).padStart(2, "0")}`);
    expect(r.labels[0].id).toBe(`time-${listDayKey(newestOf(CORPUS))}`);
  });

  it("survives an artifact with NO created_at — it buckets at the epoch instead of crashing", () => {
    // `created_at` is required by the type and absent in practice on rows shaped by an older
    // projector. The `?? 0` keeps the map rendering; the answer lands in a 1970 column at the
    // far right rather than vanishing.
    const thin = answer("thin", 0, "TABLE", null);
    delete (thin as Partial<Artifact>).created_at;
    const r = computeStageLayout([...CORPUS, thin], "TIME");

    expect(r.positions.thin).toBeDefined();
    expect(groupHolding(r, "thin")[0]?.id).toBe(`time-${listDayKey(0)}`);
  });
});

// ── Agreement: TYPE ───────────────────────────────────────────────────────────

describe("TYPE — the same archetype bands the list clusters by", () => {
  it("bands by answerArchetype ITSELF — the same call the list makes", () => {
    // Not "by something archetype-shaped". The list computes `type-${answerArchetype(a)}` for
    // its zoom target; if the map ever derived its own classification the two would agree on
    // most rows and diverge on exactly the edge cases (sub-variants, malformed payloads)
    // where being wrong is least visible.
    const r = computeStageLayout(CORPUS, "TYPE");

    for (const a of CORPUS) {
      expect(groupHolding(r, a.id)[0]?.id, a.id).toBe(`type-${answerArchetype(a)}`);
    }
    expect(r.groups.map((g) => g.id)).toEqual(
      bucketsNewestFirst(CORPUS, (a) => answerArchetype(a)).map(([k]) => `type-${k}`),
    );
  });

  it("collapsed sub-variants share ONE band — a TABLE and a BAR_CHART are one family", () => {
    // The collapse lives in answerDisplay; its consequence lives here. Two bands for one
    // family would split the chart answers across the map while the list showed them as one
    // cluster.
    const r = computeStageLayout(CORPUS, "TYPE");
    const charts = CORPUS.filter((a) => answerArchetype(a) === "CHART_WIDGET");

    expect(charts.length).toBeGreaterThanOrEqual(3);
    expect(new Set(charts.map((a) => r.positions[a.id].y)).size).toBe(1);
  });

  it("labels each band with archetypeLabel — the same text the list header shows", () => {
    // Header wording is the other half of agreement: matching ids with mismatched words is
    // still two surfaces that look like they disagree.
    const r = computeStageLayout(CORPUS, "TYPE");

    for (const g of r.groups) {
      const type = g.id.replace(/^type-/, "");
      const label = r.labels.find((l) => l.id === g.id)!;
      expect(label.text, g.id).toBe(archetypeLabel(type as ReturnType<typeof answerArchetype>));
    }
  });

  it("bands are ordered by their NEWEST member, and within a band the newest is leftmost", () => {
    // The recency ordering the list applies before grouping. Both axes asserted because the
    // band order and the in-band order come from two different pieces of the same sort.
    const r = computeStageLayout(CORPUS, "TYPE");
    const bands = bucketsNewestFirst(CORPUS, (a) => answerArchetype(a));

    const ys = bands.map(([, items]) => r.positions[items[0].id].y);
    for (let i = 1; i < ys.length; i++) expect(ys[i], `band ${i}`).toBeGreaterThan(ys[i - 1]);

    for (const [key, items] of bands.filter(([, i]) => i.length > 1)) {
      const xs = [...items]
        .sort((a, b) => b.created_at - a.created_at)
        .map((a) => r.positions[a.id].x);
      for (let i = 1; i < xs.length; i++) expect(xs[i], key).toBeGreaterThan(xs[i - 1]);
    }
  });

  it("a FALLBACK answer bands by its archetype — the map has no separate fallback band", () => {
    // Characterized as found, and it is a real divergence: `buildClusters` gives the list a
    // "Fallbacks" cluster that sinks to the bottom and carries NO archetype, so its header
    // offers no zoom at all. On the map the same answer sits in the band for whatever type it
    // rendered as. The buckets are the same helper; the fallback OVERLAY is applied on only
    // one of the two surfaces.
    const fb = CORPUS.find((a) => a.routing?.fallback === true)!;
    const r = computeStageLayout(CORPUS, "TYPE");

    expect(answerTopic(fb)).toBe("unresolved");
    expect(groupHolding(r, fb.id)[0]?.id).toBe(`type-${answerArchetype(fb)}`);
    expect(r.groups.some((g) => /fallback|unresolved/i.test(g.id))).toBe(false);
  });
});

// ── Agreement: TOPIC ──────────────────────────────────────────────────────────

describe("TOPIC — the same topic blocks the list clusters by", () => {
  it("blocks by answerTopic ITSELF, labelled with the topic key the list zooms to", () => {
    // `topic-${c.label}` in AnswersPanel, where `c.label` IS the answerTopic string. Ids and
    // header text are the same value here, so a change to either breaks this.
    const r = computeStageLayout(CORPUS, "TOPIC");

    for (const a of CORPUS) {
      expect(groupHolding(r, a.id)[0]?.id, a.id).toBe(`topic-${answerTopic(a)}`);
    }
    for (const g of r.groups) {
      expect(r.labels.find((l) => l.id === g.id)!.text).toBe(g.id.replace(/^topic-/, ""));
    }
  });

  it("puts an UNRESOLVED answer in the 'unresolved' block — the collapse key, not its subject", () => {
    // The fallback answer carries a resolved-looking `about`. Grouping the map by that label
    // would scatter dead-ends through the real topics while the list kept them together.
    const fb = CORPUS.find((a) => a.routing?.fallback === true)!;
    const r = computeStageLayout(CORPUS, "TOPIC");

    expect(fb.routing?.about?.label).toBe("Dashboard");
    expect(groupHolding(r, fb.id)[0]?.id).toBe("topic-unresolved");
  });

  it("blocks are ordered by their newest member", () => {
    // Characterized as found, and worth knowing: the LIST re-sorts its clusters by SIZE with
    // unresolved last, while the map orders blocks by recency of first appearance. The
    // membership agrees exactly; the block ORDER does not. Reading top-left-to-right on the
    // map is not reading top-to-bottom in the list.
    const r = computeStageLayout(CORPUS, "TOPIC");

    expect(r.labels.map((l) => l.id)).toEqual(
      bucketsNewestFirst(CORPUS, (a) => answerTopic(a)).map(([k]) => `topic-${k}`),
    );
  });

  it("lays a block out two cards wide, wrapping to a second row", () => {
    // The block grid, stated relationally. The three-answer topic must occupy two rows with
    // the third card starting a new one directly under the first.
    const r = computeStageLayout(CORPUS, "TOPIC");
    const topic = bucketsNewestFirst(CORPUS, (a) => answerTopic(a)).find(([, i]) => i.length === 3)!;
    const [first, second, third] = topic[1]
      .slice()
      .sort((a, b) => b.created_at - a.created_at)
      .map((a) => r.positions[a.id]);

    expect(first.y).toBe(second.y);
    expect(second.x).toBeGreaterThan(first.x);
    expect(third.x).toBe(first.x);
    expect(third.y).toBeGreaterThan(first.y);
  });

  it("WRAPS many blocks onto further rows without ever overlapping them", () => {
    // A dozen topics is an ordinary week. The wrap is the only place blocks can collide, and
    // a collision renders as two topics' cards interleaved with no visible cause.
    const many = Array.from({ length: 14 }, (_, i) =>
      answer(`w${i}`, at(20, 12) - i * 3_600_000, "TABLE", route(`Topic ${i}`)),
    );
    const r = computeStageLayout(many, "TOPIC");

    expect(r.groups).toHaveLength(14);
    expect(new Set(r.groups.map((g) => g.bbox.y)).size).toBeGreaterThan(1); // it really wrapped
    for (let i = 0; i < r.groups.length; i++) {
      for (let j = i + 1; j < r.groups.length; j++) {
        expect(
          intersects(r.groups[i].bbox, r.groups[j].bbox),
          `${r.groups[i].id} overlaps ${r.groups[j].id}`,
        ).toBe(false);
      }
    }
    for (const a of many) {
      expect(contains({ x: 0, y: 0, w: r.world.w, h: r.world.h }, cardOf(r, a.id)), a.id).toBe(true);
    }
  });

  it("is the DEFAULT arm — an unrecognised mode lays out by topic rather than blanking", () => {
    // The dispatch ends in `return layoutTopic(...)`. A mode string from a persisted store
    // written by an older build therefore renders a real map instead of an empty one.
    const bogus = computeStageLayout(CORPUS, "SOMETHING_NEW" as StageMode);

    expect(bogus).toEqual(computeStageLayout(CORPUS, "TOPIC"));
  });
});

// ── GRAPH ─────────────────────────────────────────────────────────────────────

describe("GRAPH — clusters are connected components over the edges", () => {
  const ids = CORPUS.map((a) => a.id);
  const comps = connectedComponents(ids, CORPUS_EDGES);
  const ring3 = comps.find((c) => c.length === 3)!;
  const ring2 = comps.find((c) => c.length === 2)!;
  const singles = comps.filter((c) => c.length === 1);

  it("the corpus really produces one 3-cluster, one 2-cluster and two singletons — positive control", () => {
    // Every GRAPH assertion below reads these. If the edge computation changed and every
    // answer became a singleton, the ring assertions would iterate nothing.
    expect(ring3).toBeDefined();
    expect(ring2).toBeDefined();
    expect(singles).toHaveLength(2);
  });

  it("answers sharing a resolved INSTANCE land in one cluster; unlinked answers do not", () => {
    // The same `connectedComponents(computeStageEdges(items))` the list's GRAPH tab clusters
    // by. Clustering the map some other way would put two answers in one ring that the list
    // shows under different headers.
    const r = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);
    const box = groupHolding(r, ring3[0])[0];

    expect(box).toBeDefined();
    for (const id of ring3) expect(contains(box.bbox, cardOf(r, id)), id).toBe(true);
    for (const [id] of singles) expect(contains(box.bbox, cardOf(r, id)), id).toBe(false);
  });

  it("a multi-member cluster is a RING — equal radii, first member at the top", () => {
    // The ring is what makes a same-subject cluster readable as one thing at zoom-out. Stated
    // by property (every card the same distance from the cluster's centre) rather than by
    // coordinates, so the radius formula can be retuned without a false failure.
    const r = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);
    const centres = ring3.map((id) => ({
      id,
      cx: r.positions[id].x + W / 2,
      cy: r.positions[id].y + H / 2,
    }));
    const mid = {
      x: centres.reduce((s, c) => s + c.cx, 0) / centres.length,
      y: centres.reduce((s, c) => s + c.cy, 0) / centres.length,
    };
    const radii = centres.map((c) => Math.hypot(c.cx - mid.x, c.cy - mid.y));

    for (const rad of radii) expect(rad).toBeCloseTo(radii[0], 6);
    expect(radii[0]).toBeGreaterThan(0);
    // Angles start at -90°, so the component's first member crowns the ring.
    expect(centres[0].cy).toBe(Math.min(...centres.map((c) => c.cy)));
    expect(centres[0].cx).toBeCloseTo(mid.x, 6);
  });

  it("a SINGLETON gets a position but no label and no group — nothing to zoom to", () => {
    // Deliberate: a ring of one is not a cluster. It mirrors the list, whose singletons
    // collect under an "Unlinked" header that offers no zoom either.
    const r = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);

    for (const [id] of singles) {
      expect(r.positions[id]).toBeDefined();
      expect(groupHolding(r, id)).toHaveLength(0);
    }
    expect(r.groups).toHaveLength(2);
    expect(r.labels).toHaveLength(2);
  });

  it("names a cluster after its subject INSTANCE, the way the list names it", () => {
    // AnswersPanel derives the same header from the same chain
    // (`instance_label || label || "linked"`). Matching names are how a user recognises the
    // ring they just clicked in the list.
    const r = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);
    const texts = r.labels.map((l) => l.text).sort();

    expect(texts).toEqual([C360.label, DS1.label].sort());
  });

  it("places the BIGGEST cluster first", () => {
    // Biggest-first is the map's reading order for GRAPH. The 3-ring must start at the
    // origin corner, ahead of the 2-ring.
    const r = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);
    const big = groupHolding(r, ring3[0])[0].bbox;
    const small = groupHolding(r, ring2[0])[0].bbox;

    expect(big.x).toBeLessThan(small.x);
    expect(big.w).toBeGreaterThan(small.w);
  });

  it("uses POSITIONAL cluster ids, so they are not stable across a change in membership", () => {
    // Characterized as found, not endorsed. `graph-0` names "whichever cluster sorted first",
    // unlike the content-derived time-/type-/topic- ids. Adding one answer to a cluster can
    // renumber every group, which is why the list's GRAPH tab offers no zoom target at all —
    // there is no id it could compute.
    const r = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);
    expect(r.groups.map((g) => g.id)).toEqual(["graph-0", "graph-1"]);

    const shrunk = CORPUS.filter((a) => a.id !== ring3[1] && a.id !== ring3[2]);
    const r2 = computeStageLayout(shrunk, "GRAPH", computeStageEdges(shrunk));
    expect(r2.groups[0].id).toBe("graph-0");
    expect(r2.groups[0].bbox).not.toEqual(r.groups[0].bbox); // same id, different cluster
  });

  it("with NO edges every answer is its own singleton — an ungrouped scatter, not an empty map", () => {
    // The default parameter is `edges = []`, which is what the canvas passes before the edge
    // computation has run. Every card must still be placed.
    const r = computeStageLayout(CORPUS, "GRAPH");

    expect(Object.keys(r.positions)).toHaveLength(CORPUS.length);
    expect(r.groups).toEqual([]);
    expect(r.labels).toEqual([]);
  });

  it("an edge naming an ABSENT id drags a phantom into the cluster", () => {
    // Characterized as found, not endorsed. `connectedComponents` seeds its adjacency from
    // the stage's ids but then adds whatever an edge names, so a stale edge — a row filtered
    // out, or removed mid-session while its edge survived — pulls "ghost" into a4's
    // component. The consequences: a POSITION is emitted for an artifact that does not exist
    // (the caller looks it up and renders nothing), and a4 is promoted from singleton to a
    // two-member ring, so it is drawn orbiting an empty slot under a cluster label.
    //
    // It stops short of a crash only because the component always STARTS from a real id, so
    // `byId.get(comp[0])!` is never undefined. An edge set that named two absent ids linked
    // to each other would still be ignored — nothing seeds a component from them.
    const stale: StageEdge[] = [
      ...CORPUS_EDGES,
      { from: "a4", to: "ghost", kind: "same-subject", directed: false },
      { from: "nowhere", to: "nohow", kind: "same-subject", directed: false },
    ];
    const r = computeStageLayout(CORPUS, "GRAPH", stale);

    expect(Object.keys(r.positions)).toContain("ghost");
    expect(Object.keys(r.positions)).not.toContain("nowhere");
    expect(groupHolding(r, "a4")).toHaveLength(1); // no longer a singleton
    expect(r.labels.map((l) => l.text)).toContain("Runbook"); // a4's own class names the ring
  });

  it("FOLLOWS the input array's order — an unrelated upsert can re-shuffle the whole map", () => {
    // Characterized as found, and the sharpest divergence from the other three modes. GRAPH
    // has no content key: component membership order comes from the input array, ties in the
    // biggest-first sort resolve by input order, and a ring's rotation starts at whichever
    // member the traversal reached first. The caller passes the store's `artifacts` array,
    // whose order changes whenever a row arrives — so answering an unrelated question can
    // rotate the rings and swap the singletons the user was reading.
    const reversed = [...CORPUS].reverse();
    const a = computeStageLayout(CORPUS, "GRAPH", CORPUS_EDGES);
    const b = computeStageLayout(reversed, "GRAPH", computeStageEdges(reversed));

    expect(b.positions).not.toEqual(a.positions);
    // Membership is stable even though arrangement is not: the same answers still cluster.
    expect(new Set(ring3.map((id) => groupHolding(b, id)[0]?.id)).size).toBe(1);
  });
});

// ── Characterized quirks ──────────────────────────────────────────────────────

describe("computeStageLayout — what happens on shapes nobody designed for", () => {
  it("a DUPLICATE id collapses to a single position — the second card is invisible", () => {
    // Characterized as found. `positions` is keyed by artifact id, and the store accepts a
    // duplicate id (pinned in useCanvasStore.test.ts). The layout reserves a slot for both
    // and writes only the last one, so the map shows a gap where a card should be and the
    // list shows two rows. Nothing throws.
    const twin = { ...CORPUS[0], created_at: CORPUS[0].created_at - 60_000 };
    const dup = computeStageLayout([...CORPUS, twin], "TIME");
    const distinct = computeStageLayout([...CORPUS, { ...twin, id: "distinct" }], "TIME");
    const day = `time-${listDayKey(twin.created_at)}`;
    const boxOf = (r: StageLayoutResult) => r.groups.find((g) => g.id === day)!.bbox;

    expect(Object.keys(dup.positions)).toHaveLength(CORPUS.length);
    expect(Object.keys(distinct.positions)).toHaveLength(CORPUS.length + 1);
    // The column was sized for three cards either way; with the duplicate, one slot stays empty.
    expect(boxOf(dup).h).toBe(boxOf(distinct).h);
  });

  it("a SINGLE answer still gets a group, a label and a world larger than the card", () => {
    // The first-answer-of-the-session state, which every user sees before any other. The
    // `Math.max(1, ...)` guards exist for exactly this and are easy to drop while tidying.
    for (const mode of MODES) {
      const r = computeStageLayout([CORPUS[0]], mode, []);
      expect(Object.keys(r.positions), mode).toHaveLength(1);
      expect(r.world.w, mode).toBeGreaterThan(W);
      expect(r.world.h, mode).toBeGreaterThan(H);
      if (mode !== "GRAPH") {
        expect(r.groups, mode).toHaveLength(1);
        expect(r.labels, mode).toHaveLength(1);
      }
    }
  });

  it("a thin row with NO routing at all lands in 'ungrouped', not in a nameless block", () => {
    // Pending rows have `routing: null` and are on the canvas from the moment the question is
    // asked. An empty group key would render a headerless block.
    const pending = answer("pending", at(21, 9), null, null);
    const r = computeStageLayout([...CORPUS, pending], "TOPIC");

    expect(groupHolding(r, "pending")[0]?.id).toBe("topic-ungrouped");
    expect(r.labels.find((l) => l.id === "topic-ungrouped")!.text).toBe("ungrouped");
  });
});
