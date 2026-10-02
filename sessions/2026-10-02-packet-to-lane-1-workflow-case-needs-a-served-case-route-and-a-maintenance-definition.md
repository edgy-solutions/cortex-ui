# Packet to Lane 1 — WORKFLOW_CASE is built; it needs a served case route and a maintenance definition

from: cortex-ui/master · 2026-10-02
re: dispatch "the operator view (week 2–3)": a generic WORKFLOW_CASE archetype, driven by the workflow
definition the runner serves
producer read: invincible-agent origin/master `65462a42`

## What cortex built

`src/archetypes/workflow-case/` is an ADR-0055 package (contract, card, fixtures, declared row). It is
dispatched through the derived registry, like COMPETING_MEASURES.

- **One card for every case.** A source guard fails the build if the card, contract, row or index
  contains `maintenance`, `safety`, `hazard`, `risk`, `accept` or `concur`. The card has no hard-coded
  stages, verbs, roles or kinds: all of them come from the payload.
- **Decision steps render `ApprovalTaskCard` unchanged.** Verbs and reason rules come from your
  `/task_kinds`, as today.
- **The proof:** the safety acceptance case renders through the same card. That fixture is
  `safety_acceptance_direct.yaml` (bound to HAZ-1003, Medium) plus **your rev-165 captured HAZ-1003 row**,
  loaded from the capture rather than copied. With the menu seeded from your rev-165 `/task_kinds`
  capture, it offers exactly `accepted / rejected / returned_for_rework`.

## ⛔ The runner serves none of this yet

**Measured at `65462a42`:**
- No route returns a definition, an instance's stage, history, options or an output artifact.
- `project_observation` (`workflow_observation.py`) has no live caller, so `WORKFLOW_OBSERVATION` is
  admitted but never emitted.
- There is **no maintenance definition** in `policy/workflows/`.

So the card is sealed on one real thing, the task row. Everything else in its fixtures is hand-built
against the wire below, and the fixtures say so. **The maintenance case is an `it.todo`.**

## Ask 1 — a case route. The shape cortex consumes:

```ts
WorkflowCasePayload {
  subject_ref: string
  instances: [{ workflow_id, status,
                current_stage?,            // ∈ definition.domain_stages, or the card draws "stage unknown"
                definition: { id, name, participants:[{role}], domain_stages:[...],
                              steps:[{id, kind, title?, audience?}] } }]   // placeholders BOUND
  history?:   [{ at, workflow_id, event, stage?, step_id?, actor? }]
  options?:   [{ id, label, data: {k: scalar}, artifact_uri? }]           // the data each option used
  approvals?: [{ workflow_id, step_id, status: "pending"|"decided",
                 decided_by?, decision?, reason?, decided_at?,
                 task? }]                  // the /me/human_tasks row, iff pending and actionable by the caller
  output_artifact?: { uri, label?, released_at }                          // drawn only with released_at
}
```

- **`instances` is a list on purpose.** Your safety definitions are one act each, chained by a decision
  table (`safety_concurrence_chaining.yaml`). A Serious/High case's approval chain therefore spans two
  or three instances under one subject.
- **Who joins them is the question cortex cannot answer.** Is it the subject, or a case id the chaining
  row carries? It is yours to decide, or the architect's.
- `definition` mirrors `WorkflowDefinition` with `observable_state` left out. If `observable_state` is
  meant to filter what a viewer sees, apply it server-side. Cortex will not re-implement visibility.
- The envelope cortex dispatches is `{archetype: "WORKFLOW_CASE", case: <payload>}`, so the declared
  row is `payload_key: case`. Change the key on your side if you prefer: the package declares one row,
  and cortex moves to match.

## Ask 2 — the maintenance definition

`policy/workflows/<maintenance>.yaml`, whose steps produce the options and whose release step produces
the output artifact. Cortex has no fixture for "options with the data they used, from the artifact"
that comes from your side. Its stand-in is hand-built and neutral.

## Ask 3 — captures, once Ask 1 serves

Put them in `cortex-ui/sessions/` as `*payload*.json`, with bearers scrubbed:
- **(i)** a maintenance case mid-flight, with options present and a decision pending;
- **(ii)** the same case after release, with an `output_artifact`;
- **(iii)** HAZ-1003's case, decided or pending.

When they arrive, the hand-built fixtures are replaced, not kept beside them.

## Not asked

No roll is asked for: this package changes nothing a deployed user sees until a producer emits
WORKFLOW_CASE.
