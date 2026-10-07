/**
 * cases — `GET /cases/{case_id}`, the producer's `WorkflowCasePayload` for one case.
 *
 * SOURCE: invincible-agent `3e6d9e9f` (helm rev 177, roll #20b) — `gateway.py`'s `get_case`
 * returns `case_projection.project_workflow_case(...)`, which is cortex's OWN
 * `WorkflowCasePayload` (`src/archetypes/workflow-case/contract.ts`), field for field.
 *
 * OUTCOMES (`fetchCase`), the whole closed set:
 *   200 + a body `readWorkflowCasePayload` accepts  → `{ ok: true, payload }`
 *   200 + a body it refuses                         → `{ ok: false, reason: "invalid_case_payload", detail }`
 *   404                                             → `{ ok: false, reason: "not_found" }`
 *   503                                             → `{ ok: false, reason: "runner_unavailable" }`
 *   anything else (or a transport failure)          → `{ ok: false, reason: "http_<status>" }`
 *
 * ⛔ `not_found` IS ONE REASON FOR TWO FACTS. The producer answers an absent case and a case the
 * caller is not entitled to read IDENTICALLY (404 `{"detail":"case not found"}`) — an
 * existence-oracle discipline. Nothing here, and nothing drawn from this, may try to tell them
 * apart.
 *
 * 503 is the runner (or its definitions) being unreachable. Until `3e6d9e9f` an ABSENT case also
 * answered 503; that was the producer's defect, fixed and rolled as #20b — 404 is live now.
 *
 * THERE WAS NO EXISTING VALIDATOR to reuse: `WORKFLOW_CASE`'s contract declares one `case`
 * object and nothing reads it defensively (the card dereferences `payload.instances`,
 * `instance.definition.name`, `definition.domain_stages`, ...). `readWorkflowCasePayload` below
 * is therefore a structural guard over exactly what the card dereferences — not a new schema.
 */
import { fetchCaseResponse } from "@/api/client";
import type { WorkflowCasePayload } from "@/archetypes/workflow-case/contract";

export type CaseFailureReason = "invalid_case_payload" | "not_found" | "runner_unavailable" | `http_${number}`;

export type FetchCaseResult =
  | { ok: true; payload: WorkflowCasePayload }
  | { ok: false; reason: "invalid_case_payload"; detail: string }
  | { ok: false; reason: Exclude<CaseFailureReason, "invalid_case_payload"> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const isStr = (v: unknown): v is string => typeof v === "string";
const isNonEmptyStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isOptStr = (v: unknown) => v === undefined || v === null || isStr(v);

/** The first thing wrong with `raw` as a `WorkflowCasePayload`, or `null` when it is readable. */
function firstProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "body is not an object";
  if (!isNonEmptyStr(raw.subject_ref)) return "subject_ref is not a non-empty string";
  if (!Array.isArray(raw.instances)) return "instances is not an array";
  for (const [i, inst] of raw.instances.entries()) {
    const at = `instances[${i}]`;
    if (!isRecord(inst)) return `${at} is not an object`;
    if (!isNonEmptyStr(inst.workflow_id)) return `${at}.workflow_id is not a non-empty string`;
    if (!isStr(inst.status)) return `${at}.status is not a string`;
    if (!isOptStr(inst.current_stage)) return `${at}.current_stage is neither a string nor null`;
    const def = inst.definition;
    if (!isRecord(def)) return `${at}.definition is not an object`;
    if (!isStr(def.id) || !isStr(def.name)) return `${at}.definition.id/name is not a string`;
    if (!Array.isArray(def.domain_stages) || !def.domain_stages.every(isStr)) {
      return `${at}.definition.domain_stages is not an array of strings`;
    }
    if (!Array.isArray(def.participants)) return `${at}.definition.participants is not an array`;
    if (!Array.isArray(def.steps)) return `${at}.definition.steps is not an array`;
    for (const [j, step] of def.steps.entries()) {
      if (!isRecord(step) || !isStr(step.id) || !isStr(step.kind)) {
        return `${at}.definition.steps[${j}] has no string id/kind`;
      }
    }
  }
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history)) return "history is not an array";
    for (const [i, h] of raw.history.entries()) {
      if (!isRecord(h) || !isStr(h.at) || !isStr(h.workflow_id) || !isStr(h.event)) {
        return `history[${i}] has no string at/workflow_id/event`;
      }
    }
  }
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options)) return "options is not an array";
    for (const [i, o] of raw.options.entries()) {
      if (!isRecord(o) || !isStr(o.id) || !isStr(o.label) || !isRecord(o.data)) {
        return `options[${i}] has no string id/label and object data`;
      }
    }
  }
  if (raw.approvals !== undefined) {
    if (!Array.isArray(raw.approvals)) return "approvals is not an array";
    for (const [i, a] of raw.approvals.entries()) {
      if (!isRecord(a) || !isStr(a.workflow_id) || !isStr(a.step_id)) {
        return `approvals[${i}] has no string workflow_id/step_id`;
      }
      if (a.status !== "pending" && a.status !== "decided") return `approvals[${i}].status is not pending|decided`;
    }
  }
  if (raw.output_artifact !== undefined && raw.output_artifact !== null && !isRecord(raw.output_artifact)) {
    return "output_artifact is neither an object nor null";
  }
  return null;
}

/** A readable `WorkflowCasePayload`, or the first reason it is not. */
export function readWorkflowCasePayload(
  raw: unknown,
): { ok: true; payload: WorkflowCasePayload } | { ok: false; detail: string } {
  const problem = firstProblem(raw);
  return problem === null ? { ok: true, payload: raw as WorkflowCasePayload } : { ok: false, detail: problem };
}

export async function fetchCase(caseId: string): Promise<FetchCaseResult> {
  let resp: Response;
  try {
    resp = await fetchCaseResponse(caseId);
  } catch {
    // The request never produced a status. There is no `http_<status>` to name, and inventing
    // one would be a claim about the wire — `http_0` is the browser's own spelling of "no response".
    return { ok: false, reason: "http_0" };
  }
  if (resp.status === 404) return { ok: false, reason: "not_found" };
  if (resp.status === 503) return { ok: false, reason: "runner_unavailable" };
  if (resp.status !== 200) return { ok: false, reason: `http_${resp.status}` };
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { ok: false, reason: "invalid_case_payload", detail: "body is not JSON" };
  }
  const read = readWorkflowCasePayload(body);
  return read.ok
    ? { ok: true, payload: read.payload }
    : { ok: false, reason: "invalid_case_payload", detail: read.detail };
}
