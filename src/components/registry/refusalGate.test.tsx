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

  describe("a refused KNOWLEDGE_DOCUMENT is the refusal block and nothing else (201 supersedes rev 186)", () => {
    const PROSE = "Hazard H-12 is closed; no assessment can be drawn.";
    const doc = (extra: object) => ({ archetype: "KNOWLEDGE_DOCUMENT", ...extra });

    it("draws the refusal ONLY: no prose container, no document text, no raw section", () => {
      const { container } = draw(doc({ markdown_content: PROSE, extra_key: "x", refusal: canonical }));
      const el = refusalEl();
      expect(el, "no [data-refusal]").not.toBeNull();
      expect(el!.getAttribute("role")).toBe("status");
      expect(el!.getAttribute("data-refusal-outcome")).toBe("source_unavailable");
      expect(container.textContent).toContain(REASON);
      expect(container.querySelector("[data-refusal-prose]")).toBeNull();
      expect(container.querySelector("[data-refusal-document]")).toBeNull();
      expect(container.textContent).not.toContain(PROSE);
      expect(container.querySelector("[data-raw-fields]")).toBeNull();
    });

    it.each([[undefined], [""], ["   \n"]])("no prose (%j): card alone", (md) => {
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
      expect(container.querySelector("[data-refusal-prose]")).toBeNull();
      expect(container.querySelector("[data-refusal-document]")).toBeNull();
      expect(container.querySelector("[data-raw-fields]")).toBeNull();
    });

    it("the screenshot shape (part 5530-184): the reason appears once; no JSON layers beneath", () => {
      const reason = "no failures recorded for part '5530-184': no source this engine reads holds a failure for it";
      const reply = {
        refused: true,
        outcome: "no_failures_recorded",
        part_number: "5530-184",
        reason,
        output_uri: "http://internal/sustainment/safety#FailureRecordSet",
      };
      const { container } = draw(
        doc({
          refusal: { refused: true, outcome: "no_failures_recorded", reason },
          markdown_content: "```json\n" + JSON.stringify(reply, null, 2) + "\n```",
          undeclared_extra: { a: 1 },
        }),
      );
      expect(refusalEl()).not.toBeNull();
      const carrying = [...container.querySelectorAll("*")].filter(
        (e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").includes(reason)),
      );
      expect(carrying.length, "reason text must sit in exactly one element").toBe(1);
      expect(refusalEl()!.contains(carrying[0])).toBe(true);
      const outside = [...container.querySelectorAll("*")].filter(
        (e) => !refusalEl()!.contains(e) && !e.contains(refusalEl()!) && (e.textContent ?? "").includes("5530-184"),
      );
      expect(outside).toEqual([]);
      expect(container.querySelector("[data-raw-fields]")).toBeNull();
      expect(container.querySelector("pre")).toBeNull();
      expect(container.querySelector("[data-structured-fields]")).toBeNull();
    });
  });

  describe("saf hazard refusals name the hazard", () => {
    const GAP = "severity is not assessed on this hazard; no risk level is resolved and no authority is implied";
    const CASES: [string, string, string][] = [
      ["hazard_closed", "HAZ-1005", "Hazard closed \u2014 no open risk to accept"],
      ["not_assessed", "HAZ-1006", "Hazard not assessed \u2014 no risk level, no authority"],
      ["unknown_hazard", "HAZ-9999", "Hazard not held \u2014 nothing to assess"],
    ];
    const reasonFor = (id: string) => `hazard '${id}' reason text`;

    it.each(CASES)("%s draws its headline and outcome", (outcome, id, headline) => {
      const { container } = draw({
        archetype: "CONTRIBUTION_RANKING",
        rows: [],
        refusal: { refused: true, outcome, reason: reasonFor(id) },
      });
      expect(refusalEl()!.getAttribute("data-refusal-outcome")).toBe(outcome);
      expect(container.textContent).toContain(headline);
    });

    it("hazard_id and gap render as the chip and the gap line, exact text", () => {
      draw({
        archetype: "CONTRIBUTION_RANKING",
        rows: [],
        refusal: { refused: true, outcome: "not_assessed", reason: reasonFor("HAZ-1006"), hazard_id: "HAZ-1006", gap: GAP },
      });
      const chip = document.querySelector("[data-refusal-hazard]");
      expect(chip, "no hazard chip").not.toBeNull();
      expect(chip!.getAttribute("data-refusal-hazard")).toBe("HAZ-1006");
      expect(chip!.textContent).toBe("HAZ-1006");
      const gap = document.querySelector("[data-refusal-gap]");
      expect(gap, "no gap line").not.toBeNull();
      expect(gap!.textContent).toBe(GAP);
    });

    it("without the keys: no chip, no gap line, and the reason names the hazard", () => {
      const { container } = draw({
        archetype: "CONTRIBUTION_RANKING",
        rows: [],
        refusal: { refused: true, outcome: "not_assessed", reason: reasonFor("HAZ-1006") },
      });
      expect(document.querySelector("[data-refusal-hazard]")).toBeNull();
      expect(document.querySelector("[data-refusal-gap]")).toBeNull();
      expect(container.textContent).toContain("HAZ-1006");
    });

    it("an empty-string hazard_id and gap draw nothing", () => {
      draw({
        archetype: "CONTRIBUTION_RANKING",
        rows: [],
        refusal: { refused: true, outcome: "hazard_closed", reason: "r", hazard_id: "", gap: "" },
      });
      expect(document.querySelector("[data-refusal-hazard]")).toBeNull();
      expect(document.querySelector("[data-refusal-gap]")).toBeNull();
    });

    it("an unknown outcome still reads Refused", () => {
      const { container } = draw({
        archetype: "CONTRIBUTION_RANKING",
        rows: [],
        refusal: { refused: true, outcome: "some_future_outcome", reason: "r" },
      });
      expect(container.textContent).toContain("Refused");
    });

    it("KNOWLEDGE_DOCUMENT: not_assessed card with its headline, and NO prose (201)", () => {
      const PROSE = "No assessment draft can be written for this hazard.";
      const { container } = draw({
        archetype: "KNOWLEDGE_DOCUMENT",
        markdown_content: PROSE,
        refusal: { refused: true, outcome: "not_assessed", reason: reasonFor("HAZ-1006"), hazard_id: "HAZ-1006", gap: GAP },
      });
      const el = refusalEl()!;
      expect(el.textContent).toContain("Hazard not assessed — no risk level, no authority");
      expect(el.querySelector("[data-refusal-gap]")!.textContent).toBe(GAP);
      expect(container.querySelector("[data-refusal-prose]")).toBeNull();
      expect(container.textContent).not.toContain(PROSE);
      expect(container.querySelector("[data-raw-fields]")).toBeNull();
    });
  });
});