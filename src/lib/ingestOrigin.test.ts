/**
 * ingestOrigin — CORTEX-PROPOSED (see the module header). The one invariant every arm here
 * protects: ABSENT is a third state, never read as unresolved and never as resolved.
 */
import { describe, it, expect } from "vitest";
import { readIngestOrigin, originSummary, readComponentOriginUnresolved, type IngestOrigin } from "./ingestOrigin";

describe("readIngestOrigin — absent is its own state, never guessed into unresolved", () => {
  it("is null for undefined, null, and a non-object", () => {
    expect(readIngestOrigin(undefined)).toBeNull();
    expect(readIngestOrigin(null)).toBeNull();
    expect(readIngestOrigin("origin")).toBeNull();
    expect(readIngestOrigin(42)).toBeNull();
    expect(readIngestOrigin([])).toBeNull();
  });

  it("is null for an object with no recognised status", () => {
    expect(readIngestOrigin({})).toBeNull();
    expect(readIngestOrigin({ status: "pending" })).toBeNull();
    expect(readIngestOrigin({ status: "UNRESOLVED" })).toBeNull(); // case-sensitive, not normalised
  });

  it("reads a bare unresolved origin", () => {
    expect(readIngestOrigin({ status: "unresolved" })).toEqual({ status: "unresolved" });
  });

  it("reads a fully-populated resolved origin", () => {
    const raw = {
      status: "resolved",
      document_type: "engineering drawing",
      owner_domain: "meridian.example",
      program: "NP-MERIDIAN",
      evidence: [{ source: "title_block", excerpt: "NP-MERIDIAN REV C" }],
      evidence_label: "from the title block",
      steward_task_id: "task-9",
    };
    expect(readIngestOrigin(raw)).toEqual(raw);
  });

  it("evidence excerpt is optional, and null is a valid excerpt", () => {
    expect(readIngestOrigin({ status: "resolved", evidence: [{ source: "title_block" }] })).toEqual({
      status: "resolved",
      evidence: [{ source: "title_block" }],
    });
    expect(readIngestOrigin({ status: "resolved", evidence: [{ source: "s", excerpt: null }] })).toEqual({
      status: "resolved",
      evidence: [{ source: "s", excerpt: null }],
    });
  });

  it("refuses a malformed optional field rather than dropping it silently", () => {
    expect(readIngestOrigin({ status: "resolved", document_type: 7 })).toBeNull();
    expect(readIngestOrigin({ status: "resolved", program: {} })).toBeNull();
    expect(readIngestOrigin({ status: "resolved", evidence_label: [] })).toBeNull();
    expect(readIngestOrigin({ status: "resolved", steward_task_id: 9 })).toBeNull();
  });

  it("refuses malformed evidence — not an array, or an item with no source", () => {
    expect(readIngestOrigin({ status: "resolved", evidence: "from the title block" })).toBeNull();
    expect(readIngestOrigin({ status: "resolved", evidence: [{ excerpt: "x" }] })).toBeNull();
    expect(readIngestOrigin({ status: "resolved", evidence: [{ source: "" }] })).toBeNull();
    expect(readIngestOrigin({ status: "resolved", evidence: [{ source: "s", excerpt: 7 }] })).toBeNull();
  });

  it("explicit null on an optional string field is kept as null, not dropped", () => {
    expect(readIngestOrigin({ status: "resolved", document_type: null })).toEqual({
      status: "resolved",
      document_type: null,
    });
  });
});

describe("originSummary — never fabricates a missing part", () => {
  it("unresolved is always the fixed sentence, naming no field", () => {
    expect(originSummary({ status: "unresolved" })).toBe("origin unresolved — awaiting steward");
    expect(
      originSummary({ status: "unresolved", document_type: "drawing", program: "X" } as IngestOrigin),
    ).toBe("origin unresolved — awaiting steward");
  });

  it("joins the present parts with ', ', in order", () => {
    expect(
      originSummary({
        status: "resolved",
        document_type: "engineering drawing",
        program: "NP-MERIDIAN",
        evidence_label: "from the title block",
      }),
    ).toBe("engineering drawing, NP-MERIDIAN, from the title block");
  });

  it("omits a missing part rather than inventing one", () => {
    expect(originSummary({ status: "resolved", document_type: "engineering drawing" })).toBe(
      "engineering drawing",
    );
    expect(originSummary({ status: "resolved", program: "NP-MERIDIAN" })).toBe("NP-MERIDIAN");
    expect(
      originSummary({ status: "resolved", document_type: "engineering drawing", evidence_label: "from the title block" }),
    ).toBe("engineering drawing, from the title block");
  });

  it("a resolved origin with none of the three parts says so, with no fabricated part", () => {
    expect(originSummary({ status: "resolved" })).toBe("origin resolved");
    expect(originSummary({ status: "resolved", owner_domain: "x.example", steward_task_id: "t1" })).toBe(
      "origin resolved",
    );
  });

  it("a blank string part is treated as absent, not joined as empty", () => {
    expect(originSummary({ status: "resolved", document_type: "", program: "NP-MERIDIAN" })).toBe(
      "NP-MERIDIAN",
    );
  });
});

describe("readComponentOriginUnresolved — true only on a real unresolved origin", () => {
  it("true for an unresolved origin", () => {
    expect(readComponentOriginUnresolved({ origin: { status: "unresolved" } })).toBe(true);
  });

  it("false for a resolved origin", () => {
    expect(readComponentOriginUnresolved({ origin: { status: "resolved" } })).toBe(false);
  });

  it("false when origin is absent — never the unresolved default", () => {
    expect(readComponentOriginUnresolved({})).toBe(false);
    expect(readComponentOriginUnresolved({ origin: null })).toBe(false);
    expect(readComponentOriginUnresolved({ origin: undefined })).toBe(false);
  });

  it("false for a non-object component, never throws", () => {
    expect(readComponentOriginUnresolved(null)).toBe(false);
    expect(readComponentOriginUnresolved(undefined)).toBe(false);
    expect(readComponentOriginUnresolved("x")).toBe(false);
    expect(readComponentOriginUnresolved(42)).toBe(false);
  });

  it("false for a malformed origin — refused, not guessed as unresolved", () => {
    expect(readComponentOriginUnresolved({ origin: { status: "pending" } })).toBe(false);
    expect(readComponentOriginUnresolved({ origin: "unresolved" })).toBe(false);
  });
});
