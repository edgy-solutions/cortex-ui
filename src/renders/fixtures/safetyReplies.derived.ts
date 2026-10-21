/**
 * DERIVED fixtures: shapes written from `agent_fleet/safety_agent/measures.py` at 938d7639
 * (`draft_risk_assessment`, `what_failed_on_this_part`) with `output_uri` stamped as
 * `safety_agent/main.py:856` does. NOT a live capture.
 *
 * The draft vocabulary is the producer's, not a gloss: severity is a MIL-STD-882E code ("II"),
 * probability a letter ("D"), the level a matrix label ("Medium"), the citation the matrix file's
 * NAME (`matrix.py` `_SOURCE = path.name`), and `verified_in_field` a THREE-STATE STRING
 * ("true" | "false" | "not_verified", entities.py) — never a boolean.
 */
export const SAFETY = "http://internal/sustainment/safety#";
export const DRAFT_URI = `${SAFETY}RiskAssessmentDraft`;
export const FRS_URI = `${SAFETY}FailureRecordSet`;

const MATRIX = "safety_risk_matrix.ttl";
const AUDIENCE = "risk_acceptance_medium:SUSTAINMENT";
const DESCRIPTION = "Fuel quantity probe seal degrades, allowing vapour ingress to the sense line.";

const citations = {
  severity: "hazard HAZ-1003",
  probability: "hazard HAZ-1003",
  risk_level: MATRIX,
  acceptance_audience: MATRIX,
};

const draftBase = {
  refused: false,
  hazard_id: "HAZ-1003",
  hazard: DESCRIPTION,
  tail: "TN-7703",
  platform: "PLT-BRAVO",
  acceptance_status: "drafted",
  severity: "II",
  probability: "D",
  risk_level: "Medium",
  acceptance_audience: AUDIENCE,
  citations,
  note: `DRAFTED. Accepting this risk requires an authority in '${AUDIENCE}'. This engine cannot accept it; the acceptance is a task disposition with a required reason.`,
  output_uri: DRAFT_URI,
};

const reviewRequest = (derived_from: string[]) => ({
  kind: "risk_acceptance_medium",
  task_id: "risk-acceptance-HAZ-1003",
  audience: AUDIENCE,
  title: "Accept Medium risk — HAZ-1003",
  summary: `${DESCRIPTION} Severity II, probability D, resolved Medium from the ratified matrix. No owned, field-verified mitigation.`,
  requested_by: "engine-safety",
  subject_ref: "HAZ-1003",
  payload: {
    hazard_id: "HAZ-1003",
    severity: "II",
    probability: "D",
    risk_level: "Medium",
    risk_level_slug: "medium",
    citations,
    derived_from,
    reason_required: ["accepted", "rejected"],
  },
});

/** HAZ-1003 as the producer holds it: one owned mitigation, never verified in the field. No case id (the real shape). */
const hazDerived = ["HAZ-1003", MATRIX, "MIT-2103"];
export const DRAFT_HAZ_1003: Record<string, unknown> = {
  ...draftBase,
  mitigations: [{ mitigation_id: "MIT-2103", owner: "quality.lead@example.invalid", verified_in_field: "not_verified" }],
  orphan_reason: "mitigation owned but never verified in the field",
  derived_from: hazDerived,
  review_request: reviewRequest(hazDerived),
};

/** SYNTHETIC: every `verified_in_field` state on one card, plus a value outside the vocabulary. */
const threeDerived = ["HAZ-1003", MATRIX, "MIT-2103", "MIT-2104", "MIT-2105", "MIT-2106"];
export const DRAFT_EVERY_VERIFIED_STATE: Record<string, unknown> = {
  ...draftBase,
  mitigations: [
    { mitigation_id: "MIT-2103", owner: "quality.lead@example.invalid", verified_in_field: "not_verified" },
    { mitigation_id: "MIT-2104", owner: "maint.lead@example.invalid", verified_in_field: "true" },
    { mitigation_id: "MIT-2105", owner: "rel.eng@example.invalid", verified_in_field: "false" },
    { mitigation_id: "MIT-2106", owner: "rel.eng@example.invalid", verified_in_field: "pending_trial" },
  ],
  orphan_reason: null,
  derived_from: threeDerived,
  review_request: reviewRequest(threeDerived),
};

/** No mitigations; the producer's orphan_reason for that mechanism. */
const orphanDerived = ["HAZ-1003", MATRIX];
export const DRAFT_ORPHAN: Record<string, unknown> = {
  ...draftBase,
  mitigations: [],
  orphan_reason: "no mitigation recorded",
  derived_from: orphanDerived,
  review_request: reviewRequest(orphanDerived),
};

/** The variant WITH a case id on the review request (the producer carries none today). */
export const DRAFT_WITH_CASE: Record<string, unknown> = {
  ...DRAFT_HAZ_1003,
  review_request: { ...reviewRequest(hazDerived), case_id: "case-77" },
};

/** Matrix citation absent. */
export const DRAFT_NO_MATRIX_CITATION: Record<string, unknown> = {
  ...DRAFT_HAZ_1003,
  citations: { severity: "hazard HAZ-1003", probability: "hazard HAZ-1003" },
};

// The record shape is `entities.py` FailureRecord at 938d7639: the citation names the SOURCE's own
// record ("sor-events-a:EVT-55101"), not the engine's record_id; observed_on is a calendar date.
const failure = (
  record_id: string,
  observed_on: string | undefined,
  failure_mode: string,
  sys: string,
  sourceRef: string,
  platform = "PLT-ALPHA",
) => ({
  record_id,
  platform,
  system_of_record: sys,
  failure_mode,
  ...(observed_on === undefined ? {} : { observed_on }),
  citation: `${sys}:${sourceRef}`,
});

const CHAFE = "Wiring harness chafe — FMEA failure mode WH-12.";
const SHORT = "Chafed wiring loom shorted the primary bus.";

// Deliberately OUT of date order.
const FAILURES = [
  failure("FR-6003", "2026-05-02", CHAFE, "relyence", "FM-7741", "PLT-BRAVO"),
  failure("FR-6001", "2026-03-14", SHORT, "sor-events-a", "EVT-55101"),
  failure("FR-6004", "2026-09-30", SHORT, "sor-events-a", "EVT-55188"),
  failure("FR-6002", "2026-01-11", CHAFE, "relyence", "FM-7734", "PLT-BRAVO"),
];

// `rows` as measures.py builds them: one per failure mode, ordered by count then mode.
const rows = [
  {
    rank: 1,
    entity_id: SHORT,
    entity_name: SHORT,
    contribution: 2,
    share_of_total: 0.5,
    platforms: ["PLT-ALPHA"],
    record_ids: ["FR-6001", "FR-6004"],
    citations: ["sor-events-a:EVT-55101", "sor-events-a:EVT-55188"],
  },
  {
    rank: 2,
    entity_id: CHAFE,
    entity_name: CHAFE,
    contribution: 2,
    share_of_total: 0.5,
    platforms: ["PLT-BRAVO"],
    record_ids: ["FR-6003", "FR-6002"],
    citations: ["relyence:FM-7741", "relyence:FM-7734"],
  },
];

const frsBase = {
  refused: false,
  rows,
  value_label: "failures",
  value_unit: "failures",
  scope_label: "5530-184",
  part_number: "5530-184",
  critical_items_checked: 12,
  platforms: ["PLT-ALPHA", "PLT-BRAVO"],
  systems_of_record_cited: ["relyence", "sor-events-a"],
  failures: FAILURES,
  note: "4 failure(s) for 5530-184 across 2 program(s) and 2 system(s) of record.",
  output_uri: FRS_URI,
};

export const FRS_COMPLETE: Record<string, unknown> = { ...frsBase, failure_count: 4 };
/** failure_count larger than the failures that arrived. */
export const FRS_SHORT: Record<string, unknown> = { ...frsBase, failure_count: 6 };
/** One record with no observed_on: sorts last. */
export const FRS_UNDATED: Record<string, unknown> = {
  ...frsBase,
  failure_count: 5,
  failures: [...FAILURES, failure("FR-6000", undefined, SHORT, "sor-events-a", "EVT-55001")],
};

/** Wrap a reply as the KNOWLEDGE_DOCUMENT component the BFF sends. */
export const asDocument = (reply: Record<string, unknown>, prose?: string): Record<string, unknown> => ({
  archetype: "KNOWLEDGE_DOCUMENT",
  markdown_content: (prose ? prose + "\n\n" : "") + "```json\n" + JSON.stringify(reply, null, 2) + "\n```",
});
