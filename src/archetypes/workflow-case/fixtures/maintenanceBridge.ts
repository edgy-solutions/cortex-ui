/**
 * MAINTENANCE-BRIDGE FIXTURES — transcribed from the SDK's own test builders, not hand-invented.
 *
 * Source: `git -C <iagent-mesh-sdk> show e7db4752fac33f03fa8e4f0ff082616f3a716dd1:
 * tests/test_maintenance_bridge.py` (branch `origin/lane/ca-0.9.8`). Every literal below is the
 * builder's own DEFAULT argument — never a value this file invented — so a type error against
 * `maintenanceBridgeTypes.ts`'s `Wire*` interfaces means the transcription is wrong, not that the
 * mirror is wrong (that direction is `maintenanceBridgeParity.test.ts`'s job).
 *
 * ⛔ ONE DELIBERATE DEPARTURE FROM "TRANSCRIBE ONLY", flagged rather than silently resolved — see
 * `MAINT_PART_WITH_ICN` below.
 */
import type {
  WireActionRecord,
  WireApprovalChainEntry,
  WireMaintenanceEvent,
  WirePartRow,
  WirePicture,
  WireReleasabilityLabel,
  WireSpareRow,
} from "@/api/maintenanceBridgeTypes";

/** `_label()`, test_maintenance_bridge.py lines 30–31. Shared by `MAINT_EVENT.label` and both actions'. */
const MAINT_LABEL: WireReleasabilityLabel = {
  originator_nation: "USA",
  releasable_to: ["USA", "GBR"],
};

/** `_spare_row(site="site-a", on_hand=2, lead_time_days=5, lead_time_source="supply-system")`'s
 *  defaults, test_maintenance_bridge.py lines 34–37. */
const MAINT_SPARE_ROW: WireSpareRow = {
  site: "site-a",
  on_hand: 2,
  as_of: "2026-10-04T00:00:00Z",
  lead_time_days: 5,
  lead_time_source: "supply-system",
};

/** `_picture(nearest_spare=None)`'s default, test_maintenance_bridge.py lines 40–48. `nearest_spare:
 *  null` is transcribed literally — the builder's own default argument, not this file's choice. */
const MAINT_PICTURE: WirePicture = {
  readiness: "FMC",
  factors: ["no stock"],
  lifecycle: "in-service",
  spares: [MAINT_SPARE_ROW],
  nearest_spare: null,
  battle_condition: {
    mission_essential: true,
    basis: { rule: "rule-1", observed_at: "2026-10-04T00:00:00Z" },
  },
};

/** `_event()`'s defaults, test_maintenance_bridge.py lines 51–62. */
export const MAINT_EVENT: WireMaintenanceEvent = {
  event_id: "evt-1",
  kind: "cm_discrepancy",
  asset_id: "asset-1",
  owning_tier: "tier-1",
  fault: { item: "array module", fault_code: "FC-1", observed_at: "2026-10-04T00:00:00Z" },
  sources: [
    { source: "maintainer_report", reported_by: "sub-1", observed_at: "2026-10-04T00:00:00Z", row_ref: "row-1" },
  ],
  picture: MAINT_PICTURE,
  label: MAINT_LABEL,
  provenance: [{ row_key: "row-1", observed_at: "2026-10-04T00:00:00Z" }],
};

/** `_part_row()`'s defaults, test_maintenance_bridge.py lines 65–68: only `item`/`part_ref`/
 *  `quantity` are set by the builder: the four additive fields stay at `PartRow`'s own default of
 *  `None` because the builder never overrides them — transcribed as `null`, not omitted (see
 *  `maintenanceBridgeTypes.ts`'s header on why these fields are nullable, not optional). */
const MAINT_PART_ROW_DEFAULT: WirePartRow = {
  item: "part-1",
  part_ref: "ref-1",
  quantity: 1,
  source_site: null,
  icn: null,
  hotspot_id: null,
  lead_time_days: null,
  lead_time_source: null,
};

/**
 * ⛔ SPEC/SOURCE MISMATCH, FLAGGED NOT GUESSED: the spec asks for "at least one PartRow [to carry]
 * `icn` + `hotspot_id`, using the SDK's own additive-fields test values." A repo-wide
 * `git grep -n "icn\|ICN\|hotspot"` against `e7db475` (not just this test file) finds exactly one
 * place either field is set to anything other than its default: `test_part_row_additive_fields_
 * default_to_none`, which asserts `row.icn is None` / `row.hotspot_id is None` — i.e. the SDK's
 * OWN test suite has no concrete non-null value for either field at this sha. There is nothing to
 * transcribe.
 *
 * Rather than inventing a value and calling it transcribed, this is a SEPARATE PartRow, clearly
 * NOT built from a test-builder default, with placeholder strings labeled as such. The illustration
 * cross-link the spec mentions is not wired to it (per the spec's own instruction not to wire it
 * yet) — this exists only so a PartRow with both fields populated is representable in a fixture.
 * CONFIRM WITH THE SPEC AUTHOR before this is relied on for anything beyond "the shape compiles."
 */
const MAINT_PART_WITH_ICN: WirePartRow = {
  item: "part-2",
  part_ref: "ref-2",
  quantity: 1,
  source_site: null,
  icn: "ICN-PLACEHOLDER-NOT-SDK-TRANSCRIBED",
  hotspot_id: "HOTSPOT-PLACEHOLDER-NOT-SDK-TRANSCRIBED",
  lead_time_days: null,
  lead_time_source: null,
};

/** `_approval_entry()`'s defaults, test_maintenance_bridge.py lines 71–75. */
const MAINT_APPROVAL_ENTRY_APPROVED: WireApprovalChainEntry = {
  step: 1,
  role: "role-1",
  approver_sub: "sub-1",
  decision: "approved",
  decided_at: "2026-10-04T00:00:00Z",
  decision_record_ref: "dr-1",
};

/** `_action()`'s defaults, test_maintenance_bridge.py lines 78–90. `work_order.parts` carries the
 *  transcribed single default part PLUS `MAINT_PART_WITH_ICN` (see that constant's header) — the
 *  builder's own call passes no `parts` override, so strictly its default is `(_part_row(),)`
 *  alone; the second entry is this file's addition, not the builder's. */
export const MAINT_ACTION_APPROVED: WireActionRecord = {
  action_id: "act-1",
  event_id: "evt-1",
  asset_id: "asset-1",
  owning_tier: "tier-1",
  label: MAINT_LABEL,
  work_order: {
    task: "remove and replace",
    task_refs: [{ graph_uri: "graph://node-1", data_module_code: "DMC-1" }],
    parts: [MAINT_PART_ROW_DEFAULT, MAINT_PART_WITH_ICN],
    outcome: "approved",
  },
  approval_chain: [MAINT_APPROVAL_ENTRY_APPROVED],
  provenance: {
    workflow_definition_id: "wf-def-1",
    workflow_definition_version: "1",
    workflow_instance_id: "wf-inst-1",
    manual_nodes_consulted: ["graph://node-1"],
  },
};

/** `_action(work_order=... outcome="rejected", approval_chain=(_approval_entry(decision=
 *  "rejected"),))` per the spec's own instruction ("work_order.outcome 'rejected' and the matching
 *  chain decision") — everything else is `MAINT_ACTION_APPROVED`'s same transcribed defaults. */
export const MAINT_ACTION_REJECTED: WireActionRecord = {
  ...MAINT_ACTION_APPROVED,
  work_order: { ...MAINT_ACTION_APPROVED.work_order, outcome: "rejected" },
  approval_chain: [{ ...MAINT_APPROVAL_ENTRY_APPROVED, decision: "rejected" }],
};
