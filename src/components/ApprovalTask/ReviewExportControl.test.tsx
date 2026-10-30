import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const fetchIngestStatus = vi.fn();
const fetchIngestExportProfiles = vi.fn();
const downloadIngestExport = vi.fn();
const fetchEntitlements = vi.fn();
vi.mock("@/api/client", () => ({
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  fetchIngestExportProfiles: (...a: unknown[]) => fetchIngestExportProfiles(...a),
  downloadIngestExport: (...a: unknown[]) => downloadIngestExport(...a),
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
}));
const saveBlob = vi.fn();
vi.mock("@/lib/saveBlob", () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import { ReviewExportControl } from "./ReviewExportControl";
import { FIXTURE_154_PROFILES } from "@/lib/reviewExport";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import type { IngestStatusRow } from "@/lib/ingestWire";

const ID = "sha256:abc";
const served = [
  { name: "alpha-x", format: "csv", granularity: "notice_part", label: "Alpha" },
  { name: "beta-y", format: "json", granularity: "notice" },
];
const root = (c: HTMLElement) => c.querySelector("[data-review-export]");
const names = (c: HTMLElement) => [...c.querySelectorAll("[data-export-profile]")].map((e) => e.getAttribute("data-export-profile"));
const pick = (c: HTMLElement, n: string) => fireEvent.click(c.querySelector(`[data-export-profile="${n}"]`)!);

// The stage is read from the shared status store (the one ingest poller), so the tests seed the store;
// `track` is stubbed so no poll starts. The control must never fetch the status itself.
const INITIAL = useIngestStatusStore.getState();
const seed = (stage: string) =>
  act(() => useIngestStatusStore.setState({ rows: { [ID]: { ingest_id: ID, stage } as unknown as IngestStatusRow }, track: vi.fn() }));

beforeEach(() => {
  window.localStorage.setItem("cortex.reviewExport", "1");
  seed("promoted");
  fetchIngestExportProfiles.mockResolvedValue(served);
});
afterEach(() => {
  cleanup();
  expect(fetchIngestStatus).not.toHaveBeenCalled();
  useIngestStatusStore.setState(INITIAL, true);
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("ReviewExportControl", () => {
  it("renders nothing before promoted, and never fetches profiles", async () => {
    seed("review");
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(root(container)).toBeNull();
    expect(fetchIngestExportProfiles).not.toHaveBeenCalled();
  });

  it("follows the shared status row: appears when the store's row turns promoted", async () => {
    seed("review");
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(root(container)).toBeNull();
    seed("promoted");
    await waitFor(() => expect(names(container)).toEqual(["alpha-x", "beta-y"]));
  });

  it("flag off: nothing renders and no profiles are fetched", async () => {
    window.localStorage.removeItem("cortex.reviewExport");
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(root(container)).toBeNull();
    expect(fetchIngestExportProfiles).not.toHaveBeenCalled();
  });

  it("the picker is exactly the served list, in order, and the label falls back to the name", async () => {
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(names(container)).toEqual(["alpha-x", "beta-y"]));
    expect(container.querySelector('[data-export-profile="alpha-x"]')!.textContent).toContain("Alpha");
    expect(container.querySelector('[data-export-profile="beta-y"]')!.textContent).toContain("beta-y");
    expect((container.querySelector("[data-export-download]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads the selected profile and saves under the server filename", async () => {
    const blob = new Blob(["x"]);
    downloadIngestExport.mockResolvedValue({ blob, filename: "server.csv" });
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(names(container).length).toBe(2));
    pick(container, "alpha-x");
    fireEvent.click(container.querySelector("[data-export-download]")!);
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(downloadIngestExport).toHaveBeenCalledWith(ID, "alpha-x");
    expect(saveBlob).toHaveBeenCalledWith(blob, "server.csv");
    await waitFor(() => expect(root(container)!.getAttribute("data-review-export")).toBe("done"));
  });

  it("falls back to id.name.format with no server filename", async () => {
    downloadIngestExport.mockResolvedValue({ blob: new Blob(["x"]), filename: null });
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(names(container).length).toBe(2));
    pick(container, "beta-y");
    fireEvent.click(container.querySelector("[data-export-download]")!);
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(saveBlob.mock.calls[0]![1]).toBe(`${ID}.beta-y.json`);
  });

  it("a refusal renders its code; a network error is failed, not refused", async () => {
    downloadIngestExport.mockRejectedValueOnce({ response: { status: 409, data: { detail: { error: "ingest_not_promoted", status: "review" } } } });
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(names(container).length).toBe(2));
    pick(container, "alpha-x");
    fireEvent.click(container.querySelector("[data-export-download]")!);
    await waitFor(() => expect(container.querySelector('[data-export-refusal="ingest_not_promoted"]')).not.toBeNull());
    expect(root(container)!.getAttribute("data-review-export")).toBe("refused");
    expect(container.querySelector("[data-export-refusal]")!.textContent).toBe("Refused (409): ingest_not_promoted");

    downloadIngestExport.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(container.querySelector("[data-export-download]")!);
    await waitFor(() => expect(root(container)!.getAttribute("data-review-export")).toBe("failed"));
    expect(container.querySelector("[data-export-refusal]")).toBeNull();
    expect(screen.getByText(/network/)).toBeTruthy();
  });

  it("an empty served list renders empty", async () => {
    fetchIngestExportProfiles.mockResolvedValue([]);
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(root(container)?.getAttribute("data-review-export")).toBe("empty"));
    expect(container.textContent).toContain("No export profiles are configured.");
  });

  it("mock mode: exactly the two #154 labels, in server order, no profiles fetch", async () => {
    window.localStorage.setItem("cortex.reviewExportMock", "1");
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(names(container)).toEqual(["default-csv", "default-json"]));
    const labels = [...container.querySelectorAll("[data-export-profile]")].map((e) => e.firstChild?.textContent);
    expect(labels).toEqual(FIXTURE_154_PROFILES.map((p) => p.label));
    expect(labels).toEqual(["Default CSV, one row per notice part", "Default JSON, one row per notice part, with provenance"]);
    expect(fetchIngestExportProfiles).not.toHaveBeenCalled();
  });
});
