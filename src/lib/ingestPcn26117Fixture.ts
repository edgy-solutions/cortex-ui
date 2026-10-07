/**
 * ingestPcn26117Fixture — the PCN26-117 ingest, carried past `received` by PRODUCER SOURCE, not
 * by a live capture.
 *
 * WHY THIS EXISTS. `sessions/2026-10-06-payload-ingest-pcn26-117-rev-174.json` (fleet 06b81540,
 * helm rev 174) witnesses exactly two real hops: `POST /ingest` and the `GET .../status` row at
 * `stage: "received"`. `sessions/2026-10-06-payload-ingest-pcn26-117-after-sensor-hand-start.json`
 * shows doc-tools reaching "REVIEW REQUIRED" internally, but its stage-advancing POST never
 * landed (`KeyError: 'KEYCLOAK_REALM_URL'` — no realm URL to mint a token with), so nothing past
 * `received` has been witnessed on the wire. This module BUILDS the rest — review, the
 * document_promotion task, both outcomes of acting on it, promoted, and the answer-label
 * before/after — from the producer source at fleet 06b81540, so the ingest status card and
 * `ProvenanceFloorLabel` have something real to be driven against before Thursday's live capture
 * exists.
 *
 * EVERY HOP BELOW CARRIES `built_from`, a `<path>@06b81540:<line>` citation into the exact
 * producer source it was built from — never invented free-hand. The two exceptions: `recordId`
 * is DERIVED (not invented) — `record_id_for` at `src/iagent/decision_record.py@06b81540:166-168`
 * is `"dr-" + sha1(request_key).hexdigest()[:16]`, `request_key` is the ingest_id, computed once
 * offline for this exact ingest_id and inlined as `RECORD_ID` below so this module stays
 * `node:crypto`-free. And every value that genuinely cannot be known yet (an actor, a timestamp,
 * the six PAYLOAD_FIELDS a real payload never carried) is a literal `PLACEHOLDER:*` string or a
 * field named `*Placeholder`, never a real-looking guess.
 *
 * A PRODUCER DEFECT, BUILT ON PURPOSE (see hop `4a` / `4b`). `update_ingest_stage`
 * (`src/iagent/gateway.py@06b81540:9006-9007`) registers the `document_promotion` task with a
 * 3-key payload — `{ingest_id, domain, dropped_by}`. `promotion.subject_from_payload`
 * (`src/iagent/promotion.py@06b81540:141-151`) requires seven: `PAYLOAD_FIELDS = (ingest_id,
 * object_ref, content_kind, pipeline_version, format_fingerprint, standing, extraction_ref)`.
 * Nothing chains the two, so the FIRST live promote of a stage-route-opened task at 06b81540 (and
 * still at invincible-agent origin/master eb126898) is refused `422 promotion_payload_invalid`.
 * Hop `4a` is what 06b81540 will actually do; hop `4b` is what a payload carrying all seven
 * fields would get — a hypothetical, its six extra fields placeholders, clearly labeled.
 *
 * A SECOND, SMALLER DEFECT FELL OUT OF BUILDING THIS HONESTLY: `"pdf"` is not a registered
 * content_kind at 06b81540 — `git ls-tree -r 06b81540` finds exactly one content_kinds overlay
 * row (`policy/overlays/openddil-lab/content_kinds/maintenance-fault-event.yaml`), and
 * `helm/invincible-agent/templates/configmap.yaml:80`'s `CONTENT_KIND_OVERLAY_DIRS` composes only
 * that one overlay (no `sample/content_kinds`, unlike `TASK_KIND_OVERLAY_DIRS`, which composes
 * two). So `content_kinds.by_kind("pdf")` (`src/iagent/content_kinds.py@06b81540:57-66`) returns
 * `None`, `domain` is `None` (`src/iagent/gateway.py@06b81540:8993-8994`), and the real wire would
 * carry `payload.domain: null` and `audience: "document_promotion:None"` (Python's f-string of
 * `None`, not JSON `null`-as-text) — not a placeholder, a derived fact, cited the same way.
 *
 * THURSDAY. Once a live capture reaches past `received`, it REPLACES every `built_from` hop
 * here — this module does not detect that swap itself. `ingestCapture.test.tsx`'s own stall arm
 * (the `stages_seen` equality) is what goes red first, for whichever release's capture
 * progresses; see the `it.todo`s left there, worded "live capture (Thursday) …".
 */

export const PCN26117_FIXTURE_HEADER =
  "Built from invincible-agent producer source at fleet 06b81540 (helm rev 174), NOT a live " +
  "capture — nothing past `received` has been witnessed (see " +
  "sessions/2026-10-06-payload-ingest-pcn26-117-after-sensor-hand-start.json: doc-tools reached " +
  "REVIEW REQUIRED, but its stage POST never landed — no KEYCLOAK_REALM_URL). Every hop below " +
  "carries `built_from`, a `<path>@06b81540:<line>` citation. Thursday's live capture, once it " +
  "exists, REPLACES every built_from hop here; this fixture does not detect that swap — " +
  "ingestCapture.test.tsx's stall arm does, by going red once a capture's stages_seen moves past " +
  "received.";

/** The record id's own formula, so a reader can recompute it rather than trust the literal.
 *  `record_id_for` — src/iagent/decision_record.py@06b81540:166-168. Computed offline for this
 *  ingest_id (`"dr-" + sha1(ingestId).hexdigest()[:16]`) so this module imports no node builtin. */
export const RECORD_ID = "dr-38115dc9f449155b";

/** `promotion.py@06b81540:69-70` — PAYLOAD_FIELDS, transcribed. The order IS the contract: the
 *  missing-fields message below lists in exactly this order, minus whichever keys are present. */
export const PAYLOAD_FIELDS_TRANSCRIBED = [
  "ingest_id",
  "object_ref",
  "content_kind",
  "pipeline_version",
  "format_fingerprint",
  "standing",
  "extraction_ref",
] as const;

export interface Pcn26117Seed {
  ingestId: string;
  sha256: string;
  kind: "pdf";
  droppedBy: { authz_id: string };
  createdAt: number;
}

export interface Pcn26117Hop {
  id: string;
  built_from: string;
  note?: string;
  request?: { method: string; path: string };
  response: { status: number; body: unknown };
}

export interface Pcn26117Fixture {
  header: string;
  seed: Pcn26117Seed;
  taskId: string;
  audience: string;
  recordId: string;
  missingPayloadFields: string[];
  refusalMessage: string;
  hops: Pcn26117Hop[];
}

/**
 * Build the PCN26-117 fixture on top of the two REAL hops' own ingest_id/kind/dropped_by — the
 * caller (a test) loads those from `sessions/2026-10-06-payload-ingest-pcn26-117-rev-174.json`
 * the same way `ingestCapture.test.tsx` loads its own capture, and passes the seed in here. This
 * function then builds every hop PAST `received` from producer source alone.
 */
export function buildPcn26117Fixture(seed: Pcn26117Seed): Pcn26117Fixture {
  const { ingestId, sha256, kind, droppedBy, createdAt } = seed;

  const taskId = `document_promotion:${ingestId}`;
  // `domain` is None at 06b81540 ("pdf" unregistered — see module doc comment), so Python's
  // f-string `f"{promotion.KIND}:{domain}"` renders the literal word None, not JSON null-as-text.
  const audience = "document_promotion:None";
  const payload3Key = { ingest_id: ingestId, domain: null, dropped_by: droppedBy };

  const missingPayloadFields = PAYLOAD_FIELDS_TRANSCRIBED.filter(
    (f) => !(f in payload3Key) || (payload3Key as Record<string, unknown>)[f] == null,
  );
  // promotion.py@06b81540:151 — Python's f"{missing}" is the list's repr: single-quoted,
  // comma-space separated, bracketed.
  const missingRepr = `[${missingPayloadFields.map((f) => `'${f}'`).join(", ")}]`;
  const refusalMessage =
    `the task payload is missing ${missingRepr}; each is a field of the decision record, and a ` +
    `record that cannot say what was reviewed is not evidence`;

  const baseRow = {
    ingest_id: ingestId,
    sha256,
    kind,
    duplicate: null,
    dropped_by: droppedBy,
    origin_suggestion: null,
  };

  const hops: Pcn26117Hop[] = [
    {
      id: "1-status-extracting",
      built_from: "src/iagent/gateway.py@06b81540:8916-8920 (_stage_targets includes EXTRACTING)",
      note: "doc-tools' own stage-advancing POST, carried by the status row it causes. updated_at is a PLACEHOLDER (not witnessed).",
      request: { method: "GET", path: `/ingest/${ingestId}/status` },
      response: {
        status: 200,
        body: {
          ...baseRow,
          stage: "extracting",
          detail: null,
          created_at: createdAt,
          updated_at: createdAt + 1000, // PLACEHOLDER
        },
      },
    },
    {
      id: "2a-stage-route-review-filed",
      built_from: "src/iagent/gateway.py@06b81540:8993-9017 (update_ingest_stage, the REVIEW branch)",
      note: "task_id/audience: gateway.py:8995-8996. payload (3 keys, not 7): gateway.py:9006-9007.",
      request: { method: "POST", path: `/ingest/${ingestId}/stage` },
      response: {
        status: 200,
        body: { ingest_id: ingestId, stage: "review", task_id: taskId, task_status: "FILED" },
      },
    },
    {
      id: "2b-status-review",
      built_from: "src/iagent/gateway.py@06b81540:9017 (the row ingest_status.update_status just wrote)",
      request: { method: "GET", path: `/ingest/${ingestId}/status` },
      response: {
        status: 200,
        body: {
          ...baseRow,
          stage: "review",
          detail: null,
          created_at: createdAt,
          updated_at: createdAt + 2000, // PLACEHOLDER
        },
      },
    },
    {
      id: "3-human-task-row",
      built_from: "src/iagent/human_tasks.py@06b81540:384-386 (list_tasks_for's SELECT columns)",
      note:
        "title/summary: gateway.py:9003-9004. requested_by is the caller, the doc-tools service " +
        "identity (gateway.py _DOC_TOOLS_SERVICE_AUTHZ_ID, default \"svc:doc-tools\"). Shaped for " +
        "src/lib/seedHumanTasks.ts's humanTaskFromRow.",
      request: { method: "GET", path: "/me/human_tasks" },
      response: {
        status: 200,
        body: {
          email: droppedBy.authz_id,
          tasks: [
            {
              id: "pcn26-117-review",
              kind: "document_promotion",
              task_id: taskId,
              workflow_id: null,
              audience,
              status: "pending",
              title: `Promote document ${ingestId}`,
              summary: `Review the extracted document ${ingestId} for promotion.`,
              requested_by: "svc:doc-tools",
              subject_ref: ingestId,
              payload: payload3Key,
              created_at: createdAt + 2000, // PLACEHOLDER
              workflow_service: null,
              promise_name: null,
            },
          ],
        },
      },
    },
    {
      id: "4a-act-refused-422",
      built_from: "src/iagent/promotion.py@06b81540:141-151 (subject_from_payload's missing-fields refusal)",
      note:
        "WHAT 06B81540 WILL ACTUALLY DO. gateway.py:2974-2976 catches PromotionRefused and " +
        "answers HTTPException(status, detail={error, task_id, message}).",
      request: { method: "POST", path: `/human_tasks/${taskId}/act`, },
      response: {
        status: 422,
        body: { error: "promotion_payload_invalid", task_id: taskId, message: refusalMessage },
      },
    },
    {
      id: "4b-act-200-promoted-hypothetical",
      built_from: "src/iagent/gateway.py@06b81540:3008 (the document_promotion success return)",
      note:
        "HYPOTHETICAL — only reachable if the task's payload carried all 7 PAYLOAD_FIELDS, which " +
        "06b81540 never writes (see 4a and the module doc comment). hypothetical_payload's 6 " +
        "extra fields are PLACEHOLDERs; ingest_id is the real one. fact: " +
        "promotion.py:209-215 (promotion_fact). record_id is NOT a placeholder (see RECORD_ID).",
      request: { method: "POST", path: `/human_tasks/${taskId}/act` },
      response: {
        status: 200,
        body: {
          task_id: taskId,
          decision: "promoted",
          rows_resolved: 1,
          ingest_id: ingestId,
          record_id: RECORD_ID,
          replayed: false,
          fact: {
            promoted_by: "human:PLACEHOLDER:acted_by@example.com",
            promoted_at: createdAt + 3000, // PLACEHOLDER
            promotion_ref: RECORD_ID,
          },
          hypothetical_payload: {
            ingest_id: ingestId,
            object_ref: "PLACEHOLDER:object_ref",
            content_kind: "PLACEHOLDER:content_kind",
            pipeline_version: "PLACEHOLDER:pipeline_version",
            format_fingerprint: "PLACEHOLDER:format_fingerprint",
            standing: "PLACEHOLDER:standing",
            extraction_ref: "PLACEHOLDER:extraction_ref",
          },
        },
      },
    },
    {
      id: "5-status-promoted",
      built_from: "src/iagent/gateway.py@06b81540:2999-3003 (_detail = f\"record {record_id}\")",
      note: "Only reachable after 4b (the hypothetical), per the producer defect — see the header.",
      request: { method: "GET", path: `/ingest/${ingestId}/status` },
      response: {
        status: 200,
        body: {
          ...baseRow,
          stage: "promoted",
          detail: `record ${RECORD_ID}`,
          created_at: createdAt,
          updated_at: createdAt + 3000, // PLACEHOLDER
        },
      },
    },
    {
      id: "6a-provenance-floor-before",
      built_from: "src/iagent/provenance_floor.py@06b81540:68-84 (provenance_floor, pre-promotion)",
      note: "A component drawing on this ingest's unpromoted user-drop material.",
      response: {
        status: 200,
        body: { provenance_floor: { obtained_via: "user-drop", ingest_ids: [ingestId], unidentified: 0 } },
      },
    },
    {
      id: "6b-provenance-floor-after",
      built_from:
        "src/iagent/provenance_floor.py@06b81540:68-84, docstring \"PROMOTION DOES NOT CHANGE THE " +
        "RUNG\" — obtained_via stays user-drop; the promoted id LEAVES ingest_ids.",
      response: {
        status: 200,
        body: { provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: 0 } },
      },
    },
  ];

  return {
    header: PCN26117_FIXTURE_HEADER,
    seed,
    taskId,
    audience,
    recordId: RECORD_ID,
    missingPayloadFields,
    refusalMessage,
    hops,
  };
}
