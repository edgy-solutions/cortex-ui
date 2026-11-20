import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RefusalCard } from "./RefusalCard";
import { readRefusalEnvelope } from "@/lib/refusalEnvelope";

afterEach(cleanup);

const env = (extra: Record<string, unknown>) =>
  readRefusalEnvelope({
    refusal: { refused: true, outcome: "source_unavailable", reason: "configuration_not_available", connector: "saf-sql", fn: "rate", ...extra },
  })!;
const draw = (e: ReturnType<typeof env>) => render(<RefusalCard envelope={e} />).container;

describe("RefusalCard message", () => {
  it("draws the message; the code and source appear only after the toggle", () => {
    const c = draw(env({ message: "No configuration is held for this part." }));
    expect(c.querySelector("[data-refusal-message]")!.textContent).toBe("No configuration is held for this part.");
    expect(c.textContent).not.toContain("configuration_not_available");
    expect(c.querySelector("[data-refusal-detail]")).toBeNull();
    const t = c.querySelector("[data-refusal-detail-toggle]")!;
    expect(t.textContent).toBe("detail");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(t);
    expect(t.getAttribute("aria-expanded")).toBe("true");
    const d = c.querySelector("[data-refusal-detail]")!;
    expect(d.textContent).toContain("configuration_not_available");
    expect(d.textContent).toContain("saf-sql · rate");
    expect(c.querySelector("[data-refusal-outcome]")!.getAttribute("data-refusal-outcome")).toBe("source_unavailable");
    fireEvent.click(t);
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(c.querySelector("[data-refusal-detail]")).toBeNull();
  });

  it("no message draws the code as today", () => {
    const c = draw(env({}));
    expect(c.textContent).toContain("configuration_not_available");
    expect(c.querySelector("[data-refusal-message]")).toBeNull();
    expect(c.querySelector("[data-refusal-detail-toggle]")).toBeNull();
  });

  it("over-long, multi-line and non-string messages draw today's rendering", () => {
    for (const bad of ["x".repeat(161), "a\nb", 7]) {
      const e = env({ message: bad });
      expect("message" in e).toBe(false);
      const c = draw(e);
      expect(c.querySelector("[data-refusal-message]")).toBeNull();
      expect(c.textContent).toContain("configuration_not_available");
      cleanup();
    }
  });

  it("message with a null reason: the toggle shows the source only", () => {
    const c = draw(env({ message: "Plain.", reason: null }));
    fireEvent.click(c.querySelector("[data-refusal-detail-toggle]")!);
    expect(c.querySelector("[data-refusal-detail]")!.textContent).toBe("saf-sql · rate");
  });

  it("message with nothing to detail: no toggle", () => {
    const c = draw(env({ message: "Plain.", reason: null, connector: undefined, fn: undefined }));
    expect(c.querySelector("[data-refusal-detail-toggle]")).toBeNull();
    expect(c.querySelector("[data-refusal-message]")!.textContent).toBe("Plain.");
  });
});

describe("RefusalCard served lists", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => `E${i + 1}`);
  const lis = (c: Element) => c.querySelectorAll("[data-served-list-item]");

  it("with a message, items show without opening detail and sit outside it", () => {
    const c = draw(env({ message: "Plain.", lists: [{ items: ["E1", "E2"] }] }));
    expect(Array.from(lis(c)).map((l) => l.textContent)).toEqual(["E1", "E2"]);
    expect(c.querySelector("[data-refusal-detail]")).toBeNull();
    fireEvent.click(c.querySelector("[data-refusal-detail-toggle]")!);
    const d = c.querySelector("[data-refusal-detail]")!;
    expect(d.querySelector("[data-served-list-item]")).toBeNull();
    expect(d.querySelector("[data-served-lists]")).toBeNull();
    expect(lis(c).length).toBe(2);
  });
  it("without a message, items show too", () => {
    const c = draw(env({ lists: [{ items: ["E1", "E2"] }] }));
    expect(c.querySelector("[data-refusal-message]")).toBeNull();
    expect(Array.from(lis(c)).map((l) => l.textContent)).toEqual(["E1", "E2"]);
  });
  it("the label is drawn", () => {
    const c = draw(env({ lists: [{ label: "End items with no data", items: ["E1"] }] }));
    expect(c.querySelector("[data-served-list-label]")!.textContent).toBe("End items with no data");
  });
  it("no label, no label element", () => {
    const c = draw(env({ lists: [{ items: ["E1"] }] }));
    expect(c.querySelector("[data-served-list-label]")).toBeNull();
  });
  it("10 items draw 8; the toggle shows 10, then 8 again", () => {
    const c = draw(env({ lists: [{ items: items(10) }] }));
    expect(lis(c).length).toBe(8);
    const t = c.querySelector("[data-served-list-toggle]")!;
    expect(t.textContent).toBe("show all 10");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(t);
    expect(lis(c).length).toBe(10);
    expect(t.textContent).toBe("show fewer");
    expect(t.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(t);
    expect(lis(c).length).toBe(8);
    expect(c.querySelector("[data-served-list-more]")).toBeNull();
  });
  it("8 items draw 8 with no toggle", () => {
    const c = draw(env({ lists: [{ items: items(8) }] }));
    expect(lis(c).length).toBe(8);
    expect(c.querySelector("[data-served-list-toggle]")).toBeNull();
  });
  it("total 5 with 2 items says 3 more not shown", () => {
    const c = draw(env({ lists: [{ items: ["E1", "E2"], total: 5 }] }));
    expect(c.querySelector("[data-served-list-more]")!.textContent).toBe("3 more not shown");
    expect(lis(c).length).toBe(2);
  });
  it("total equal to the items says nothing more", () => {
    const c = draw(env({ lists: [{ items: ["E1", "E2"], total: 2 }] }));
    expect(c.querySelector("[data-served-list-more]")).toBeNull();
  });
  it("each list keeps its own toggle state", () => {
    const c = draw(env({ lists: [{ items: items(10) }, { items: items(10) }] }));
    fireEvent.click(c.querySelectorAll("[data-served-list-toggle]")[0]);
    const lists = c.querySelectorAll("[data-served-list]");
    expect(lists[0].querySelectorAll("[data-served-list-item]").length).toBe(10);
    expect(lists[1].querySelectorAll("[data-served-list-item]").length).toBe(8);
  });
  it("no lists draws no [data-served-lists]", () => {
    expect(draw(env({})).querySelector("[data-served-lists]")).toBeNull();
    expect(draw(env({ lists: [] })).querySelector("[data-served-lists]")).toBeNull();
  });
});
