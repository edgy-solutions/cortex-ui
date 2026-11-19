import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { WarningLines } from "./WarningLines";

afterEach(cleanup);
const FIX = [
  "line one\nRAW_PROMPT_SENTINEL more",
  "x".repeat(1990) + "RAW_MODEL_SENTINEL",
  { code: "SOME_CODE", message: "2 of 5 table crops timed out", telemetry_ref: "trace-abc123" },
];
const noSentinel = (h: string) => {
  expect(h).not.toContain("RAW_PROMPT_SENTINEL");
  expect(h).not.toContain("RAW_MODEL_SENTINEL");
};

describe("WarningLines", () => {
  it("never renders withheld text, collapsed or expanded", () => {
    const { container } = render(<WarningLines warnings={FIX} heading="h" />);
    noSentinel(container.innerHTML);
    expect(container.querySelectorAll("[data-warning-line]")).toHaveLength(3);
    expect(container.textContent!.split("detail withheld").length - 1).toBe(2);
    expect(container.textContent).toContain("SOME_CODE");
    expect(container.textContent).toContain("2 of 5 table crops timed out");
    container.querySelectorAll("button").forEach((b) => fireEvent.click(b));
    noSentinel(container.innerHTML);
    expect(container.querySelectorAll("[data-warning-detail]")).toHaveLength(3);
  });
  it("telemetry ref only after the click, on that line only", () => {
    const { container } = render(<WarningLines warnings={FIX} heading="h" />);
    expect(container.innerHTML).not.toContain("trace-abc123");
    const line = container.querySelectorAll("[data-warning-line]")[2];
    fireEvent.click(line.querySelector("button")!);
    expect(line.innerHTML).toContain("trace-abc123");
    expect(container.querySelectorAll("[data-warning-detail]")).toHaveLength(1);
    expect(line.querySelector("a")).toBeNull();
  });
  it("a plain bounded string is not a button", () => {
    const { container } = render(<WarningLines warnings={["short"]} heading="h" />);
    expect(container.querySelector("button")).toBeNull();
  });
  it("empty renders nothing", () => {
    const { container } = render(<WarningLines warnings={[]} heading="h" />);
    expect(container.innerHTML).toBe("");
  });
});
