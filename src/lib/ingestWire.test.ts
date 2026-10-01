import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  readIngestStatusRow,
  readIngestUploadId,
  readProvenanceFloor,
  provenanceFloorIsUnverified,
  readIngestErrorMessage,
  readActRefusal,
  isIngestNotFoundError,
  promotionIngestId,
  payloadMatchesIngestId,
  ingestStageLadder,
  ingestPollingDone,
  INGEST_KINDS,
  INGEST_STAGES,
} from "./ingestWire";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const row = (over: Record<string, unknown> = {}) => ({
  ingest_id: `sha256:${SHA_A}`,
  sha256: SHA_A,
  kind: "pdf",
  stage: "received",
  detail: null,
  duplicate: null,
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
  ...over,
});

describe("readIngestStatusRow", () => {
  it("reads a well-formed row", () => {
    const r = readIngestStatusRow(row());
    expect(r?.ingest_id).toBe(`sha256:${SHA_A}`);
    expect(r?.kind).toBe("pdf");
    expect(r?.stage).toBe("received");
  });

  it("rejects non-record input", () => {
    expect(readIngestStatusRow(null)).toBeNull();
    expect(readIngestStatusRow({})).toBeNull();
  });

  // one rejecting case per rule, that rule the only thing wrong in its fixture
  it("rejects an ingest_id that does not match sha256:<64 hex>", () => {
    expect(readIngestStatusRow(row({ ingest_id: "not-a-sha" }))).toBeNull();
    expect(readIngestStatusRow(row({ ingest_id: `sha256:${SHA_A.slice(0, 63)}` }))).toBeNull();
    expect(readIngestStatusRow(row({ ingest_id: undefined }))).toBeNull();
  });

  it("rejects a blank sha256", () => {
    expect(readIngestStatusRow(row({ sha256: "" }))).toBeNull();
    expect(readIngestStatusRow(row({ sha256: undefined }))).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(readIngestStatusRow(row({ kind: "spreadsheet" }))).toBeNull();
  });

  it("rejects an unknown stage string rather than passing it through", () => {
    expect(readIngestStatusRow(row({ stage: "made_up_stage" }))).toBeNull();
  });

  it("rejects a null stage with no duplicate", () => {
    expect(readIngestStatusRow(row({ stage: null, duplicate: null }))).toBeNull();
  });

  it("rejects rejected/failed with a blank or absent detail", () => {
    expect(readIngestStatusRow(row({ stage: "rejected", detail: null }))).toBeNull();
    expect(readIngestStatusRow(row({ stage: "rejected", detail: "" }))).toBeNull();
    expect(readIngestStatusRow(row({ stage: "failed", detail: undefined }))).toBeNull();
  });

  it("rejects a duplicate record with a blank of_ingest_id or message", () => {
    expect(readIngestStatusRow(row({ duplicate: { of_ingest_id: "", message: "m" } }))).toBeNull();
    expect(readIngestStatusRow(row({ duplicate: { of_ingest_id: `sha256:${SHA_B}`, message: "" } }))).toBeNull();
  });

  it("rejects a blank or absent created_at/updated_at", () => {
    expect(readIngestStatusRow(row({ created_at: "" }))).toBeNull();
    expect(readIngestStatusRow(row({ updated_at: undefined }))).toBeNull();
  });

  // the near side
  it("accepts a null stage WITH a duplicate", () => {
    const r = readIngestStatusRow(
      row({ stage: null, duplicate: { of_ingest_id: `sha256:${SHA_B}`, message: "already processed" } }),
    );
    expect(r?.stage).toBeNull();
    expect(r?.duplicate).toEqual({ of_ingest_id: `sha256:${SHA_B}`, message: "already processed" });
  });

  it("accepts a null detail on received", () => {
    const r = readIngestStatusRow(row({ stage: "received", detail: null }));
    expect(r?.detail).toBeNull();
  });

  it("reads every documented stage", () => {
    for (const stage of INGEST_STAGES) {
      const detail = stage === "rejected" || stage === "failed" ? "a reason" : null;
      expect(readIngestStatusRow(row({ stage, detail }))?.stage).toBe(stage);
    }
  });
});

describe("readIngestUploadId", () => {
  it("reads ingest_id, not id", () => {
    expect(readIngestUploadId({ ingest_id: `sha256:${SHA_A}`, stage: "received" })).toBe(`sha256:${SHA_A}`);
  });

  it("rejects malformed input, including a bare id field", () => {
    expect(readIngestUploadId(null)).toBeNull();
    expect(readIngestUploadId({})).toBeNull();
    expect(readIngestUploadId({ ingest_id: "" })).toBeNull();
    expect(readIngestUploadId({ id: `sha256:${SHA_A}` })).toBeNull();
    expect(readIngestUploadId({ ingest_id: "not-a-sha" })).toBeNull();
  });
});

describe("readProvenanceFloor — unchanged by the real-wire revision", () => {
  it("is null when the field is absent", () => {
    expect(readProvenanceFloor({ archetype: "X" })).toBeNull();
  });

  it("is non-null with an empty ingest_ids array — a valid floor with nothing to warn about", () => {
    const result = readProvenanceFloor({ provenance_floor: { obtained_via: "direct", ingest_ids: [], unidentified: 0 } });
    expect(result).toEqual({ obtained_via: "direct", ingest_ids: [], unidentified: 0 });
  });

  it("is non-null for a non-empty ingest_ids array", () => {
    const result = readProvenanceFloor({ provenance_floor: { obtained_via: "user-drop", ingest_ids: ["ing-1"], unidentified: 0 } });
    expect(result?.ingest_ids).toEqual(["ing-1"]);
  });

  it("accepts the unstamped rung, which is not one of the SDK's five", () => {
    const result = readProvenanceFloor({ provenance_floor: { obtained_via: "unstamped", ingest_ids: [], unidentified: 0 } });
    expect(result?.obtained_via).toBe("unstamped");
  });

  it("is null for an unknown rung", () => {
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "vibes", ingest_ids: [], unidentified: 0 } })).toBeNull();
  });

  it("is null when ingest_ids is not a string array", () => {
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "direct", ingest_ids: [1, 2], unidentified: 0 } })).toBeNull();
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "direct" } })).toBeNull();
  });

  it("reads the unidentified COUNT through", () => {
    const r = readProvenanceFloor({ provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: 3 } });
    expect(r?.unidentified).toBe(3);
  });

  // REQUIRED, never defaulted: a reader that filled a missing count with 0 would turn "we could
  // not see it" into "there was none", which is the laundering the field exists to prevent.
  it("is null when unidentified is ABSENT — not defaulted to 0", () => {
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: "user-drop", ingest_ids: [] } })).toBeNull();
  });

  it("is null for an unidentified that is not a non-negative integer — including the packet's loose `true`", () => {
    for (const bad of [true, "1", -1, 1.5, null]) {
      expect(readProvenanceFloor({ provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: bad } }), String(bad)).toBeNull();
    }
  });

  it("is null when obtained_via is the producer's null — the answer drew on nothing", () => {
    expect(readProvenanceFloor({ provenance_floor: { obtained_via: null, ingest_ids: [], unidentified: 0 } })).toBeNull();
  });
});

describe("provenanceFloorIsUnverified — reads ingest_ids AND unidentified", () => {
  const f = (ingest_ids: string[], unidentified: number) => ({ obtained_via: "user-drop" as const, ingest_ids, unidentified });
  it("each field alone is enough, and only both empty is calm", () => {
    expect(provenanceFloorIsUnverified(f(["sha256:aa"], 0))).toBe(true);
    expect(provenanceFloorIsUnverified(f([], 1))).toBe(true);
    expect(provenanceFloorIsUnverified(f([], 0))).toBe(false);
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

  it("reads a 422 validation array, joining loc-prefixed messages", () => {
    const err = {
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ["body", "kind"], msg: "field required", type: "value_error.missing" },
            { loc: ["body", "on_behalf_of"], msg: "field required", type: "value_error.missing" },
          ],
        },
      },
    };
    expect(readIngestErrorMessage(err)).toBe("kind: field required; on_behalf_of: field required");
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

describe("readActRefusal", () => {
  it("reads a 409 ingest_node_absent refusal", () => {
    const err = {
      response: {
        status: 409,
        data: { detail: { error: "ingest_node_absent", task_id: "t1", message: "ingest node absent. Nothing was written." } },
      },
    };
    expect(readActRefusal(err)).toEqual({
      status: 409,
      error: "ingest_node_absent",
      message: "ingest node absent. Nothing was written.",
    });
  });

  it("reads a 503 promotion_store_unavailable refusal", () => {
    const err = {
      response: {
        status: 503,
        data: { detail: { error: "promotion_store_unavailable", task_id: "t1", message: "promotion store unavailable. Nothing was written." } },
      },
    };
    expect(readActRefusal(err)).toEqual({
      status: 503,
      error: "promotion_store_unavailable",
      message: "promotion store unavailable. Nothing was written.",
    });
  });

  it("is null on a string detail — the stricter read than readIngestErrorMessage", () => {
    const err = { response: { status: 403, data: { detail: "on_behalf_of must match the authenticated caller" } } };
    expect(readActRefusal(err)).toBeNull();
  });

  it("is null on malformed input", () => {
    expect(readActRefusal(null)).toBeNull();
    expect(readActRefusal({ response: { status: 503, data: { detail: { message: "no error code" } } } })).toBeNull();
  });
});

describe("promotionIngestId — THE BRIDGE IS GONE", () => {
  it("is an identity read of ingest_id", () => {
    expect(promotionIngestId({ ingest_id: `sha256:${SHA_A}` })).toBe(`sha256:${SHA_A}`);
  });
});

describe("payloadMatchesIngestId", () => {
  it("matches only an exact ingest_id field", () => {
    expect(payloadMatchesIngestId({ ingest_id: `sha256:${SHA_A}` }, `sha256:${SHA_A}`)).toBe(true);
    expect(payloadMatchesIngestId({ ingest_id: SHA_A }, `sha256:${SHA_A}`)).toBe(false);
  });

  it("is false, never throws, on malformed payload", () => {
    expect(payloadMatchesIngestId(null, `sha256:${SHA_A}`)).toBe(false);
    expect(payloadMatchesIngestId("nope", `sha256:${SHA_A}`)).toBe(false);
    expect(payloadMatchesIngestId({}, `sha256:${SHA_A}`)).toBe(false);
  });
});

describe("ingestStageLadder", () => {
  it("marks earlier stages done and the current stage current", () => {
    expect(ingestStageLadder("extracting")).toEqual([
      { stage: "received", state: "done" },
      { stage: "extracting", state: "current" },
      { stage: "awaiting_disposition", state: "pending" },
      { stage: "promoted", state: "pending" },
    ]);
  });

  it("received marks only itself current, the rest pending", () => {
    const ladder = ingestStageLadder("received");
    expect(ladder[0]).toEqual({ stage: "received", state: "current" });
    expect(ladder.slice(1).every((r) => r.state === "pending")).toBe(true);
  });

  it("awaiting_disposition marks received/extracting done and itself current", () => {
    expect(ingestStageLadder("awaiting_disposition")).toEqual([
      { stage: "received", state: "done" },
      { stage: "extracting", state: "done" },
      { stage: "awaiting_disposition", state: "current" },
      { stage: "promoted", state: "pending" },
    ]);
  });

  it("promoted marks the whole main track done/current with no branch rung", () => {
    const ladder = ingestStageLadder("promoted");
    expect(ladder.find((r) => r.stage === "promoted")?.state).toBe("current");
    expect(ladder.some((r) => r.stage === "rejected")).toBe(false);
    expect(ladder.some((r) => r.stage === "failed")).toBe(false);
  });

  it("rejected is drawn as a terminal branch off awaiting_disposition, NOT past promoted", () => {
    const ladder = ingestStageLadder("rejected");
    expect(ladder).toEqual([
      { stage: "received", state: "done" },
      { stage: "extracting", state: "done" },
      { stage: "awaiting_disposition", state: "done" },
      { stage: "promoted", state: "pending" },
      { stage: "rejected", state: "current" },
    ]);
    // the one assertion a mutant blind to the branch would fire on
    expect(ladder.find((r) => r.stage === "promoted")?.state).toBe("pending");
  });

  it("failed marks ONLY received done — the row has no failed-at field", () => {
    const ladder = ingestStageLadder("failed");
    expect(ladder).toEqual([
      { stage: "received", state: "done" },
      { stage: "extracting", state: "pending" },
      { stage: "awaiting_disposition", state: "pending" },
      { stage: "promoted", state: "pending" },
      { stage: "failed", state: "current" },
    ]);
  });
});

describe("ingestPollingDone", () => {
  it("is true for promoted, rejected and failed", () => {
    for (const stage of ["promoted", "rejected", "failed"] as const) {
      expect(ingestPollingDone({ stage, duplicate: null })).toBe(true);
    }
  });

  it("is true for any row whose duplicate is non-null, regardless of stage", () => {
    const dup = { of_ingest_id: `sha256:${SHA_B}`, message: "already processed" };
    expect(ingestPollingDone({ stage: null, duplicate: dup })).toBe(true);
    expect(ingestPollingDone({ stage: "extracting", duplicate: dup })).toBe(true);
  });

  it("keeps polling through received/extracting/awaiting_disposition", () => {
    for (const stage of ["received", "extracting", "awaiting_disposition"] as const) {
      expect(ingestPollingDone({ stage, duplicate: null })).toBe(false);
    }
  });
});

describe("INGEST_KINDS", () => {
  it("is exactly the closed pdf/cad set — no kinds route to fetch it from", () => {
    expect([...INGEST_KINDS]).toEqual(["pdf", "cad"]);
  });
});

describe("INGEST_STAGES", () => {
  it("is exactly the closed six-stage set, in order", () => {
    expect([...INGEST_STAGES]).toEqual([
      "received",
      "extracting",
      "awaiting_disposition",
      "promoted",
      "rejected",
      "failed",
    ]);
  });
});

// ── Live fixture — Lane 1's measured refusals at helm rev 162 ──────────────────────────────
// Loaded, not inlined: sessions/2026-09-30-payload-ingest-refusals-rev-162.json.

interface RefusalsFixture {
  status_404: { status: number; body: { detail: string } };
  upload_403: { status: number; body: { detail: string } };
}

function loadRefusalsFixture(): RefusalsFixture {
  const file = path.join(__dirname, "../../sessions/2026-09-30-payload-ingest-refusals-rev-162.json");
  return JSON.parse(readFileSync(file, "utf8")) as RefusalsFixture;
}

describe("Lane 1's rev-162 refusal fixture", () => {
  const fixture = loadRefusalsFixture();

  it("isIngestNotFoundError is true on the measured 404, shaped as an axios error", () => {
    const err = { response: { status: fixture.status_404.status, data: fixture.status_404.body } };
    expect(isIngestNotFoundError(err)).toBe(true);
  });

  it("readIngestErrorMessage returns the measured 403 detail verbatim", () => {
    const err = { response: { status: fixture.upload_403.status, data: fixture.upload_403.body } };
    expect(readIngestErrorMessage(err)).toBe(fixture.upload_403.body.detail);
  });
});
