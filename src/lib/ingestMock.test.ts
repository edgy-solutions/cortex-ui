/**
 * THE MOCK SPEAKS THE WIRE THE READER READS. Nothing else drives `ingestMock` through
 * `ingestWire`'s readers, so a mock left on an old shape would pass every test and draw an empty
 * panel in mock mode — the reader returns null, and null draws nothing. Every response the mock
 * emits goes through the same reader the real transport's responses go through.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { uploadIngest, fetchIngestStatus, __resetIngestMock } from "./ingestMock";
import { readIngestUploadId, readIngestStatusRow, ingestPollingDone } from "./ingestWire";

const file = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" });

beforeEach(() => __resetIngestMock());

describe("ingestMock responses are accepted by the ingestWire readers", () => {
  it("a new arrival: the upload id reads, and EVERY row the mock walks through reads, to review, where it parks for a human", async () => {
    const id = readIngestUploadId(await uploadIngest(file("spec.pdf"), "pdf", "alice@example.com"));
    expect(id, "readIngestUploadId refused the mock's upload response").not.toBeNull();
    // The mock advances a stage per fetch. Poll it the way the card does, and refuse any row the
    // reader rejects — one stage the mock spells wrong would leave the card blank at that step.
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const row = readIngestStatusRow(await fetchIngestStatus(id!));
      expect(row, `readIngestStatusRow refused the mock's row after ${seen.join(" → ") || "the upload"}`).not.toBeNull();
      seen.push(String(row!.stage));
      if (row!.stage === "review") break;
    }
    expect(seen.at(-1), `the mock never parked at review: ${seen.join(" → ")}`).toBe("review");
    expect(ingestPollingDone(readIngestStatusRow(await fetchIngestStatus(id!))!), "review must keep polling").toBe(false);
  });

  it("a duplicate: both reads accept it, and the row carries the duplicate object", async () => {
    await uploadIngest(file("spec.pdf"), "pdf", "alice@example.com");
    const id = readIngestUploadId(await uploadIngest(file("spec-dup.pdf"), "pdf", "alice@example.com"));
    expect(id, "readIngestUploadId refused the mock's duplicate upload response").not.toBeNull();
    const row = readIngestStatusRow(await fetchIngestStatus(id!));
    expect(row, "readIngestStatusRow refused the mock's duplicate row").not.toBeNull();
    expect(row!.duplicate?.of_ingest_id).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  // The roll-11 capture showed a duplicate's own ingest_id is a uuid, not sha256 — mirrored here
  // (M7 fires this test if the mock's duplicate id regresses back to sha form).
  it("a duplicate upload yields a uuid ingest_id, the reader accepts its row, and its stage does not advance on a second fetch", async () => {
    await uploadIngest(file("spec.pdf"), "pdf", "alice@example.com");
    const id = readIngestUploadId(await uploadIngest(file("spec-dup.pdf"), "pdf", "alice@example.com"));
    expect(id, "readIngestUploadId refused the mock's duplicate upload response").not.toBeNull();
    expect(id, "a duplicate's own ingest_id must not be sha256 form").not.toMatch(/^sha256:/);

    const first = readIngestStatusRow(await fetchIngestStatus(id!));
    expect(first, "readIngestStatusRow refused the mock's duplicate row").not.toBeNull();
    const second = readIngestStatusRow(await fetchIngestStatus(id!));
    expect(second, "readIngestStatusRow refused the mock's duplicate row on a second fetch").not.toBeNull();
    expect(second!.stage, "a duplicate row must not advance on a second fetch").toBe(first!.stage);
  });
});
