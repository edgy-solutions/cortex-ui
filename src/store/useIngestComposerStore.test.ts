/**
 * The composer store's two doors for a refused drop: `cad` (no content_kind row yet, 7f) and `xml` (no sensor yet) are never
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
  it("pdf still submits with the same upload args", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"a".repeat(64)}` });
    const file = pdf();
    useIngestComposerStore.setState({ file, kind: "pdf" });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, "pdf", "a@example.com", "pdf");
  });
});

describe("xml is never selectable or sendable", () => {
  it("attaching an .xml infers xml but leaves kind null", async () => {
    await useIngestComposerStore.getState().attach(xml());
    const s = useIngestComposerStore.getState();
    expect(s.inferred).toMatchObject({ kind: "xml", ambiguous: false });
    expect(s.kind).toBeNull();
  });
  it("setKind('xml') is rejected", () => {
    useIngestComposerStore.getState().setKind("xml");
    expect(useIngestComposerStore.getState().kind).toBeNull();
    useIngestComposerStore.getState().setKind("pdf");
    expect(useIngestComposerStore.getState().kind).toBe("pdf");
  });
  it("submit with kind forced to xml never calls upload", async () => {
    useIngestComposerStore.setState({ file: xml(), kind: "xml" });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    expect(uploadIngest).not.toHaveBeenCalled();
    expect(useIngestComposerStore.getState().turns).toHaveLength(0);
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
