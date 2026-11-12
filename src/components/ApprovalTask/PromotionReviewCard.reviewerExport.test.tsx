/**
 * 0.4.88 item 2 -- "Export as..." on the Promote review for a reviewer who did NOT drop the notice.
 * The status route answers only the submitter (a non-submitter gets a plain 404), so the row never arrives; the
 * button then rests on the server's own `check_only` verdict. Only the wire is stubbed (`@/api/client`): the
 * source seam, `useDocument`, `useCanExportSelection` and `profilesFor` run for real. Every arm is on a HELD Promote.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { REVIEW_SHAPES_FIXTURE } from "@/lib/reviewShapesFixture";

const fetchEntitlements = vi.fn();
const fetchIngestExportProfiles = vi.fn();
const checkNoticesExport = vi.fn();
const fetchIngestStatus = vi.fn();
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  actOnHumanTask: vi.fn(),
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
  fetchIngestExportProfiles: (...a: unknown[]) => fetchIngestExportProfiles(...a),
  checkNoticesExport: (...a: unknown[]) => checkNoticesExport(...a),
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
const fetchIngestSource = vi.fn();
const fetchIngestExtraction = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  correctIngestLeaf: vi.fn(),
  // The transport seam forwards to the client in production; here it forwards to the client stub above.
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  fetchIngestSource: (...a: unknown[]) => fetchIngestSource(...a),
  fetchIngestExtraction: (...a: unknown[]) => fetchIngestExtraction(...a),
  fetchReviewShapes: async () => REVIEW_SHAPES_FIXTURE.map((r) => ({ ...r })),
}));
const openPdf = vi.fn();
vi.mock("@/lib/pdfSource", () => ({
  openPdf: (...a: unknown[]) => openPdf(...a),
  RenderCancelled: class extends Error {},
}));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { fixtureExtractionBody, fixturePromotionPayload } from "@/lib/promotionReviewFixture";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";

const SHA = `sha256:${"5b15f205".padEnd(64, "a")}`;
const DECL = {
  kind: "document_promotion",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "PROMOTE",
  title: "Contributed document",
  accepts: ["promoted", "rejected"],
  reason_required: ["rejected"],
};
const task = (): ApprovalTaskPayload => ({
  task_id: "t-promo",
  kind: "document_promotion",
  task_state: "pending",
  title: `Promote document ${SHA}`,
  summary: `Review the extracted document ${SHA} for promotion.`,
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: SHA,
  declaration: DECL,
  payload: { ...fixturePromotionPayload(SHA), domain: "SUSTAINMENT", notice_id: "PCN-2683", dropped_by: { authz_id: "alice@example.com", on_behalf_of: null } },
});

const GRANT = { capabilities: ["ingest:exportBatch"] };
const PROFILES = [
  { name: "p-listed", format: "csv", granularity: "g", accepts: null, exportable_states: ["s-a"] },
  { name: "p-other", format: "csv", granularity: "g", accepts: null, exportable_states: ["s-b"] },
];
const ok = (name: string) => ({ profile: name, version: 1, notices: 1, unexportable: [] });
const refused = (name: string) => ({
  profile: name,
  version: 1,
  notices: 1,
  unexportable: [{ notice_id: SHA, reason: "state_not_exportable", state: "s-a" }],
});
const notFound404 = () => Object.assign(new Error("Request failed with status code 404"), { response: { status: 404, data: { detail: "not found" } } });
const checks = (byName: Record<string, () => Promise<unknown>>) =>
  checkNoticesExport.mockImplementation((name: string) => byName[name]());

const INITIAL = useIngestStatusStore.getState();
const btn = () => document.querySelector("[data-review-export-as]") as HTMLElement | null;
const promoteBtn = () => document.querySelector('[data-verb="promoted"]') as HTMLButtonElement;

/** Mount through the real dispatch on a HELD Promote (no extracted rows), assert the hold, then drive the status poll. */
async function mountHeld() {
  const r = render(<ApprovalTaskCard task={task()} />);
  await waitFor(() => expect(document.querySelector('[data-extraction-state="empty"]')).not.toBeNull());
  await waitFor(() => expect(document.querySelector("[data-pdf-state=\"ready\"]")).not.toBeNull());
  expect(promoteBtn().disabled).toBe(true);
  expect(promoteBtn().getAttribute("data-promote-hold")).toBe("no-rows");
  expect(document.querySelector('[data-promote-held="no-rows"]')).not.toBeNull();
  await act(async () => {
    useIngestStatusStore.getState().pollDue([SHA]);
  });
  return r;
}

beforeEach(() => {
  openPdf.mockReset().mockResolvedValue({ numPages: 2, renderPage: vi.fn().mockResolvedValue({ width: 560, height: 724 }), destroy: vi.fn() });
  window.localStorage.setItem("cortex.reviewExport", "1");
  fetchIngestSource.mockReset().mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]).buffer, status: 200, contentType: "application/pdf" });
  fetchIngestExtraction.mockReset().mockImplementation(async () => ({ ...fixtureExtractionBody(SHA), rows: [] }));
  fetchEntitlements.mockReset().mockResolvedValue(GRANT);
  fetchIngestExportProfiles.mockReset().mockResolvedValue(PROFILES);
  checkNoticesExport.mockReset();
  fetchIngestStatus.mockReset().mockRejectedValue(notFound404());
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null });
  act(() => useIngestStatusStore.getState().reset());
});
afterEach(() => {
  cleanup();
  useIngestStatusStore.setState(INITIAL, true);
  window.localStorage.clear();
});

describe("a reviewer who did not drop the notice, on a held Promote", () => {
  it("arm 1: granted, the status read 404s, one profile admits -> the button shows; the dialog offers only that profile, named by the card's number", async () => {
    checks({ "p-listed": async () => ok("p-listed"), "p-other": async () => refused("p-other") });
    await mountHeld();
    await waitFor(() => expect(btn(), "button absent").not.toBeNull());
    expect(useIngestStatusStore.getState().notFound[SHA]).toBe(true);
    fireEvent.click(btn()!);
    await waitFor(() => expect(document.querySelector('[data-export-profile="p-listed"]')).not.toBeNull());
    expect(document.querySelector('[data-export-profile="p-other"]'), "p-other offered").toBeNull();
    expect(document.querySelector("[data-export-source]")!.textContent).toBe("PCN-2683");
  });

  it("arm 2: no grant (the only difference) -> absent, and neither the profile read nor a check is made", async () => {
    fetchEntitlements.mockResolvedValue({ capabilities: [] });
    checks({ "p-listed": async () => ok("p-listed"), "p-other": async () => refused("p-other") });
    await mountHeld();
    await act(async () => {});
    expect(btn()).toBeNull();
    expect(checkNoticesExport).not.toHaveBeenCalled();
    expect(fetchIngestExportProfiles).not.toHaveBeenCalled();
  });

  it("arm 3: granted, every profile refuses -> absent", async () => {
    checks({ "p-listed": async () => refused("p-listed"), "p-other": async () => refused("p-other") });
    await mountHeld();
    await waitFor(() => expect(checkNoticesExport).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(btn(), "button shown though nothing admits").toBeNull();
  });

  it("arm 4: the status read has not settled -> absent, and no check fires", async () => {
    fetchIngestStatus.mockReturnValue(new Promise(() => {}));
    checks({ "p-listed": async () => ok("p-listed"), "p-other": async () => ok("p-other") });
    await mountHeld();
    await waitFor(() => expect(fetchIngestExportProfiles).toHaveBeenCalled());
    await act(async () => {});
    expect(btn()).toBeNull();
    expect(checkNoticesExport, "checks fired before the 404").not.toHaveBeenCalled();
  });

  it("arm 5: the one admitting check errs -> an unknown answer is not a yes; absent", async () => {
    checks({
      "p-listed": async () => {
        throw new Error("503");
      },
      "p-other": async () => refused("p-other"),
    });
    await mountHeld();
    await waitFor(() => expect(checkNoticesExport).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(btn()).toBeNull();
  });
});
