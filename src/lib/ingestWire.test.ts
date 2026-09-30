import { describe, it, expect } from "vitest";
import {
  readIngestStatusRow,
  readIngestUploadId,
  readProvenanceFloor,
  readIngestErrorMessage,
  isIngestNotFoundError,
  promotionIngestId,
  payloadMatchesIngestId,
  ingestStageLadder,
  ingestPollingDone,
  INGEST_KINDS,
  INGEST_STATUSES,
} from "./ingestWire";

const row = (over: Record<string, unknown> = {}) => ({
  id: "3f9a2b",
  sha256: "3f9a2b",
  kind: "pdf",
  object_prefix: "ingest/3f9a2b/",
  submitted_by: "alice@example.com",
  on_behalf_of: "alice@example.com",
  source: "upload.pdf",
  status: "received",
  extracted_count: null,
  extracted_total: null,
  duplicate_of: null,
  detail: null,
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
  ...over,
});

describe("readIngestStatusRow", () => {
  it("reads a well-formed row", () => {
    const r = readIngestStatusRow(row());
    expect(r?.id).toBe("3f9a2b");
    expect(r?.kind).toBe("pdf");
    expect(r?.status).toBe("received");
  });

  it("rejects malformed input", () => {
    expect(readIngestStatusRow(null)).toBeNull();
    expect(readIngestStatusRow({})).toBeNull();
    expect(readIngestStatusRow(row({ id: undefined }))).toBeNull();
    expect(readIngestStatusRow(row({ sha256: "" }))).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(readIngestStatusRow(row({ kind: "spreadsheet" }))).toBeNull();
  });

  it("rejects an UNKNOWN status value rather than passing it through", () => {
    expect(readIngestStatusRow(row({ status: "made_up_status" }))).toBeNull();
  });

  it("reads every documented status, including the out-of-band duplicate", () => {
    for (const status of [...INGEST_STATUSES, "duplicate"]) {
      expect(readIngestStatusRow(row({ status }))?.status).toBe(status);
    }
  });

  it("reads extracted_count/extracted_total when present, null when absent", () => {
    expect(readIngestStatusRow(row())?.extracted_count).toBeNull();
    expect(readIngestStatusRow(row({ extracted_count: 4, extracted_total: 10 }))?.extracted_count).toBe(4);
    expect(readIngestStatusRow(row({ extracted_count: 4, extracted_total: 10 }))?.extracted_total).toBe(10);
  });

  it("reads duplicate_of and detail for a duplicate row", () => {
    const r = readIngestStatusRow(
      row({ status: "duplicate", duplicate_of: "a1b2c3", detail: "already processed on 2026-09-29 from upload.pdf" }),
    );
    expect(r?.duplicate_of).toBe("a1b2c3");
    expect(r?.detail).toMatch(/already processed/);
  });

  it("source is null rather than a fabricated string when absent", () => {
    expect(readIngestStatusRow(row({ source: undefined }))?.source).toBeNull();
  });
});

describe("readIngestUploadId", () => {
  it("reads the id off either POST /ingest response shape", () => {
    expect(readIngestUploadId({ id: "abc", status: "received", object_prefix: "x/" })).toBe("abc");
    expect(readIngestUploadId({ id: "abc", status: "duplicate", detail: "d", duplicate_of: "xyz" })).toBe("abc");
  });

  it("rejects malformed input", () => {
    expect(readIngestUploadId(null)).toBeNull();
    expect(readIngestUploadId({})).toBeNull();
    expect(readIngestUploadId({ id: "" })).toBeNull();
  });
});

describe("readProvenanceFloor — unchanged by the real-wire revision", () => {
  it("is null when the field is absent", () => {
    expect(readProvenanceFloor({ archetype: "X" })).toBeNull();
  });

  it("is non-null with an empty ingest_ids array — a valid floor with nothing to warn about", () => {
    const result = readProvenanceFloor({ provenance_floor: { obtained_via: "direct", ingest_ids: [] } });
    expect(result).toEqual({ obtained_via: "direct", ingest_ids: [] });
  });

  it("is non-null for a non-empty ingest_ids array", () => {
    const result = readProvenanceFloor({ provenance_floor: { obtained_via: "user-drop", ingest_ids: ["ing-1"] } });
    expect(result?.ingest_ids).toEqual(["ing-1"]);
  });

  it("accepts the unstamped rung, which is not one of the SDK's five", () => {
    const result = readProvenanceFloor({ provenance_floor: { obtained_via: "unstamped", ingest_ids: [] } });
    expect(result?.obtained_via).toBe("unstamped");
  });

  it("is null for an unknown rung", () => {
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "vibes", ingest_ids: [] } })).toBeNull();
  });

  it("is null when ingest_ids is not a string array", () => {
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "direct", ingest_ids: [1, 2] } })).toBeNull();
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "direct" } })).toBeNull();
  });
});

describe("readIngestErrorMessage", () => {
  it("reads a plain-string detail — the upload route's 400/403/413 shape", () => {
    const err = { response: { status: 413, data: { detail: "file exceeds 50MiB" } } };
    expect(readIngestErrorMessage(err)).toBe("file exceeds 50MiB");
  });

  it("reads a {message} object nested under detail — the act route's PromotionRefused shape", () => {
    const err = {
      response: {
        status: 503,
        data: { detail: { error: "promotion_store_unconfigured", task_id: "t1", message: "promotion store not configured" } },
      },
    };
    expect(readIngestErrorMessage(err)).toBe("promotion store not configured");
  });

  it("is null when neither shape is present", () => {
    expect(readIngestErrorMessage(new Error("network"))).toBeNull();
    expect(readIngestErrorMessage({ response: { status: 500, data: {} } })).toBeNull();
    expect(readIngestErrorMessage(null)).toBeNull();
  });
});

describe("isIngestNotFoundError", () => {
  it("is true only for a 404 response", () => {
    expect(isIngestNotFoundError({ response: { status: 404 } })).toBe(true);
    expect(isIngestNotFoundError({ response: { status: 403 } })).toBe(false);
    expect(isIngestNotFoundError(new Error("x"))).toBe(false);
    expect(isIngestNotFoundError(null)).toBe(false);
  });
});

describe("promotionIngestId — THE ID BRIDGE", () => {
  it("prefixes the bare sha256", () => {
    expect(promotionIngestId({ sha256: "deadbeef" })).toBe("sha256:deadbeef");
  });

  it("a naive bare-vs-prefixed comparison never matches — the reason the bridge exists", () => {
    const bareSha = "deadbeef";
    const taskIngestId = "sha256:deadbeef";
    expect((bareSha as string) === taskIngestId).toBe(false);
    expect(promotionIngestId({ sha256: bareSha })).toBe(taskIngestId);
  });

  it("does not double-prefix an already-prefixed mistake into a false match", () => {
    const alreadyPrefixed = "sha256:deadbeef";
    const mistakenlyBridged = promotionIngestId({ sha256: alreadyPrefixed });
    expect(mistakenlyBridged).toBe("sha256:sha256:deadbeef");
    expect(mistakenlyBridged).not.toBe(promotionIngestId({ sha256: "deadbeef" }));
  });
});

describe("payloadMatchesIngestId", () => {
  it("matches only an exact ingest_id field", () => {
    expect(payloadMatchesIngestId({ ingest_id: "sha256:deadbeef" }, "sha256:deadbeef")).toBe(true);
    expect(payloadMatchesIngestId({ ingest_id: "deadbeef" }, "sha256:deadbeef")).toBe(false);
  });

  it("is false, never throws, on malformed payload", () => {
    expect(payloadMatchesIngestId(null, "sha256:deadbeef")).toBe(false);
    expect(payloadMatchesIngestId("nope", "sha256:deadbeef")).toBe(false);
    expect(payloadMatchesIngestId({}, "sha256:deadbeef")).toBe(false);
  });
});

describe("ingestStageLadder", () => {
  it("marks earlier statuses done and the current status current", () => {
    expect(ingestStageLadder("extracting")).toEqual([
      { stage: "received", state: "done" },
      { stage: "classified", state: "done" },
      { stage: "extracting", state: "current" },
      { stage: "extracted", state: "pending" },
      { stage: "review", state: "pending" },
      { stage: "promoted", state: "pending" },
    ]);
  });

  it("received marks only itself current, the rest pending", () => {
    const ladder = ingestStageLadder("received");
    expect(ladder[0]).toEqual({ stage: "received", state: "current" });
    expect(ladder.slice(1).every((r) => r.state === "pending")).toBe(true);
  });

  it("rejected is drawn as a terminal branch off review, NOT as past promoted", () => {
    const ladder = ingestStageLadder("rejected");
    expect(ladder).toEqual([
      { stage: "received", state: "done" },
      { stage: "classified", state: "done" },
      { stage: "extracting", state: "done" },
      { stage: "extracted", state: "done" },
      { stage: "review", state: "done" },
      { stage: "promoted", state: "pending" },
      { stage: "rejected", state: "current" },
    ]);
    // the one assertion a mutant blind to the branch would fire on
    expect(ladder.find((r) => r.stage === "promoted")?.state).toBe("pending");
  });

  it("promoted marks the whole main track done/current with no branch rung", () => {
    const ladder = ingestStageLadder("promoted");
    expect(ladder.find((r) => r.stage === "promoted")?.state).toBe("current");
    expect(ladder.some((r) => r.stage === "rejected")).toBe(false);
  });
});

describe("ingestPollingDone", () => {
  it("is true for promoted, rejected and duplicate", () => {
    for (const status of ["promoted", "rejected", "duplicate"] as const) {
      expect(ingestPollingDone({ status })).toBe(true);
    }
  });

  it("keeps polling through received/classified/extracting/extracted/review", () => {
    for (const status of ["received", "classified", "extracting", "extracted", "review"] as const) {
      expect(ingestPollingDone({ status })).toBe(false);
    }
  });
});

describe("INGEST_KINDS", () => {
  it("is exactly the closed pdf/cad set — no kinds route to fetch it from", () => {
    expect([...INGEST_KINDS]).toEqual(["pdf", "cad"]);
  });
});
