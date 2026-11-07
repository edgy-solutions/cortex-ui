import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FlowDecomposition } from "./Card";
import { FLOW_NOTE_KINDS } from "./contract";
import { archetypePackage } from "../registry";
import { readDeclaredAbsences } from "../defineArchetype";
import { SIGN_NEGATIVE, SIGN_POSITIVE } from "@/lib/chartPalette";
import { FLOW_DECOMPOSITION_ABSENCES, FLOW_DECOMPOSITION_FIXTURES, GOOD_PROVENANCE, LOOKALIKE_TREE, edgesOf, plain, plainRows } from "./fixtures";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";

afterEach(cleanup);

const draw = (payload: Record<string, unknown>) => render(<FlowDecomposition {...payload} />);
const GOOD = FLOW_DECOMPOSITION_FIXTURES[0];
const q = (c: HTMLElement, sel: string) => [...c.querySelectorAll(sel)];

describe("FLOW_DECOMPOSITION fixtures discriminate", () => {
  it.each(FLOW_DECOMPOSITION_FIXTURES.map((f) => [f.name, f] as const))("%s — declares exactly what it names", (_n, f) => {
    const { container } = draw(f.payload);
    expect(readDeclaredAbsences(container, FLOW_DECOMPOSITION_ABSENCES).sort()).toEqual([...f.declares].sort());
  });

  it("every absence flips, both directions", () => {
    for (const a of FLOW_DECOMPOSITION_ABSENCES) {
      expect(FLOW_DECOMPOSITION_FIXTURES.some((f) => f.declares.includes(a)), `${a} never declared`).toBe(true);
      expect(FLOW_DECOMPOSITION_FIXTURES.some((f) => !f.declares.includes(a)), `${a} declared by all`).toBe(true);
    }
  });

  it("the registry's Card IS this file's Card", () => {
    expect(archetypePackage("FLOW_DECOMPOSITION")!.Card).toBe(FlowDecomposition);
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const src = readFileSync(join(__dirname, "Card.tsx"), "utf8");
    const unique = [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
    const covered = new Set<string>(["data-archetype", ...FLOW_DECOMPOSITION_ABSENCES]);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an attribute no fixture flips").toEqual([]);
  });

  it("the card source names no domain word", () => {
    for (const f of ["Card.tsx", "contract.ts", "model.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src, f).not.toMatch(/\bEAC\b|\bcost|\baccount|work package/i);
    }
  });
});

describe("refusal and notes", () => {
  it("a refusal names its reason and draws no chart", () => {
    const f = FLOW_DECOMPOSITION_FIXTURES.find((x) => x.name.startsWith("sink_has_children"))!;
    const { container } = draw(f.payload);
    expect(container.querySelector("[data-flow-refusal]")!.getAttribute("data-flow-refusal")).toBe("sink_has_children");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("each note kind renders its own line", () => {
    for (const kind of FLOW_NOTE_KINDS) {
      const f = FLOW_DECOMPOSITION_FIXTURES.find((x) => x.name.startsWith(kind))!;
      const { container } = draw(f.payload);
      expect(q(container, "[data-flow-note]").map((n) => n.getAttribute("data-flow-note")), kind).toEqual([kind]);
      expect(container.querySelector("[data-flow-node]"), `${kind} still draws`).not.toBeNull();
      cleanup();
    }
  });
});

describe("the provenance banner", () => {
  const banner = (c: HTMLElement) => c.querySelector("[data-flow-provenance]")?.textContent;
  it("is drawn verbatim, before the chart", () => {
    const { container } = draw(GOOD.payload);
    expect(banner(container)).toBe(GOOD_PROVENANCE);
    const el = container.querySelector("[data-flow-provenance]")!;
    const svg = container.querySelector("svg")!;
    expect(el.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING, "banner precedes the chart").toBeTruthy();
  });
  it("a blank string draws none", () => {
    expect(banner(draw(plain(plainRows(), { data_provenance: "  " })).container)).toBeUndefined();
  });
  it("a refusal still shows it, because its raw fields carry figures", () => {
    const f = FLOW_DECOMPOSITION_FIXTURES.find((x) => x.name.startsWith("sink_has_children"))!;
    const { container } = draw({ ...f.payload, data_provenance: GOOD_PROVENANCE });
    expect(container.querySelector("[data-flow-refusal]")).not.toBeNull();
    expect(banner(container)).toBe(GOOD_PROVENANCE);
  });
});

describe("the header reads render.value_label", () => {
  const h3 = (payload: Record<string, unknown>) => draw(payload).container.querySelector("h3")?.textContent;
  it("render's label and unit, not the top-level echo", () => {
    expect(h3({ ...GOOD.payload, value_label: "row name" })).toBe("Net amount (USD)");
  });
  it("the top-level value_label only when render has none", () => {
    expect(h3(plain(plainRows(), { value_label: "row name", render: { other_label: "All other" } }))).toBe("row name");
  });
});

describe("drawing", () => {
  it("colour follows the sign, from the tokens", () => {
    const { container } = draw(GOOD.payload);
    for (const n of q(container, "[data-flow-node]")) {
      const sign = n.getAttribute("data-flow-sign");
      const fill = n.querySelector("rect")!.getAttribute("fill");
      expect(fill, n.getAttribute("data-flow-node")!).toBe(sign === "positive" ? SIGN_POSITIVE : SIGN_NEGATIVE);
    }
    for (const l of q(container, "path[data-flow-link]")) {
      const sign = l.getAttribute("data-flow-sign");
      expect(l.getAttribute("stroke")).toBe(sign === "positive" ? SIGN_POSITIVE : SIGN_NEGATIVE);
    }
    expect(SIGN_POSITIVE).not.toBe(SIGN_NEGATIVE);
  });

  it("zero draws no node and no band", () => {
    const { container } = draw(GOOD.payload);
    expect(q(container, '[data-flow-sign="zero"]')).toHaveLength(0);
    expect(q(container, "[data-flow-node]").some((n) => /B3|B4/.test(n.getAttribute("data-flow-node")!))).toBe(false);
  });

  it("columns: x grows with level", () => {
    const { container } = draw(GOOD.payload);
    const x = (path: string) => Number(container.querySelector(`[data-flow-node="${path}"] rect`)!.getAttribute("x"));
    expect(x("Program")).toBeLessThan(x("Program / Group A"));
    expect(x("Program / Group A")).toBeLessThan(x("Program / Group A / Item A1"));
    expect(x("Program / Group A / Item A1")).toBeLessThan(x("Program / Group A / Item A1 / Part A1a / Piece A1a1"));
    // a leaf stays in ITS column; it is not pushed to the last one
    const leaf = x("Program / Group A / Item A1 / Part A1b");
    expect(leaf).toBe(x("Program / Group A / Item A1 / Part A1a"));
    expect(leaf).toBeLessThan(x("Program / Group A / Item A1 / Part A1a / Piece A1a1"));
  });

  it("labels carry U+2212 for negatives and the unit only when served", () => {
    const withUnit = draw(GOOD.payload).container;
    expect(withUnit.textContent).toContain("−300.5 USD");
    cleanup();
    const without = draw(FLOW_DECOMPOSITION_FIXTURES[1].payload).container;
    expect(without.textContent).toContain("−10");
    expect(without.textContent).not.toContain("USD");
    expect(without.textContent).not.toMatch(/-\d/);
  });

  it("a sink is marked by node_kind, not by its label", () => {
    const { container } = draw(plain(edgesOf(LOOKALIKE_TREE)));
    const sinks = q(container, "[data-flow-node][data-flow-sink]").map((n) => n.getAttribute("data-flow-node"));
    expect(sinks).toEqual(["Total / Branch / Remainder"]);
    expect(container.querySelector('[data-flow-node="Total / Branch / All other"]')!.hasAttribute("data-flow-sink")).toBe(false);
    // only the sink continues to the last column
    expect(q(container, "path[data-flow-passthrough]").map((p) => p.getAttribute("data-flow-passthrough"))).toEqual([
      "Total / Branch / Remainder",
    ]);
  });

  it("pass-through bands exist for sinks above the last column", () => {
    const { container } = draw(GOOD.payload);
    expect(q(container, "path[data-flow-passthrough]").length).toBeGreaterThan(0);
  });
});

describe("click to focus", () => {
  const click = (c: HTMLElement, path: string) => fireEvent.click(c.querySelector(`[data-flow-node="${path}"] rect`)!);
  const crumbs = (c: HTMLElement) => q(c, "[data-flow-crumb]").map((b) => b.getAttribute("data-flow-crumb"));

  it("focuses a subtree, breadcrumbs walk back, the first crumb returns to the whole", () => {
    const { container } = draw(GOOD.payload);
    const whole = q(container, "[data-flow-node]").length;
    click(container, "Program / Group A");
    expect(crumbs(container)).toEqual(["Program", "Group A"]);
    expect(q(container, "[data-flow-node]").length).toBeLessThan(whole);
    expect(container.querySelector('[data-flow-node="Program / Group B"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-flow-crumb="Program"]')!);
    expect(crumbs(container)).toEqual(["Program"]);
    expect(q(container, "[data-flow-node]")).toHaveLength(whole);
  });

  it("clicking the focused node returns to the whole", () => {
    const { container } = draw(GOOD.payload);
    click(container, "Program / Group A");
    click(container, "Program / Group A");
    expect(crumbs(container)).toEqual(["Program"]);
  });

  it("a leaf and a sink change nothing", () => {
    const { container } = draw(GOOD.payload);
    click(container, "Program / Group A");
    const before = container.innerHTML;
    click(container, "Program / Group A / Item A1 / Part A1b");
    click(container, "Program / Group A / All other");
    expect(container.innerHTML).toBe(before);
  });
});

describe("dispatch", () => {
  it("SemanticInterpreter draws the card from a component, no flag", () => {
    render(<SemanticInterpreter payload={{ components: [{ archetype: "FLOW_DECOMPOSITION", ...GOOD.payload }] }} />);
    expect(document.querySelector('[data-archetype="FLOW_DECOMPOSITION"]')).not.toBeNull();
    expect(document.querySelector("[data-flow-node]")).not.toBeNull();
  });
});
