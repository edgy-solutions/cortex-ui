/**
 * The composer store's two doors for a refused drop: `cad` (no content_kind row yet, 7f) is never
 * selectable or sendable, and a 4xx with a readable body becomes a `refused` turn, not an `error`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadIngest = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({ uploadIngest: (...a: unknown[]) => uploadIngest(...a) }));

import { useIngestComposerStore } from "./useIngestComposerStore";

const http = (status: number, detail: unknown) => ({ response: { status, data: { detail } } });
const pdf = () => new File(["%PDF-1.4\n"], "a.pdf");
const xml = () => new File(['<?xml version="1.0"?><dmodule/>'], "a.xml");
const step = () => new File(["ISO-10303-21;\nHEADER;"], "a.step");

beforeEach(() => {
  uploadIngest.mockReset();
  useIngestComposerStore.setState({ file: null, kind: null, inferred: null, turns: [] });
});

describe("cad is never selectable or sendable", () => {
  it("attaching a .step infers cad but leaves kind null", async () => {
    await useIngestComposerStore.getState().attach(step());
    const s = useIngestComposerStore.getState();
    expect(s.inferred).toMatchObject({ kind: "cad", ambiguous: false });
    expect(s.kind).toBeNull();
  });
  it("setKind('cad') is rejected", () => {
    useIngestComposerStore.getState().setKind("cad");
    expect(useIngestComposerStore.getState().kind).toBeNull();
    useIngestComposerStore.getState().setKind("pdf");
    expect(useIngestComposerStore.getState().kind).toBe("pdf");
  });
  it("submit with kind forced to cad never calls upload", async () => {
    useIngestComposerStore.setState({ file: step(), kind: "cad" });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    expect(uploadIngest).not.toHaveBeenCalled();
    expect(useIngestComposerStore.getState().turns).toHaveLength(0);
  });
  it.each([
    ["pdf", pdf],
    ["xml", xml],
  ] as const)("%s still submits with the same upload args", async (kind, mk) => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"a".repeat(64)}` });
    const file = mk();
    useIngestComposerStore.setState({ file, kind });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, kind, "a@example.com", kind);
  });
});

describe("a failed upload", () => {
  const send = async (err: unknown) => {
    uploadIngest.mockRejectedValue(err);
    useIngestComposerStore.setState({ file: pdf(), kind: "pdf" });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    return useIngestComposerStore.getState().turns[0];
  };
  it("400 kind_unregistered is a refused turn carrying the refusal", async () => {
    const t = await send(http(400, { error: "kind_unregistered", message: "cad has no row", registered: ["pdf", "xml"] }));
    expect(t.phase).toBe("refused");
    expect(t.error).toBe("cad has no row");
    expect(t.refusal).toEqual({ status: 400, message: "cad has no row", code: "kind_unregistered", registered: ["pdf", "xml"] });
  });
  it("a network error is an error turn", async () => {
    const t = await send(new Error("Network Error"));
    expect(t.phase).toBe("error");
    expect(t.error).toBe("Upload failed.");
    expect(t.refusal ?? null).toBeNull();
  });
  it("a 500 with a detail is an error turn carrying that detail", async () => {
    const t = await send(http(500, "boom"));
    expect(t.phase).toBe("error");
    expect(t.error).toBe("boom");
  });
});
