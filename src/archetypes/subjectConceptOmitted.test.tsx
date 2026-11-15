/**
 * RULED 2026-11-03: the projector omits `subject_concept` when it is null (producer side, Lane 1 /
 * presentation); cortex excuses nothing. No reader changes for this, so what is left on this side
 * is to prove the omission lands clean: every projected archetype, drawn through the interpreter
 * with the null key and without it, must differ only by the raw row.
 *
 * Captures reach 5 of the 15 archetypes, so the other 10 use fixtures or hand payloads, each hand
 * payload with text only its card draws. Two refusals would compare equal and prove nothing, which
 * is why `draws` exists.
 *
 * Until the pin carries the omission, `declaredRender.test.tsx` still pins today's raw row and the
 * producer seal reds at the re-pin that crosses it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { LEDGER_FIXTURES } from "@/components/ledger/fixtures/sourceLedger";
import { rawFieldsOf } from "@/lib/rawFields";
import { parityComponents as competing } from "./competing-measures/parityPopulation.testkit";
import { parityComponents as ranking } from "./contribution-ranking/parityPopulation.testkit";
import { parityComponents as deltaSet } from "./delta-set/parityPopulation.testkit";
import { parityComponents as multiSeries } from "./multi-series/parityPopulation.testkit";
import { parityComponents as shortfall } from "./shortfall-grid/parityPopulation.testkit";
import { parityComponents as variance } from "./variance-tree/parityPopulation.testkit";
import { PROJECTED_ARCHETYPES } from "./projectedPopulation.testkit";

// The Gantt library cannot lay out in jsdom; what is compared here is the card around it.
vi.mock("@svar-ui/react-gantt", () => ({
  Gantt: () => null,
  WillowDark: ({ children }: { children?: unknown }) => children,
}));

afterEach(cleanup);

const readCapture = (f: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "../../fixtures/captures", f), "utf8"));

type Component = Record<string, unknown>;
type Walked = { name: string; component: Component; draws: string | null };

/** `draws` is null only for CANVAS_SEED, which is acted on rather than drawn. */
const HAND: Record<string, { component: Component; draws: string | null }> = {
  INTERVAL_TIMELINE: {
    draws: "1 row · 1 group",
    component: {
      archetype: "INTERVAL_TIMELINE",
      rows: [
        {
          group_kind: "initiative",
          group_id: "I-1",
          group_name: "Initiative One",
          group_weight: null,
          initiative_id: "I-1",
          initiative_name: "Initiative One",
          phase_id: "PH-1",
          phase_name: "Phase One",
          phase_sequence: 1,
          project_id: "P-1",
          project_name: "Project One",
          planned_start: "2026-01-01",
          planned_end: "2026-03-01",
          actual_start: null,
          actual_end: null,
          risk_flag: null,
        },
      ],
    },
  },
  PERIOD_SERIES: {
    draws: "FY26-Q2",
    component: {
      archetype: "PERIOD_SERIES",
      rows: [{ period: "FY26-Q2", capex: 800000, expense: 500000, total: 1300000, cap: 1500000, over_cap: false, overage: null }],
    },
  },
  STEP_LADDER: {
    draws: "Base cost",
    component: {
      archetype: "STEP_LADDER",
      price: "7865884.00",
      unit_price: "7865884.00",
      value_unit: "USD",
      sums: true,
      steps: [{ name: "Base cost", rate: null, basis: null, amount: "7865884.00", running_total: "7865884.00", value_unit: "USD" }],
    },
  },
  THRESHOLD_GRID: {
    draws: "Site A",
    component: {
      archetype: "THRESHOLD_GRID",
      rows: [{ subject_id: "S1", subject_name: "Site A", period: "FY26-Q3", value: 1.8, threshold: 2.0, over_threshold: false, contributors: ["P3"] }],
    },
  },
  MATRIX_GRID: {
    draws: "Financial Close",
    component: {
      archetype: "MATRIX_GRID",
      rows: [
        {
          row_id: "C1",
          row_name: "Financial Close",
          column_id: "S1",
          column_name: "Site A",
          level: 2.0,
          target_level: 4.0,
          gap: 2.0,
          assessed_at: "2026-06-30",
          assessed_by: "council",
          assessment_count: 3,
        },
      ],
    },
  },
  CANVAS_SEED: { draws: null, component: { archetype: "CANVAS_SEED", artifact_ids: ["a"] } },
  FORECAST_MEASURE: {
    draws: "Meridian",
    component: {
      archetype: "FORECAST_MEASURE",
      rows: [
        {
          program_id: "P1",
          program_name: "Meridian",
          method_label: "CPI",
          formula: "EAC = BAC / CPI",
          eac: 14152381,
          vac: -2152381,
          etc: 6152381,
          bac: 12000000,
          bcws: 9000000,
          bcwp: 8000000,
          acwp: 8000000,
          cpi: 1,
          spi: 0.89,
          percent_complete: 0.67,
          as_of_period: "FY26-Q3",
          reported_periods: 6,
          value_unit: "USD",
        },
      ],
    },
  },
  SOURCE_LEDGER: { draws: "Three measures", component: LEDGER_FIXTURES[0].component as Component },
  INSTANCES_BY_PROPERTY: {
    draws: "Parts by state",
    component: { archetype: "INSTANCES_BY_PROPERTY", title: "Parts by state", columns: [{ key: "a", label: "A" }], rows: [{ a: "x" }] },
  },
};

/** Package archetypes walk their whole parity population; a fixture may be a refusal on purpose. */
const PACKAGES: Record<string, (r: (f: string) => unknown) => Record<string, Component>> = {
  COMPETING_MEASURES: competing,
  CONTRIBUTION_RANKING: ranking,
  DELTA_SET: deltaSet,
  MULTI_SERIES: multiSeries,
  SHORTFALL_GRID: shortfall,
  VARIANCE_TREE: variance,
};

function population(archetype: string): Walked[] {
  if (HAND[archetype]) return [{ name: archetype, ...HAND[archetype] }];
  return Object.entries(PACKAGES[archetype](readCapture)).map(([name, component]) => ({ name, component, draws: null }));
}

/** The component's own HTML with its raw section lifted out, and the keys that section listed. */
function drawn(component: Component) {
  const { container } = render(<SemanticInterpreter payload={{ components: [component] }} />);
  const raw = [...container.querySelectorAll("[data-raw-field]")].map((f) => f.getAttribute("data-raw-field"));
  container.querySelectorAll("details[data-raw-fields]").forEach((d) => d.remove());
  const out = { raw, html: container.innerHTML, text: container.textContent ?? "" };
  cleanup();
  return out;
}

const withNull = (c: Component): Component => ({ ...c, subject_concept: null });
const omitted = (c: Component): Component => {
  const { subject_concept: _dropped, ...rest } = c;
  return rest;
};

describe("the projector omits a null subject_concept: every projected archetype", () => {
  it.each([...PROJECTED_ARCHETYPES])("%s loses the raw row and nothing else", (archetype) => {
    const walked = population(archetype);
    expect(walked.length, archetype).toBeGreaterThan(0);
    for (const { name, component, draws } of walked) {
      const before = drawn(withNull(component));
      const after = drawn(omitted(component));
      expect(after.html, name).toBe(before.html);
      expect(after.raw, name).toEqual(before.raw.filter((k) => k !== "subject_concept"));
      if (draws !== null) expect(after.text, `${name} never reached its card`).toContain(draws);
    }
  });

  it("the row was really there to lose: every archetype that declares its keys listed it", () => {
    const listed = PROJECTED_ARCHETYPES.filter((a) => drawn(withNull(population(a)[0].component)).raw.includes("subject_concept"));
    const undeclared = PROJECTED_ARCHETYPES.filter((a) => rawFieldsOf({ archetype: a }).status === "no_declaration");
    expect(undeclared).toEqual(["SOURCE_LEDGER", "INSTANCES_BY_PROPERTY"]);
    expect([...listed, ...undeclared].sort()).toEqual([...PROJECTED_ARCHETYPES].sort());
  });

  it("every package archetype has a capture or fixture that draws rather than refuses", () => {
    for (const archetype of Object.keys(PACKAGES)) {
      const reached = population(archetype).filter(({ component }) => {
        const { container } = render(<SemanticInterpreter payload={{ components: [omitted(component)] }} />);
        const hit = container.querySelector("[data-refused]") === null && (container.textContent ?? "").trim() !== "";
        cleanup();
        return hit;
      });
      expect(reached.length, archetype).toBeGreaterThan(0);
    }
  });
});
