/**
 * The composer store's two doors for a refused drop: `cad` (no content_kind row yet, 7f) is never selectable or sendable
 * (`xml` was too, until the architect lifted it 2026-10-17: 7f's pins rolled, the door ON since 190), and a 4xx with a readable body becomes a `refused` turn, not an `error`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadIngest = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({ uploadIngest: (...a: unknown[]) => uploadIngest(...a) }));

import { useIngestComposerStore, dropReady, offeredDropLeaves } from "./useIngestComposerStore";

const http = (status: number, detail: unknown) => ({ response: { status, data: { detail } } });
const pdf = () => new File(["%PDF-1.4\n"], "a.pdf");
const xml = () => new File(['<?xml version="1.0"?><dmodule/>'], "a.xml");
const step = () => new File(["ISO-10303-21;\nHEADER;"], "a.step");

beforeEach(() => {
  uploadIngest.mockReset();
  useIngestComposerStore.setState({ file: null, kind: null, inferred: null, leaf: null, turns: [] });
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
    useIngestComposerStore.setState({ file, kind: "pdf", leaf: "unsure" });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, "pdf", "a@example.com", "pdf", null);
  });
});

describe("xml is selectable and sendable (lifted 2026-10-17)", () => {
  it("attaching an .xml infers xml and selects it", async () => {
    await useIngestComposerStore.getState().attach(xml());
    const s = useIngestComposerStore.getState();
    expect(s.inferred).toMatchObject({ kind: "xml", ambiguous: false });
    expect(s.kind).toBe("xml");
  });
  it("setKind('xml') is taken", () => {
    useIngestComposerStore.getState().setKind("xml");
    expect(useIngestComposerStore.getState().kind).toBe("xml");
  });
  it("submit with xml uploads kind xml and content_kind xml (the format)", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"b".repeat(64)}` });
    const file = xml();
    useIngestComposerStore.setState({ file, kind: "xml" });
    await useIngestComposerStore.getState().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, "xml", "a@example.com", "xml", null);
    expect(useIngestComposerStore.getState().turns).toHaveLength(1);
  });
});

describe("a failed upload", () => {
  const send = async (err: unknown) => {
    uploadIngest.mockRejectedValue(err);
    useIngestComposerStore.setState({ file: pdf(), kind: "pdf", leaf: "unsure" });
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

describe("the drop-time kind question (architect 2026-10-23)", () => {
  const S = () => useIngestComposerStore.getState();

  it("leaf is null after attach, and a PDF drop is not ready until one is chosen", async () => {
    useIngestComposerStore.setState({ leaf: "pcn" });
    await S().attach(pdf());
    expect(S().kind).toBe("pdf");
    expect(S().leaf).toBeNull();
    expect(dropReady(S())).toBe(false);
  });
  it("pdf + no leaf: submit makes NO upload call and keeps the draft", async () => {
    useIngestComposerStore.setState({ file: pdf(), kind: "pdf" });
    await S().submit("a@example.com", "");
    expect(uploadIngest).not.toHaveBeenCalled();
    expect(S().turns).toHaveLength(0);
    expect(S().file).not.toBeNull();
  });
  it("pdf + unsure: uploads with leaf null (nothing on the wire), turn records the choice", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"a".repeat(64)}` });
    const file = pdf();
    useIngestComposerStore.setState({ file, kind: "pdf" });
    S().setLeaf("unsure");
    await S().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, "pdf", "a@example.com", "pdf", null);
    expect(S().turns[0].leaf).toBe("unsure");
  });
  it("pdf + pcn: leaf pcn on the wire, content_kind stays pdf; the draft leaf resets", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"a".repeat(64)}` });
    const file = pdf();
    useIngestComposerStore.setState({ file, kind: "pdf" });
    S().setLeaf("pcn");
    await S().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, "pdf", "a@example.com", "pdf", "pcn");
    expect(S().leaf).toBeNull();
  });
  it("xml: submit sends with leaf null, and setLeaf is ignored", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"b".repeat(64)}` });
    const file = xml();
    useIngestComposerStore.setState({ file, kind: "xml" });
    S().setLeaf("pcn");
    expect(S().leaf).toBeNull();
    await S().submit("a@example.com", "");
    expect(uploadIngest).toHaveBeenCalledWith(file, "xml", "a@example.com", "xml", null);
  });
  it("a stale leaf on a non-PDF kind never reaches the wire", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: `sha256:${"b".repeat(64)}` });
    useIngestComposerStore.setState({ file: xml(), kind: "xml", leaf: "pdn" });
    await S().submit("a@example.com", "");
    expect(uploadIngest.mock.calls[0][4]).toBeNull();
  });
  it("setKind to a DIFFERENT kind resets the leaf; the same kind keeps it", () => {
    useIngestComposerStore.setState({ file: pdf(), kind: "pdf" });
    S().setLeaf("pdn");
    S().setKind("pdf");
    expect(S().leaf).toBe("pdn");
    S().setKind("xml");
    expect(S().leaf).toBeNull();
  });
  it("clearDraft resets the leaf", () => {
    useIngestComposerStore.setState({ file: pdf(), kind: "pdf" });
    S().setLeaf("pcn");
    S().clearDraft();
    expect(S().leaf).toBeNull();
  });
});

describe("offeredDropLeaves (droppable_kinds, architect 2026-10-30)", () => {
  it("null entitlements fail closed", () => expect(offeredDropLeaves(null)).toEqual([]));
  it("keeps SERVED order, not enum order", () => expect(offeredDropLeaves({ droppable_kinds: ["pdn", "pcn"] })).toEqual(["pdn", "pcn"]));
  it("drops non-enum, duplicate and non-string members", () => expect(offeredDropLeaves({ droppable_kinds: ["pcn", "document", "pcn", 3] })).toEqual(["pcn"]));
  it("a missing key or a non-array is []", () => {
    expect(offeredDropLeaves({})).toEqual([]);
    expect(offeredDropLeaves({ droppable_kinds: "pcn" })).toEqual([]);
  });
});
