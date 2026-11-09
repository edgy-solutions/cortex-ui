# 2026-11-08: 0.4.83 pin candidate ece163b; the case panel reads intake; the where-used table is built against a transcription

**Dispatch (pasted):** "cortex: case-panel third item when Lane 1 names the served label field;
impact card against 74's captured body; 0.4.83 pin candidate named with its image and gate."

## The candidate

| | |
|---|---|
| sha | `ece163bdec96f14adc766b2e36052de3bfc31d4a` |
| image | `sha256:cc0f09a8f757d97899d739a221cdff9fd4209f1e5dae3608a4a6a32fce9a130f` |
| CI | run 42561507170, success |

- The digest was read from GHCR with the full sha. Negative control `53caff9` gives 404. Positive
  control `01fa313` gives 200, `sha256:2b625433…`.
- Gate, on a git-archive export of the code with invincible-agent `c3b51ed7` as the sibling:
  316 files, 4785 passed, 1 skipped, 9 todo. Transport, redproof, tsc, seals and bundle all 0.
- It does not need #315: `group_by` is optional.
- Not regenerated for #303. Against master `17007300` the openapi differs only by #303's four
  refusal schemas on existing paths. The regen is still open for Chris; a regen commit would
  replace this candidate.

## 1. Case panel item 3: done

- `intake?: string`, top level (#321, merged at `17007300`).
- It labels the case's opening row in the list and the pane. The row is the first history row
  whose `workflow_id` is `subject_ref`, before any instance's rows. No word is spelled, and the
  word guard now also forbids `received` and `reported`.
- Key absent: "no step recorded" stays. The guard refuses `""` and `null`.
- Not seen on a live body; #321 is not on sandbox.
- Six mutants fired. Five reddened the intended arm. The sixth survived because its clause was
  redundant (position already excludes an instance's row). The clause is deleted, and removing
  position now reddens both arms it covers.

## 2. Impact card: built, not sealed against a wire body

**There is no captured body.** #315 is still OPEN at `8c48128f`, unrolled, and its PR has no
capture.

- The card is the generic `INSTANCES_BY_PROPERTY` renderer, because that is how #315 serves it.
  Nothing in it names the domain, and a guard arm checks that.
- Rows group by the column `group_by` names, in arrival order. A `group_by` naming no column is
  drawn ungrouped and said. An absent `group_by` is one table, unchanged.
- A missing key, `null` or `""` is `data-ibp-cell-absent`. A served `0` is `0`.
- The test body is transcribed from `where_used()` at `8c48128f`, and labelled as one layer inside
  the wire. The breaking input (missing, `null`, `0`, a number in one column) is the test's own.
- Seven mutants, all killed. "0 drawn as absent" is caught only by the breaking input, since the
  transcribed body never puts a 0 beside an absence.

**Still open, asked of lane 74:**

- a capture of the projected answer after the roll;
- a capture of `configuration_not_available`, since cortex has not traced how a refusal reaches
  the screen;
- whether the reason for an absence should show, because `data_provenance` is not on the table.

## Packets

- Placed, uncommitted, in invincible-agent/sessions:
  `2026-11-08-packet-to-lane-01-cc-lane-74-architect-from-cortex-0-4-83-pin-candidate-ece163b-intake-read-impact-table-built.md`
- Lane 1's 11-09 intake packet is committed with the work. The other untracked `sessions/`
  packets are left as they were.

worktrees: under wt\<lane>\ (0 moved, 0 pruned, 0 under %TEMP%). `git worktree list` shows only
the main checkout. The gate roots in the session scratchpad are `git archive` exports, not
worktrees.
