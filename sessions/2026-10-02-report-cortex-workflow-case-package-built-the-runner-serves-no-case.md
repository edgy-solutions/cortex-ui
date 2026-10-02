# Report — cortex-ui: WORKFLOW_CASE is built as a package; the runner serves no case yet

from: cortex-ui/master · 2026-10-02
dispatch: "the operator view (week 2–3)" — a generic WORKFLOW_CASE archetype
producer read: invincible-agent origin/master `65462a42`

| Dispatch clause | Outcome |
|---|---|
| ADR-0055 package (contract, card, fixtures, declared row) | **Done.** `src/archetypes/workflow-case/`, dispatched through the derived registry |
| Driven by the workflow definition the runner serves | **Not possible yet.** No route serves a definition, an instance, its history, options or artifact. The contract is cortex-PROPOSED, its header says so, and the route is asked for in the packet |
| State and history, options with their data, approval chain, released artifact | Drawn from the payload. Each has a declared absence |
| Decision steps reuse the approval card | `ApprovalTaskCard` is imported and rendered unchanged. Verbs and reason rules come from `/task_kinds` |
| Maintenance case first; no maintenance naming in the component | **No maintenance definition exists** upstream, so it is an `it.todo`. A source guard fails the build if card/contract/row/index contain `maintenance\|safety\|hazard\|risk\|accept\|concur` |
| Safety acceptance renders through the same card, as proof | **Yes**: `safety_acceptance_direct.yaml` bound to HAZ-1003, plus Lane 1's **captured** rev-165 HAZ-1003 row. With the captured menu, it offers exactly `accepted / rejected / returned_for_rework` |

## Design decisions

- **`instances` is a list.** The safety definitions are one act each, chained by a decision table, so a Serious/High approval chain spans several instances under one subject. A single-instance contract could not draw it.
- **Stage:** an unknown `current_stage` draws "stage unknown". The card never guesses the first stage.
- **Approval entries:** a decided approval with an empty reason draws `data-reason-absent`, never a blank. A pending approval with no actionable task draws text only, with no buttons.
- **Artifact:** drawn only with both `uri` and `released_at`.
- **`fallbackDisclosure`: `WORKFLOW_CASE` claims an answer.** This is the strict, withhold-under-fallback side, like GROUPED_REVIEW and WORKFLOW_OBSERVATION. Revisit it if the operator must see a pending decision even under a fallback.
- **Completeness gates forced edits to** `answerDisplay.ts` (label "Case") and `ArchetypeGlyph.tsx` (GitBranch).
- **No capability-catalog row.** It would need ontology URIs the producer has not minted.

## Seals and mutants (Card.tsx; each restored from a backup)

- **Fixtures:** six, each declaring its absences by EQUALITY. Every absence is flipped both ways across the set.
  - Fixture 1 loads the served row from the capture rather than copying it.
  - Fixtures 2–6 are hand-built and labelled as such.
- **Mutants, all RED:**

| Mutant | What it changes |
|---|---|
| M1 | hand-made buttons instead of ApprovalTaskCard |
| M2 | guesses the first stage |
| M3 | artifact drawn without `released_at` |
| M4 | the word in a comment |
| M5 | blank reason |
| M6 | first instance's stages only |

- **M3 at first stayed GREEN.** No fixture had a uri without `released_at`. Fixture 6 now has that key present with the value `undefined`, which is the shape a containment check cannot see.
- **The implementer's source guard first stripped comments before scanning,** which would have hidden M4. It is fixed.

## Gates

- check:transport 0, tsc 0.
- Scoped vitest: 26 files, 346 passed, 2 todo.
- Implementer's full run: 2144 passed, 4 todo, 4 reds.
  - 3 were contention timeouts that pass alone.
  - 1 is the known environmental taskKindParity "two, they AGREE".

## Also observed

The rev-165 export captures, committed with this work:
- `POST /export/package` still returns `failed / unavailable` (engine-cost has no `duckdb`).
- A non-cost canvas returns `not_in_model`.
- **The card export stays.**

## Files

- Packet: `sessions/2026-10-02-packet-to-lane-1-workflow-case-needs-a-served-case-route-and-a-maintenance-definition.md`
- Package: `src/archetypes/workflow-case/`
- Modified: `SemanticInterpreter.tsx`, `answerDisplay.ts`, `ArchetypeGlyph.tsx`, `fallbackDisclosure.ts`
