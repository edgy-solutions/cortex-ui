import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Waterfall } from "./Card";
import { WATERFALL_NOTE_KINDS } from "./contract";
import { archetypePackage } from "../registry";
import { readDeclaredAbsences } from "../defineArchetype";
import { SIGN_NEGATIVE, SIGN_POSITIVE } from "@/lib/chartPalette";
import { STEP_ORDER, WATERFALL_ABSENCES, WATERFALL_FIXTURES, WATERFALL_PROVENANCE, good } from "./fixtures";
import { FLOW_DECOMPOSITION_FIXTURES } from "../flow-decomposition/fixtures";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";

afterEach(cleanup);

const draw = (payload: Record<string, unknown>) => render(<Waterfall {...payload} />);
const q = (c: HTMLElement, sel: string) => [...c.querySelectorAll(sel)];
const GOOD = WATERFALL_FIXTURES[0];

describe("WATERFALL fixtures discriminate", () => {
  it.each(WATERFALL_FIXTURES.map((f) => [f.name, f] as const))("%s — declares exactly what it names", (_n, f) => {
    const { container } = draw(f.payload);
    expect(readDeclaredAbsences(container, WATERFALL_ABSENCES).sort()).toEqual([...f.declares].sort());
  });

  it("every absence flips, both directions", () => {
    for (const a of WATERFALL_ABSENCES) {
      expect(WATERFALL_FIXTURES.some((f) => f.declares.includes(a)), `${a} never declared`).toBe(true);
      expect(WATERFALL_FIXTURES.some((f) => !f.declares.includes(a)), `${a} declared by all`).toBe(true);
    }
  });

  it("the registry's Card IS this file's Card", () => {
    expect(archetypePackage("WATERFALL")!.Card).toBe(Waterfall);
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const src = readFileSync(join(__dirname, "Card.tsx"), "utf8");
    const unique = [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
    const covered = new Set<string>(["data-archetype", ...WATERFALL_ABSENCES]);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an attribute no fixture flips").toEqual([]);
  });

  it("the card source names no domain word", () => {
    for (const f of ["Card.tsx", "contract.ts", "model.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src, f).not.toMatch(/\bEAC\b|\bcost|\baccount|work package/i);
    }
  });
});

describe("drawing", () => {
  it("draws start, each step in SERVED order, then end, with the served labels verbatim", () => {
    const { container } = draw(GOOD.payload);
    const bars = q(container, "[data-waterfall-bar]");
    expect(bars.map((b) => b.getAttribute("data-waterfall-bar"))).toEqual(["start", "step", "step", "step", "step", "end"]);
    expect(bars.map((b) => b.querySelector("text:last-of-type")!.textContent)).toEqual([
      "Opening total",
      ...STEP_ORDER,
      "Closing total",
    ]);
  });

  it("each step shows its signed amount as text, and the totals are plain", () => {
    const { container } = draw(GOOD.payload);
    const amounts = q(container, "[data-waterfall-bar]").map((b) => b.querySelector("text")!.textContent);
    expect(amounts).toEqual(["1,000", "+40.5", "+300", "+109.5", "−250", "1,200"]);
  });

  it("the remainder bar carries the served other_label and the remainder mark", () => {
    const { container } = draw(good({ render: { shape: "WATERFALL", other_label: "Everything else" } }));
    const mark = container.querySelector("[data-waterfall-remainder]")!;
    expect(mark.textContent).toContain("Everything else");
  });

  it("step colour follows the sign, from the tokens", () => {
    const { container } = draw(GOOD.payload);
    for (const g of q(container, "[data-waterfall-sign]")) {
      const sign = g.getAttribute("data-waterfall-sign");
      expect(g.querySelector("rect")!.getAttribute("fill")).toBe(sign === "positive" ? SIGN_POSITIVE : SIGN_NEGATIVE);
    }
  });

  it("a connector joins each pair of neighbouring bars", () => {
    const { container } = draw(GOOD.payload);
    expect(q(container, "[data-waterfall-connector]")).toHaveLength(5);
  });

  it("the header reads render's label and unit", () => {
    expect(draw({ ...GOOD.payload, value_label: "row name" }).container.querySelector("h3")?.textContent).toBe("Net movement (USD)");
  });

  it("is a fluid SVG that cannot overflow a 640px preview", () => {
    const { container } = draw(GOOD.payload);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("viewBox")).toBeTruthy();
    expect(svg.style.maxWidth).toBe("100%");
  });
});

describe("refusal, notes and the banner", () => {
  it("a refusal names its reason and the gap, and draws no chart", () => {
    const f = WATERFALL_FIXTURES.find((x) => x.name.startsWith("walk_unbalanced"))!;
    const { container } = draw(f.payload);
    expect(container.querySelector("[data-waterfall-refusal]")!.getAttribute("data-waterfall-refusal")).toBe("walk_unbalanced");
    expect(container.textContent).toContain("gap 0.01");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("each note kind that a fixture names renders its own line and still draws", () => {
    for (const kind of WATERFALL_NOTE_KINDS.filter((k) => WATERFALL_FIXTURES.some((f) => f.name.startsWith(k)))) {
      const f = WATERFALL_FIXTURES.find((x) => x.name.startsWith(kind))!;
      const { container } = draw(f.payload);
      expect(q(container, "[data-waterfall-note]").map((n) => n.getAttribute("data-waterfall-note")), kind).toEqual([kind]);
      expect(container.querySelector("[data-waterfall-bar]"), `${kind} still draws`).not.toBeNull();
      cleanup();
    }
  });

  it("the banner is verbatim and precedes the chart; a refusal still shows it", () => {
    const { container } = draw(GOOD.payload);
    const el = container.querySelector("[data-waterfall-provenance]")!;
    expect(el.textContent).toBe(WATERFALL_PROVENANCE);
    expect(el.compareDocumentPosition(container.querySelector("svg")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    const { walk: _w, ...noWalk } = GOOD.payload;
    const refused = draw(noWalk);
    expect(refused.container.querySelector("[data-waterfall-refusal]")).not.toBeNull();
    expect(refused.container.querySelector("[data-waterfall-provenance]")?.textContent).toBe(WATERFALL_PROVENANCE);
  });
});

describe("chosen by the served shape, never inferred", () => {
  it("a FLOW_DECOMPOSITION payload carrying a walk still draws as the Sankey", () => {
    const flow = FLOW_DECOMPOSITION_FIXTURES[1].payload;
    const withWalk = { ...flow, walk: good().walk };
    const { container } = render(<SemanticInterpreter payload={{ components: [{ archetype: "FLOW_DECOMPOSITION", ...withWalk }] }} />);
    expect(container.querySelector('[data-archetype="FLOW_DECOMPOSITION"]')).not.toBeNull();
    expect(container.querySelector('[data-archetype="WATERFALL"]')).toBeNull();
    expect(container.querySelector("[data-waterfall-bar]")).toBeNull();
  });
});

describe("dispatch", () => {
  it("a WATERFALL component reaches this card through the interpreter, with its walk", () => {
    const { container } = render(
      <SemanticInterpreter payload={{ components: [{ archetype: "WATERFALL", ...GOOD.payload }] }} />,
    );
    expect(container.querySelector('[data-archetype="WATERFALL"]'), "no WATERFALL case in SemanticInterpreter").not.toBeNull();
    expect(q(container, "[data-waterfall-bar]").map((b) => b.getAttribute("data-waterfall-bar"))).toEqual([
      "start", "step", "step", "step", "step", "end",
    ]);
  });
});
