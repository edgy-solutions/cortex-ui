import { describe, it, expect } from "vitest";
import type { Artifact } from "@/api/types";
import {
  EXPORT_BATCH_CAPABILITY,
  FIXTURE_ENTITLEMENTS,
  FIXTURE_154_PROFILES,
  FIXTURE_PROVISIONAL_PROFILES,
  exportScopeBody,
  fixtureResolution,
  profilesAccepting,
  readExportResolution,
  selectionNotices,
  type ExportProfile,
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
  it("reads any non-empty format verbatim; an empty or non-string one refuses the body (config names the case)", () => {
    expect(readExportProfiles([{ name: "a", format: "xlsx", granularity: "notice_part" }])).toEqual([{ name: "a", format: "xlsx", granularity: "notice_part" }]);
    expect(readExportProfiles([{ name: "a", format: "", granularity: "notice_part" }])).toBeNull();
    expect(readExportProfiles([{ name: "a", format: 3, granularity: "notice_part" }])).toBeNull();
    expect(readExportProfiles([{ name: "a", granularity: "notice_part" }])).toBeNull();
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
  const KEY = EXPORT_BATCH_CAPABILITY;
  it("true with the capability among others", () =>
    expect(canExportBatch({ capabilities: ["can_drop:pcn", KEY, "can_export:default-csv"] })).toBe(true));
  it("false with capabilities absent (a BFF older than #290)", () => expect(canExportBatch({ cells: [] })).toBe(false));
  it("false with an empty list", () => expect(canExportBatch({ capabilities: [] })).toBe(false));
  it("false with a string, not an array", () => expect(canExportBatch({ capabilities: KEY })).toBe(false));
  it("false with a near-miss key", () => expect(canExportBatch({ capabilities: [`${KEY}X`, KEY.toLowerCase()] })).toBe(false));
  it("false with only a per-profile export capability", () =>
    expect(canExportBatch({ capabilities: ["can_export:default-csv"] })).toBe(false));
  it("a group no longer opens it: capability, never group", () =>
    expect(canExportBatch({ groups: ["alert-processors"], capabilities: [] })).toBe(false));
  it("the mock's entitlements body opens it through the same reader", () =>
    expect(canExportBatch(FIXTURE_ENTITLEMENTS)).toBe(true));
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

const base = { name: "p", format: "csv", granularity: "notice_part" };

describe("readExportProfiles: the ruling-1 fields", () => {
  it("reads accepts, grain, dedupe and version", () => {
    const out = readExportProfiles([{ ...base, accepts: ["k1", "k2"], grain: "per_part", dedupe: true, version: "3" }]);
    expect(out?.[0]).toMatchObject({ accepts: ["k1", "k2"], grain: "per_part", dedupe: true, version: "3" });
  });
  it.each([
    ["accepts: a string", { accepts: "x" }],
    ["accepts: an empty string entry", { accepts: [""] }],
    ["accepts: a non-string entry", { accepts: [1] }],
    ["grain: empty", { grain: "" }],
    ["version: a number", { version: 2 }],
    ["dedupe: a string", { dedupe: "yes" }],
  ])("refuses the WHOLE body on %s", (_n, extra) => {
    expect(readExportProfiles([{ ...base }, { ...base, name: "q", ...extra }])).toBeNull();
  });
  it("absent fields stay absent", () => {
    const p = readExportProfiles([base])![0]!;
    for (const k of ["accepts", "grain", "dedupe", "version"]) expect(k in p).toBe(false);
  });
});

describe("profilesAccepting", () => {
  const mk = (name: string, accepts?: string[]): ExportProfile => ({ ...base, name, ...(accepts ? { accepts } : {}) });
  it("offers a profile that accepts every kind, in served order", () => {
    const ps = [mk("z", ["a", "b"]), mk("y", ["b", "a", "c"])];
    expect(profilesAccepting(ps, ["a", "b"]).map((p) => p.name)).toEqual(["z", "y"]);
  });
  it("does not offer a profile accepting only some of the kinds", () => {
    expect(profilesAccepting([mk("z", ["a"])], ["a", "b"])).toEqual([]);
  });
  it("never offers a profile with no accepts", () => {
    expect(profilesAccepting([mk("z")], ["a"])).toEqual([]);
  });
  it("empty kinds gives []", () => {
    expect(profilesAccepting([mk("z", ["a"])], [])).toEqual([]);
  });
  it("the provisional fixture: the sample overlay takes both kinds, the 154 pair only the first", () => {
    const out = profilesAccepting(FIXTURE_PROVISIONAL_PROFILES, ["synthetic-kind-a", "synthetic-kind-b"]);
    expect(out.map((p) => p.name)).toEqual(["part-list"]);
  });
});

describe("readExportResolution", () => {
  const ok = { notices: [{ ingest_id: "i", notice_id: null, content_kind: "k" }], unexportable: [] };
  it("reads the fixture's range resolution", () => {
    const r = readExportResolution(JSON.parse(JSON.stringify(fixtureResolution({ from: "2026-01-01", to: "2026-01-02" }))));
    expect(r?.notices).toHaveLength(2);
    expect(r?.unexportable).toHaveLength(1);
  });
  it("null for a non-object", () => expect(readExportResolution("x")).toBeNull());
  it("null when notices is missing", () => expect(readExportResolution({ unexportable: [] })).toBeNull());
  it("null for an empty content_kind", () =>
    expect(readExportResolution({ ...ok, notices: [{ ingest_id: "i", notice_id: null, content_kind: "" }] })).toBeNull());
  it("null for a reason that is not a string", () =>
    expect(readExportResolution({ ...ok, unexportable: [{ ingest_id: null, notice_id: null, reason_code: null, reason: 3 }] })).toBeNull());
  it("notice_id: null is allowed", () => expect(readExportResolution(ok)?.notices[0]?.notice_id).toBeNull());
  it("exportScopeBody spells the wire keys", () => {
    expect(exportScopeBody({ ingestIds: ["a"] })).toEqual({ ingest_ids: ["a"] });
    expect(exportScopeBody({ from: "x", to: "y" })).toEqual({ from: "x", to: "y" });
  });
});

describe("selectionNotices", () => {
  const ingest = (id: string, ingestId: string | null, summary = ""): Artifact =>
    ({ id, summary, rendered_output: { components: [{ archetype: "INGEST", ingest: { ingest_id: ingestId } }] } }) as unknown as Artifact;
  const answer = (id: string): Artifact => ({ id, summary: "an answer", rendered_output: { components: [] } }) as unknown as Artifact;
  it("keeps an ingest id and collapses duplicates", () => {
    const arts = [ingest("a1", "i-1"), ingest("a2", "i-1"), ingest("a3", "i-2")];
    expect(selectionNotices(arts, ["a1", "a2", "a3"]).ingestIds).toEqual(["i-1", "i-2"]);
  });
  it("a null ingest_id goes to notReady, labelled by summary or id", () => {
    const arts = [ingest("a1", null, "doc.pdf"), ingest("a2", null)];
    expect(selectionNotices(arts, ["a1", "a2"])).toEqual({
      ingestIds: [],
      notReady: [{ id: "a1", label: "doc.pdf" }, { id: "a2", label: "a2" }],
      others: 0,
    });
  });
  it("an answer card counts toward others", () => {
    expect(selectionNotices([answer("x")], ["x"])).toEqual({ ingestIds: [], notReady: [], others: 1 });
  });
  it("an id missing from the artifacts is ignored", () => {
    expect(selectionNotices([answer("x")], ["gone"])).toEqual({ ingestIds: [], notReady: [], others: 0 });
  });
});
