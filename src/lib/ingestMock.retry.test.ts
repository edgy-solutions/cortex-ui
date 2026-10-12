import { describe, it, expect, beforeEach } from "vitest";
import { uploadIngest, fetchIngestStatus, mockRetryIngest, __seedMockFailedFixture, __resetIngestMock } from "./ingestMock";

const failure = { reason_code: "timeout", reason: "r", step: null, run_id: null, pin_digest: null, failed_at: 1 };
const drop = async () => ((await uploadIngest(new File(["x"], "a.pdf"), "pdf", "a@b.c", "pdf")) as { ingest_id: string }).ingest_id;

beforeEach(() => __resetIngestMock());

describe("mockRetryIngest", () => {
  it("a failed row goes back to received, attempt + 1, failure null", async () => {
    const id = await drop();
    __seedMockFailedFixture(id, failure);
    expect(await mockRetryIngest(id)).toEqual({ ingest_id: id, stage: "received", attempt: 2 });
    expect(await fetchIngestStatus(id)).toMatchObject({ failure: null, attempt: 2 });
  });
  it("a row that is not failed rejects with the wrapped 409 not_failed", async () => {
    const id = await drop();
    await expect(mockRetryIngest(id)).rejects.toMatchObject({ response: { status: 409, data: { detail: { error: "not_failed" } } } });
  });
  it("an unknown row rejects the same way", async () => {
    await expect(mockRetryIngest("nope")).rejects.toMatchObject({ response: { status: 409 } });
  });
});
