# 2026-11-10: the 0.4.85 candidate is 90b7c13; option data is drawn by its fields, and the case link opens the held task

**Dispatch (the architect, via Chris):**
1. "Option cards render `[object Object]` for parts, spares and task_refs. Those are objects on the wire
   ({graph_uri, data_module_code} for task_refs); render each by its declared fields, never by string coercion.
   A test with the real action-record shape."
2. "The hub card's link lands on the read-only case panel when the viewer holds a pending task on that case.
   The deep link opens the pending task for a viewer who has one, and the case panel otherwise."

**Consolidated by Chris:** the two walk defects above, plus two items already on master in `8e32f5b`:
- the footer keeps `work` and omits wall clock and hops;
- the four regen steps at `4f2dac35`.

## The candidate

| | |
|---|---|
| sha | `90b7c1333e1d63469bec78d5700bead7496f45fb` (on top of `a6c5136`, which is on `8e32f5b`) |
| image | `sha256:8597fac2ec6b1bdf27b62a3ce8a3b6fa10b184cc54d1e184627c6c07e4335c68` |
| CI | Build Containers run 42900637157, success, all 29 Build Frontend steps succeeded (none skipped; "Build and push frontend image (multi-arch)" ran) |
| producer | `4f2dac35fa108c6904e7762b2b9dc644e14be40d`, unchanged from 0.4.84 |

- **The digest** comes from GHCR with the full sha. Negative control `53caff9` gives 404; positive control `01fa313`
  gives 200, `sha256:2b625433…`.
- **The gate** ran on git-archive exports: cortex at `90b7c13`, invincible-agent at `4f2dac35`. Gate `g85c`:
  - 319 files: 4832 passed, 1 skipped, 9 todo, and no expected fails.
  - Transport, redproof, test, tsc, seals and bundle all exit 0.
  - Report mtime 15:09:16. The instrument: 490 cross-repo arms ran, 0 did not.
  - The test step ran with `--maxWorkers=4`. The box had 0 GB of physical memory free (editor and browsers), and
    the two full-worker runs before it were red on load alone:
    - `g85a`: 7 fork workers timed out on start;
    - `g85b`: 1 worker failed to start, and `knowledge-document/parity` hit the 5 s test timeout.

    Neither run had a code failure, and every file that did not run passed on its own (7 files with 125 tests, then
    2 with 10). CI's full suite on a clean runner is green.
- **0.4.84 is unchanged** (`8e32f5b`). This candidate carries everything in it.

## 1. Option data drawn by its fields

- **Cause.** `Card.tsx` drew every option value as `String(option.data[key])`. The producer's `project_options`
  hands the task's option objects through whole (every key but verb/label), so a list of `{graph_uri,
  data_module_code}` drew as `[object Object],[object Object]`. The same happened to `parts`, `spares` and
  `battle_condition`. `CaseOption.data` was typed as scalars only, so the type hid it.
- **The fix.** `OptionValue.tsx` draws a value by its own shape and names no field (config names the case):
  - a list draws one item per element;
  - an object draws one field per key, recursively;
  - a scalar draws its own text;
  - three absences each say which they are: null is `none`, an empty list is `none listed`, an empty object
    is `no fields`.

  The recursion is bounded at depth 6. Past that the value draws as JSON, which still shows its fields.
  `CaseOption.data` is now `Record<string, unknown>`. Each key carries `data-option-field`, and each value
  carries `data-option-value` (`scalar|none|list|record|…`).
- **The test** is `Card.optionData.test.tsx`.
  - **The options** are built as `maint_fault_propose.yaml` builds them (`f9fa4d7b`). Nested values are the
    transcribed SDK shapes, not invented:
    - `task`, `task_refs` and `parts` come from `MAINT_ACTION_APPROVED.work_order`;
    - `spares`, `nearest_spare: null` and `battle_condition` come from `MAINT_EVENT.picture`;
    - the one addition is a task_ref with `graph_uri: null`.
  - **Both roads are walked:**
    - the case's own `options`, shaped as `project_options` serves them and passed through the real reader;
    - the pending task's `payload.options`.
  - **The expectation comes from the VALUE.** The test walks it and requires the same shape drawn, field by
    field and in order. It also spot-checks DMC-1, `graph://node-1`, and `none` for the null graph node.
- **Seals.**
  - `fixtures.test.tsx` lists `data-option-field` as structural.
  - The no-domain-words seal now also reads `OptionValue.tsx`. The field names were moved out of its comment and
    into the test.
- **Mutants.** Each reddened its intended arm, and the files were restored byte-identical.

  | Id | Mutation | Failed on |
  |---|---|---|
  | O1 | `String(option.data[key])` restored | "not to contain '[object Object]'", both roads |
  | O2 | list elements coerced | "not to contain '[object Object]'", both roads |
  | O3 | a record drops its first key | `task_refs[0]` "expected ['data_module_code'] to equal ['graph_uri', 'data_module_code']", plus the depth arm |
  | O4 | depth bound 1 | `task_refs[0]` "expected 'deep' to be 'record'": the bound must not swallow real shapes |
  | O5 | null drawn as `String(value)` | "expected 'null' to be 'none'", plus the absences arm |
  | O6 | past the bound, `String(value)` | the depth arm, "[object Object]" |

## 2. The case link opens the viewer's held task

- **Cause.** `DeepLinkLanding` opened a task only from `approvals[].task`. The case read never serves that field:
  `case_projection.project_approvals` says it is "omitted per the roll spec". So a viewer holding the task
  always got the panel.

  The landing's tests handed it `approvals[].task`, so all of them were green while the real link could never
  open a task. A fixture one layer inside the wire seals nothing.
- **The fix.**
  - **`heldTasks(payload, tasks)`** (in `caseOptions.ts`) returns the viewer's own pending store rows, in chain
    order, that were registered by one of the case's instances.
    - The store holds only this viewer's rows, because the BFF injects `recipient_id`. So a pending row there
      means the viewer holds it.
    - "Registered by an instance" uses the shared `isInstanceTask` predicate: `workflowId === wf` and
      `taskId` starts with `${wf}:`. That is how `caseOptions` already matched, and how the producer's
      `project_approvals` matches.
  - **The landing's rule:** exactly one held row opens that task in the full pane, as before. None shows the case
    panel. Several also show the panel, because the link cannot choose for the viewer.
- **The tests** are rebuilt on the served shape:
  - instance ids are `case-1~1` and `case-1~2`;
  - approvals carry no `task`, and the first arm asserts that premise from the reader;
  - the body passes through the real `readWorkflowCasePayload` (the mock keeps the real module and replaces only
    `fetchCase`).

  The arms:
  - a held task opens;
  - a later step in the chain opens for its holder (the releaser's link);
  - a row that is no longer pending stays on the panel;
  - a task on another case's instance stays on the panel;
  - a row with the stamp but no prefix, or the prefix but no stamp, stays on the panel;
  - a task that arrives after the case loaded opens then;
  - nothing held gives the read-only panel, which Esc closes;
  - two held give the panel;
  - the three error bodies.
- **Mutants.** Each reddened its intended arm:

  | Id | Mutation | Arm reddened |
  |---|---|---|
  | D1 | no stamp check | the stamp/prefix arm |
  | D2 | no prefix check | the stamp/prefix arm |
  | D3 | no pending filter | the no-longer-pending arm |
  | D4 | `>= 1` | the two-held arm |
  | D5 | only the first instance | the chain arm and the two-held arm |
  | D6 | the old `approvals[].task` logic | the held-task arm, the chain arm and the arrives-later arm |
  | D7 | any pending task | the another-case arm |

## Open

- **The case card's approvals section** also branches on `approval.task`, which is never served. Inside the panel,
  a pending approval always draws "awaiting a decision", even for the viewer who holds it.
  - The landing now routes around this for the one-held case.
  - It still shows when a viewer holds two tasks on one case, or opens the case from elsewhere.
  - The fix is the same `heldTasks` match: draw `ApprovalTaskCard` for the held row. That changes what the card
    offers, so it is left for a ruling, not folded into this beat. Lane 1 could instead serve `approvals[].task`,
    the field the contract already names.
- **OpenDDIL's 10-17 questions 1 and 2** are answered by this beat, in the packet:
  - `/case/{id}` opens the step pending for whoever opens it, when they hold exactly one;
  - otherwise it opens the read-only panel.

## Packets

- **Placed, uncommitted,** in invincible-agent/sessions:
  `2026-11-10-packet-to-lane-01-cc-architect-openddil-from-cortex-0-4-85-candidate-90b7c13-option-data-and-the-held-task-link.md`
- The untracked `sessions/` packets in this repo are left as they were.

worktrees: under wt\<lane>\ (0 moved, 0 pruned, 0 under %TEMP%). `git worktree list` shows only the main checkout.
The gate roots in the session scratchpad are `git archive` exports, not worktrees.
