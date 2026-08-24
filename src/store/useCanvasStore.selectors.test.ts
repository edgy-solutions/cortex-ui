/**
 * CHARACTERIZATION of the `useCurrent*` selector hooks.
 *
 * The store's own contract is pinned in useCanvasStore.test.ts. These five hooks are split
 * out because their load-bearing property is not a property of the store at all — it is a
 * property of the RENDER LOOP, and `getState()` cannot see it.
 *
 * Zustand compares a selector's result with Object.is. A selector that mints a fresh `[]`
 * or `{}` on each call therefore reports "changed" on every call, including the call React
 * makes to re-check the snapshot after the render it just triggered. The result is not a
 * slow component or a stale value: it is render → new literal → re-render → new literal,
 * until React gives up with "Maximum update depth exceeded" and the canvas is blank. The
 * hoisted `EMPTY_*` constants at the bottom of useCanvasStore.ts are the entire defence,
 * and they are invisible to any test that only reads state.
 *
 * So every assertion about an empty result below is `toBe`, never `toEqual`. `toEqual`
 * passes cheerfully on the exact code that freezes the app.
 *
 * Every render here goes through `mount`, which carries a ceiling. A broken selector does
 * not fail an assertion — it never reaches one — so without the ceiling the failure mode of
 * this file would be a hung suite, which is worse than no file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Artifact, RouteDecision, Source, GraphTraceNode } from "@/api/types";
import * as canvasModule from "./useCanvasStore";
import {
  useCanvasStore,
  useCurrentArtifact,
  useCurrentRouting,
  useCurrentSources,
  useCurrentGraphTrace,
  useCurrentGraphAlternates,
} from "./useCanvasStore";

const store = () => useCanvasStore.getState();

const PRODUCED_FOR: Artifact["produced_for"] = {
  user_id: "alice",
  is_authenticated: true,
  entitlement_source: "none",
};

const ROUTING: RouteDecision = {
  about: { label: "Catalog Asset", uri: "urn:x:Dataset", confidence: 0.9 },
  action: {
    label: "Look up ownership",
    iri: "mesh:lookupOwnership",
    confidence: 0.9,
    classify_called: true,
    candidate_count: 1,
  },
  handled_by: {
    engine_name: "Engine A",
    provider: "engine_a_lookup_ownership",
    endpoint_url: "http://engine-a:8081/analyze",
  },
};

const SOURCE: Source = { type: "catalog_asset", label: "Alpha", uri: "urn:x:alpha", relevance: 1 };
const TRACE_NODE: GraphTraceNode = {
  uri: "urn:x:Dataset",
  label: "Dataset",
  role: "resolved_subject",
  hops: 0,
};
const ALTERNATE_NODE: GraphTraceNode = {
  uri: "urn:x:otherVerb",
  label: "Other verb",
  role: "alternate_verb",
};

/** A populated row, upserted through the Electric path so the fixture uses the real API. */
const serverRow = (id: string, overrides: Partial<Artifact> = {}): Artifact => ({
  id,
  created_at: 500,
  updated_at: 600,
  valid_as_of: 500,
  valid_until: null,
  question_text: `question for ${id}`,
  summary: `summary for ${id}`,
  resolved_intent: {},
  message_id: `msg-${id}`,
  status: "complete",
  rendered_output: { components: [{ archetype: "TABLE" }] },
  produced_by: { actor_type: "agent", actor_id: "engine_a_lookup_ownership" },
  produced_for: PRODUCED_FOR,
  routing: ROUTING,
  sources: [SOURCE],
  graph_trace: [TRACE_NODE],
  graph_trace_alternates: [ALTERNATE_NODE],
  derived_from_artifact_id: null,
  durability_status: "durable",
  watermark: 42,
  ...overrides,
});

/**
 * The ceiling. A stable selector settles in one or two renders; an unstable one climbs
 * without bound. 25 is far above the former and far below React's own nested-update limit,
 * so THIS error is what a regression reports — named, immediate, and pointing at the hook.
 */
const RENDER_CEILING = 25;

function mount<T>(hook: () => T) {
  const probe = { renders: 0 };
  const rendered = renderHook(() => {
    probe.renders += 1;
    if (probe.renders > RENDER_CEILING) {
      throw new Error(
        `render ceiling (${RENDER_CEILING}) exceeded — the selector returned a new identity on every call`,
      );
    }
    return hook();
  });
  return { ...rendered, probe };
}

/** A store write that touches nothing any of these hooks select. */
const unrelatedWrite = () =>
  act(() => {
    store().setActiveTab(`tab-${Math.random()}`);
  });

/**
 * The population under sweep. Derived coverage of it is asserted separately below — a hook
 * added to the module and forgotten here would otherwise inherit "tested" for free.
 */
const SELECTORS: Array<[string, () => unknown]> = [
  ["useCurrentArtifact", useCurrentArtifact],
  ["useCurrentRouting", useCurrentRouting],
  ["useCurrentSources", useCurrentSources],
  ["useCurrentGraphTrace", useCurrentGraphTrace],
  ["useCurrentGraphAlternates", useCurrentGraphAlternates],
];

beforeEach(() => {
  store().clearCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCurrent* — the sweep's population", () => {
  it("covers EVERY useCurrent* hook the module exports — positive control", () => {
    // Without this the stability sweep below is a list someone has to remember to extend.
    // A sixth selector that defaults to a fresh literal is exactly the regression this file
    // exists for, and it would ship green.
    const exported = Object.keys(canvasModule)
      .filter((k) => k.startsWith("useCurrent"))
      .sort();

    expect(exported.length).toBeGreaterThanOrEqual(5);
    expect(exported).toEqual(SELECTORS.map(([name]) => name).sort());
  });
});

describe("useCurrent* — referential stability with no current artifact", () => {
  // The state every HUD component mounts into on a cold boot: no artifact selected, every
  // selector on its empty branch. This is where the blank screen came from.

  for (const [name, hook] of SELECTORS) {
    it(`${name} returns the SAME identity across an unrelated store write — a fresh literal here is the blank-screen freeze`, () => {
      const { result, rerender, probe } = mount(hook);
      const first = result.current;

      unrelatedWrite();
      rerender();

      expect(result.current).toBe(first);
      expect(probe.renders).toBeLessThan(RENDER_CEILING);
    });
  }

  it("hands EVERY caller the same instance — two HUD panels mounted separately share one empty array", () => {
    // Not just stable within one component: the constant is module-level, so a second panel
    // mounting mid-session cannot introduce a competing identity that churns the first.
    const a = mount(useCurrentSources);
    const b = mount(useCurrentSources);

    expect(a.result.current).toBe(b.result.current);
    expect(a.result.current).toEqual([]);
  });

  it("the two absent-value shapes are `null` for objects and a stable `[]` for collections", () => {
    // Stated so the empty contract is readable in one place. null is stable for free;
    // the arrays are stable only because someone hoisted them.
    expect(mount(useCurrentArtifact).result.current).toBeNull();
    expect(mount(useCurrentRouting).result.current).toBeNull();
    expect(mount(useCurrentSources).result.current).toEqual([]);
    expect(mount(useCurrentGraphTrace).result.current).toEqual([]);
    expect(mount(useCurrentGraphAlternates).result.current).toEqual([]);
  });

  it("sources, graph_trace and alternates get THREE distinct empties — the constants are not shared across hooks", () => {
    // Pinned because the mutation hazard below is contained by exactly this: poisoning one
    // empty cannot reach the other two. Collapsing them into one shared constant would be a
    // reasonable-looking tidy-up that widens the blast radius.
    const sources = mount(useCurrentSources).result.current;
    const trace = mount(useCurrentGraphTrace).result.current;
    const alternates = mount(useCurrentGraphAlternates).result.current;

    expect(sources).not.toBe(trace);
    expect(trace).not.toBe(alternates);
    expect(sources).not.toBe(alternates);
  });
});

describe("useCurrent* — the empty branch is reached by three different absences", () => {
  it("a FOREGROUND POINTING AT NOTHING yields the same empties as no foreground at all", () => {
    // setCurrentArtifact takes any string, checked by nothing (pinned in the store's own
    // file). The selectors then run `find` over a collection that has no such row every
    // time the store emits — so the dangling-id state is not just blank, it is the empty
    // branch, and it had better be the stable one.
    const emptyWithNoCurrent = mount(useCurrentSources).result.current;

    act(() => {
      store().electricUpsertArtifact(serverRow("real"));
      store().setCurrentArtifact("does-not-exist");
    });

    expect(mount(useCurrentArtifact).result.current).toBeNull();
    expect(mount(useCurrentRouting).result.current).toBeNull();
    expect(mount(useCurrentSources).result.current).toBe(emptyWithNoCurrent);
  });

  it("a current artifact whose FIELD is null yields the hoisted constant, not null and not a copy", () => {
    // The `?? EMPTY_*` half. A projection row that arrives with sources null — which is what
    // Postgres sends for an artifact the grounding never populated — must not reach a
    // consumer as null (it would crash `.map`) nor as a fresh `[]` (it would loop).
    const emptyWithNoCurrent = mount(useCurrentSources).result.current;

    act(() => {
      store().electricUpsertArtifact(
        serverRow("a1", {
          sources: null as unknown as Source[],
          graph_trace: null as unknown as GraphTraceNode[],
          graph_trace_alternates: null as unknown as GraphTraceNode[],
          routing: null,
        }),
      );
    });

    expect(store().currentArtifactId).toBe("a1");
    expect(mount(useCurrentSources).result.current).toBe(emptyWithNoCurrent);
    expect(mount(useCurrentRouting).result.current).toBeNull();
    expect(mount(useCurrentGraphTrace).result.current).toEqual([]);
    expect(mount(useCurrentGraphAlternates).result.current).toEqual([]);
  });

  it("an artifact missing the field ENTIRELY takes the same branch as an explicit null", () => {
    // Optional-chained `?.field` returns undefined for a row shaped by an older projector.
    // Same coalesce, same constant — the two absences are indistinguishable downstream.
    const emptyWithNoCurrent = mount(useCurrentGraphAlternates).result.current;
    const row = serverRow("a1");
    delete (row as Partial<Artifact>).graph_trace_alternates;

    act(() => {
      store().electricUpsertArtifact(row);
    });

    expect(mount(useCurrentGraphAlternates).result.current).toBe(emptyWithNoCurrent);
  });

  it("an empty-but-present array is passed THROUGH — the row's own [] is not swapped for the constant", () => {
    // Pinned as found. A pending row's `sources: []` is its own array, so it is stable only
    // because nothing rewrites it; the constant never gets substituted for it. The two are
    // interchangeable for rendering and NOT interchangeable for identity, which is the only
    // thing this file is about.
    const constant = mount(useCurrentSources).result.current;
    const ownEmpty: Source[] = [];

    act(() => {
      store().electricUpsertArtifact(serverRow("a1", { sources: ownEmpty }));
    });

    expect(mount(useCurrentSources).result.current).toBe(ownEmpty);
    expect(mount(useCurrentSources).result.current).not.toBe(constant);
  });
});

describe("useCurrent* — pass-through to the foregrounded row", () => {
  beforeEach(() => {
    act(() => {
      store().electricUpsertArtifact(serverRow("a1", { watermark: 1 }));
      store().electricUpsertArtifact(
        serverRow("a2", {
          watermark: 2,
          sources: [{ ...SOURCE, label: "Beta" }],
          graph_trace: [{ ...TRACE_NODE, label: "Beta trace" }],
          graph_trace_alternates: [{ ...ALTERNATE_NODE, label: "Beta alternate" }],
          routing: { ...ROUTING, about: { ...ROUTING.about, label: "Beta about" } },
        }),
      );
      store().setCurrentArtifact("a1");
    });
  });

  it("each hook reads the CURRENT row's field BY REFERENCE, never a copy", () => {
    // A copy would be a fresh identity per call — the loop again, this time on the populated
    // branch where the empty constants cannot help.
    const row = store().artifacts.find((a) => a.id === "a1")!;

    expect(mount(useCurrentArtifact).result.current).toBe(row);
    expect(mount(useCurrentRouting).result.current).toBe(row.routing);
    expect(mount(useCurrentSources).result.current).toBe(row.sources);
    expect(mount(useCurrentGraphTrace).result.current).toBe(row.graph_trace);
    expect(mount(useCurrentGraphAlternates).result.current).toBe(row.graph_trace_alternates);
  });

  it("FOLLOWS the foreground when the user selects another artifact — without a remount", () => {
    // The reason these are hooks and not a prop drilled from the canvas. Every HUD panel
    // re-points itself at the newly-selected row off one store write.
    const { result, probe } = mount(useCurrentSources);
    expect(result.current[0].label).toBe("Alpha");

    act(() => {
      store().setCurrentArtifact("a2");
    });

    expect(result.current[0].label).toBe("Beta");
    expect(probe.renders).toBeLessThan(RENDER_CEILING);
  });

  it("a patch to a SIBLING artifact does not churn the current row's identity", () => {
    // Every write replaces the artifacts ARRAY, so every subscriber re-selects. What keeps
    // the canvas quiet is that `map` hands back the untouched rows by reference — the
    // selector's result is unchanged and React stops there.
    const before = mount(useCurrentArtifact).result.current;
    const { result } = mount(useCurrentArtifact);

    act(() => {
      store().updateArtifact("a2", { status: "failed" }, "local:onerror_failed");
    });

    expect(result.current).toBe(before);
  });

  it("a patch to the CURRENT row replaces the ARTIFACT object but keeps the untouched FIELD arrays", () => {
    // The asymmetry worth knowing before choosing a hook: `useCurrentArtifact` re-renders on
    // any patch to the foregrounded row (updateArtifact always spreads a new object and
    // always bumps updated_at), while the field hooks re-render only when their own field is
    // in the patch. A panel that only needs sources pays nothing for a status change.
    const artifactBefore = mount(useCurrentArtifact).result.current;
    const sourcesBefore = mount(useCurrentSources).result.current;

    act(() => {
      store().updateArtifact("a1", { status: "failed" }, "local:onerror_failed");
    });

    expect(mount(useCurrentArtifact).result.current).not.toBe(artifactBefore);
    expect(mount(useCurrentSources).result.current).toBe(sourcesBefore);
  });

  it("reaches only the FIRST row for a duplicated id — the shadow row is unselectable", () => {
    // The store accepts a duplicate id (pinned there). Consequence stated here, where it
    // bites: `find` short-circuits, so the second row's content can never reach the canvas
    // no matter what the user clicks.
    act(() => {
      store().electricUpsertArtifact(serverRow("dupe", { watermark: 9, summary: "first" }));
      useCanvasStore.setState((s) => ({
        artifacts: [...s.artifacts, serverRow("dupe", { watermark: 9, summary: "second" })],
      }));
      store().setCurrentArtifact("dupe");
    });

    expect(store().artifacts.filter((a) => a.id === "dupe")).toHaveLength(2);
    expect(mount(useCurrentArtifact).result.current!.summary).toBe("first");
  });
});

describe("useCurrent* — the loop the hoisted constants prevent", () => {
  it("a selector returning a FRESH literal renders without bound; the real hook settles at once", () => {
    // The demonstration, not an analogy: the control selector below differs from
    // `useCurrentSources`'s empty branch in exactly one respect — it builds its `[]` inline.
    // React re-checks the store snapshot after each render it commits, sees a new identity,
    // and renders again. That is the "Maximum update depth exceeded" the EMPTY_* constants
    // were introduced to stop, and it is reproducible in under 25 renders.
    //
    // Silenced because React logs the getSnapshot-should-be-cached warning on every one of
    // those renders; the assertion, not the console, is the evidence.
    vi.spyOn(console, "error").mockImplementation(() => {});

    const stable = mount(useCurrentSources);
    expect(stable.probe.renders).toBeLessThanOrEqual(2);

    expect(() =>
      mount(() =>
        useCanvasStore((s) => {
          const id = s.currentArtifactId;
          if (!id) return [];
          return s.artifacts.find((a) => a.id === id)?.sources ?? [];
        }),
      ),
    ).toThrow(/render ceiling/);
  });
});

describe("useCurrent* — the shared constant is mutable, and that is a hazard", () => {
  it("a caller that MUTATES the empty array poisons every other caller for the process lifetime", () => {
    // Characterized as found, not endorsed. The constants are plain arrays: nothing stops a
    // consumer doing `alternates.push(...)` or `.sort()` in place, and the damage is not
    // local — the next panel to mount reads the same instance and sees the injected node,
    // for an artifact that has no alternates at all. Freezing them would make this test red;
    // that would be an improvement, and the reader should update it rather than revert.
    const empty = mount(useCurrentGraphAlternates).result.current as GraphTraceNode[];
    expect(Object.isFrozen(empty)).toBe(false);

    try {
      empty.push(ALTERNATE_NODE);

      // A second, independent mount — with no artifact and no store write at all.
      expect(mount(useCurrentGraphAlternates).result.current).toHaveLength(1);
    } finally {
      empty.length = 0;
    }

    expect(mount(useCurrentGraphAlternates).result.current).toHaveLength(0);
  });
});
