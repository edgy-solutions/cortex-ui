/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `WORKFLOW_CASE`.
 *
 * Six declared absences, one proof fixture built from a REAL served row rather than typed by
 * hand, one hand-built multi-instance chain, one neutral-domain "everything present" fixture,
 * two single-absence fixtures, and one fixture isolating the empty-approval-chain / artifact-
 * prepared-but-not-released pair. Fixtures 1 and 2 use producer vocabulary (the regex the
 * source guard enforces on `Card.tsx` / `contract.ts` / `row.ts` / `index.ts` does not apply to
 * this file) because the facts they transcribe genuinely carry it — a definition's own `name`
 * and a task's own `kind` are not something a fixture gets to launder.
 */
import tasksCapture from "../../../../sessions/2026-10-02-payload-me-human-tasks-rev-165-bob.json";
import taskKindsCapture from "../../../../sessions/2026-10-02-payload-task-kinds-rev-165-bob.json";
import { taskToArtifact } from "@/lib/taskArtifact";
import { parseTaskPayload } from "@/lib/taskPayload";
import type { HumanTask } from "@/store/useHumanTaskStore";
import type { ApprovalTaskPayload, CaseArtifact, CaseDefinition, CaseInstance, WorkflowCasePayload } from "../contract";

export const WORKFLOW_CASE_ABSENCES = [
  "data-stage-unknown",
  "data-history-absent",
  "data-options-absent",
  "data-approvals-absent",
  "data-artifact-unreleased",
  "data-reason-absent",
] as const;

export type WorkflowCaseAbsence = (typeof WORKFLOW_CASE_ABSENCES)[number];

export interface WorkflowCaseFixture {
  name: string;
  payload: WorkflowCasePayload;
  declares: WorkflowCaseAbsence[];
}

/**
 * THE SAME MAPPER THE TASK LIST USES. Reusing `taskToArtifact` (rather than hand-writing the
 * HumanTask -> ApprovalTaskPayload field mapping a second time) means a defect in that mapping
 * shows up here too, instead of a second copy quietly disagreeing with the first.
 */
function toApprovalTaskPayload(task: HumanTask): ApprovalTaskPayload {
  const artifact = taskToArtifact(task);
  const component = artifact.rendered_output?.components[0] as
    | { archetype: string; task: ApprovalTaskPayload }
    | undefined;
  if (!component || component.archetype !== "APPROVAL_TASK") {
    throw new Error(
      `fixtures: taskToArtifact(${task.kind}) did not produce an APPROVAL_TASK component — the ` +
        `WORKFLOW_CASE fixture that reused this mapper needs updating alongside it`,
    );
  }
  return component.task;
}

type RawTaskRow = Record<string, unknown>;

/** `seedHumanTasks.ts`'s own REST-row -> HumanTask mapping, not re-derived. */
function toHumanTask(row: RawTaskRow): HumanTask {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    workflowId: (row.workflow_id as string | null) ?? null,
    audience: String(row.audience ?? ""),
    kind: String(row.kind ?? "workflow_ack"),
    status: (row.status as HumanTask["status"]) ?? "pending",
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    requestedBy: String(row.requested_by ?? ""),
    subjectRef: (row.subject_ref as string | null) ?? null,
    payload: parseTaskPayload(row.payload),
    createdAt: Number(row.created_at ?? 0),
  };
}

/**
 * THE SERVED ROW, PICKED BY KEY — never re-typed. `sessions/2026-10-02-payload-me-human-tasks-
 * rev-165-bob.json` `.body.tasks[]`, the row where `task_id === "acceptance"` and `subject_ref
 * === "HAZ-1003"`.
 */
const HAZ_1003_ROW: RawTaskRow = (() => {
  const tasks = (tasksCapture as { body: { tasks: RawTaskRow[] } }).body.tasks;
  const row = tasks.find((t) => t.task_id === "acceptance" && t.subject_ref === "HAZ-1003");
  if (!row) {
    throw new Error(
      "fixtures: the captured me/human_tasks row for HAZ-1003's acceptance task is missing — " +
        "the capture file this fixture reads from must have changed shape",
    );
  }
  return row;
})();

/** `sessions/2026-10-02-payload-task-kinds-rev-165-bob.json` `.body.kinds`, keyed by kind name. */
const TASK_KINDS: Record<string, RawTaskRow> = (taskKindsCapture as { body: { kinds: Record<string, RawTaskRow> } })
  .body.kinds;

/**
 * THE SERIOUS ACCEPTANCE KIND, PICKED BY PATTERN, never the literal string. Falls back to the
 * Medium kind (and says so in the comment on the fixture that uses it) if a Serious-specific
 * acceptance kind is ever withdrawn from the capture.
 */
function pickKind(pattern: RegExp): RawTaskRow | null {
  for (const key of Object.keys(TASK_KINDS)) {
    if (pattern.test(key)) return TASK_KINDS[key];
  }
  return null;
}
const SERIOUS_ACCEPTANCE_KIND = pickKind(/^risk_acceptance_serious$/);
const SERIOUS_CONCURRENCE_KIND = pickKind(/^risk_acceptance_concurrence_serious$/);
const FALLBACK_TO_MEDIUM = !SERIOUS_ACCEPTANCE_KIND;
const ACCEPTANCE_KIND = SERIOUS_ACCEPTANCE_KIND ?? pickKind(/^risk_acceptance_medium$/);
if (!ACCEPTANCE_KIND) {
  throw new Error("fixtures: neither a Serious nor a Medium acceptance kind is in the capture");
}

/**
 * FIXTURE 1's definition — transcribed from `policy/workflows/safety_acceptance_direct.yaml` at
 * `invincible-agent` origin/master, sha `65462a42d6b06071eb5d1b740caef072aa8987ff`, with
 * `{level}` = "Medium", `{level_slug}` = "medium", `{hazard_id}` = "HAZ-1003" bound. Only the
 * one step the YAML declares; `kind`/`id`/`audience`/`title` are its own fields, copied, not
 * composed.
 */
const SAFETY_ACCEPTANCE_DIRECT_MEDIUM: CaseDefinition = {
  id: "safety_acceptance_direct",
  name: "Safety risk acceptance (Medium/Low) — acceptance only",
  participants: [{ role: "initiator" }, { role: "acceptance_authority" }],
  domain_stages: ["drafted", "acceptance_pending", "disposed"],
  steps: [
    {
      id: "acceptance",
      kind: "human_await",
      audience: "risk_acceptance_medium:SUSTAINMENT",
      title: "Accept Medium risk — HAZ-1003",
    },
  ],
};

const HAZ_1003_INSTANCE: CaseInstance = {
  workflow_id: String(HAZ_1003_ROW.workflow_id),
  definition: SAFETY_ACCEPTANCE_DIRECT_MEDIUM,
  current_stage: "acceptance_pending",
  status: "running",
};

const FIXTURE_1_PAYLOAD: WorkflowCasePayload = {
  subject_ref: "HAZ-1003",
  instances: [HAZ_1003_INSTANCE],
  approvals: [
    {
      workflow_id: HAZ_1003_INSTANCE.workflow_id,
      step_id: "acceptance",
      status: "pending",
      task: toApprovalTaskPayload(toHumanTask(HAZ_1003_ROW)),
    },
  ],
  // history, options, artifact: not in the captured row at all — this producer serves the task
  // row only, never a case's history/options/artifact (see contract.ts's header).
};

/**
 * FIXTURE 2 — hand-built, say so here rather than implying a second capture: no served row
 * backs a Serious chain today. Transcribed from the two producer definitions the same way as
 * fixture 1 (same sha), with `{hazard_id}` bound to a fixture-only subject ("HAZ-2041") that is
 * not any real hazard id.
 */
const SAFETY_CONCURRENCE_SERIOUS: CaseDefinition = {
  id: "safety_concurrence",
  name: "Safety risk concurrence (Serious/High) — act one of two",
  participants: [{ role: "initiator" }, { role: "user_representative" }],
  domain_stages: ["drafted", "concurrence_pending", "concurrence_disposed"],
  steps: [
    {
      id: "concurrence",
      kind: "human_await",
      audience: "risk_acceptance_concurrence_serious:SUSTAINMENT",
      title: "Concur on Serious risk — HAZ-2041",
    },
  ],
};

const SAFETY_ACCEPTANCE_DIRECT_SERIOUS: CaseDefinition = {
  // The producer's own `name` has "(Medium/Low)" baked in literally — no `{level}` placeholder
  // on that field — even though this SAME definition is what a Serious/High chain reaches after
  // concurrence. Transcribed as-is: the card draws whatever the definition says, not a prettier
  // name this fixture could supply instead.
  id: "safety_acceptance_direct",
  name: "Safety risk acceptance (Medium/Low) — acceptance only",
  participants: [{ role: "initiator" }, { role: "acceptance_authority" }],
  domain_stages: ["drafted", "acceptance_pending", "disposed"],
  steps: [
    {
      id: "acceptance",
      kind: "human_await",
      audience: "risk_acceptance_serious:SUSTAINMENT",
      title: "Accept Serious risk — HAZ-2041",
    },
  ],
};

const CONCURRENCE_INSTANCE: CaseInstance = {
  workflow_id: "risk-concurrence-HAZ-2041-serious",
  definition: SAFETY_CONCURRENCE_SERIOUS,
  current_stage: "concurrence_disposed",
  status: "completed",
};

const ACCEPTANCE_INSTANCE: CaseInstance = {
  workflow_id: "risk-acceptance-HAZ-2041-serious",
  definition: SAFETY_ACCEPTANCE_DIRECT_SERIOUS,
  current_stage: "acceptance_pending",
  status: "running",
};

const FIXTURE_2_PAYLOAD: WorkflowCasePayload = {
  subject_ref: "HAZ-2041",
  instances: [CONCURRENCE_INSTANCE, ACCEPTANCE_INSTANCE],
  approvals: [
    {
      workflow_id: CONCURRENCE_INSTANCE.workflow_id,
      step_id: "concurrence",
      status: "decided",
      decided_by: "jane.doe",
      decision: "concurred",
      reason: "Hazard analysis checked; the residual likelihood and severity are documented.",
      decided_at: "2026-09-28T14:03:00Z",
    },
    {
      workflow_id: ACCEPTANCE_INSTANCE.workflow_id,
      step_id: "acceptance",
      status: "pending",
      task: {
        task_id: "acceptance",
        // PICKED FROM THE CAPTURE, never the literal — see FALLBACK_TO_MEDIUM below for what
        // happens if the Serious kind is ever withdrawn.
        kind: String(ACCEPTANCE_KIND.kind),
        task_state: "pending",
        title: "Accept Serious risk — HAZ-2041",
        summary: "Residual risk acceptance, reached after concurrence.",
        audience: "risk_acceptance_serious:SUSTAINMENT",
        requested_by: "",
        subject_ref: "HAZ-2041",
      },
    },
  ],
};
// FALLBACK_TO_MEDIUM is read here (not just above) so a withdrawn Serious kind fails loudly in
// the one place a reader would look for why fixture 2's task now offers Medium's verbs.
if (FALLBACK_TO_MEDIUM) {
  // eslint-disable-next-line no-console
  console.warn(
    "[WORKFLOW_CASE fixtures] no risk_acceptance_serious kind in the task_kinds capture — " +
      "fixture 2 fell back to the Medium kind's declared verbs.",
  );
}
void SERIOUS_CONCURRENCE_KIND; // read for its presence, not its value — see fixture 2's comment.

/**
 * FIXTURE 3 — hand-built, neutral domain. Stands in for a served definition/instance pair until
 * a real one is served (see the `it.todo`s in `fixtures.test.tsx`). Deliberately carries NONE of
 * the six absences: every section has something to draw.
 */
const DEMO_DEFINITION: CaseDefinition = {
  id: "demo_case",
  name: "Demo case (stand-in for a served definition)",
  participants: [{ role: "initiator" }, { role: "reviewer" }],
  domain_stages: ["drafted", "in_review", "closed"],
  steps: [{ id: "review", kind: "human_await", title: "Review the options" }],
};

function demoInstance(workflowId: string, currentStage: string, status: CaseInstance["status"]): CaseInstance {
  return { workflow_id: workflowId, definition: DEMO_DEFINITION, current_stage: currentStage, status };
}

const FIXTURE_3_INSTANCE = demoInstance("demo-DEMO-0001", "closed", "completed");

const FIXTURE_3_PAYLOAD: WorkflowCasePayload = {
  subject_ref: "DEMO-0001",
  instances: [FIXTURE_3_INSTANCE],
  history: [
    { at: "2026-09-01T09:00:00Z", workflow_id: FIXTURE_3_INSTANCE.workflow_id, event: "opened", stage: "drafted" },
    {
      at: "2026-09-03T10:00:00Z",
      workflow_id: FIXTURE_3_INSTANCE.workflow_id,
      event: "moved_to_review",
      stage: "in_review",
    },
    {
      at: "2026-09-05T16:30:00Z",
      workflow_id: FIXTURE_3_INSTANCE.workflow_id,
      event: "disposed",
      stage: "closed",
      actor: "alex",
    },
  ],
  options: [
    {
      id: "A",
      label: "Option A",
      data: { cost: 1200, duration_days: 5, vendor: "Acme" },
      artifact_uri: "https://example.invalid/options/a.pdf",
    },
    {
      id: "B",
      label: "Option B",
      data: { cost: 1500, duration_days: 3, vendor: "Globex" },
      artifact_uri: "https://example.invalid/options/b.pdf",
    },
  ],
  approvals: [
    {
      workflow_id: FIXTURE_3_INSTANCE.workflow_id,
      step_id: "review",
      status: "decided",
      decided_by: "alex",
      decision: "selected_option_a",
      reason: "Lower cost and a shorter duration; see the attached comparison.",
      decided_at: "2026-09-05T16:31:00Z",
    },
  ],
  output_artifact: {
    uri: "https://example.invalid/artifacts/decision.pdf",
    label: "Decision record",
    released_at: "2026-09-05T16:31:00Z",
  },
};

/** FIXTURE 4 — decided with no reason. Everything else mirrors fixture 3, to isolate the one
 *  absence this fixture declares. */
const FIXTURE_4_INSTANCE = demoInstance("demo-DEMO-0002", "closed", "completed");
const FIXTURE_4_PAYLOAD: WorkflowCasePayload = {
  subject_ref: "DEMO-0002",
  instances: [FIXTURE_4_INSTANCE],
  history: [
    { at: "2026-09-10T09:00:00Z", workflow_id: FIXTURE_4_INSTANCE.workflow_id, event: "opened", stage: "drafted" },
  ],
  options: [{ id: "A", label: "Option A", data: { cost: 900 } }],
  approvals: [
    {
      workflow_id: FIXTURE_4_INSTANCE.workflow_id,
      step_id: "review",
      status: "decided",
      decided_by: "sam",
      decision: "selected_option_a",
      reason: "",
    },
  ],
  output_artifact: {
    uri: "https://example.invalid/artifacts/decision-2.pdf",
    released_at: "2026-09-10T12:00:00Z",
  },
};

/** FIXTURE 5 — a current_stage the definition does not declare. Everything else present, to
 *  isolate the one absence this fixture declares. */
const FIXTURE_5_INSTANCE = demoInstance("demo-DEMO-0003", "nonexistent", "running");
const FIXTURE_5_PAYLOAD: WorkflowCasePayload = {
  subject_ref: "DEMO-0003",
  instances: [FIXTURE_5_INSTANCE],
  history: [
    { at: "2026-09-15T09:00:00Z", workflow_id: FIXTURE_5_INSTANCE.workflow_id, event: "opened", stage: "drafted" },
  ],
  options: [{ id: "A", label: "Option A", data: { cost: 900 } }],
  approvals: [
    {
      workflow_id: FIXTURE_5_INSTANCE.workflow_id,
      step_id: "review",
      status: "decided",
      decided_by: "sam",
      decision: "selected_option_a",
      reason: "Only option on the table.",
    },
  ],
  output_artifact: {
    uri: "https://example.invalid/artifacts/decision-3.pdf",
    released_at: "2026-09-15T12:00:00Z",
  },
};

/** FIXTURE 6 — artifact prepared, not released; no decision yet. History and options are both
 *  present (so neither of THOSE absences is what this fixture isolates); the approval chain is
 *  empty — not absent from the payload, an actual `[]` — and the artifact carries a `uri` with
 *  no `released_at`. */
const FIXTURE_6_INSTANCE = demoInstance("demo-DEMO-0004", "in_review", "running");
const FIXTURE_6_PAYLOAD: WorkflowCasePayload = {
  subject_ref: "DEMO-0004",
  instances: [FIXTURE_6_INSTANCE],
  history: [
    { at: "2026-09-20T09:00:00Z", workflow_id: FIXTURE_6_INSTANCE.workflow_id, event: "opened", stage: "drafted" },
  ],
  options: [{ id: "A", label: "Option A", data: { cost: 700 } }],
  approvals: [],
  output_artifact: {
    uri: "https://example.invalid/artifacts/decision-4.pdf",
    label: "Decision record (prepared, not released)",
    // Spelled with the KEY present and the VALUE `undefined`, on purpose, not omitted: this is
    // the case a containment check ("does output_artifact have a released_at property?") cannot
    // tell apart from a released artifact — the key is there either way. Only a truthiness read
    // (`!!artifact.released_at`, the card's own test, and M3's target) takes the not-released
    // branch; a mutant that drops that check would render the link anyway. The cast is needed
    // because `CaseArtifact.released_at` is typed as a required `string` — this fixture is
    // deliberately off that type, not a value the contract permits.
    released_at: undefined,
  } as unknown as CaseArtifact,
};

export const WORKFLOW_CASE_FIXTURES: WorkflowCaseFixture[] = [
  {
    name: "safety acceptance (Medium), pending — the served HAZ-1003 row",
    payload: FIXTURE_1_PAYLOAD,
    declares: ["data-history-absent", "data-options-absent", "data-artifact-unreleased"],
  },
  {
    name: "safety Serious chain — concurrence decided, acceptance pending (hand-built)",
    payload: FIXTURE_2_PAYLOAD,
    declares: ["data-history-absent", "data-options-absent", "data-artifact-unreleased"],
  },
  {
    name: "options with data, artifact released (hand-built, neutral domain)",
    payload: FIXTURE_3_PAYLOAD,
    declares: [],
  },
  {
    name: "decided with no reason",
    payload: FIXTURE_4_PAYLOAD,
    declares: ["data-reason-absent"],
  },
  {
    name: "stage not in the definition",
    payload: FIXTURE_5_PAYLOAD,
    declares: ["data-stage-unknown"],
  },
  {
    name: "artifact prepared, not released — no decision yet",
    payload: FIXTURE_6_PAYLOAD,
    declares: ["data-approvals-absent", "data-artifact-unreleased"],
  },
];

// This module is bundled into the production registry (via `index.ts`), so the captures above are
// plain ES `import`s of the JSON, never `node:fs`: a browser bundle cannot resolve a Node builtin.
// An earlier version imported `readFileSync` here, unused, "so a future edit finds this note"; that
// import alone broke `vite build` for every push from 2915e36 to 77506a1, while tsc and the whole
// suite stayed green. `src/lib/noNodeBuiltinsInTheBundle.test.ts` now fails on it in the suite.
