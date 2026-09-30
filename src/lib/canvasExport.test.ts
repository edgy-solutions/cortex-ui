import { describe, it, expect } from "vitest";
import {
  readCanvasExport,
  artifactLink,
  canvasAnswerIds,
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
