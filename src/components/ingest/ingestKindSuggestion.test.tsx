/**
 * Ruling 1 (PR #4) — ADR-0041 §4: the classifier suggests a LEAF content kind, the human confirms.
 * The wire is PROPOSED (not emitted by the platform yet): `suggested_content_kind` on the status
 * row, `POST /ingest/{id}/content_kind {"content_kind"}` to confirm.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { readIngestStatusRow, type IngestStatusRow } from "@/lib/ingestWire";

const confirmIngestContentKind = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: vi.fn(),
  disputeIngestOrigin: vi.fn(),
  confirmIngestContentKind: (...a: unknown[]) => confirmIngestContentKind(...a),
}));

afterEach(() => {
  cleanup();
  confirmIngestContentKind.mockReset();
});

const SHA = "3f9a2b".padEnd(64, "0");
const ID = `sha256:${SHA}`;

const wire = (over: Record<string, unknown> = {}) => ({
  ingest_id: ID,
  sha256: SHA,
  kind: "pdf",
  stage: "review",
  detail: null,
  duplicate: null,
  created_at: 1790860800000,
  updated_at: 1790860800000,
  case_id: null,
  ...over,
});

const row = (over: Partial<IngestStatusRow> = {}): IngestStatusRow => ({
  ...(readIngestStatusRow(wire())!),
  ...over,
});

const mount = (r: IngestStatusRow) =>
  render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);

describe("reader: suggested_content_kind", () => {
  it("present: a non-blank string is read", () => {
    expect(readIngestStatusRow(wire({ suggested_content_kind: "pcn" }))?.suggested_content_kind).toBe("pcn");
  });
  it("blank: null", () => {
    expect(readIngestStatusRow(wire({ suggested_content_kind: "  " }))?.suggested_content_kind).toBeNull();
    expect(readIngestStatusRow(wire({ suggested_content_kind: "" }))?.suggested_content_kind).toBeNull();
  });
  it("non-string: null, and the row is NOT refused", () => {
    for (const v of [7, true, {}, ["pcn"]]) {
      const r = readIngestStatusRow(wire({ suggested_content_kind: v }));
      expect(r).not.toBeNull();
      expect(r?.suggested_content_kind).toBeNull();
    }
  });
  it("absent: null", () => {
    expect(readIngestStatusRow(wire())?.suggested_content_kind).toBeNull();
  });
});

describe("IngestStatusCard — the kind suggestion", () => {
  it("absent renders NOTHING: no [data-kind-suggestion], text equals the baseline", () => {
    const baseline = mount(row()).container.textContent;
    cleanup();
    for (const v of [null, undefined]) {
      const r = mount(row({ suggested_content_kind: v }));
      expect(r.container.querySelector("[data-kind-suggestion]")).toBeNull();
      expect(r.container.textContent).toBe(baseline);
      cleanup();
    }
    const withIt = mount(row({ suggested_content_kind: "pcn" })).container.textContent;
    expect(withIt).not.toBe(baseline);
  });

  it("present renders the uppercased kind and both verbs", () => {
    const r = mount(row({ suggested_content_kind: "pcn" }));
    const box = r.container.querySelector("[data-kind-suggestion='pcn']")!;
    expect(box.textContent).toContain("Classifier suggests: PCN");
    expect(box.querySelector("span")?.textContent).toBe("PCN");
    expect(box.querySelector("[data-kind-verb='confirm']")?.textContent).toBe("Confirm");
    expect(box.querySelector("[data-kind-verb='decline']")?.textContent).toBe("Not this");
    expect(box.hasAttribute("data-kind-confirmed")).toBe(false);
  });

  it("Confirm posts exactly once with the SUGGESTION (not the file-format kind) and marks confirmed", async () => {
    confirmIngestContentKind.mockResolvedValue({});
    const r = mount(row({ kind: "pdf", suggested_content_kind: "pcn" }));
    fireEvent.click(r.container.querySelector("[data-kind-verb='confirm']")!);
    await waitFor(() => expect(r.container.querySelector("[data-kind-confirmed]")).toBeTruthy());
    expect(confirmIngestContentKind).toHaveBeenCalledTimes(1);
    expect(confirmIngestContentKind).toHaveBeenCalledWith(ID, "pcn");
    expect(r.container.querySelector("[data-kind-verb]")).toBeNull();
  });

  it("Not this posts nothing and collapses to the note", () => {
    const r = mount(row({ suggested_content_kind: "pcn" }));
    fireEvent.click(r.container.querySelector("[data-kind-verb='decline']")!);
    expect(confirmIngestContentKind).not.toHaveBeenCalled();
    expect(r.container.querySelector("[data-kind-verb]")).toBeNull();
    expect(r.container.querySelector("[data-kind-confirmed]")).toBeNull();
    expect(r.container.querySelector("[data-kind-suggestion]")?.textContent).toBe(
      "Kind not confirmed — the reviewer will see the extraction",
    );
  });

  it("a 4xx shows the producer's error inline, never throws, and stays confirmable", async () => {
    confirmIngestContentKind.mockRejectedValue(
      Object.assign(new Error("x"), { response: { status: 422, data: { detail: "content_kind 'pcn' is not a registered leaf kind" } } }),
    );
    const r = mount(row({ suggested_content_kind: "pcn" }));
    fireEvent.click(r.container.querySelector("[data-kind-verb='confirm']")!);
    await waitFor(() => expect(r.container.querySelector("[data-kind-suggestion-error]")).toBeTruthy());
    expect(r.container.querySelector("[data-kind-suggestion-error]")?.textContent).toContain("not a registered leaf kind");
    expect(r.container.querySelector("[data-kind-confirmed]")).toBeNull();
    expect(r.container.querySelector("[data-kind-verb='confirm']")).toBeTruthy();
  });

  it.each([
    ["promoted", null],
    ["rejected", "not a PCN"],
    ["failed", "extractor crashed"],
  ] as const)("terminal stage %s shows no suggestion even when the field is present", (stage, detail) => {
    const r = mount(row({ stage, detail, suggested_content_kind: "pcn" }));
    expect(r.container.querySelector("[data-kind-suggestion]")).toBeNull();
    expect(r.container.textContent).not.toMatch(/Classifier suggests/);
  });

  it("a duplicate shows no suggestion even when the field is present", () => {
    const r = mount(
      row({
        stage: "review",
        duplicate: { of_ingest_id: "sha256:" + "a".repeat(64), message: "already processed" },
        suggested_content_kind: "pcn",
      }),
    );
    expect(r.container.querySelector("[data-kind-suggestion]")).toBeNull();
  });
});
