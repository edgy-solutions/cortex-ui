import { describe, it, expect } from "vitest";
import {
  AP_GROUP,
  FIXTURE_154_PROFILES,
  canExportBatch,
  filenameFromDisposition,
  isExportStage,
  profileLabel,
  readExportProfiles,
  refusalCode,
} from "./reviewExport";

describe("readExportProfiles", () => {
  it("accepts the fixture and keeps its order", () => {
    const out = readExportProfiles(JSON.parse(JSON.stringify(FIXTURE_154_PROFILES)));
    expect(out?.map((p) => p.name)).toEqual(FIXTURE_154_PROFILES.map((p) => p.name));
  });
  it("returns null for a non-array", () => {
    expect(readExportProfiles({ profiles: [] })).toBeNull();
  });
  it("returns null when one entry has no name", () => {
    expect(readExportProfiles([{ name: "a", format: "csv", granularity: "notice_part" }, { format: "csv", granularity: "notice_part" }])).toBeNull();
  });
  it("returns null for format xml", () => {
    expect(readExportProfiles([{ name: "a", format: "xml", granularity: "notice_part" }])).toBeNull();
  });
  it("reads any non-empty granularity verbatim (config names the case, architect 2026-10-30)", () => {
    expect(readExportProfiles([{ name: "a", format: "csv", granularity: "page" }])).toEqual([{ name: "a", format: "csv", granularity: "page" }]);
    expect(readExportProfiles([{ name: "a", format: "csv", granularity: "answer" }])).toEqual([{ name: "a", format: "csv", granularity: "answer" }]);
  });
  it("refuses the WHOLE body on an empty or non-string granularity", () => {
    const ok = { name: "b", format: "csv", granularity: "notice" };
    expect(readExportProfiles([ok, { name: "a", format: "csv", granularity: "" }])).toBeNull();
    expect(readExportProfiles([ok, { name: "a", format: "csv", granularity: 3 }])).toBeNull();
  });
  it("returns null for the pre-rename key: scope row, no granularity", () => {
    expect(readExportProfiles([{ name: "a", format: "csv", scope: "row" }])).toBeNull();
  });
  it("drops a numeric label but keeps the entry", () => {
    const out = readExportProfiles([{ name: "a", format: "csv", granularity: "notice_part", label: 7 }]);
    expect(out).toEqual([{ name: "a", format: "csv", granularity: "notice_part" }]);
  });
});

describe("profileLabel", () => {
  it("uses the label, else the name", () => {
    expect(profileLabel({ name: "n", format: "csv", granularity: "notice_part", label: "L" })).toBe("L");
    expect(profileLabel({ name: "n", format: "csv", granularity: "notice_part" })).toBe("n");
  });
});

describe("isExportStage", () => {
  it("is true only for promoted", () => {
    expect(isExportStage("promoted")).toBe(true);
    for (const s of ["review", "released", undefined, "PROMOTED"]) expect(isExportStage(s)).toBe(false);
  });
});

describe("canExportBatch", () => {
  it("true with the group", () => expect(canExportBatch({ groups: [AP_GROUP] })).toBe(true));
  it("false with groups absent", () => expect(canExportBatch({ cells: [] })).toBe(false));
  it("false with a string, not an array", () => expect(canExportBatch({ groups: "alert-processors" })).toBe(false));
  it("false with a near-miss name", () => expect(canExportBatch({ groups: ["alert-processors-x"] })).toBe(false));
  it("false with another group present", () => expect(canExportBatch({ groups: ["other"] })).toBe(false));
});

describe("filenameFromDisposition", () => {
  it("reads quoted, bare and filename*", () => {
    expect(filenameFromDisposition('attachment; filename="a.csv"')).toBe("a.csv");
    expect(filenameFromDisposition("attachment; filename=a.csv")).toBe("a.csv");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''a%20b.csv")).toBe("a b.csv");
  });
  it("filename* wins over filename", () => {
    expect(filenameFromDisposition("attachment; filename=\"plain.csv\"; filename*=UTF-8''star.csv")).toBe("star.csv");
  });
  it("strips path separators", () => {
    expect(filenameFromDisposition('attachment; filename="../../x.csv"')).toBe("x.csv");
  });
  it("is null otherwise", () => {
    expect(filenameFromDisposition("attachment")).toBeNull();
    expect(filenameFromDisposition(undefined)).toBeNull();
    expect(filenameFromDisposition(null)).toBeNull();
  });
});

describe("refusalCode", () => {
  it("reads status and #154's detail.error", () => {
    expect(refusalCode({ response: { status: 409, data: { detail: { error: "ingest_not_promoted" } } } })).toEqual({ status: 409, code: "ingest_not_promoted" });
  });
  it("a top-level error or reason is not #154's shape: no code", () => {
    expect(refusalCode({ response: { status: 409, data: { error: "ingest_not_promoted" } } })).toEqual({ status: 409, code: null });
    expect(refusalCode({ response: { status: 403, data: { reason: "no_group" } } })).toEqual({ status: 403, code: null });
  });
  it("a 422 validation detail (an array) reads no code", () => {
    expect(refusalCode({ response: { status: 422, data: { detail: [{ loc: ["query", "profile"] }] } } })).toEqual({ status: 422, code: null });
  });
  it("is null/null for a plain error", () => {
    expect(refusalCode(new Error("network"))).toEqual({ status: null, code: null });
  });
});
