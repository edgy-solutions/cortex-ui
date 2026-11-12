/**
 * "Export as..." on the notice card is for ANY viewer holding ingest:exportBatch (architect, 0.4.87), not only the
 * reviewer. alice holds the grants but not the review task and saw "no review task visible to you" and no export.
 *
 * The capability check and the profile filter run for real; only the wire is stubbed (fetchEntitlements,
 * fetchIngestExportProfiles). Each control pair differs ONLY in the entitlements' capabilities.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor, act, fireEvent } from "@testing-library/react";

const fetchEntitlements = vi.fn();
const fetchIngestExportProfiles = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: vi.fn(),
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
  fetchIngestExportProfiles: (...a: unknown[]) => fetchIngestExportProfiles(...a),
}));
vi.mock("@/lib/ingestTransport", () => ({ retryIngest: vi.fn(), fetchIngestStatus: vi.fn(), correctIngestLeaf: vi.fn() }));
vi.mock("@/lib/saveBlob", () => ({ saveBlob: vi.fn() }));

import { SeededCard } from "./ingestCardTestKit";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { promotionIngestId, type IngestStatusRow } from "@/lib/ingestWire";

// SYNTHETIC stage and profile names: no real stage is spelled.
const SHA = "3f9a2b".padEnd(64, "0");
const ID = `sha256:${SHA}`;
const STAGE = "synthetic-state-a";
const OTHER = "synthetic-state-b";
const GRANT = "ingest:exportBatch";
const prof = (name: string, states: string[]) => ({ name, format: "csv", granularity: "g", accepts: null, exportable_states: states });

const row = (): IngestStatusRow =>
  ({ ingest_id: ID, sha256: SHA, kind: "pdf", stage: STAGE, detail: null, duplicate: null, created_at: 1790860800000, updated_at: 1790860800000, case_id: null }) as unknown as IngestStatusRow;

const task = (r: IngestStatusRow): HumanTask => ({
  id: "row-1",
  taskId: "task-9",
  workflowId: null,
  audience: "promotion:DATA_ENGINEERING",
  kind: "document_promotion",
  status: "pending",
  title: "Promote or reject",
  summary: r.ingest_id,
  requestedBy: "bob",
  subjectRef: r.ingest_id,
  payload: { ingest_id: promotionIngestId(r) },
  createdAt: 0,
});

beforeEach(() => {
  window.localStorage.setItem("cortex.reviewExport", "1");
  window.localStorage.removeItem("cortex.reviewExportMock");
  fetchIngestExportProfiles.mockResolvedValue([prof("p-match", [STAGE]), prof("p-other", [OTHER])]);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  fetchEntitlements.mockReset();
  fetchIngestExportProfiles.mockReset();
  useIngestStatusStore.getState().reset();
  useHumanTaskStore.setState({ tasks: [] });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

const btn = () => document.querySelector("[data-review-export-as]");
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

/** The ONLY differences between the paired arms are these two flags; granted changes only `capabilities`. */
async function mount({ reviewer, granted }: { reviewer: boolean; granted: boolean }) {
  fetchEntitlements.mockResolvedValue({ capabilities: granted ? [GRANT, "other:cap"] : ["other:cap"] });
  const r = row();
  useHumanTaskStore.setState({ tasks: reviewer ? [task(r)] : [] });
  render(<SeededCard ingestId={ID} seed={r} />);
  await waitFor(() => expect(fetchEntitlements).toHaveBeenCalled(), { timeout: 400 }).catch(() => undefined); // absent when nothing mounted the control
  await flush();
}

describe("Export as... on the notice card", () => {
  it("1. a non-reviewer with the grant sees it (alice), on the no-review-task screen", async () => {
    await mount({ reviewer: false, granted: true });
    expect(document.querySelector("[data-ingest-no-review-task]")).not.toBeNull();
    await waitFor(() => expect(btn()).not.toBeNull());
  });

  it("2. control: the same non-reviewer without the grant does not", async () => {
    await mount({ reviewer: false, granted: false });
    expect(document.querySelector("[data-ingest-no-review-task]")).not.toBeNull();
    expect(btn()).toBeNull();
  });

  it("3. a reviewer without the grant does not see it", async () => {
    await mount({ reviewer: true, granted: false });
    expect(document.querySelector("[data-ingest-review]")).not.toBeNull();
    expect(btn()).toBeNull();
  });

  it("4. control: the same reviewer with the grant does", async () => {
    await mount({ reviewer: true, granted: true });
    expect(document.querySelector("[data-ingest-review]")).not.toBeNull();
    await waitFor(() => expect(btn()).not.toBeNull());
  });

  it("5. the state still gates: with the grant but no profile listing the stage, nothing shows", async () => {
    fetchIngestExportProfiles.mockResolvedValue([prof("p-other", [OTHER])]);
    await mount({ reviewer: false, granted: true });
    await waitFor(() => expect(fetchIngestExportProfiles).toHaveBeenCalled(), { timeout: 400 }).catch(() => undefined);
    await flush();
    expect(btn()).toBeNull();
  });

  it("6. the dialog opens OUTSIDE the card (portaled to body), and no click inside it reaches the canvas", async () => {
    // On the canvas the card sits under a camera transform, so a fixed overlay rendered in place is positioned and
    // scaled relative to the CARD. The dialog must be a direct child of document.body, outside the render container.
    fetchEntitlements.mockResolvedValue({ capabilities: [GRANT] });
    const r = row();
    useHumanTaskStore.setState({ tasks: [] });
    const outer = vi.fn();
    const { container } = render(<div onClick={outer}><SeededCard ingestId={ID} seed={r} /></div>);
    await waitFor(() => expect(btn()).not.toBeNull());
    fireEvent.click(btn()!);
    const dialog = await waitFor(() => { const d = document.querySelector("[data-export-dialog]"); expect(d).not.toBeNull(); return d!; });
    expect(dialog.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
    fireEvent.click(document.querySelector("[data-export-close]")!);
    expect(outer).not.toHaveBeenCalled();
  });
});
