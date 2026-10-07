/**
 * BRIDGE -> WORKFLOW_CASE. A pure projector: `maintenance_bridge`'s two wire records in, a
 * `WorkflowCasePayload` out — no fetch, no store, no route. The order that asked for this names
 * the swap directly: "swap to Lane 1's `/cases` route when served" — until then, this function's
 * only callers are fixtures built from the SDK's own test builders (`fixtures/maintenanceBridge.ts`).
 *
 * MAPS ONLY WHAT HAS A HOME in `contract.ts`'s shape. Every field read below is commented with
 * why; every Wire field NOT read is named in `MAINTENANCE_BRIDGE_UNDRAWN`, and the census test
 * (`fromMaintenanceBridge.test.tsx`) proves those two lists partition `MIRRORED_FIELDS` exactly —
 * nothing silently missing, nothing listed twice.
 */
import { MAINT_FAULT_PROPOSE_DEFINITION } from "./fixtures";
import type { CaseApproval, CaseDefinition, CaseHistoryEntry, CaseInstance, WorkflowCasePayload } from "./contract";
import type { WireActionRecord, WireMaintenanceEvent } from "@/api/maintenanceBridgeTypes";

/**
 * ── THE DEFINITION ────────────────────────────────────────────────────────────────────────────
 * Reused, never copied, from `fixtures/index.ts`'s transcription of the real `maint_fault_
 * propose.yaml` — the one case this projector can currently attach a real, non-fabricated
 * definition to. Any OTHER `workflow_definition_id` (or no action at all, so no id at all) falls
 * back to the honest minimum the spec asks for: empty `participants`/`domain_stages`/`steps`,
 * `name` set to whatever id stands in for a real one — never invented stages.
 */
function instanceDefinition(action: WireActionRecord | null | undefined, event: WireMaintenanceEvent): CaseDefinition {
  const definitionId = action ? action.provenance.workflow_definition_id : event.event_id;
  if (action && action.provenance.workflow_definition_id === "maint_fault_propose") {
    return MAINT_FAULT_PROPOSE_DEFINITION;
  }
  // HONEST MINIMUM: no steps/stages this projector could get right without fabricating a
  // definition the producer never sent. `name` is the id itself, not a prettified label.
  return { id: definitionId, name: definitionId, participants: [], domain_stages: [], steps: [] };
}

function buildInstance(event: WireMaintenanceEvent, action: WireActionRecord | null | undefined): CaseInstance {
  return {
    // `action.provenance.workflow_instance_id` IS the real workflow instance key once the bridge
    // has acted; before that, the event itself is the only identifier this case has, so
    // `event.event_id` stands in — both are stable, producer-issued ids, never invented here.
    workflow_id: action ? action.provenance.workflow_instance_id : event.event_id,
    definition: instanceDefinition(action, event),
    // The bridge's `WorkOrder.outcome` carries only final values (`"approved" | "rejected"`) — no
    // pending state is representable once an action exists, so "completed" is not a guess at the
    // producer's intent, it is the only state an action's existence is consistent with.
    status: action ? "completed" : "running",
  };
}

/**
 * ── HISTORY ───────────────────────────────────────────────────────────────────────────────────
 * One entry per `event.sources[]`, chronologically, then one per `action.approval_chain[]` when
 * an action exists. `entry.event` is the SOURCE'S OWN LITERAL (`"maintainer_report"` /
 * `"bit_telemetry"`, or the chain entry's own `"approved"`/`"rejected"`) rather than an invented
 * generic verb like "reported" or "decided" — the same transcribe-don't-paraphrase choice this
 * package's fixtures make elsewhere (see `fixtures/index.ts`'s header). Entries are sorted by
 * `at` (ISO-8601 strings compare correctly lexically) rather than assumed pre-ordered, because
 * nothing in the wire shape guarantees sources and chain entries interleave in time order.
 */
function buildHistory(
  workflowId: string,
  event: WireMaintenanceEvent,
  action: WireActionRecord | null | undefined,
): CaseHistoryEntry[] {
  const fromSources: CaseHistoryEntry[] = event.sources.map((source) => ({
    at: source.observed_at,
    workflow_id: workflowId,
    event: source.source,
    actor: source.reported_by,
  }));
  const fromChain: CaseHistoryEntry[] = action
    ? action.approval_chain.map((entry) => ({
        at: entry.decided_at,
        workflow_id: workflowId,
        event: entry.decision,
        step_id: String(entry.step),
        actor: entry.approver_sub,
      }))
    : [];
  return [...fromSources, ...fromChain].sort((a, b) => a.at.localeCompare(b.at));
}

/** One `CaseApproval` per `action.approval_chain[]` entry — "decided" because the bridge only
 *  ever carries a chain entry after a decision exists; there is no pending shape here to draw. */
function buildApprovals(workflowId: string, action: WireActionRecord): CaseApproval[] {
  return action.approval_chain.map((entry) => ({
    workflow_id: workflowId,
    step_id: String(entry.step),
    status: "decided",
    decided_by: entry.approver_sub,
    decision: entry.decision,
    decided_at: entry.decided_at,
  }));
}

/**
 * The pure projector. `action` absent or `null` means the event has not yet been acted on —
 * `approvals` is then OMITTED from the payload entirely (not `[]`): `[]` would read as "a chain
 * existed and was empty," which is not this case's fact.
 */
export function caseFromMaintenanceBridge(
  event: WireMaintenanceEvent,
  action?: WireActionRecord | null,
): WorkflowCasePayload {
  const instance = buildInstance(event, action);
  const history = buildHistory(instance.workflow_id, event, action);
  return {
    // `asset_id`, not `event_id`: the asset is the subject a human recognizes across this event's
    // whole life (the fault episode AND the action it leads to both carry the same asset_id);
    // `event_id` is a record key for one event row, the same role `workflow_id` already fills.
    subject_ref: event.asset_id,
    instances: [instance],
    history,
    ...(action ? { approvals: buildApprovals(instance.workflow_id, action) } : {}),
  };
}

/**
 * ── THE CENSUS ────────────────────────────────────────────────────────────────────────────────
 * Every dotted path below is a LEAF field reachable from `WireMaintenanceEvent` or
 * `WireActionRecord` by walking `maintenanceBridgeTypes.ts`'s `MIRRORED_FIELDS` (an object-typed
 * field recurses; an array-of-object field recurses with a `[]` suffix). `fromMaintenanceBridge.
 * test.tsx` derives this same path set MECHANICALLY from `MIRRORED_FIELDS` and asserts it equals
 * `MAPPED ∪ UNDRAWN` with no overlap — so a field added to a `Wire*` interface and forgotten here
 * fails that test, not just a hand count.
 */
export const MAINTENANCE_BRIDGE_MAPPED = [
  "event.event_id",
  "event.asset_id",
  "event.sources[].source",
  "event.sources[].reported_by",
  "event.sources[].observed_at",
  "action.approval_chain[].step",
  "action.approval_chain[].approver_sub",
  "action.approval_chain[].decision",
  "action.approval_chain[].decided_at",
  "action.provenance.workflow_definition_id",
  "action.provenance.workflow_instance_id",
] as const;

/**
 * KNOWN GAP, not a pass: the work order (task/task_refs/parts), the picture, the label, and the
 * event provenance have no home in `WorkflowCasePayload` today. Drawing the parts needs a
 * contract field, which `contract.ts`'s header already says is ADR-0055's decision, not this
 * projector's.
 */
export const MAINTENANCE_BRIDGE_UNDRAWN = [
  "event.kind",
  "event.owning_tier",
  "event.fault.item",
  "event.fault.fault_code",
  "event.fault.observed_at",
  "event.sources[].row_ref",
  "event.picture.readiness",
  "event.picture.factors",
  "event.picture.lifecycle",
  "event.picture.spares[].site",
  "event.picture.spares[].on_hand",
  "event.picture.spares[].as_of",
  "event.picture.spares[].lead_time_days",
  "event.picture.spares[].lead_time_source",
  "event.picture.nearest_spare.site",
  "event.picture.nearest_spare.on_hand",
  "event.picture.nearest_spare.as_of",
  "event.picture.nearest_spare.lead_time_days",
  "event.picture.nearest_spare.lead_time_source",
  "event.picture.battle_condition.mission_essential",
  "event.picture.battle_condition.basis.rule",
  "event.picture.battle_condition.basis.observed_at",
  "event.label.originator_nation",
  "event.label.releasable_to",
  "event.provenance[].row_key",
  "event.provenance[].observed_at",
  "action.action_id",
  "action.event_id",
  "action.asset_id",
  "action.owning_tier",
  "action.label.originator_nation",
  "action.label.releasable_to",
  "action.work_order.task",
  "action.work_order.task_refs[].graph_uri",
  "action.work_order.task_refs[].data_module_code",
  "action.work_order.parts[].item",
  "action.work_order.parts[].part_ref",
  "action.work_order.parts[].quantity",
  "action.work_order.parts[].source_site",
  "action.work_order.parts[].icn",
  "action.work_order.parts[].hotspot_id",
  "action.work_order.parts[].lead_time_days",
  "action.work_order.parts[].lead_time_source",
  "action.work_order.outcome",
  "action.approval_chain[].role",
  "action.approval_chain[].decision_record_ref",
  "action.provenance.workflow_definition_version",
  "action.provenance.manual_nodes_consulted",
] as const;

/**
 * ── THE UNDRAWN PATHS, CARRIED TO THE SCREEN ──────────────────────────────────────────────────
 * The human's 2026-10-07 ruling (ADR-0055 amendment requested of Lane 1): what the archetype
 * declares draws, every other key goes in the collapsed raw section. `MAINTENANCE_BRIDGE_UNDRAWN`
 * is exactly those keys, so they ride the component as extra TOP-LEVEL keys and the generic
 * \`rawFieldsOf\` finds them — no WORKFLOW_CASE special case anywhere.
 *
 * KEY: \`bridge.\` + the dotted census path, verbatim (\`bridge.action.work_order.task\`). The
 * prefix cannot collide with WORKFLOW_CASE's reads (\`[]\`) or its payload key (\`case\`).
 *
 * ARRAY PATHS: the census names an array-of-object leaf with a \`[]\` suffix
 * (\`event.sources[].row_ref\`). The key keeps that path as spelled, and the value is the ARRAY of
 * that leaf across the elements that carry it (one entry per element, in order, \`undefined\`
 * elements skipped) — never the whole parent array, which would re-carry fields that ARE mapped.
 *
 * PRESENT = the path resolves to a defined value (\`null\` counts: it is the producer's literal).
 * A path through a \`null\`/absent parent (e.g. \`nearest_spare: null\`) is absent and omitted.
 */
export interface MaintenanceBridgeInput {
  event: WireMaintenanceEvent;
  action?: WireActionRecord | null;
}

function resolvePath(node: unknown, segments: readonly string[]): unknown[] {
  if (segments.length === 0) return node === undefined ? [] : [node];
  if (typeof node !== "object" || node === null) return [];
  const [head, ...rest] = segments;
  const isArray = head.endsWith("[]");
  const name = isArray ? head.slice(0, -2) : head;
  const child = (node as Record<string, unknown>)[name];
  if (!isArray) return resolvePath(child, rest);
  if (!Array.isArray(child)) return [];
  return child.flatMap((el) => resolvePath(el, rest));
}

export function undrawnFromMaintenanceBridge(bridge: MaintenanceBridgeInput): Record<string, unknown> {
  const root = { event: bridge.event, action: bridge.action ?? undefined };
  const out: Record<string, unknown> = {};
  for (const path of MAINTENANCE_BRIDGE_UNDRAWN) {
    const found = resolvePath(root, path.split("."));
    if (found.length === 0) continue;
    out[`bridge.${path}`] = path.includes("[]") ? found : found[0];
  }
  return out;
}

/** The WORKFLOW_CASE component this bridge yields: the projected case, plus the undrawn paths. */
export function componentFromMaintenanceBridge(
  event: WireMaintenanceEvent,
  action?: WireActionRecord | null,
): Record<string, unknown> {
  return {
    archetype: "WORKFLOW_CASE",
    case: caseFromMaintenanceBridge(event, action),
    ...undrawnFromMaintenanceBridge({ event, action }),
  };
}
