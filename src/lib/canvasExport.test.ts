import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  readCanvasExport,
  artifactLink,
  canvasAnswerIds,
  readExportRecipients,
  readRecipientRequired,
  type CanvasExport,
} from "./canvasExport";
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";

const GOOD_SHA = "sha256:" + "a".repeat(64);
const GOOD_URI = "/export/package/artifact/legal-2026-09-30.zip";

const base: CanvasExport = {
  export_id: GOOD_SHA,
  status: "exists",
  recipient_scope: "legal",
  artifact_uri: GOOD_URI,
  artifact_sha256: GOOD_SHA,
};

describe("artifactLink", () => {
  it("exists + good hash + gateway-prefixed uri → link", () => {
    const link = artifactLink(base);
    expect(link).toEqual({ href: GOOD_URI, sha256: GOOD_SHA });
  });

  it("status producing → null", () => {
    expect(artifactLink({ ...base, status: "producing" })).toBeNull();
  });

  it("status failed → null", () => {
    expect(artifactLink({ ...base, status: "failed" })).toBeNull();
  });

  it("uppercase hex in sha256 → null", () => {
    expect(
      artifactLink({ ...base, artifact_sha256: "sha256:" + "A".repeat(64) }),
    ).toBeNull();
  });

  it("63-hex (short hash) → null", () => {
    expect(
      artifactLink({ ...base, artifact_sha256: "sha256:" + "a".repeat(63) }),
    ).toBeNull();
  });

  it("missing sha256: prefix → null", () => {
    expect(artifactLink({ ...base, artifact_sha256: "a".repeat(64) })).toBeNull();
  });

  it("empty artifact_uri → null", () => {
    expect(artifactLink({ ...base, artifact_uri: "" })).toBeNull();
  });

  it("uri outside /export/package/artifact/ → null", () => {
    expect(
      artifactLink({ ...base, artifact_uri: "/canvas/export/exp1/artifact" }),
    ).toBeNull();
  });
});

describe("readCanvasExport", () => {
  it("rejects a non-object", () => {
    expect(readCanvasExport(null)).toBeNull();
    expect(readCanvasExport("exp1")).toBeNull();
    expect(readCanvasExport(42)).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(
      readCanvasExport({ export_id: "e1", status: "pending", recipient_scope: "legal" }),
    ).toBeNull();
  });

  it("a failed export reads with export_id null, not absent", () => {
    const got = readCanvasExport({
      export_id: null,
      status: "failed",
      recipient_scope: "legal",
      reason: "engine returned no verifiable artifact hash",
    });
    expect(got).not.toBeNull();
    expect(got?.export_id).toBeNull();
    expect(got?.status).toBe("failed");
  });

  it("accepts a well-formed row and carries optional fields (incl. lots_disclosed/sections) through", () => {
    const got = readCanvasExport({
      export_id: GOOD_SHA,
      status: "exists",
      recipient_scope: "legal",
      artifact_uri: GOOD_URI,
      artifact_sha256: GOOD_SHA,
      artifact_bytes: 12,
      artifact_filename: "f.zip",
      algorithm_sha: "abc",
      lots_disclosed: [1, 2, 3],
      sections: ["summary", "detail"],
    });
    expect(got).toEqual({
      export_id: GOOD_SHA,
      status: "exists",
      recipient_scope: "legal",
      artifact_uri: GOOD_URI,
      artifact_sha256: GOOD_SHA,
      artifact_bytes: 12,
      artifact_filename: "f.zip",
      algorithm_sha: "abc",
      lots_disclosed: [1, 2, 3],
      sections: ["summary", "detail"],
    });
  });

  it("carries null lots_disclosed / sections through as null, not dropped", () => {
    const got = readCanvasExport({
      export_id: GOOD_SHA,
      status: "exists",
      recipient_scope: "legal",
      lots_disclosed: null,
      sections: null,
    });
    expect(got?.lots_disclosed).toBeNull();
    expect(got?.sections).toBeNull();
  });
});

describe("readExportRecipients", () => {
  it("accepts a well-formed array", () => {
    expect(readExportRecipients([{ value: "legal", label: "Legal" }])).toEqual([
      { value: "legal", label: "Legal" },
    ]);
  });

  it("is null on a non-array", () => {
    expect(readExportRecipients({ recipients: [] })).toBeNull();
    expect(readExportRecipients(null)).toBeNull();
    expect(readExportRecipients(undefined)).toBeNull();
  });

  it("is null when any element is missing a label — a partial list must not be drawn as the list", () => {
    expect(
      readExportRecipients([{ value: "legal", label: "Legal" }, { value: "finance" }]),
    ).toBeNull();
  });

  it("is null when any element is missing a value, or carries a blank one", () => {
    expect(readExportRecipients([{ label: "Legal" }])).toBeNull();
    expect(readExportRecipients([{ value: "", label: "Legal" }])).toBeNull();
  });
});

describe("readRecipientRequired", () => {
  it("is non-null only when reason is recipient_required and options read", () => {
    expect(
      readRecipientRequired({
        reason: "recipient_required",
        options: [{ value: "legal", label: "Legal" }],
      }),
    ).toEqual([{ value: "legal", label: "Legal" }]);
  });

  it("is null on a reason other than recipient_required", () => {
    expect(
      readRecipientRequired({
        reason: "not_a_recipient_you_may_export_to",
        options: [{ value: "legal", label: "Legal" }],
      }),
    ).toBeNull();
  });

  it("is null when options is malformed even though the reason matches", () => {
    expect(
      readRecipientRequired({ reason: "recipient_required", options: [{ value: "legal" }] }),
    ).toBeNull();
    expect(readRecipientRequired({ reason: "recipient_required", options: "not-an-array" })).toBeNull();
  });

  it("is null on non-record input", () => {
    expect(readRecipientRequired(null)).toBeNull();
    expect(readRecipientRequired("recipient_required")).toBeNull();
  });
});

describe("readCanvasExport — outcome", () => {
  it("copies a string outcome through", () => {
    const got = readCanvasExport({
      export_id: null,
      status: "failed",
      recipient_scope: "notional-customer-alpha",
      reason: "boom",
      outcome: "unavailable",
    });
    expect(got?.outcome).toBe("unavailable");
  });

  it("does not copy a non-string outcome", () => {
    const got = readCanvasExport({
      export_id: null,
      status: "failed",
      recipient_scope: "legal",
      outcome: 42,
    });
    expect(got?.outcome).toBeUndefined();
  });
});

// ── Lane 1's live capture, roll #11 ─────────────────────────────────────────────────────────
// sessions/2026-10-01-payload-export-package-roll-11.json. Loaded, never inlined. Seals the
// REFUSAL half of the export route only — the live engine cannot import `agent_fleet`, so every
// POST in this capture failed.

interface ExportExchange {
  request: { method: string; path: string };
  response: { status: number; body: unknown };
}

interface ExportCapture {
  captured_by: string;
  bff: string;
  exchanges: ExportExchange[];
}

function loadExportCapture(): ExportCapture {
  const file = path.join(__dirname, "../../sessions/2026-10-01-payload-export-package-roll-11.json");
  return JSON.parse(readFileSync(file, "utf8")) as ExportCapture;
}

describe("export roll-11 capture — the deployed gateway's actual wire", () => {
  const capture = loadExportCapture();

  it("has the three exchanges this seal reads", () => {
    expect(capture.exchanges).toHaveLength(3);
  });

  it("[0] GET /export/package/recipients — readExportRecipients reads the one alpha recipient", () => {
    const body = capture.exchanges[0].response.body as { recipients: unknown };
    expect(readExportRecipients(body.recipients)).toEqual([
      { value: "notional-customer-alpha", label: "notional-customer-alpha" },
    ]);
  });

  it("[1] POST /export/package 409 — readRecipientRequired reads the options", () => {
    const body = capture.exchanges[1].response.body as { detail: unknown };
    expect(readRecipientRequired(body.detail)).toEqual([
      { value: "notional-customer-alpha", label: "notional-customer-alpha" },
    ]);
  });

  it("[2] POST /export/package 200 failed — readCanvasExport reads status/export_id/outcome/reason, artifactLink is null", () => {
    const row = readCanvasExport(capture.exchanges[2].response.body);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("failed");
    expect(row?.export_id).toBeNull();
    expect(row?.outcome).toBe("unavailable");
    expect(row?.reason).toMatch(/agent_fleet/);
    expect(artifactLink(row!)).toBeNull();
  });
});

describe("canvasAnswerIds", () => {
  it("excludes task artifacts, keeps order, dedups", () => {
    const artifacts = [
      { id: "a1" },
      { id: TASK_ARTIFACT_PREFIX + "t1" },
      { id: "a2" },
      { id: "a1" },
      { id: TASK_ARTIFACT_PREFIX + "t2" },
      { id: "a3" },
    ];
    expect(canvasAnswerIds(artifacts)).toEqual(["a1", "a2", "a3"]);
  });
});
