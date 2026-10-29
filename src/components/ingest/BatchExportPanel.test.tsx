import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";

const fetchIngestExportProfiles = vi.fn();
const downloadBatchExport = vi.fn();
const fetchEntitlements = vi.fn();
vi.mock("@/api/client", () => ({
  fetchIngestExportProfiles: (...a: unknown[]) => fetchIngestExportProfiles(...a),
  downloadBatchExport: (...a: unknown[]) => downloadBatchExport(...a),
  downloadIngestExport: vi.fn(),
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
}));
const saveBlob = vi.fn();
vi.mock("@/lib/saveBlob", () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import { BatchExportPanel } from "./BatchExportPanel";

const served = [{ name: "alpha-x", format: "csv", scope: "row" }];
const q = (c: HTMLElement, s: string) => c.querySelector(s) as HTMLElement | null;

beforeEach(() => {
  window.localStorage.setItem("cortex.reviewExport", "1");
  fetchEntitlements.mockResolvedValue({ groups: ["alert-processors"] });
  fetchIngestExportProfiles.mockResolvedValue(served);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

async function shown(c: HTMLElement) {
  await waitFor(() => expect(q(c, "[data-batch-export]")).not.toBeNull());
}
const setDate = (c: HTMLElement, sel: string, v: string) => fireEvent.change(q(c, sel)!, { target: { value: v } });

describe("BatchExportPanel", () => {
  it("a non-member sees nothing", async () => {
    fetchEntitlements.mockResolvedValue({ cells: [] });
    const { container } = render(<BatchExportPanel />);
    await waitFor(() => expect(fetchEntitlements).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(q(container, "[data-batch-export]")).toBeNull();
  });

  it("a failed membership read shows nothing", async () => {
    fetchEntitlements.mockRejectedValue(new Error("down"));
    const { container } = render(<BatchExportPanel />);
    await waitFor(() => expect(fetchEntitlements).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(q(container, "[data-batch-export]")).toBeNull();
  });

  it("a member sees it", async () => {
    const { container } = render(<BatchExportPanel />);
    await shown(container);
  });

  it("flag off: a member sees nothing", async () => {
    window.localStorage.removeItem("cortex.reviewExport");
    const { container } = render(<BatchExportPanel />);
    await new Promise((r) => setTimeout(r, 20));
    expect(q(container, "[data-batch-export]")).toBeNull();
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });

  it("download stays disabled until both dates and a profile are set; from after to blocks", async () => {
    const { container } = render(<BatchExportPanel />);
    await shown(container);
    const btn = () => q(container, "[data-batch-download]") as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    setDate(container, "[data-batch-from]", "2026-10-01");
    expect(btn().disabled).toBe(true);
    setDate(container, "[data-batch-to]", "2026-10-05");
    expect(btn().disabled).toBe(true);
    fireEvent.click(q(container, '[data-export-profile="alpha-x"]')!);
    expect(btn().disabled).toBe(false);
    setDate(container, "[data-batch-from]", "2026-10-09");
    expect(btn().disabled).toBe(true);
    expect(container.textContent).toContain("From is after To.");
  });

  it("a click calls downloadBatchExport with exactly name, from, to", async () => {
    downloadBatchExport.mockResolvedValue({ blob: new Blob(["x"]), filename: null });
    const { container } = render(<BatchExportPanel />);
    await shown(container);
    setDate(container, "[data-batch-from]", "2026-10-01");
    setDate(container, "[data-batch-to]", "2026-10-05");
    fireEvent.click(q(container, '[data-export-profile="alpha-x"]')!);
    fireEvent.click(q(container, "[data-batch-download]")!);
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(downloadBatchExport).toHaveBeenCalledWith("alpha-x", "2026-10-01", "2026-10-05");
    expect(saveBlob.mock.calls[0]![1]).toBe("2026-10-01_2026-10-05.alpha-x.csv");
  });

  it("renders a refusal with its code, and a network error as failed", async () => {
    downloadBatchExport.mockRejectedValueOnce({ response: { status: 403, data: { error: "not_in_group" } } });
    const { container } = render(<BatchExportPanel />);
    await shown(container);
    setDate(container, "[data-batch-from]", "2026-10-01");
    setDate(container, "[data-batch-to]", "2026-10-05");
    fireEvent.click(q(container, '[data-export-profile="alpha-x"]')!);
    fireEvent.click(q(container, "[data-batch-download]")!);
    await waitFor(() => expect(q(container, '[data-export-refusal="not_in_group"]')).not.toBeNull());
    expect(q(container, "[data-export-refusal]")!.textContent).toBe("Refused (403): not_in_group");
    downloadBatchExport.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(q(container, "[data-batch-download]")!);
    await waitFor(() => expect(q(container, "[data-export-failed]")).not.toBeNull());
    expect(q(container, "[data-export-refusal]")).toBeNull();
  });
});
