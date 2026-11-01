/**
 * reviewShapes -- the registry reader and the row picker. Each `it` names what turns red.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { pickShapeRow, readReviewShapes, type ShapeRow } from "./reviewShapes";
import { PLAN_ITEM_KIND } from "./reviewCoverage";
import { REVIEW_SHAPES_FIXTURE } from "./reviewShapesFixture";

const good = { review_shape: "notice", item_kind: "part", rules_version: "notice.v1" };

describe("readReviewShapes keeps a row only if the three identifying strings are non-empty", () => {
  it("a non-array body (object, null, string, undefined) is []", () => {
    for (const b of [{}, null, "x", undefined, 7]) expect(readReviewShapes(b)).toEqual([]);
  });

  it("near side: a complete row is kept, rules absent gives [] and params absent gives {}", () => {
    expect(readReviewShapes([good])).toEqual([{ ...good, params: {}, rules: [] }]);
  });

  it.each(["review_shape", "item_kind", "rules_version"])("drops a row whose %s is empty, missing or not a string", (k) => {
    expect(readReviewShapes([{ ...good, [k]: "" }])).toEqual([]);
    expect(readReviewShapes([{ ...good, [k]: undefined }])).toEqual([]);
    expect(readReviewShapes([{ ...good, [k]: 3 }])).toEqual([]);
  });

  it("drops a non-object entry and keeps its neighbours", () => {
    expect(readReviewShapes([null, good, "x"]).map((r) => r.review_shape)).toEqual(["notice"]);
  });

  it("drops a rule without a string id, keeps one with one (params defaulting to {}), and keeps the row's params", () => {
    const [r] = readReviewShapes([{ ...good, params: { a: 1 }, rules: [{ id: 3 }, { params: {} }, { id: "same_shape_run" }, { id: "x", params: { n: 2 } }] }]);
    expect(r.params).toEqual({ a: 1 });
    expect(r.rules).toEqual([{ id: "same_shape_run", params: {} }, { id: "x", params: { n: 2 } }]);
  });

  it("a rules value that is not an array is []", () => {
    expect(readReviewShapes([{ ...good, rules: "same_shape_run" }])[0].rules).toEqual([]);
  });
});

describe("pickShapeRow says why there is no row, in the documented order", () => {
  const rows: ShapeRow[] = readReviewShapes([good, { review_shape: "document", item_kind: "section", rules_version: "document.v1" }]);

  it("found: the row for the shape whose item_kind the extraction names", () => {
    const got = pickShapeRow(rows, "notice", "part");
    expect(got.row).toBe(rows[0]);
  });

  it("no review_shape on the extraction", () => {
    const got = pickShapeRow(rows, null, "part");
    expect(got.row).toBeNull();
    expect((got as { why: string }).why).toContain("no review_shape");
  });

  it("no item_kind on the extraction (names the shape)", () => {
    const got = pickShapeRow(rows, "notice", null) as { row: null; why: string };
    expect(got.why).toContain("no item_kind");
    expect(got.why).toContain('"notice"');
  });

  it("review_shape null wins over item_kind null (order)", () => {
    expect((pickShapeRow(rows, null, null) as { why: string }).why).toContain("no review_shape");
  });

  it("no served row for the shape", () => {
    const got = pickShapeRow(rows, "course", "concept") as { row: null; why: string };
    expect(got.row).toBeNull();
    expect(got.why).toContain('"course"');
    expect(got.why).toContain("/review-shapes");
  });

  it("the row's item_kind differs from the extraction's: names both values", () => {
    const got = pickShapeRow(rows, "notice", "section") as { row: null; why: string };
    expect(got.row).toBeNull();
    expect(got.why).toContain('item_kind "section"');
    expect(got.why).toContain('"part"');
  });

  it("an item_kind this plan does not produce ids for, even when row and extraction agree", () => {
    const got = pickShapeRow(rows, "document", "section") as { row: null; why: string };
    expect(got.row).toBeNull();
    expect(got.why).toContain('"section"');
    expect(got.why).toContain(`"${PLAN_ITEM_KIND}"`);
  });
});

describe("the mock fixture is the producer's seed registry at 41230a7e", () => {
  it("is sorted by review_shape and every row passes the reader unchanged", () => {
    const names = REVIEW_SHAPES_FIXTURE.map((r) => r.review_shape);
    expect(names).toEqual([...names].sort());
    expect(readReviewShapes(REVIEW_SHAPES_FIXTURE)).toEqual(REVIEW_SHAPES_FIXTURE);
    expect(names).toEqual(["course", "document", "finding", "notice"]);
  });

  // Cross-repo: read the sibling's files AT THE PIN with git (never the working tree, which may hold WIP).
  // SKIPPED when the sibling checkout or the sha is absent (CI has no sibling); `openapi.seal.test.ts` does the same.
  const SHA = "41230a7ef0b3976d19c54d665aabd6d1ee2dfd87";
  const sibling = ["invincible-agent", "ia-01"].map((n) => resolve(__dirname, "../../..", n)).find((d) => existsSync(resolve(d, ".git")));
  const git = (...a: string[]) => execFileSync("git", ["-C", sibling!, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let pinned = false;
  try {
    pinned = sibling !== undefined && git("cat-file", "-t", SHA).trim() === "commit";
  } catch {
    pinned = false;
  }

  it.skipIf(!pinned)("every fixture row equals the yaml the producer ships (scalar keys, rules and their params)", () => {
    const files = git("ls-tree", "--name-only", SHA, "policy/review_shapes/")
      .split("\n")
      .filter((f) => f.endsWith(".yaml"));
    expect(files.map((f) => f.replace(/^.*\//, "").replace(".yaml", "")).sort()).toEqual(REVIEW_SHAPES_FIXTURE.map((r) => r.review_shape));
    for (const f of files) {
      const text = git("show", `${SHA}:${f}`);
      const scalar = (k: string) => text.match(new RegExp(`^${k}:\\s*(\\S+)\\s*$`, "m"))?.[1];
      const row = REVIEW_SHAPES_FIXTURE.find((r) => r.review_shape === scalar("review_shape"))!;
      expect(row, f).toBeDefined();
      expect(row.item_kind, f).toBe(scalar("item_kind"));
      expect(row.rules_version, f).toBe(scalar("rules_version"));
      const ids = [...text.matchAll(/^\s+- id:\s*(\S+)/gm)].map((m) => m[1]);
      expect(row.rules.map((r) => r.id), f).toEqual(ids);
      const params = [...text.matchAll(/^\s+- id:\s*\S+\s+params:\s*\{([^}]*)\}/gm)].map((m) =>
        Object.fromEntries(m[1].split(",").map((kv) => kv.split(":").map((x) => x.trim())).map(([k, v]) => [k, Number(v)])),
      );
      expect(row.rules.map((r) => r.params), f).toEqual(params);
    }
  });
});
