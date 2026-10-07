/**
 * FIXTURES for `GET /cases/{case_id}` and the event ingest rows that point at it.
 *
 * ⚠ NONE OF THESE IS A LIVE CAPTURE. Each is labelled below as either producer-test-derived or
 * hand-built. A live `GET /cases/{id}` capture on helm rev >= 177 has been asked of Lane 1 (see
 * the `it.todo` in `cases.test.ts`); until it lands, nothing here has been observed on the wire.
 */
import type { WorkflowCasePayload } from "@/archetypes/workflow-case/contract";

/** Hand-built ids. The `evt-` + 64 hex shape is `ingest_status.EVENT_INGEST_ID_RE` at `3e6d9e9f`. */
export const EVENT_SHA = "e0".padEnd(64, "0");
export const EVENT_INGEST_ID = `evt-${EVENT_SHA}`;
/** `case_id` of the producer test's case (tests/test_case_projection.py `_case` default). */
export const CASE_ID = "case-1";

/**
 * PRODUCER-TEST-DERIVED, NOT A LIVE CAPTURE.
 *
 * Transcribed by hand from what `project_workflow_case` returns for the input built in
 * invincible-agent `3e6d9e9f` `tests/test_case_projection.py`
 * `test_payload_keys_are_exactly_the_contract_fields` (L59-76): `_case(instances=[{"n": 1,
 * "instance_id": "case-1~1", "definition_id": "def-a"}], transitions=[{"from": None, "outcome":
 * "received", "to": "received", "by": "system", "at": "t0"}], terminal="done")` with
 * `defs = {"def-a": _definition("def-a")}` (`_definition` L24-30, whose default step is `_step("s1",
 * "human_await", title="Approve", audience="aud:x")`, L15-21) and `task_rows=[]`.
 * The values follow `src/iagent/case_projection.py`: `subject_ref` = case_id; status "completed"
 * (last instance, `terminal` set); `current_stage` null ("NO SOURCE"); `options` [] and
 * `output_artifact` None ("always empty"); no approvals for no task rows. `history` carries no
 * `step_id` — the producer's entry has exactly at/workflow_id/event/stage/actor. `at` is the
 * test's literal `"t0"`; a real transition carries a timestamp.
 */
export const CASE_PAYLOAD_PRODUCER_TEST_DERIVED: WorkflowCasePayload = {
  subject_ref: CASE_ID,
  instances: [
    {
      workflow_id: "case-1~1",
      definition: {
        id: "def-a",
        name: "def-a",
        participants: [],
        domain_stages: [],
        steps: [{ id: "s1", kind: "human_await", title: "Approve", audience: "aud:x" }],
      },
      current_stage: null,
      status: "completed",
    },
  ],
  history: [{ at: "t0", workflow_id: CASE_ID, event: "received", stage: "received", actor: "system" }],
  options: [],
  approvals: [],
  output_artifact: null,
};

/** A body the reader must refuse: one instance whose definition is missing. HAND-BUILT. */
export const CASE_PAYLOAD_INVALID_HAND_BUILT: unknown = {
  subject_ref: CASE_ID,
  instances: [{ workflow_id: "case-1~1", status: "running" }],
};

/**
 * Event status rows, `received` then `case_opened`. HAND-BUILT — the producer tests give no
 * `/ingest/{id}/status` row for an event. The ladder is exactly what `POST /ingest/events`
 * writes at `3e6d9e9f` (`record_received`, then `update_status(CASE_OPENED, case_id=...)`);
 * the field set is `ingest_status_route`'s (gateway.py), with `case_id` null until case_opened
 * and `origin` omitted as on today's wire.
 */
const eventRow = (stage: string, case_id: string | null) => ({
  ingest_id: EVENT_INGEST_ID,
  stage,
  detail: null,
  duplicate: null,
  kind: "event",
  sha256: EVENT_SHA,
  created_at: 1790860800000,
  updated_at: 1790860801000,
  dropped_by: { authz_id: "alice" },
  origin_suggestion: null,
  case_id,
});

export const EVENT_ROW_RECEIVED_HAND_BUILT = eventRow("received", null);
export const EVENT_ROW_CASE_OPENED_HAND_BUILT = eventRow("case_opened", CASE_ID);
/** Producer contradiction: an event row at case_opened with no case_id. HAND-BUILT. */
export const EVENT_ROW_CASE_OPENED_NO_CASE_ID_HAND_BUILT = eventRow("case_opened", null);
/** A document row that (against Lane 1's "null on document rows") carries a case_id. HAND-BUILT. */
export const PDF_ROW_WITH_CASE_ID_HAND_BUILT = {
  ...eventRow("received", CASE_ID),
  ingest_id: `sha256:${"3f".padEnd(64, "0")}`,
  sha256: "3f".padEnd(64, "0"),
  kind: "pdf",
};
