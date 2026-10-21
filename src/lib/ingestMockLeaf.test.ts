import { describe, it, expect, beforeEach } from "vitest";
import { uploadIngest, fetchIngestStatus, fetchIngestMine, correctIngestLeaf, __seedMockFailedFixture, __resetIngestMock } from "./ingestMock";
import { readActRefusal, readIngestStatusRow } from "./ingestWire";

beforeEach(() => __resetIngestMock());

async function drop(name: string): Promise<string> {
  const up = (await uploadIngest(new File(["x"], name), "pdf", "me", "pdf")) as { ingest_id: string };
  return up.ingest_id;
}
const poll = async (id: string) => readIngestStatusRow(await fetchIngestStatus(id))!;

describe("mock: leaf / leaf_source", () => {
  it("a row carries null/null while received, before the title read", async () => {
    const id = await drop("PCN-1.pdf");
    // /ingest/mine reads the store without advancing it.
    const mine = (await fetchIngestMine(10)) as { items: unknown[] };
    const r = readIngestStatusRow(mine.items[0])!;
    expect([r.ingest_id, r.stage]).toEqual([id, "received"]);
    expect([r.leaf, r.leaf_source]).toEqual([null, null]);
  });

  it("a pcn-named drop advances to review with (pcn, title)", async () => {
    const id = await drop("PCN26-117.pdf");
    await poll(id);
    const r = await poll(id);
    expect(r.stage).toBe("review");
    expect([r.leaf, r.leaf_source]).toEqual(["pcn", "title"]);
  });

  it("an unnamed drop parks at awaiting_kind and does not advance", async () => {
    const id = await drop("scan.pdf");
    await poll(id);
    expect((await poll(id)).stage).toBe("awaiting_kind");
    const again = await poll(id);
    expect(again.stage).toBe("awaiting_kind");
    expect([again.leaf, again.leaf_source]).toEqual([null, null]);
  });

  it("an unnamed drop parks at awaiting_kind on the title read, never reaching extracting", async () => {
    const id = await drop("scan.pdf");
    const r = await poll(id);
    expect(r.stage).toBe("awaiting_kind");
    expect([r.leaf, r.leaf_source]).toEqual([null, null]);
  });

  it("a named drop carries its title leaf INTO extracting (the title read is extraction's first step)", async () => {
    const id = await drop("PDN-7.pdf");
    const r = await poll(id);
    expect(r.stage).toBe("extracting");
    expect([r.leaf, r.leaf_source]).toEqual(["pdn", "title"]);
  });

  it("correctIngestLeaf from awaiting_kind sends the row to received with (pdn, corrected); the polls then reach review", async () => {
    const id = await drop("scan.pdf");
    await poll(id);
    await poll(id);
    const r = readIngestStatusRow(await correctIngestLeaf(id, "pdn"))!;
    expect(r.stage).toBe("received");
    expect([r.leaf, r.leaf_source, r.corrected_by]).toEqual(["pdn", "corrected", "mock-caller"]);
    expect((await poll(id)).stage).toBe("extracting");
    const next = await poll(id);
    expect(next.stage).toBe("review");
    expect([next.leaf, next.leaf_source]).toEqual(["pdn", "corrected"]);
  });

  it("a correction at a terminal stage rejects with leaf_not_changeable; an unknown id rejects 404", async () => {
    const id = await drop("PCN-1.pdf");
    // The mock has no promote verb; its failed fixture is a terminal stage too.
    __seedMockFailedFixture(id, { reason_code: "x", reason: "r" } as never);
    const err = await correctIngestLeaf(id, "pdn").then(() => null, (e: unknown) => e);
    expect(readActRefusal(err)).toMatchObject({ status: 409, error: "leaf_not_changeable" });
    await expect(correctIngestLeaf("nope", "pcn")).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe("mock: declared leaf, candidates, and a correction at review", () => {
  const dropAs = async (name: string, contentKind: string): Promise<string> =>
    ((await uploadIngest(new File(["x"], name), "pdf", "me", contentKind)) as { ingest_id: string }).ingest_id;

  it("a declared drop carries (leaf, declared) from received and never parks", async () => {
    const id = await dropAs("scan.pdf", "pdn");
    const mine = readIngestStatusRow(((await fetchIngestMine(10)) as { items: unknown[] }).items[0])!;
    expect([mine.stage, mine.leaf, mine.leaf_source]).toEqual(["received", "pdn", "declared"]);
    expect((await poll(id)).stage).toBe("extracting");
    const r = await poll(id);
    expect([r.stage, r.leaf, r.leaf_source]).toEqual(["review", "pdn", "declared"]);
  });

  it("a declared leaf wins over a title that names the other kind", async () => {
    const id = await dropAs("PCN-9.pdf", "pdn");
    const r = await poll(id);
    expect([r.leaf, r.leaf_source]).toEqual(["pdn", "declared"]);
  });

  it("a title match sets source title", async () => {
    const id = await dropAs("PDN-3.pdf", "pdf");
    const r = await poll(id);
    expect([r.leaf, r.leaf_source]).toEqual(["pdn", "title"]);
  });

  it("a notice-named drop that parks carries candidates, best first", async () => {
    const id = await drop("notice.pdf");
    const r = await poll(id);
    expect(r.stage).toBe("awaiting_kind");
    expect(r.leaf_candidates?.map((c) => [c.leaf, c.score, c.evidence_ref.page])).toEqual([["pcn", 0.55, 1], ["pdn", 0.4, 1]]);
  });

  it("an unhinted parked drop carries no leaf_candidates key", async () => {
    const id = await drop("scan.pdf");
    const raw = (await fetchIngestStatus(id)) as Record<string, unknown>;
    expect("leaf_candidates" in raw).toBe(false);
  });

  it("the candidates are gone after a correction", async () => {
    const id = await drop("notice.pdf");
    await poll(id);
    const raw = (await correctIngestLeaf(id, "pcn")) as Record<string, unknown>;
    expect("leaf_candidates" in raw).toBe(false);
    expect(readIngestStatusRow(raw)!.leaf_candidates).toBeUndefined();
  });

  it("a correction at review goes back to received, then to review with (leaf, corrected, mock-caller)", async () => {
    const id = await drop("PCN-5.pdf");
    await poll(id);
    expect((await poll(id)).stage).toBe("review");
    const r = readIngestStatusRow(await correctIngestLeaf(id, "pdn"))!;
    expect([r.stage, r.leaf, r.leaf_source, r.corrected_by]).toEqual(["received", "pdn", "corrected", "mock-caller"]);
    await poll(id);
    const next = await poll(id);
    expect([next.stage, next.leaf, next.leaf_source, next.corrected_by]).toEqual(["review", "pdn", "corrected", "mock-caller"]);
  });

  it("the same leaf is a no-op", async () => {
    const id = await drop("PCN-5.pdf");
    await poll(id);
    expect((await poll(id)).stage).toBe("review");
    const r = readIngestStatusRow(await correctIngestLeaf(id, "pcn"))!;
    expect([r.stage, r.leaf, r.leaf_source, r.corrected_by ?? null]).toEqual(["review", "pcn", "title", null]);
  });

  it("the notice candidates draw one title crop in page fractions", async () => {
    const id = await drop("notice.pdf");
    const r = await poll(id);
    expect(r.leaf_candidates?.map((c) => c.evidence_ref.bbox)).toEqual([[0.07, 0.03, 0.92, 0.07], [0.07, 0.03, 0.92, 0.07]]);
  });

  it("a correction at received or extracting leaves the stage unchanged", async () => {
    const id = await dropAs("scan.pdf", "pdf");
    expect(readIngestStatusRow(await correctIngestLeaf(id, "pcn"))!.stage).toBe("received");
    await poll(id);
    expect(readIngestStatusRow(await correctIngestLeaf(id, "pdn"))!.stage).toBe("extracting");
  });
});
