/**
 * "My drops": the panel lists the user's own drops and re-fetches each one's status every time it
 * opens (closing a panel never loses a card), through the existing IngestStatusCard.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";

const fetchIngestStatus = vi.fn();
const uploadIngest = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  uploadIngest: (...a: unknown[]) => uploadIngest(...a),
  disputeIngestOrigin: vi.fn(),
  confirmIngestContentKind: vi.fn(),
}));
let sub: string | undefined = "user-a";
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: sub ? { profile: { sub, email: "a@example.com" } } : null }),
}));

import { MyDrops } from "./MyDrops";
import { recordMyDrop, readMyDrops } from "@/lib/myDrops";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";

const statusRow = (id: string) => ({
  ingest_id: id, sha256: "ab".repeat(32), kind: "pdf", stage: "review", detail: null,
  duplicate: null, created_at: 1790860800000, updated_at: 1790860800000, origin: null, case_id: null,
});

beforeEach(() => {
  window.localStorage.clear();
  sub = "user-a";
  fetchIngestStatus.mockImplementation((id: string) => Promise.resolve(statusRow(id)));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fetchIngestStatus.mockReset();
  uploadIngest.mockReset();
  useIngestComposerStore.setState({ turns: [], file: null, kind: null, inferred: null });
});

const trigger = () => document.querySelector("[data-my-drops-trigger]") as HTMLElement;
const panel = () => document.querySelector("[data-my-drops-panel]");

describe("MyDrops", () => {
  it("shows the count, and lists each drop in the panel with its filename", async () => {
    recordMyDrop("user-a", { ingestId: "ing-1", filename: "one.pdf", droppedAt: 1 });
    recordMyDrop("user-a", { ingestId: "ing-2", filename: "two.pdf", droppedAt: 2 });
    render(<MyDrops />);
    expect(trigger().textContent).toContain("My drops (2)");
    expect(panel()).toBeNull();
    fireEvent.click(trigger());
    expect([...document.querySelectorAll("[data-my-drop]")].map((e) => e.getAttribute("data-my-drop"))).toEqual(["ing-2", "ing-1"]);
    expect(document.querySelector('[data-my-drop="ing-1"] [data-my-drop-file]')?.textContent).toBe("one.pdf");
    await waitFor(() => expect(document.querySelector('[data-my-drop="ing-1"] [data-ingest-status]')?.textContent).toBe("review"));
  });

  it("opening calls the status fetch once per listed id; closing and reopening calls it again", async () => {
    recordMyDrop("user-a", { ingestId: "ing-1", filename: "one.pdf", droppedAt: 1 });
    recordMyDrop("user-a", { ingestId: "ing-2", filename: "two.pdf", droppedAt: 2 });
    render(<MyDrops />);
    expect(fetchIngestStatus).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    await waitFor(() => expect(fetchIngestStatus).toHaveBeenCalledTimes(2));
    expect(fetchIngestStatus.mock.calls.map((c) => c[0]).sort()).toEqual(["ing-1", "ing-2"]);
    fireEvent.click(document.querySelector("[data-my-drops-close]")!);
    expect(panel()).toBeNull();
    fireEvent.click(trigger());
    await waitFor(() => expect(fetchIngestStatus).toHaveBeenCalledTimes(4));
  });

  it("a reload (unmount, fresh render, same storage) shows the same drops", () => {
    recordMyDrop("user-a", { ingestId: "ing-1", filename: "one.pdf", droppedAt: 1 });
    render(<MyDrops />).unmount();
    render(<MyDrops />);
    fireEvent.click(trigger());
    expect(document.querySelector('[data-my-drop="ing-1"]')).not.toBeNull();
  });

  it("user B sees none of user A's drops", () => {
    recordMyDrop("user-a", { ingestId: "ing-1", filename: "one.pdf", droppedAt: 1 });
    sub = "user-b";
    render(<MyDrops />);
    expect(trigger().textContent).toContain("My drops (0)");
    fireEvent.click(trigger());
    expect(document.querySelector("[data-my-drop]")).toBeNull();
    expect(fetchIngestStatus).not.toHaveBeenCalled();
  });

  it("with no authenticated user the list is empty and storage is not touched", () => {
    sub = undefined;
    recordMyDrop(null, { ingestId: "ing-1", filename: "one.pdf", droppedAt: 1 });
    render(<MyDrops />);
    expect(trigger().textContent).toContain("My drops (0)");
    expect(window.localStorage.length).toBe(0);
  });

  it("a storage that throws renders an empty list, no throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<MyDrops />);
    expect(trigger().textContent).toContain("My drops (0)");
    fireEvent.click(trigger());
    expect(document.querySelector("[data-my-drop]")).toBeNull();
  });

  it("a successful upload records the drop for the submitting user, and the count follows", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: "ing-9", stage: "received", duplicate: null });
    render(<MyDrops />);
    useIngestComposerStore.setState({ file: new File(["%PDF-"], "new.pdf"), kind: "pdf" });
    await useIngestComposerStore.getState().submit("a@example.com", "", "user-a");
    expect(readMyDrops("user-a")).toMatchObject([{ ingestId: "ing-9", filename: "new.pdf" }]);
    expect(readMyDrops("user-b")).toEqual([]);
    await waitFor(() => expect(trigger().textContent).toContain("My drops (1)"));
  });
});
