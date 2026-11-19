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
