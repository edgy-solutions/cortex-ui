import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { TriageTaskCard, type TriageTaskPayload } from "./TriageTaskCard";

afterEach(cleanup);
const task = (warnings: unknown[]): TriageTaskPayload => ({
  task_id: "t1", kind: "k", title: "T", summary: "s", audience: "a",
  requested_by: "r", subject_ref: null, warnings,
});

describe("TriageTaskCard warnings", () => {
  it("raw multi-line text never reaches the card; a bounded warning shows", () => {
    const { container } = render(
      <TriageTaskCard task={task(["raw\nRAW_PROMPT_SENTINEL", "2 of 5 crops timed out"])} />,
    );
    expect(container.innerHTML).not.toContain("RAW_PROMPT_SENTINEL");
    expect(container.textContent).toContain("2 of 5 crops timed out");
    expect(container.textContent).toContain("detail withheld");
  });
});
