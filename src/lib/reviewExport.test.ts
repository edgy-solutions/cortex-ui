import { describe, it, expect } from "vitest";
import type { Artifact } from "@/api/types";
import {
  EXPORT_BATCH_CAPABILITY,
  FIXTURE_ENTITLEMENTS,
  FIXTURE_154_PROFILES,
  exportNoticesBody,
  lassoTargets,
  profilesFor,
  readExportCheck,
  readUnexportableRefusal,
  selectionNotices,
  type ExportProfile,
  type ExportTarget,
  canExportBatch,
  filenameFromDisposition,
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

describe("readExportProfiles: #356's declared keys", () => {
  // The sample listing in #356's shape.
  const sample = { ...base, accepts: null, grain: "per_notice", version: 2, dedupe: ["Part"], exportable_states: ["synthetic-state-a"] };
  it("accepts #356's sample: int version, list dedupe, accepts null, exportable_states", () => {
    const out = readExportProfiles([sample]);
    expect(out?.[0]).toMatchObject({ accepts: null, grain: "per_notice", version: 2, dedupe: ["Part"], exportable_states: ["synthetic-state-a"] });
  });
  it("accepts a list for accepts", () => {
    expect(readExportProfiles([{ ...base, accepts: ["k1", "k2"] }])?.[0]?.accepts).toEqual(["k1", "k2"]);
  });
  it.each([
    ["accepts: a string", { accepts: "x" }],
    ["accepts: an empty string entry", { accepts: [""] }],
    ["accepts: a non-string entry", { accepts: [1] }],
    ["grain: empty", { grain: "" }],
    ["grain: a number", { grain: 1 }],
    ["version: a string", { version: "3" }],
    ["version: a fraction", { version: 1.5 }],
    ["dedupe: a boolean", { dedupe: true }],
    ["dedupe: a non-string entry", { dedupe: [1] }],
    ["exportable_states: a string", { exportable_states: "x" }],
    ["exportable_states: an empty entry", { exportable_states: [""] }],
    ["exportable_states: null", { exportable_states: null }],
  ])("refuses the WHOLE body on %s", (_n, extra) => {
    expect(readExportProfiles([{ ...base }, { ...base, name: "q", ...extra }])).toBeNull();
  });
  it("absent keys are accepted and stay absent (an older BFF)", () => {
    const p = readExportProfiles([base])![0]!;
    for (const k of ["accepts", "grain", "dedupe", "version", "exportable_states"]) expect(k in p).toBe(false);
  });
});

/** SYNTHETIC profiles, local to this file (the shipped mock mirrors the producer's real rows, so it cannot stand in here). */
const SYNTH_STATES = ["synthetic-state-a", "synthetic-state-b"];
const SYNTH_PROFILES: ExportProfile[] = ["default-csv", "default-json", "part-list"].map((name) => ({
  name,
  format: "csv",
  granularity: "notice_part",
  accepts: name === "part-list" ? null : ["synthetic-kind-a"],
  grain: name === "part-list" ? "per_part" : "per_notice",
  version: 1,
  dedupe: [],
  exportable_states: [...SYNTH_STATES],
}));
describe("profilesFor", () => {
  const mk = (name: string, extra: Partial<ExportProfile> = {}): ExportProfile => ({ ...base, name, exportable_states: ["synthetic-state-a"], ...extra });
  const t = (kind: string | null, state: string | null, ingestId = "i"): ExportTarget => ({ ingestId, kind, state });
  const names = (ps: ExportProfile[]) => ps.map((p) => p.name);

  it("no targets offers nothing", () => expect(profilesFor([mk("z")], [])).toEqual([]));
  it("keeps served order", () => {
    expect(names(profilesFor([mk("z"), mk("y"), mk("x")], [t("k", "synthetic-state-a")]))).toEqual(["z", "y", "x"]);
  });

  // condition 1: exportable_states declared
  it("1 near: a profile declaring exportable_states is offered", () => {
    expect(names(profilesFor([mk("z")], [t("k", "synthetic-state-a")]))).toEqual(["z"]);
  });
  it("1 far: a profile with exportable_states ABSENT is never offered", () => {
    const p = mk("z");
    delete p.exportable_states;
    expect(profilesFor([p], [t("k", "synthetic-state-a")])).toEqual([]);
    expect(profilesFor([p], [t(null, null)])).toEqual([]);
  });

  // condition 2: accepts
  it("2 near: every known kind in accepts is offered", () => {
    const ps = [mk("z", { accepts: ["a", "b"] })];
    expect(names(profilesFor(ps, [t("a", "synthetic-state-a"), t("b", "synthetic-state-a")]))).toEqual(["z"]);
  });
  it("2 far: one kind outside accepts refuses the profile", () => {
    const ps = [mk("z", { accepts: ["a"] })];
    expect(profilesFor(ps, [t("a", "synthetic-state-a"), t("b", "synthetic-state-a")])).toEqual([]);
  });
  it("2: accepts null offers any kind; so does accepts absent", () => {
    expect(names(profilesFor([mk("z", { accepts: null }), mk("y")], [t("anything", "synthetic-state-a")]))).toEqual(["z", "y"]);
  });
  it("2: an unknown kind does not block", () => {
    expect(names(profilesFor([mk("z", { accepts: ["a"] })], [t("a", "synthetic-state-a"), t(null, "synthetic-state-a")]))).toEqual(["z"]);
  });

  // condition 3: states
  it("3 near: one target in an exportable state is enough", () => {
    expect(names(profilesFor([mk("z")], [t("k", "synthetic-state-b"), t("k", "synthetic-state-a")]))).toEqual(["z"]);
  });
  it("3 far: every target in a state the profile does not list refuses it", () => {
    expect(profilesFor([mk("z")], [t("k", "synthetic-state-b"), t("k", "synthetic-state-c")])).toEqual([]);
  });
  it("3: an unknown state does not block (the server decides)", () => {
    expect(names(profilesFor([mk("z")], [t("k", null)]))).toEqual(["z"]);
  });
  it("one notice, a known state: only the profiles listing that state", () => {
    const ps = [mk("z", { exportable_states: ["synthetic-state-a"] }), mk("y", { exportable_states: ["synthetic-state-b"] }), mk("x", { exportable_states: [] })];
    expect(names(profilesFor(ps, [t("k", "synthetic-state-b")]))).toEqual(["y"]);
  });
  it("the fixture offers its sample set for a synthetic state, nothing for another", () => {
    expect(names(profilesFor(SYNTH_PROFILES, [t("synthetic-kind-a", "synthetic-state-a")]))).toEqual(["default-csv", "default-json", "part-list"]);
    expect(names(profilesFor(SYNTH_PROFILES, [t("synthetic-kind-b", "synthetic-state-a")]))).toEqual(["part-list"]);
    expect(profilesFor(SYNTH_PROFILES, [t("synthetic-kind-a", "synthetic-state-zzz")])).toEqual([]);
  });
});

describe("readExportCheck", () => {
  const ok = { profile: "p", version: 2, notices: 3, unexportable: [{ notice_id: "i-1", reason: "state_not_exportable", state: "synthetic-state-a" }, { notice_id: "i-2", reason: "not_available" }] };
  it("reads #356's check_only body; an absent state is null", () => {
    expect(readExportCheck(ok)).toEqual({
      profile: "p",
      version: 2,
      notices: 3,
      unexportable: [
        { notice_id: "i-1", reason: "state_not_exportable", state: "synthetic-state-a" },
        { notice_id: "i-2", reason: "not_available", state: null },
      ],
    });
  });
  it("reads an empty unexportable list", () => expect(readExportCheck({ ...ok, unexportable: [] })?.unexportable).toEqual([]));
  it.each([
    ["not an object", "x"],
    ["no profile", { ...ok, profile: "" }],
    ["version a string", { ...ok, version: "2" }],
    ["notices negative", { ...ok, notices: -1 }],
    ["notices a fraction", { ...ok, notices: 1.5 }],
    ["unexportable missing", { profile: "p", version: 1, notices: 0 }],
    ["an entry with an empty notice_id", { ...ok, unexportable: [{ notice_id: "", reason: "r" }] }],
    ["an entry with no reason", { ...ok, unexportable: [{ notice_id: "i" }] }],
    ["a state that is not a string", { ...ok, unexportable: [{ notice_id: "i", reason: "r", state: 3 }] }],
  ])("null on %s", (_n, body) => expect(readExportCheck(body)).toBeNull());
});

describe("readUnexportableRefusal", () => {
  const err = (data: unknown) => ({ response: { status: 422, data } });
  it("reads detail.unexportable by shape, whatever the error code", () => {
    const rows = [{ notice_id: "i-1", reason: "state_not_exportable", state: "synthetic-state-a" }];
    expect(readUnexportableRefusal(err({ detail: { error: "export_notices_unexportable", unexportable: rows, message: "m" } }))).toEqual(rows);
    expect(readUnexportableRefusal(err({ detail: { error: "some_other_code", unexportable: rows } }))).toEqual(rows);
  });
  it("null when absent or malformed", () => {
    expect(readUnexportableRefusal(err({ detail: { error: "x" } }))).toBeNull();
    expect(readUnexportableRefusal(err({ detail: "plain" }))).toBeNull();
    expect(readUnexportableRefusal(err({ detail: { unexportable: [{ notice_id: 1, reason: "r" }] } }))).toBeNull();
    expect(readUnexportableRefusal(new Error("x"))).toBeNull();
  });
});

describe("exportNoticesBody", () => {
  it("carries ingest ids as notice_ids; check_only only when true; never destination", () => {
    expect(exportNoticesBody("p", { notice_ids: ["a", "b"] }, false)).toEqual({ notice_ids: ["a", "b"], profile: "p" });
    expect("check_only" in exportNoticesBody("p", { notice_ids: ["a"] }, false)).toBe(false);
    expect(exportNoticesBody("p", { notice_ids: ["a"] }, true)).toEqual({ notice_ids: ["a"], profile: "p", check_only: true });
    expect("destination" in exportNoticesBody("p", { notice_ids: ["a"] }, true)).toBe(false);
  });
});

describe("exportNoticesBody, the range selector (#364)", () => {
  it("a range body has range and NO notice_ids; an ids body has notice_ids and NO range", () => {
    const r = exportNoticesBody("p", { range: { from: "2026-01-01", to: "2026-01-31" } }, true);
    expect(r).toEqual({ range: { from: "2026-01-01", to: "2026-01-31" }, profile: "p", check_only: true });
    expect("notice_ids" in r).toBe(false);
    expect("range" in exportNoticesBody("p", { notice_ids: ["a"] }, true)).toBe(false);
  });
});

describe("readExportCheck, a range reply (#364)", () => {
  const rangeReply = { profile: "p", version: 1, notices: 2, unexportable: [], range: { from: "2026-01-01", to: "2026-01-02", field: "created_at" }, notice_ids: ["a", "b"] };
  it("reads the resolved notice_ids", () => expect(readExportCheck(rangeReply, { range: true })?.noticeIds).toEqual(["a", "b"]));
  it("a range reply with no notice_ids is malformed", () => {
    const { notice_ids: _n, ...rest } = rangeReply;
    expect(readExportCheck(rest, { range: true })).toBeNull();
  });
  it("notice_ids that is not a list of strings is malformed", () => {
    expect(readExportCheck({ ...rangeReply, notice_ids: [1] }, { range: true })).toBeNull();
    expect(readExportCheck({ ...rangeReply, notice_ids: "a" }, { range: true })).toBeNull();
  });
  it("an undeclared extra key is tolerated", () => expect(readExportCheck({ ...rangeReply, undeclared: 1 }, { range: true })?.noticeIds).toEqual(["a", "b"]));
  it("an ids check carries no noticeIds even when the reply has one", () => expect(readExportCheck(rangeReply)?.noticeIds).toBeUndefined());
});

describe("lassoTargets", () => {
  const ingest = (id: string, ingestId: string | null, kind?: string): Artifact =>
    ({ id, summary: "", rendered_output: { components: [{ archetype: "INGEST", ingest: { ingest_id: ingestId, ...(kind ? { content_kind: kind } : {}) } }] } }) as unknown as Artifact;
  it("kind and state from the row; stage kept verbatim; the component's kind is the fallback; unknown stays null", () => {
    const rows = {
      "i-1": { stage: "synthetic-state-a", content_kind: "k-row" },
      "i-2": { stage: null },
    } as unknown as Parameters<typeof lassoTargets>[2];
    const out = lassoTargets([ingest("a1", "i-1", "k-comp"), ingest("a2", "i-2", "k-comp"), ingest("a3", "i-3")], ["a1", "a2", "a3"], rows);
    expect(out.targets).toEqual([
      { ingestId: "i-1", kind: "k-row", state: "synthetic-state-a", label: "drop i-1" },
      { ingestId: "i-2", kind: "k-comp", state: null, label: "drop i-2" },
      { ingestId: "i-3", kind: null, state: null, label: "drop i-3" },
    ]);
  });
  it("label (0.4.88): the row's notice number, else the card's, else drop <12 hex>", () => {
    const card = (id: string, ingestId: string, notice?: string): Artifact =>
      ({ id, summary: "", rendered_output: { components: [{ archetype: "INGEST", ingest: { ingest_id: ingestId, ...(notice ? { notice_id: notice } : {}) } }] } }) as unknown as Artifact;
    const long = "sha256:" + "3f9a1c7e5b2d" + "0".repeat(52);
    const rows = { "i-1": { notice_id: "PCN-1" } } as unknown as Parameters<typeof lassoTargets>[2];
    const out = lassoTargets([card("a1", "i-1", "PCN-card"), card("a2", "i-2", "PCN-2"), card("a3", long)], ["a1", "a2", "a3"], rows);
    expect(out.targets.map((t) => t.label)).toEqual(["PCN-1", "PCN-2", "drop 3f9a1c7e5b2d"]);
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
