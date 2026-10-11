/**
 * Ruling: a duplicate shows the ORIGINAL's id and LIVE status. Today's server answers a duplicate
 * with a fresh row id (status=duplicate) plus `duplicate.of_ingest_id`; the fixed server mints no
 * row. Cortex must render both the same: the dup row's id and the upload response's own `stage`
 * appear nowhere. The only stage on screen is the one fetched for the original.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const fetchIngestStatus = vi.fn();
const uploadIngest = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  uploadIngest: (...a: unknown[]) => uploadIngest(...a),
  disputeIngestOrigin: vi.fn(),
  confirmIngestContentKind: vi.fn(),
}));
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { profile: { sub: "user-a", email: "a@example.com" } } }),
}));

import { IngestTurns } from "./IngestTurns";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import { readMyDrops } from "@/lib/myDrops";
import { uploadIngest as mockUpload, fetchIngestStatus as mockFetch, __resetIngestMock } from "@/lib/ingestMock";

const DUP = "d0d0d0d0-1111-4222-8333-444444444444";
const ORIG = `sha256:${"3f9a2b".padEnd(64, "0")}`;
const MESSAGE = "already processed on 2026-10-09 from work-instruction.pdf";

const dupResponse = (over: Record<string, unknown> = {}) => ({
  ingest_id: DUP,
  stage: "received", // the upload response's own stage: must never be drawn
  detail: MESSAGE,
  duplicate: { of_ingest_id: ORIG, message: MESSAGE },
  ...over,
});

const origRow = (stage: string) => ({
  ingest_id: ORIG, sha256: "3f9a2b".padEnd(64, "0"), kind: "pdf", stage, detail: null,
  duplicate: null, created_at: 1790860800000, updated_at: 1790860800000, origin: null, case_id: null,
});

beforeEach(() => {
  window.localStorage.clear();
  fetchIngestStatus.mockImplementation((id: string) =>
    id === ORIG ? Promise.resolve(origRow("review")) : Promise.reject(new Error(`unexpected fetch of ${id}`)),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fetchIngestStatus.mockReset();
  uploadIngest.mockReset();
  useIngestComposerStore.setState({ turns: [], file: null, kind: null, inferred: null });
});

async function dropDuplicate(response: unknown) {
  uploadIngest.mockResolvedValue(response);
  const r = render(<IngestTurns />);
  useIngestComposerStore.setState({ file: new File(["%PDF-"], "work-instruction.pdf"), kind: "pdf" });
  await useIngestComposerStore.getState().submit("a@example.com", "", "user-a");
  return r;
}

/** Every text node and every attribute value under the container. */
function everything(root: HTMLElement): string[] {
  const out = [root.textContent ?? ""];
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const a of Array.from(el.attributes)) out.push(`${a.name}=${a.value}`);
  }
  return out;
}

describe("a duplicate shows the original", () => {
  it("the dup row's uuid is absent from the turn's text and from every attribute", async () => {
    const r = await dropDuplicate(dupResponse());
    // Precondition: the ORIGINAL's card has rendered with its fetched badge, so the leak check below is reached.
    await waitFor(() => expect(r.container.querySelector(`[data-ingest-id="${ORIG}"] [data-ingest-status]`)?.textContent).toBe("review"));
    const hits = everything(r.container as HTMLElement).filter((s) => s.includes(DUP));
    expect(hits, "the duplicate row's own id leaked into the DOM").toEqual([]);
    expect(r.container.textContent).not.toContain(DUP);
  });

  it("the status fetch is called with the original id and never with the dup id", async () => {
    const r = await dropDuplicate(dupResponse());
    await waitFor(() => expect(fetchIngestStatus).toHaveBeenCalled());
    expect(fetchIngestStatus.mock.calls.every((c) => c[0] === ORIG)).toBe(true);
    expect(fetchIngestStatus.mock.calls.map((c) => c[0])).not.toContain(DUP);
    expect(useIngestComposerStore.getState().turns[0].ingestId).toBe(ORIG);
    expect(r.container.querySelector(`[data-ingest-id="${ORIG}"]`)).not.toBeNull();
  });

  it("the badge shows the original's FETCHED stage (review) even though the upload said received", async () => {
    const r = await dropDuplicate(dupResponse({ stage: "received" }));
    await waitFor(() => expect(r.container.querySelector("[data-ingest-status]")?.textContent).toBe("review"));
    expect(r.container.querySelectorAll("[data-ingest-status]")).toHaveLength(1);
  });

  it("'already processed' is on screen exactly once", async () => {
    const r = await dropDuplicate(dupResponse());
    await waitFor(() => expect(r.container.querySelector("[data-ingest-status]")).not.toBeNull());
    expect((r.container.textContent!.match(/already processed/gi) ?? []).length).toBe(1);
  });

  it("a missing of_ingest_id shows the message only: no card, no badge, no fetch", async () => {
    const r = await dropDuplicate(dupResponse({ duplicate: { message: MESSAGE } }));
    expect(r.container.querySelector('[data-ingest-turn-result="duplicate"]')?.textContent).toBe(MESSAGE);
    expect(r.container.querySelector("[data-ingest-id]")).toBeNull();
    expect(r.container.querySelector("[data-ingest-status]")).toBeNull();
    expect(fetchIngestStatus).not.toHaveBeenCalled();
    expect(everything(r.container as HTMLElement).filter((s) => s.includes(DUP))).toEqual([]);
    expect(readMyDrops("user-a")).toEqual([]);
  });

  it("My drops records the ORIGINAL's id, not the dup row's", async () => {
    await dropDuplicate(dupResponse());
    expect(readMyDrops("user-a").map((d) => d.ingestId)).toEqual([ORIG]);
  });
});

describe("the mock mirrors today's server", () => {
  it("a duplicate answer carries a fresh uuid ingest_id AND of_ingest_id naming the original, whose status fetches", async () => {
    __resetIngestMock();
    const first = (await mockUpload(new File(["a"], "first.pdf"), "pdf", "a@example.com")) as { ingest_id: string };
    const dup = (await mockUpload(new File(["a"], "first-dup.pdf"), "pdf", "a@example.com")) as {
      ingest_id: string; stage: string; duplicate: { of_ingest_id: string; message: string };
    };
    expect(dup.ingest_id).not.toBe(first.ingest_id);
    expect(dup.ingest_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(dup.duplicate.of_ingest_id).toBe(first.ingest_id);
    expect(typeof dup.stage).toBe("string");
    await expect(mockFetch(dup.duplicate.of_ingest_id)).resolves.toMatchObject({ ingest_id: first.ingest_id });
  });
});
