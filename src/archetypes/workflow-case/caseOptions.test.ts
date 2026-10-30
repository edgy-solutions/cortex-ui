import { describe, expect, it } from "vitest";
import { caseOptions } from "./caseOptions";
import type { WorkflowCasePayload } from "./contract";
import type { HumanTask } from "@/store/useHumanTaskStore";
import { readTaskDeclaration, type TaskDeclaration } from "@/lib/taskDeclaration";

const inst = (id: string) => ({ workflow_id: id, definition: {}, status: "running" });
const payload = (extra: Record<string, unknown>, ids = ["wf-1"]) =>
  ({ instances: ids.map(inst), ...extra }) as unknown as WorkflowCasePayload;
const task = (over: Partial<HumanTask>): HumanTask => ({
  id: "r", taskId: "wf-1:t", workflowId: "wf-1", audience: "a", kind: "k", status: "pending",
  title: "", summary: "", requestedBy: "", subjectRef: null, createdAt: 0, ...over,
});
const VERBS = ["zeta", "alpha", "mid", "beta"];
const decl = (): TaskDeclaration =>
  readTaskDeclaration({ kind: "k", declared: true, accepts: VERBS, reason_required: [] })!;
const none = () => null;

describe("caseOptions", () => {
  it("an options array on the case wins", () => {
    const o = [{ id: "x", label: "X", data: {} }];
    expect(caseOptions(payload({ options: o }), [task({})], none)).toEqual({ source: "case", options: o });
  });
  it("[] is not fallen back from, even with a pending task carrying options", () => {
    const t = task({ payload: { options: [{ verb: "a" }] } });
    expect(caseOptions(payload({ options: [] }), [t], none)).toEqual({ source: "case", options: [] });
  });
  it("absent: the task's payload.options, in order, with labels and data, skipping a verbless entry", () => {
    const t = task({ payload: { options: [
      { verb: "one", label: "One", k: 1 }, { label: "no verb" }, { verb: "two", n: null }, { verb: "three" }, { verb: "four" },
    ] } });
    const r = caseOptions(payload({}), [t], none);
    expect(r.source).toBe("task");
    if (r.source !== "task") return;
    expect(r.options).toEqual([
      { id: "one", label: "One", data: { k: 1 }, artifact_uri: null },
      { id: "two", label: "two", data: { n: null }, artifact_uri: null },
      { id: "three", label: "three", data: {}, artifact_uri: null },
      { id: "four", label: "four", data: {}, artifact_uri: null },
    ]);
  });
  it("absent, no payload.options: the task's own declaration, in declaration order (not sorted)", () => {
    const t = task({ declaration: { kind: "k", declared: true, accepts: VERBS, reason_required: [] } });
    const r = caseOptions(payload({}), [t], none);
    expect(r.source === "task" && r.options.map((o) => o.id)).toEqual(VERBS);
  });
  it("absent, declaration only from declarationFor", () => {
    const r = caseOptions(payload({}), [task({})], () => decl());
    expect(r.source === "task" && r.options.map((o) => o.id)).toEqual(VERBS);
  });
  it("absent, no payload.options and no declaration: undeclared marker, no options (fail closed, architect 2026-10-30)", () => {
    const r = caseOptions(payload({}), [task({})], none);
    expect(r).toEqual({ source: "task", taskId: "wf-1:t", options: [], undeclared: true });
  });
  it("a declaration that offers none is NOT marked undeclared", () => {
    const d = readTaskDeclaration({ kind: "k", declared: true, accepts: [], reason_required: [] })!;
    const r = caseOptions(payload({}), [task({})], () => d);
    expect(r.source === "task" && r.options).toEqual([]);
    expect(r.source === "task" && r.undeclared).toBeUndefined();
  });
  it("the latest instance wins over an earlier one", () => {
    const early = task({ id: "e", taskId: "wf-1:t", workflowId: "wf-1", payload: { options: [{ verb: "early" }] } });
    const late = task({ id: "l", taskId: "wf-2:t", workflowId: "wf-2", payload: { options: [{ verb: "late" }] } });
    const r = caseOptions(payload({}, ["wf-1", "wf-2"]), [early, late], none);
    expect(r.source === "task" && r.options.map((o) => o.id)).toEqual(["late"]);
  });
  it("another workflow's task, or a matching workflowId without the taskId prefix, is ignored", () => {
    const other = task({ workflowId: "wf-9", taskId: "wf-9:t", payload: { options: [{ verb: "a" }] } });
    const noPrefix = task({ workflowId: "wf-1", taskId: "other:t", payload: { options: [{ verb: "a" }] } });
    expect(caseOptions(payload({}), [other, noPrefix], none)).toEqual({ source: "none" });
  });
  it("absent with no tasks is none", () => {
    expect(caseOptions(payload({}), [], none)).toEqual({ source: "none" });
  });
});
