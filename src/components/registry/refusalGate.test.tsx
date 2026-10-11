/**
 * THE REFUSAL GATE (invincible-agent PR #13): a component carrying a `refusal` envelope draws
 * as a refusal for every archetype, never as the card's own empty state.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { SemanticInterpreter } from "./SemanticInterpreter";

afterEach(cleanup);

const REASON = "the connector could not read the source";
const canonical = {
  refused: true,
  outcome: "source_unavailable",
  reason: REASON,
  connector: "saf-sql",
  fn: "incident_rate",
};

const TABLE: [string, string][] = [
  ["INTERVAL_TIMELINE", "rows"],
  ["PERIOD_SERIES", "rows"],
  ["COMPETING_MEASURES", "rows"],
  ["STEP_LADDER", "steps"],
  ["THRESHOLD_GRID", "rows"],
  ["MATRIX_GRID", "rows"],
  ["DELTA_SET", "effects"],
  ["CANVAS_SEED", "artifact_ids"],
  ["SHORTFALL_GRID", "rows"],
  ["VARIANCE_TREE", "rows"],
  ["CONTRIBUTION_RANKING", "rows"],
  ["FORECAST_MEASURE", "rows"],
  ["MULTI_SERIES", "rows"],
  ["SOURCE_LEDGER", "rows"],
];

const draw = (comp: object) => render(<SemanticInterpreter payload={{ components: [comp] }} />);
const refusalEl = () => document.querySelector("[data-refusal]");

describe("the refusal gate", () => {
  it("the population table has 14 entries and every archetype is dispatched", () => {
    expect(TABLE.length).toBe(14);
    const src = readFileSync(__dirname + "/SemanticInterpreter.tsx", "utf8");
    for (const [a] of TABLE) {
      // CANVAS_SEED has no `case`: it reaches renderComponent through the acted-on `default`
      // branch (a named check below it), so it IS gated, but is asserted by name instead.
      if (a === "CANVAS_SEED") expect(src).toContain('"CANVAS_SEED"');
      else expect(src, `no case for ${a}`).toContain(`case "${a}"`);
    }
  });

  it.each(TABLE)("%s with a refusal envelope draws a refusal", (archetype, key) => {
    const { container } = draw({ archetype, [key]: [], refusal: canonical });
    const el = refusalEl();
    expect(el, `${archetype}: no [data-refusal]`).not.toBeNull();
    expect(el!.getAttribute("data-refusal-outcome")).toBe("source_unavailable");
    expect(container.textContent, `${archetype}: reason missing`).toContain(REASON);
    expect(container.textContent, `${archetype}: drew an empty state`).not.toMatch(/\bno\b[^.]*\brecorded\b/i);
  });

  it("FRACAS: CONTRIBUTION_RANKING and MULTI_SERIES say the source could not be read", () => {
    for (const [archetype, empty] of [
      ["CONTRIBUTION_RANKING", /no contributors/i],
      ["MULTI_SERIES", /no periods/i],
    ] as const) {
      const { container } = draw({ archetype, rows: [], refusal: canonical });
      const t = container.textContent ?? "";
      expect(t, `${archetype}: headline`).toContain("could not be read");
      expect(t, `${archetype}: connector`).toContain("saf-sql");
      expect(t, `${archetype}: empty state drawn`).not.toMatch(empty);
      cleanup();
    }
  });

  it.each([
    ["engine_fault", "The engine failed to answer"],
    ["not_in_model", "Refused"],
    ["refused", "Refused"],
  ])("outcome %s draws [data-refusal]", (outcome, headline) => {
    const { container } = draw({
      archetype: "CONTRIBUTION_RANKING",
      rows: [],
      refusal: { refused: true, outcome, reason: null },
    });
    expect(refusalEl()!.getAttribute("data-refusal-outcome")).toBe(outcome);
    expect(container.textContent).toContain(headline);
    expect(container.textContent).toContain("No reason given");
  });

  it("CONTROL: without the envelope the card draws its own empty state", () => {
    const { container } = draw({ archetype: "CONTRIBUTION_RANKING", rows: [] });
    expect(refusalEl()).toBeNull();
    expect(container.textContent).toMatch(/no contributors recorded/i);
  });

  describe("a refused KNOWLEDGE_DOCUMENT keeps its prose (rev 186)", () => {
    const PROSE = "Hazard H-12 is closed; no assessment can be drafted.";
    const doc = (extra: object) => ({ archetype: "KNOWLEDGE_DOCUMENT", ...extra });

    it("draws the refusal, then the prose beneath it", () => {
      const { container } = draw(doc({ markdown_content: PROSE, refusal: canonical }));
      const el = refusalEl();
      expect(el, "no [data-refusal]").not.toBeNull();
      expect(el!.getAttribute("role")).toBe("status");
      expect(el!.getAttribute("data-refusal-outcome")).toBe("source_unavailable");
      expect(container.textContent).toContain(REASON);
      const prose = container.querySelector("[data-refusal-document] [data-refusal-prose]");
      expect(prose, "prose container missing").not.toBeNull();
      expect(prose!.textContent).toContain(PROSE);
      expect(el!.compareDocumentPosition(prose!) & Node.DOCUMENT_POSITION_FOLLOWING, "prose not after card").toBeTruthy();
    });

    it.each([[undefined], [""], ["   \n"]])("no prose (%j): card alone, no empty prose box", (md) => {
      const { container } = draw(doc({ ...(md === undefined ? {} : { markdown_content: md }), refusal: canonical }));
      expect(refusalEl()).not.toBeNull();
      expect(container.querySelector("[data-refusal-prose]")).toBeNull();
    });

    it("CONTROL: without a refusal the prose renders and there is no refusal", () => {
      const { container } = draw(doc({ markdown_content: PROSE }));
      expect(refusalEl()).toBeNull();
      expect(container.querySelector("[data-refusal-document]")).toBeNull();
      expect(container.textContent).toContain(PROSE);
    });

    it("a non-document archetype with a prose-like field stays refusal-only", () => {
      const { container } = draw({ archetype: "SHORTFALL_GRID", rows: [], markdown_content: PROSE, refusal: canonical });
      expect(refusalEl()).not.toBeNull();
      // (the card itself lists undeclared fields under "Raw"; that is today's behaviour)
      expect(container.querySelector("[data-refusal-prose]")).toBeNull();
      expect(container.querySelector("[data-refusal-document]")).toBeNull();
    });
  });
});
