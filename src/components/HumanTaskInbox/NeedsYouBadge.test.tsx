import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

import { toast } from "sonner";
import { NeedsYouBadge } from "./NeedsYouBadge";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { ingestToArtifact, type IngestEntry } from "@/lib/ingestArtifact";
import { readIngestStatusRow, type IngestStatusRow } from "@/lib/ingestWire";

const T = 1790860800000;
const sha = (n: string) => `sha256:${n.padEnd(64, "0")}`;
const wireRow = (n: string, stage: string): IngestStatusRow =>
  readIngestStatusRow({
    ingest_id: sha(n), sha256: sha(n).slice(7), kind: "pdf", stage, detail: null, duplicate: null,
    created_at: T, updated_at: T, origin: null, case_id: null,
  })!;
const drop = (n: string, stage: string) => {
  const e: IngestEntry = {
    key: sha(n), filename: `${n}.pdf`, kind: "pdf", droppedAt: T, phase: "status", ingestId: sha(n), error: null,
    acceptedThisSession: true, duplicate: null, note: null, notFound: false, row: wireRow(n, stage),
  };
  return ingestToArtifact(e);
};
const btn = () => document.querySelector("button[data-needs-you-count]") as HTMLButtonElement;
const setRows = (rows: Record<string, IngestStatusRow>) => act(() => useIngestStatusStore.setState({ rows }));

beforeEach(() => {
  vi.mocked(toast.warning).mockClear();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  useIngestStatusStore.getState().reset();
});
afterEach(cleanup);

describe("NeedsYouBadge", () => {
  it("the count shows the drops at awaiting_kind", () => {
    useCanvasStore.setState({ artifacts: [drop("aa", "awaiting_kind"), drop("bb", "extracting"), drop("cc", "awaiting_kind")] });
    render(<NeedsYouBadge />);
    expect(btn().textContent).toContain("2");
    expect(btn().getAttribute("data-needs-you-count")).toBe("2");
  });

  it("with none waiting the button is disabled and shows no count", () => {
    useCanvasStore.setState({ artifacts: [drop("bb", "extracting")] });
    render(<NeedsYouBadge />);
    expect(btn().disabled).toBe(true);
    expect(btn().getAttribute("data-needs-you-count")).toBe("0");
    expect(btn().textContent).toBe("Needs you");
  });

  it("a click jumps to the next drop that needs you, cycling", () => {
    const a = drop("aa", "awaiting_kind");
    const c = drop("cc", "awaiting_kind");
    useCanvasStore.setState({ artifacts: [a, drop("bb", "extracting"), c] });
    render(<NeedsYouBadge />);
    fireEvent.click(btn());
    expect(useCanvasStore.getState().currentArtifactId).toBe(a.id);
    fireEvent.click(btn());
    expect(useCanvasStore.getState().currentArtifactId).toBe(c.id);
    fireEvent.click(btn());
    expect(useCanvasStore.getState().currentArtifactId).toBe(a.id);
  });

  it("a row entering awaiting_kind toasts once", () => {
    render(<NeedsYouBadge />);
    setRows({ [sha("aa")]: wireRow("aa", "extracting") });
    expect(toast.warning).not.toHaveBeenCalled();
    setRows({ [sha("aa")]: wireRow("aa", "awaiting_kind") });
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toBe("Needs you: what kind is this?");
    setRows({ [sha("aa")]: wireRow("aa", "awaiting_kind") });
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("the toast names the drop and its Pick opens that drop", () => {
    // `bb` sits between them in the rail, so a jump to the wrong artifact cannot pass by position.
    const a = drop("aa", "extracting");
    const b = drop("bb", "extracting");
    useCanvasStore.setState({ artifacts: [b, a] });
    render(<NeedsYouBadge />);
    setRows({ [sha("aa")]: wireRow("aa", "extracting"), [sha("bb")]: wireRow("bb", "extracting") });
    setRows({ [sha("aa")]: wireRow("aa", "awaiting_kind"), [sha("bb")]: wireRow("bb", "extracting") });
    const opts = vi.mocked(toast.warning).mock.calls[0][1] as unknown as { id: string; description?: string; action: { onClick: () => void } };
    expect(opts.id).toBe(`needs-you:${sha("aa")}`);
    expect(opts.description).toBe(a.summary);
    act(() => opts.action.onClick());
    expect(useCanvasStore.getState().currentArtifactId).toBe(a.id);
  });

  it("a row first loaded at awaiting_kind does not toast", () => {
    render(<NeedsYouBadge />);
    setRows({ [sha("aa")]: wireRow("aa", "awaiting_kind") });
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
