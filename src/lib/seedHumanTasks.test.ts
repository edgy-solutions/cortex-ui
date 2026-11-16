/**
 * `humanTaskFromRow` — the per-row mapping the queue read uses, extracted and exported so a seal
 * can call the production function rather than hand-build a row (see `approvalTaskCard.test.tsx`'s
 * "HAZ-1003 human task row, as served" describe).
 *
 * This file seals the one distinction the header comment in `seedHumanTasks.ts` claims:
 * `declaration` is carried on the output ONLY when the input row HAS the key at all —
 * `"declaration" in task` must be `false` for a row that never mentions it, not merely
 * `undefined`, because `Object.hasOwn`-style checks downstream (`useTaskKindStore.declarationFor`)
 * distinguish "no key" from "key, undefined value".
 */
import { describe, it, expect } from "vitest";
import { humanTaskFromRow, missingRequired } from "./seedHumanTasks";

const BASE_ROW = {
  id: "row-1",
  task_id: "task-1",
  workflow_id: null,
  audience: "stewards",
  kind: "risk_acceptance_medium",
  status: "pending",
  title: "t",
  summary: "s",
  requested_by: "bob",
  subject_ref: "HAZ-1003",
  payload: {},
  created_at: 0,
};

describe("humanTaskFromRow", () => {
  it("refuses a row with no id or no task_id", () => {
    expect(humanTaskFromRow({ ...BASE_ROW, id: null })).toBeNull();
    expect(humanTaskFromRow({ ...BASE_ROW, task_id: null })).toBeNull();
  });

  // task_id and kind are REQUIRED (saf 2026-11-15, Chris 2026-11-16). Each absent form is a refusal,
  // and the kind is the served value, never a fallback.
  it("required: every absent form of task_id or kind refuses, and names exactly what is missing", () => {
    const { task_id: _t, ...noTaskId } = BASE_ROW;
    const { kind: _k, ...noKind } = BASE_ROW;
    const cases: Array<[string, Record<string, unknown>, string[]]> = [
      ["task_id null", { ...BASE_ROW, task_id: null }, ["task_id"]],
      ["task_id absent", noTaskId, ["task_id"]],
      ["task_id empty", { ...BASE_ROW, task_id: "" }, ["task_id"]],
      ["task_id a number", { ...BASE_ROW, task_id: 7 }, ["task_id"]],
      ["kind null", { ...BASE_ROW, kind: null }, ["kind"]],
      ["kind absent", noKind, ["kind"]],
      ["kind empty", { ...BASE_ROW, kind: "" }, ["kind"]],
      ["both", { ...BASE_ROW, task_id: null, kind: null }, ["task_id", "kind"]],
      ["id null", { ...BASE_ROW, id: null }, ["id"]],
    ];
    for (const [name, row, missing] of cases) {
      expect(missingRequired(row), name).toEqual(missing);
      expect(humanTaskFromRow(row), name).toBeNull();
    }
    expect(missingRequired({ ...BASE_ROW })).toEqual([]);
  });

  it("the kind is the served value, verbatim", () => {
    expect(humanTaskFromRow({ ...BASE_ROW })?.kind).toBe("risk_acceptance_medium");
    expect(humanTaskFromRow({ ...BASE_ROW, kind: "a_kind_no_one_wrote_down" })?.kind).toBe("a_kind_no_one_wrote_down");
    expect(humanTaskFromRow({ ...BASE_ROW })?.taskId).toBe("task-1");
  });

  it("a row WITHOUT a declaration key yields a HumanTask with no `declaration` key at all", () => {
    const task = humanTaskFromRow({ ...BASE_ROW });
    expect(task).not.toBeNull();
    expect("declaration" in task!).toBe(false);
  });

  it("a row WITH a declaration key carries it through verbatim, even when its value is null", () => {
    const decl = { kind: "risk_acceptance_medium", declared: true };
    const task = humanTaskFromRow({ ...BASE_ROW, declaration: decl });
    expect("declaration" in task!).toBe(true);
    expect(task!.declaration).toBe(decl);

    const taskNullDecl = humanTaskFromRow({ ...BASE_ROW, declaration: null });
    expect("declaration" in taskNullDecl!).toBe(true);
    expect(taskNullDecl!.declaration).toBeNull();
  });
});
