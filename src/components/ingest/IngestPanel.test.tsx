import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { IngestPanel } from "./IngestPanel";

vi.mock("@/lib/ingestFlag", () => ({
  isIngestUiEnabled: vi.fn(() => false),
}));

afterEach(cleanup);

describe("IngestPanel — flag off", () => {
  it("renders nothing when isIngestUiEnabled() is false", () => {
    const { container } = render(<IngestPanel />);
    expect(container.innerHTML).toBe("");
    expect(document.querySelector("[data-ingest-panel]")).toBeNull();
  });
});
