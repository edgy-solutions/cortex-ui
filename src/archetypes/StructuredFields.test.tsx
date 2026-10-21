import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StructuredFields, StructuredValue } from "./StructuredFields";

afterEach(cleanup);

describe("StructuredValue", () => {
  it.each([
    ["s", "s"],
    [1234.5, "1234.5"],
    [true, "true"],
    [false, "false"],
    [null, "null"],
    [undefined, "undefined"],
  ])("scalar %j is verbatim %j", (v, out) => {
    const { container } = render(<StructuredValue value={v} />);
    expect(container.textContent).toBe(out);
    expect(container.querySelector("details")).toBeNull();
  });

  it("object -> closed details `{N keys}` with a nested table", () => {
    const { container } = render(<StructuredValue value={{ a: 1, b: { c: 2 } }} />);
    const d = container.querySelector("details")!;
    expect(d.hasAttribute("open")).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("{2 keys}");
    expect(d.querySelector('[data-structured-field="a"]')).not.toBeNull();
    expect(container.querySelectorAll("details").length).toBe(2);
  });

  it("array -> `[N items]` with an ordered list", () => {
    const { container } = render(<StructuredValue value={["x", 2]} />);
    expect(container.querySelector("summary")!.textContent).toBe("[2 items]");
    expect([...container.querySelectorAll("ol > li")].map((e) => e.textContent)).toEqual(["x", "2"]);
  });

  it("empty containers", () => {
    expect(render(<StructuredValue value={{}} />).container.textContent).toBe("{0 keys}");
    cleanup();
    expect(render(<StructuredValue value={[]} />).container.textContent).toBe("[0 items]");
  });

  it("stops pointerdown on summaries", () => {
    let reached = false;
    const { container } = render(
      <div onPointerDown={() => (reached = true)}>
        <StructuredValue value={{ a: 1 }} />
      </div>,
    );
    container.querySelector("summary")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(reached).toBe(false);
  });
});

describe("StructuredFields", () => {
  it("names the missing render and lists keys sorted", () => {
    const { container } = render(<StructuredFields fields={{ b: 1, a: "x" }} archetype="NEW_THING" />);
    expect(container.querySelector('[data-no-render-registered="NEW_THING"]')!.textContent).toBe(
      "no render registered for NEW_THING",
    );
    expect(container.querySelector("[data-structured-fields]")!.getAttribute("data-structured-fields")).toBe("2");
    expect([...container.querySelectorAll("tr[data-structured-field]")].map((e) => e.getAttribute("data-structured-field"))).toEqual(["a", "b"]);
    expect(container.querySelector("pre")).toBeNull();
  });

  it("notDrawn: names the render that did not draw and why, and does NOT claim none is registered", () => {
    const { container } = render(<StructuredFields fields={{ a: 1 }} archetype="WORKFLOW_CASE" notDrawn="no case" />);
    expect(container.querySelector('[data-render-not-drawn="WORKFLOW_CASE"]')!.textContent).toBe(
      "WORKFLOW_CASE render not drawn: no case",
    );
    expect(container.querySelector("[data-no-render-registered]")).toBeNull();
    expect(container.querySelector("[data-structured-fields]")!.getAttribute("data-structured-fields")).toBe("1");
  });
});
