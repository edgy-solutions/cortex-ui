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

  it("a pcn-named drop advances to review with (pcn, extraction-title)", async () => {
    const id = await drop("PCN26-117.pdf");
    await poll(id);
    const r = await poll(id);
    expect(r.stage).toBe("review");
    expect([r.leaf, r.leaf_source]).toEqual(["pcn", "extraction-title"]);
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
    expect([r.leaf, r.leaf_source]).toEqual(["pdn", "extraction-title"]);
  });

  it("correctIngestLeaf from awaiting_kind resumes extraction with (pdn, ingest); the next poll reaches review", async () => {
    const id = await drop("scan.pdf");
    await poll(id);
    await poll(id);
    const r = readIngestStatusRow(await correctIngestLeaf(id, "pdn"))!;
    expect(r.stage).toBe("extracting");
    expect([r.leaf, r.leaf_source]).toEqual(["pdn", "ingest"]);
    const next = await poll(id);
    expect(next.stage).toBe("review");
    expect([next.leaf, next.leaf_source]).toEqual(["pdn", "ingest"]);
  });

  it("a correction at a terminal stage rejects with leaf_locked; an unknown id rejects 404", async () => {
    const id = await drop("PCN-1.pdf");
    // The mock has no promote verb; its failed fixture is a terminal stage too.
    __seedMockFailedFixture(id, { reason_code: "x", reason: "r" } as never);
    const err = await correctIngestLeaf(id, "pdn").then(() => null, (e: unknown) => e);
    expect(readActRefusal(err)).toMatchObject({ status: 409, error: "leaf_locked" });
    await expect(correctIngestLeaf("nope", "pcn")).rejects.toMatchObject({ response: { status: 404 } });
  });
});
