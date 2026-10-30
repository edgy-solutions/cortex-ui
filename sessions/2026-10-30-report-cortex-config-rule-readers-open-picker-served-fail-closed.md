# 2026-10-30 report: the config rule, steps 1-3 — readers open, picker served, fail closed

**Trigger:** the architect's go, relayed by Chris: "steps 1 (open both readers), 2 (picker from droppable_kinds),
3 (packet). On the fallback: no declaration means no actions … Fail closed." It also covers the three asks from the
same relay: the `capabilities` signal, dropping the plan-recipient rows, and the `layout: "rows"` / `consumer` PRs.
It follows the census `2026-10-30-report-cortex-config-names-the-case-census.md`.

## Landed on master

### d2536fc: readers open, picker served, fail closed (27 files)

**Census items closed**

| # | site | before | after |
|---|---|---|---|
| A4 | `promotionReview.ts` | `leaf: "pcn" \| "pdn" \| null`; any other leaf read as null | `string \| null`, read verbatim. It is null only when absent, non-string or empty. |
| A2 | `reviewExport.ts` | `granularity` closed to `notice_part \| notice`; anything else refused the whole body | `string`; the reader refuses only a missing, non-string or empty value. `format` stays closed, because it is mechanism. |
| A3 | `DropLeafRow.tsx` | hard-coded `[PCN] [PDN] [Not sure]` | Reads `offeredDropLeaves(entitlements)`: `droppable_kinds` ∩ the generated `INGEST_LEAVES`, in served order and de-duplicated. "Not sure" is always last. An empty set shows "No document kinds served for your account" (`data-ingest-leaf-none`). |
| A5 | `useIngestComposerStore.ts` | sent a leaf only if it was pcn or pdn | sends whatever was chosen, except `unsure` |
| A6 | `taskDeclaration.ts` `offeredVerbs` | `["approved", "rejected"]` with no declaration | `[]`. Every task card blocks via `isActBlocked`, rendering `NO_DECLARATION_SERVED` (`data-no-declaration`) with nothing to click. The workflow case's `caseOptions` returns `undeclared: true`, and the case card renders the same line. |
| C3 (ours) | `GroupedReview/types.ts` | `notice_type: "PCN" \| "PDN"` | `string`. The field NAMES are unchanged, pending who emits the batches (asked in the packet). |

**Interim, and labelled as such:** `LEAF_LABELS {pcn: "PCN", pdn: "PDN"}`, with `toUpperCase` as the fallback. It
stays until `drop_leaves [{leaf, label}]` ships (SDK v0.9.11).

**`document` is not offered, by construction:** it is not in the generated leaf enum.

### dd9a0c6: the suites that asserted the old behaviour

The CI-layout gate (rootE) on d2536fc failed **4 arms that the implementer's targeted run never reached**:
- **2 in `exportProfilesRead`.** Granularity `answer` had been refused. It is now a pass-through arm, and the
  refusal arm uses an empty granularity.
- **2 in `taskKindStore`.** UNLOADED and UNREACHABLE had fallen back to the seed verbs. Both now fail closed: no verbs,
  `data-no-declaration` present, and still not `undeclared`.

**Gate on dd9a0c6 (rootE):** transport, redproof, test, tsc, seals and bundle all exit 0. 4492 passed and 9 todo,
across 300 files. INSTRUMENT 445/0/0.

## Mutants

| mutant | result |
|---|---|
| granularity re-closed to `notice_part \| notice` | RED on `exportProfilesRead` and `reviewExport.test` |
| seed verbs restored in `offeredVerbs(null)` | **SURVIVES every card and case test.** The cards block on `!decl` before they read verbs, and `caseOptions` returns early. **RED only on the direct unit arm** (`taskDeclaration.audiencePool.test.ts`, "no declaration, no verbs: fail closed"). |

The fail-closed rule therefore has **two independent guards:**
- the block, which the card tests seal;
- the empty verb list, which only the unit arm seals.

**Do not delete that unit arm as redundant with the card tests.** It is the only arm that covers the verb list.

## PR #54 (the user merges)

`fix/layout-rows-and-batch-gap-names-capabilities`:

- **33156b6:**
  - `layout: "rows"` added to `FrontendCapability`, and the `assembleCapabilities` cast removed. The mutant `"grid"`
    gives TS2322.
  - The GAP comment in `reviewExport.ts` names the ruled `capabilities` list (`ingest:exportBatch`,
    `can_export:<profile>`) as "RULED, not yet served".
  - The `AP_GROUP` doc reads "mock-only stand-in".
  - The schema's layout finding is marked RESOLVED.
  - rootE gate green.
- **612c5df:** the `BatchExportPanel.tsx` header comment, which still said "PROPOSED groups", now names the ruled
  signal. Comment only.

**`consumer` on `FrontendCapability`** is Lane 1's, per the ruling.

**Plan-recipient rows per answer:** dropped, per the ruling ("already #43's per-answer rows").

## Packets placed in invincible-agent `sessions/` (uncommitted)

- `2026-10-30-packet-to-lane-01-cc-ca-from-cortex-review-coverage-rename-acked-five-questions-before-the-send-moves.md`
  - The rename lands in one commit, the day 0.4.73 is generated: `additionalProperties: false` means 0.4.72 would
    422 an `items` record.
  - Five questions: the field list, the item id type, the `review_shape` values, the rule registry, and the transition.
- `2026-10-30-packet-to-lane-01-and-architect-from-cortex-config-rule-the-producer-wire-still-names-the-case.md`
  - W1-W4 on the producer's wire: the `leaf` response enum, the granularity enum, `notice_id` / `HeaderEdit.field`,
    and the `review_shape` enum.
  - The fail-closed consequence for any live kind missing from `/task_kinds`.
  - Who emits GROUPED_REVIEW batches.

## Open, cortex's own (the census's next rows)

- **`isRegisteredKind` / `src/lib/taskKindRegistry`.** It decides `declared` from a cortex-side list. That fails test 4,
  because the served `/task_kinds` should be the only source.
- **`DocumentReviewCard`** hard-codes `promoted` / `rejected` buttons rather than mapping `verbs`. It is
  fail-closed today only because `isActBlocked` blocks it first. It needs to map served verbs.
- **`AP_GROUP`** goes in the commit that reads `capabilities`, once `Entitlements` declares it.
- **The `review_coverage` rename** waits on 0.4.73.
- **The drop-leaf labels** wait on `drop_leaves`.

## Image

dd9a0c6 was pushed under R-009, so master now carries both d2536fc and dd9a0c6.

**The build:** run 41080579062, conclusion success. Both jobs succeeded, and no step was skipped, so the image
steps ran.

**Digest**, read anonymously from the GHCR manifests API by full sha:

| sha | status | digest |
|---|---|---|
| dd9a0c6 (this push) | 200 | `sha256:cbebedb6154a3af978d532a70ee4146abba78d67ebde50e3d433a369ac7392a5` |
| e772cca (positive control) | 200 | `sha256:a31494f1…`, unchanged |
| 06b57f6 (negative control) | 404 | sessions-only, so gated |

The 0fd6d6d 404 from the last report is the same case: docs-only, so gated, not missing.

**Not rolled:** the sandbox is frozen. The field still runs `a31494f1`.

**What a roll of `cbebedb6` would change, for whoever pins it:**
- Any task whose kind has no served declaration becomes unactionable. It shows "no declaration served".
- The drop picker shows only the caller's `droppable_kinds`. If the BFF does not yet serve the field, the caller sees
  "No document kinds served for your account" plus "Not sure".
