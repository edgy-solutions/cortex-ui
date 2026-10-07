/**
 * THE TS MIRROR OF `iagent_mesh.maintenance_bridge` — ADR-0046 §1/§4's wire shapes.
 *
 * Source of truth: `git -C <iagent-mesh-sdk> show e7db4752fac33f03fa8e4f0ff082616f3a716dd1:
 * iagent_mesh/maintenance_bridge.py` — branch `origin/lane/ca-0.9.8`. SHA-pinned rather than
 * tagged on purpose: this module is UNRELEASED (no v0.9.8 tag exists at the time of writing), and
 * a mirror of an unreleased model is the case where drift between the two repos is fastest, which
 * is the same reasoning `meshSdkTypes.ts` gives for its own (different, unmoved) pin.
 *
 * ⛔ `CaseState` IS DELIBERATELY ABSENT FROM THIS FILE. The SDK module's own docstring rules it
 * out: "this enum lives in iagent, not in OpenDDIL's store... a wire-shape SDK is the wrong home
 * for a type whose entire point is that it crosses no wire." Mirroring it here would be inventing
 * a field the source of truth explicitly refuses to carry.
 *
 * ── THIS SIDE OF THE WIRE: tuples BECOME readonly arrays ─────────────────────────────────────
 * Every sequence field in `maintenance_bridge.py` is `tuple[X, ...]` on a `frozen=True` model
 * (immutable by construction on the Python side), unlike `meshSdkTypes.ts`'s `list[X]` fields —
 * so this mirror uses `readonly X[]`, not `X[]`, to carry the same immutability guarantee rather
 * than widening it away.
 *
 * ── OPTIONAL vs NULLABLE, REASONED FROM `model_dump` ─────────────────────────────────────────
 * None of the fifteen classes below declares a custom `@model_serializer` and none calls
 * `out.pop(...)` (unlike `ToolOutput.method` in `meshSdkTypes.ts`, whose wrap-serializer pops the
 * key to stay additive). Pydantic's default `model_dump()` KEEPS every field, serializing an unset
 * `Optional[X] = None` as `null` rather than omitting the key — so every `Optional[X] = None` field
 * in this module is read as NULLABLE but NOT OPTIONAL: the key always arrives, its value may be
 * `null`. That is asserted explicitly below for `Picture.nearest_spare` (a BUSINESS VALUE: "no
 * stock anywhere", per the SDK's own docstring) and for `PartRow`'s four additive fields, because
 * those are the fields a reader is most likely to mis-type as absent-not-null.
 *
 * This is a claim about the PRODUCER's serialization path, which no file in cortex can verify by
 * itself — stated here, the same way `meshSdkTypes.ts` states `BUILT_BY_HAND_UPSTREAM` per class,
 * so a reader can contest it if a custom serializer is ever added upstream.
 *
 * ── ENUM VALUES, NOT MEMBER NAMES ─────────────────────────────────────────────────────────────
 * Every `Literal[...]` below transcribes the STRING VALUES the SDK's own tests construct against
 * (`lead_time_source="supply-system"`, not `SUPPLY_SYSTEM` — there is no Python enum class here,
 * only `Literal` string tuples: `LEAD_TIME_SOURCES`, `EVENT_SOURCES`, `EVENT_KINDS`,
 * `APPROVAL_OUTCOMES`).
 */

/** Python: `LeadTimeSource = Literal[LEAD_TIME_SOURCES]`, `LEAD_TIME_SOURCES = ("stand-in", "supply-system")`. */
export type WireLeadTimeSource = "stand-in" | "supply-system";

/** Python: `EventSourceKind = Literal[EVENT_SOURCES]`, `EVENT_SOURCES = ("maintainer_report", "bit_telemetry")`. */
export type WireEventSourceKind = "maintainer_report" | "bit_telemetry";

/** Python: `EventKind = Literal[EVENT_KINDS]`, `EVENT_KINDS = ("cm_discrepancy", "lifecycle_transition")`. */
export type WireEventKind = "cm_discrepancy" | "lifecycle_transition";

/** Python: `ApprovalOutcome = Literal[APPROVAL_OUTCOMES]`, `APPROVAL_OUTCOMES = ("approved", "rejected")`. Final
 *  values only — the SDK's `WorkOrder`/`ApprovalChainEntry` have no pending state "by construction". */
export type WireApprovalOutcome = "approved" | "rejected";

/** Python: `ReleasabilityLabel`. Shared, byte-for-byte, by `MaintenanceEvent.label` and `ActionRecord.label`. */
export interface WireReleasabilityLabel {
  originator_nation: string;
  releasable_to: readonly string[];
}

/** Python: `Fault`. Part of the episode key `(asset_id, fault.item, fault.fault_code)`. */
export interface WireFault {
  item: string;
  fault_code: string;
  observed_at: string;
}

/** Python: `EventSource` — one element of `MaintenanceEvent.sources[]`. */
export interface WireEventSource {
  source: WireEventSourceKind;
  reported_by: string;
  observed_at: string;
  row_ref: string;
}

/** Python: `SpareRow` — one element of `Picture.spares[]`, and the shape `Picture.nearest_spare` carries. */
export interface WireSpareRow {
  site: string;
  on_hand: number;
  as_of: string;
  lead_time_days: number;
  lead_time_source: WireLeadTimeSource;
}

/** Python: `BattleConditionBasis` — `Picture.battle_condition.basis`. */
export interface WireBattleConditionBasis {
  rule: string;
  observed_at: string;
}

/** Python: `BattleCondition` — an object, not a bare `str` (packet correction, 2026-10-02). */
export interface WireBattleCondition {
  mission_essential: boolean;
  basis: WireBattleConditionBasis;
}

/** Python: `Picture` — the tier's computed readiness/lifecycle/spares/battle-condition snapshot. */
export interface WirePicture {
  readiness: string;
  factors: readonly string[];
  lifecycle: string;
  spares: readonly WireSpareRow[];
  /**
   * ⛔ `null` MEANS "no site has stock anywhere" — a BUSINESS VALUE, not a missing fact (the SDK's
   * own docstring, verbatim: "a trigger's intake-refusal check must not conflate the two"). NOT
   * optional: see this file's header on how optionality was reasoned for this module.
   */
  nearest_spare: WireSpareRow | null;
  battle_condition: WireBattleCondition;
}

/** Python: `EventProvenanceRow` — one element of `MaintenanceEvent.provenance[]`. */
export interface WireEventProvenanceRow {
  row_key: string;
  observed_at: string;
}

/**
 * Python: `MaintenanceEvent`. Mirrors ADR-0046 §1 verbatim. One per fault episode; the episode key
 * is `(asset_id, fault.item, fault.fault_code)` while the episode is open. `sources` is non-empty
 * by the SDK's own validator — not re-enforced here, TS has no runtime refinement types.
 */
export interface WireMaintenanceEvent {
  event_id: string;
  kind: WireEventKind;
  asset_id: string;
  owning_tier: string;
  fault: WireFault;
  sources: readonly WireEventSource[];
  picture: WirePicture;
  label: WireReleasabilityLabel;
  provenance: readonly WireEventProvenanceRow[];
}

/** Python: `TaskRef` — one element of `WorkOrder.task_refs[]`, per `openddil:ADR-0031`'s addendum. */
export interface WireTaskRef {
  graph_uri: string;
  data_module_code: string;
}

/**
 * Python: `PartRow` — one element of `WorkOrder.parts[]`. `source_site`, `icn`, `hotspot_id`,
 * `lead_time_days`, `lead_time_source` are all `Optional[X] = None`: NULLABLE, not optional (see
 * header). The SDK enforces `lead_time_days`/`lead_time_source` set together or neither — a
 * cross-field rule a mirror of field SHAPES cannot carry and does not attempt to.
 */
export interface WirePartRow {
  item: string;
  part_ref: string;
  quantity: number;
  source_site: string | null;
  icn: string | null;
  hotspot_id: string | null;
  lead_time_days: number | null;
  lead_time_source: WireLeadTimeSource | null;
}

/** Python: `WorkOrder` — `ActionRecord.work_order`. `outcome` is final-values-only, by construction. */
export interface WireWorkOrder {
  task: string;
  task_refs: readonly WireTaskRef[];
  parts: readonly WirePartRow[];
  outcome: WireApprovalOutcome;
}

/**
 * Python: `ApprovalChainEntry` — one element of `ActionRecord.approval_chain[]`. Structurally
 * required by `ActionRecord` even though the OVERNIGHT ask named only the two record types.
 * Approver-resolution and entitlement are refusal causes the OWNING TIER checks, not a validation
 * this type (or its mirror) performs.
 */
export interface WireApprovalChainEntry {
  step: number;
  role: string;
  approver_sub: string;
  decision: WireApprovalOutcome;
  decided_at: string;
  decision_record_ref: string;
}

/** Python: `ActionProvenance` — `ActionRecord.provenance`. `workflow_definition_id` is `iagent:ADR-0039`'s. */
export interface WireActionProvenance {
  workflow_definition_id: string;
  workflow_definition_version: string;
  workflow_instance_id: string;
  manual_nodes_consulted: readonly string[];
}

/**
 * Python: `ActionRecord`. Mirrors ADR-0046 §4's `MaintenanceAction`, renamed on this side (week-1
 * packet §4) — same wire shape, different name, left open pending OpenDDIL's own naming reply.
 */
export interface WireActionRecord {
  action_id: string;
  event_id: string;
  asset_id: string;
  owning_tier: string;
  label: WireReleasabilityLabel;
  work_order: WireWorkOrder;
  approval_chain: readonly WireApprovalChainEntry[];
  provenance: WireActionProvenance;
}

/**
 * ── THE COMPILER'S HALF OF THE SEAL ──────────────────────────────────────────────────────────
 * Same two primitives `meshSdkTypes.ts` uses, redeclared here because that file does not export
 * them: a hand-written mirror of a foreign model drifts without a symptom, and `Exactly<>` is the
 * one check that fails on a WIDER type as well as a narrower one.
 */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

/** The literal unions, checked for exact membership rather than "assignable to". */
export type _lead_time_source_is_closed = Assert<
  Exactly<WireLeadTimeSource, "stand-in" | "supply-system">
>;
export type _event_source_kind_is_closed = Assert<
  Exactly<WireEventSourceKind, "maintainer_report" | "bit_telemetry">
>;
export type _event_kind_is_closed = Assert<
  Exactly<WireEventKind, "cm_discrepancy" | "lifecycle_transition">
>;
export type _approval_outcome_is_closed = Assert<Exactly<WireApprovalOutcome, "approved" | "rejected">>;

/**
 * ⛔ `Picture.nearest_spare` SPLIT INTO TWO CLAIMS, THE SAME WAY `meshSdkTypes.ts` SPLITS
 * `bound_defaulted` — one assertion that folds "may be absent" into "may be null" would pass for
 * the wrong reason (see that file's own comment on the mutant this shape caught before).
 */
export type _nearest_spare_is_not_optional = Assert<
  Exactly<undefined extends WirePicture["nearest_spare"] ? true : false, false>
>;
export type _nearest_spare_is_nullable = Assert<
  Exactly<null extends WirePicture["nearest_spare"] ? true : false, true>
>;

/** The same split, over all four `PartRow` additive fields plus `source_site`, in one assertion per flag. */
type PartRowOptionalFields = "source_site" | "icn" | "hotspot_id" | "lead_time_days" | "lead_time_source";
export type _part_row_additive_fields_are_not_optional = Assert<
  Exactly<{ [K in PartRowOptionalFields]: undefined extends WirePartRow[K] ? true : false }[PartRowOptionalFields], false>
>;
export type _part_row_additive_fields_are_nullable = Assert<
  Exactly<{ [K in PartRowOptionalFields]: null extends WirePartRow[K] ? true : false }[PartRowOptionalFields], true>
>;

/**
 * ── THE RUNTIME DESCRIPTOR THE PARITY SEAL COMPARES, AND THE PROJECTOR'S CENSUS WALKS ─────────
 * Same mechanism as `meshSdkTypes.ts`'s `MIRRORED_FIELDS`: keyed by `keyof` each interface, so the
 * compiler refuses a field described here the interface does not declare and vice versa. The `ts`
 * string follows one convention throughout — `"WireX"` for a nested object, `"readonly WireX[]"`
 * for an array of them — because `fromMaintenanceBridge.test.tsx`'s census walks this table
 * mechanically by pattern-matching that convention; see that file for why it must not drift.
 */
export interface MirroredField {
  ts: string;
  optional: boolean;
  nullable: boolean;
}

export const MIRRORED_FIELDS = {
  ReleasabilityLabel: {
    originator_nation: { ts: "string", optional: false, nullable: false },
    releasable_to: { ts: "readonly string[]", optional: false, nullable: false },
  },
  Fault: {
    item: { ts: "string", optional: false, nullable: false },
    fault_code: { ts: "string", optional: false, nullable: false },
    observed_at: { ts: "string", optional: false, nullable: false },
  },
  EventSource: {
    source: { ts: '"maintainer_report" | "bit_telemetry"', optional: false, nullable: false },
    reported_by: { ts: "string", optional: false, nullable: false },
    observed_at: { ts: "string", optional: false, nullable: false },
    row_ref: { ts: "string", optional: false, nullable: false },
  },
  SpareRow: {
    site: { ts: "string", optional: false, nullable: false },
    on_hand: { ts: "number", optional: false, nullable: false },
    as_of: { ts: "string", optional: false, nullable: false },
    lead_time_days: { ts: "number", optional: false, nullable: false },
    lead_time_source: { ts: '"stand-in" | "supply-system"', optional: false, nullable: false },
  },
  BattleConditionBasis: {
    rule: { ts: "string", optional: false, nullable: false },
    observed_at: { ts: "string", optional: false, nullable: false },
  },
  BattleCondition: {
    mission_essential: { ts: "boolean", optional: false, nullable: false },
    basis: { ts: "WireBattleConditionBasis", optional: false, nullable: false },
  },
  Picture: {
    readiness: { ts: "string", optional: false, nullable: false },
    factors: { ts: "readonly string[]", optional: false, nullable: false },
    lifecycle: { ts: "string", optional: false, nullable: false },
    spares: { ts: "readonly WireSpareRow[]", optional: false, nullable: false },
    // Always present, business-value nullable — see this file's header and the Exactly<> split above.
    nearest_spare: { ts: "WireSpareRow", optional: false, nullable: true },
    battle_condition: { ts: "WireBattleCondition", optional: false, nullable: false },
  },
  EventProvenanceRow: {
    row_key: { ts: "string", optional: false, nullable: false },
    observed_at: { ts: "string", optional: false, nullable: false },
  },
  MaintenanceEvent: {
    event_id: { ts: "string", optional: false, nullable: false },
    kind: { ts: '"cm_discrepancy" | "lifecycle_transition"', optional: false, nullable: false },
    asset_id: { ts: "string", optional: false, nullable: false },
    owning_tier: { ts: "string", optional: false, nullable: false },
    fault: { ts: "WireFault", optional: false, nullable: false },
    sources: { ts: "readonly WireEventSource[]", optional: false, nullable: false },
    picture: { ts: "WirePicture", optional: false, nullable: false },
    label: { ts: "WireReleasabilityLabel", optional: false, nullable: false },
    provenance: { ts: "readonly WireEventProvenanceRow[]", optional: false, nullable: false },
  },
  TaskRef: {
    graph_uri: { ts: "string", optional: false, nullable: false },
    data_module_code: { ts: "string", optional: false, nullable: false },
  },
  PartRow: {
    item: { ts: "string", optional: false, nullable: false },
    part_ref: { ts: "string", optional: false, nullable: false },
    quantity: { ts: "number", optional: false, nullable: false },
    source_site: { ts: "string", optional: false, nullable: true },
    icn: { ts: "string", optional: false, nullable: true },
    hotspot_id: { ts: "string", optional: false, nullable: true },
    lead_time_days: { ts: "number", optional: false, nullable: true },
    lead_time_source: { ts: '"stand-in" | "supply-system"', optional: false, nullable: true },
  },
  WorkOrder: {
    task: { ts: "string", optional: false, nullable: false },
    task_refs: { ts: "readonly WireTaskRef[]", optional: false, nullable: false },
    parts: { ts: "readonly WirePartRow[]", optional: false, nullable: false },
    outcome: { ts: '"approved" | "rejected"', optional: false, nullable: false },
  },
  ApprovalChainEntry: {
    step: { ts: "number", optional: false, nullable: false },
    role: { ts: "string", optional: false, nullable: false },
    approver_sub: { ts: "string", optional: false, nullable: false },
    decision: { ts: '"approved" | "rejected"', optional: false, nullable: false },
    decided_at: { ts: "string", optional: false, nullable: false },
    decision_record_ref: { ts: "string", optional: false, nullable: false },
  },
  ActionProvenance: {
    workflow_definition_id: { ts: "string", optional: false, nullable: false },
    workflow_definition_version: { ts: "string", optional: false, nullable: false },
    workflow_instance_id: { ts: "string", optional: false, nullable: false },
    manual_nodes_consulted: { ts: "readonly string[]", optional: false, nullable: false },
  },
  ActionRecord: {
    action_id: { ts: "string", optional: false, nullable: false },
    event_id: { ts: "string", optional: false, nullable: false },
    asset_id: { ts: "string", optional: false, nullable: false },
    owning_tier: { ts: "string", optional: false, nullable: false },
    label: { ts: "WireReleasabilityLabel", optional: false, nullable: false },
    work_order: { ts: "WireWorkOrder", optional: false, nullable: false },
    approval_chain: { ts: "readonly WireApprovalChainEntry[]", optional: false, nullable: false },
    provenance: { ts: "WireActionProvenance", optional: false, nullable: false },
  },
} as const satisfies {
  ReleasabilityLabel: Record<keyof WireReleasabilityLabel, MirroredField>;
  Fault: Record<keyof WireFault, MirroredField>;
  EventSource: Record<keyof WireEventSource, MirroredField>;
  SpareRow: Record<keyof WireSpareRow, MirroredField>;
  BattleConditionBasis: Record<keyof WireBattleConditionBasis, MirroredField>;
  BattleCondition: Record<keyof WireBattleCondition, MirroredField>;
  Picture: Record<keyof WirePicture, MirroredField>;
  EventProvenanceRow: Record<keyof WireEventProvenanceRow, MirroredField>;
  MaintenanceEvent: Record<keyof WireMaintenanceEvent, MirroredField>;
  TaskRef: Record<keyof WireTaskRef, MirroredField>;
  PartRow: Record<keyof WirePartRow, MirroredField>;
  WorkOrder: Record<keyof WireWorkOrder, MirroredField>;
  ApprovalChainEntry: Record<keyof WireApprovalChainEntry, MirroredField>;
  ActionProvenance: Record<keyof WireActionProvenance, MirroredField>;
  ActionRecord: Record<keyof WireActionRecord, MirroredField>;
};

/**
 * ── AND THE FLAGS ARE TIED TO THE TYPES FOR EVERY FIELD, PER CLASS ───────────────────────────
 * Same generic `FlagsAgree` as `meshSdkTypes.ts` — `satisfies` above forces the KEY SETS to
 * agree; this forces the DECLARED optional/nullable flags to agree with what the interface
 * structurally is, for every field, not just the ones a human remembered to assert about by hand.
 */
type IsOptional<T, K extends keyof T> = undefined extends T[K] ? true : false;
type IsNullable<T, K extends keyof T> = null extends T[K] ? true : false;

type FlagsAgree<T, D extends Record<keyof T, { optional: boolean; nullable: boolean }>> = {
  [K in keyof T]-?: Exactly<D[K]["optional"], IsOptional<T, K>> extends true
    ? Exactly<D[K]["nullable"], IsNullable<T, K>> extends true
      ? true
      : ["nullable disagrees with the interface at", K]
    : ["optional disagrees with the interface at", K];
}[keyof T];

export type _releasability_label_flags = Assert<
  Exactly<FlagsAgree<WireReleasabilityLabel, typeof MIRRORED_FIELDS.ReleasabilityLabel>, true>
>;
export type _fault_flags = Assert<Exactly<FlagsAgree<WireFault, typeof MIRRORED_FIELDS.Fault>, true>>;
export type _event_source_flags = Assert<
  Exactly<FlagsAgree<WireEventSource, typeof MIRRORED_FIELDS.EventSource>, true>
>;
export type _spare_row_flags = Assert<Exactly<FlagsAgree<WireSpareRow, typeof MIRRORED_FIELDS.SpareRow>, true>>;
export type _battle_condition_basis_flags = Assert<
  Exactly<FlagsAgree<WireBattleConditionBasis, typeof MIRRORED_FIELDS.BattleConditionBasis>, true>
>;
export type _battle_condition_flags = Assert<
  Exactly<FlagsAgree<WireBattleCondition, typeof MIRRORED_FIELDS.BattleCondition>, true>
>;
export type _picture_flags = Assert<Exactly<FlagsAgree<WirePicture, typeof MIRRORED_FIELDS.Picture>, true>>;
export type _event_provenance_row_flags = Assert<
  Exactly<FlagsAgree<WireEventProvenanceRow, typeof MIRRORED_FIELDS.EventProvenanceRow>, true>
>;
export type _maintenance_event_flags = Assert<
  Exactly<FlagsAgree<WireMaintenanceEvent, typeof MIRRORED_FIELDS.MaintenanceEvent>, true>
>;
export type _task_ref_flags = Assert<Exactly<FlagsAgree<WireTaskRef, typeof MIRRORED_FIELDS.TaskRef>, true>>;
export type _part_row_flags = Assert<Exactly<FlagsAgree<WirePartRow, typeof MIRRORED_FIELDS.PartRow>, true>>;
export type _work_order_flags = Assert<Exactly<FlagsAgree<WireWorkOrder, typeof MIRRORED_FIELDS.WorkOrder>, true>>;
export type _approval_chain_entry_flags = Assert<
  Exactly<FlagsAgree<WireApprovalChainEntry, typeof MIRRORED_FIELDS.ApprovalChainEntry>, true>
>;
export type _action_provenance_flags = Assert<
  Exactly<FlagsAgree<WireActionProvenance, typeof MIRRORED_FIELDS.ActionProvenance>, true>
>;
export type _action_record_flags = Assert<
  Exactly<FlagsAgree<WireActionRecord, typeof MIRRORED_FIELDS.ActionRecord>, true>
>;
