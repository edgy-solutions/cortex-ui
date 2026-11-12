# 2026-11-11: one export path on the review card; the mock profiles mirror what the producer serves (0.4.86)

**To:** Chris, the architect · **cc:** Lane 1
**From:** cortex-ui/master lane
**Commits:** `d65ef3b` (the change), `0654bb1` (the seal census follow-up), on master, pushed 2026-11-11
**Rides:** 0.4.86
**Image:** `ghcr.io/edgy-solutions/cortex-ui@sha256:a7b81f5a68034e0fc40249aedf24ae6b157dacc39cfb251771a76976ea205a16` (tag `0654bb1794eaa38f41abdbba38cab513309a9d62`)

## What was asked

Architect, via Chris (2026-11-11): "retire the old promoted-only export control; one export path. Fix the mock
profiles to use served stage names so the mock demo shows the review button. Both on 0.4.86." This answers questions
1 and 2 of `2026-11-11-report-cortex-aligns-export-as-to-356-held-unpushed.md`.

## 1. One export path

**Deleted:**
- `ReviewExportControl` and its test. This was the per-card control on `GET /ingest/{id}/export`, rendered only at
  `promoted` and gated on `can_export` only.
- The code that existed only for it: `exportOne`, `downloadIngestExport`, `exportOnePath` and `isExportStage`. The
  last of these was the one place cortex spelled `"promoted"` as a gate.

"Export as…" (`POST /ingest/export/notices`, offered by `exportable_states`) is now the only export on the review
card. It is the same dialog and route the lasso bar uses.

**Consequence, as ruled:** a viewer who holds `can_export:<profile>` but not `ingest:exportBatch` no longer has an
export on the review card.

**Tests that moved:**
- `exportProfilesRead.test.tsx` renders `ExportSelectionDialog` directly. `ReviewExportAs` hides itself on a failed
  profile read, so the failure state cannot be reached through it. Its arms keep their meaning: the typed read
  through the real axios client, granularity verbatim, and an empty granularity → the failure state.
- `downloadExportRefusal.test.ts` lost its two `downloadIngestExport` arms. The notices route's 403 and 422 arms
  still cover the Blob → JSON re-read of a refusal, and a notices 502 non-JSON arm was added.
- `PromotionReviewCard.test.tsx` replaces "a pending task renders no export control" with "the review card draws
  exactly one export control, `[data-review-export-as]`, and never `[data-review-export]`".

## 2. The mock profiles are the served rows

Before, `FIXTURE_PROFILES` listed invented states (`synthetic-state-a/b`), so in mock mode the review button never
showed for a real stage. It also said `grain: per_notice` for the two base rows, but the producer serves `per_part`
(`_GRAIN_OF["notice_part"]`).

It is now a **mirror** of what `GET /ingest/export/profiles` serves at `8c3eb9af`, for the base rows plus the sample
overlay, to a viewer granted every profile:

| name | grain | exportable_states | dedupe |
|---|---|---|---|
| `default-csv` | per_part | [promoted] | [] |
| `default-json` | per_part | [promoted] | [] |
| `part-list` | per_part | [promoted] | [Part] |
| `part-list-reviewed` | per_part | [review, promoted] | [Part] |

All four rows have `accepts` null and `version` 1. The labels are copied verbatim.

The stage names are spelled here only because the producer serves them. They are used only when `reviewExportMock`
is on, and no code branches on them. The module header now says exactly that: the logic spells no state; only the
sealed mirror does.

**Sealed by `reviewExportMockProfiles.producerSeal.test.ts`.** The seal reads the defaults from the producer instead
of restating them, and a missing anchor throws:
- `_GRAIN_OF`;
- `DEFAULT_EXPORTABLE_STATES = (ingest_status.PROMOTED,)`;
- the `PROMOTED` value from `ingest_status.py`'s stage unpack.

Its arms:
1. Cardinality of base + overlay. An overlay row replaces the base row of the same name, and `deleted: true`
   tombstones one.
2. Each row, field for field and in name order.
3. The ordered columns of each row.
4. Every fixture state is in `INGEST_STAGES`.
5. A producer was found.

**The demo arm, `ReviewExportAs.mock.test.tsx`.**
- It drives the real mock ingest (`ingestMock.ts`) to rest and reads the stage from the mock's own status row. It
  spells no stage.
- It asserts that the review button shows and offers exactly the fixture profiles that list that stage.
- It also asserts that this set is non-empty and smaller than the whole list.

Today the mock comes to rest at `review`, and the dialog offers `part-list-reviewed` only.

## 3. A seal-census hole, found and NOT fixed here (finding)

`scripts/check-cross-repo-seals.mjs` censuses a seal by `"../../../` (with the trailing slash) or by
`CANDIDATE_ROOTS`. Six test files reach the producer as `path.join(__dirname, "../../..", name, …)`, with no
trailing slash, and so were never censused:
- `reviewExport154`
- `rowEditsWireParity`
- `reviewShapes`
- `emptyConfirmParity`
- `canvasExport`
- the new mock-profiles seal

`d65ef3b` widened the pattern, and its first gate run found **`reviewShapes.test.ts`'s yaml arm SKIPPED**. That arm
reads the producer at the old sha `41230a7e` through `git` and says itself that "CI has no sibling". So that arm has
never run in CI, and check:seals could not see it. This is the "1 skipped" in every gate's count, including
`a255a8e`'s.

Fixing that seal is not 0.4.86's scope, and the wide pattern would turn CI red on it. So `0654bb1` puts the pattern
back, and the two export seals now name `CANDIDATE_ROOTS`, which censuses them (37 files).

**Still open:** widen the census and re-point `reviewShapes`'s yaml arm at `CORTEX_PRODUCER_ROOT` at the pin. It is a
cortex-only defect, so I can open a board item for it (architect 11-03).

## Mutants (9, each fired alone, all restored)

| id | mutation | reddened |
|---|---|---|
| X1 | fixture `part-list-reviewed` states → [promoted] | seal field arm **and** the demo arm |
| X2 | fixture `default-csv` grain → per_notice | seal field arm |
| X3 | `FIXTURE_COLUMNS` loses `part-list-reviewed` | seal columns arm |
| X4 | fixture state typo `reveiw` | seal field arm **and** the `INGEST_STAGES` arm |
| X5 | `ReviewExportAs` unmounted from the review card | the one-control arm |
| Y1 | producer `DEFAULT_EXPORTABLE_STATES` gains REVIEW | seal field arm |
| Y2 | producer `_GRAIN_OF["notice_part"]` → per_notice | seal field arm |
| Y3 | producer overlay `part-list-reviewed` → [promoted] | seal field arm |
| Y4 | producer overlay row renamed onto `part-list` | seal cardinality and field arms |

## Gate

The gate ran on git-archive exports of both repos: cortex at `0654bb1`, producer at `8c3eb9af`.
- **Steps:** transport, redproof, `npm run test` (report mtime 19:09:18), tsc, seals and `build:bundle` all exited 0.
- **Tests:** 323 of 323 files; 4902 passed, 1 skipped (the `reviewShapes` arm above), 9 todo.
- **Seals:** 37 files censused; 502 arms ran (490 at `a255a8e`), 0 did not run.

The first run, on `d65ef3b`, was red only at seals, for the reason in §3.

## CI and digest

- **Push:** master `9fa0975..0654bb1`, both commits.
- **CI:** run `43132706743` concluded success. The steps "Cross-repo seals must have RUN" and "Prove the cross-repo
  seal guard can still fail" passed, and "Build and push frontend image (multi-arch)" ran; this is a code push, so it
  was not gated.
- **Digest:** `sha256:a7b81f5a68034e0fc40249aedf24ae6b157dacc39cfb251771a76976ea205a16`, read from the GHCR registry
  API using the bare full sha. Negative control `53caff9b…` → 404; positive control `01fa3134…` → 200.
- **Lane 1:** sent the digest in
  `invincible-agent/sessions/2026-11-11-packet-to-lane-01-from-cortex-0654bb1-is-built-a7b81f5a-one-export-path-for-0-4-86.md`.
- **Pin:** `0654bb1`. This report's own commit is sessions-only and builds no image.
