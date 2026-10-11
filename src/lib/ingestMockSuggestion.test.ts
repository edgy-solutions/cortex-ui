import { describe, it, expect, beforeEach } from "vitest";
import { uploadIngest, fetchIngestStatus, confirmIngestContentKind, __resetIngestMock } from "./ingestMock";
import { readIngestStatusRow } from "./ingestWire";

const f = (name: string) => new File(["x"], name, { type: "application/pdf" });

async function toReview(name: string) {
  const up = (await uploadIngest(f(name), "pdf", "me")) as { ingest_id: string };
  let raw: unknown;
  for (let i = 0; i < 3; i++) raw = await fetchIngestStatus(up.ingest_id);
  return { id: up.ingest_id, row: readIngestStatusRow(raw)! };
}

describe("mock: suggested_content_kind when a drop reaches review", () => {
  beforeEach(() => __resetIngestMock());
  it("pcn / pdn by filename; none otherwise; not before review", async () => {
    expect((await toReview("PCN26-117.pdf")).row.suggested_content_kind).toBe("pcn");
    expect((await toReview("my-pdn.pdf")).row.suggested_content_kind).toBe("pdn");
    const plain = await toReview("plain.pdf");
    expect(plain.row.stage).toBe("review");
    expect(plain.row.suggested_content_kind).toBeNull();
    const up = (await uploadIngest(f("pcn.pdf"), "pdf", "me")) as { ingest_id: string };
    expect(readIngestStatusRow(await fetchIngestStatus(up.ingest_id))?.suggested_content_kind).toBeNull();
  });
  it("accepts the confirm verb for a known row, 404s an unknown one", async () => {
    const { id } = await toReview("pcn.pdf");
    await expect(confirmIngestContentKind(id, "pcn")).resolves.toBeTruthy();
    await expect(confirmIngestContentKind("nope", "pcn")).rejects.toMatchObject({ response: { status: 404 } });
  });
});
