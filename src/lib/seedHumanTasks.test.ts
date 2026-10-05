/**
 * `humanTaskFromRow` — the per-row mapping `seedFromRest` uses, extracted and exported so a seal
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
import { humanTaskFromRow } from "./seedHumanTasks";

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
