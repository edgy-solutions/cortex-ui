# Report: the six-item list and the PR #4 rulings

**For:** Chris. **From:** cortex-ui/master. **Date:** 2026-10-10.

## Where each item stands

| # | Item | State |
|---|---|---|
| 1 | Refusal field (with #13) | **Merged** as `9bf80639c24418af0448a4d4ff1651f8dca13d40`. Digest `sha256:1985ce7fe1aa378687b1f001e6441066f381ababed959c9296483eb687a49f86`, run 38023535376, 0 steps skipped. Lane 1 has the sha and digest. |
| 2 | `/cases` seal | PR #2, `seal/cases-arrival` @ `0d371ff`. CI green. |
| 3 | Ingest composer | PR #4, `feat/ingest-composer` @ `2dbfd7f`. CI green: run 38027376355, 2776 passed, 10 todo, "with both peers present". **Waiting for you before 184.** |
| 4 | DELTA_SET seal | **Waiting.** No lot 3 capture is on IA master or in cortex `sessions/`. The arrival arm in `src/archetypes/delta-set/parity.test.tsx` goes red when a capture with `projected[]` DELTA_SET lands, and its message names the steps (add it to CAPTURE_FILES, regenerate the baseline). |
| 5 | Consume `frontend_version` | PR #6, `feat/frontend-version-on-ask` @ `f7ab612`. CI green: run 38027984743, 2759 passed, 1 skipped, 10 todo. Flag OFF by default. **The platform discards the field until `InterviewRequest` declares it** (gateway.py:3798). |
| 6 | PCN walk for Lane 1 | PR #5, `feat/pcn-walk` @ `7f940bb`. CI green. **Never run against the live sandbox.** |

No code was merged tonight, so there is no new image to pin. `9bef790` changed sessions only, so it built no image by design.

## PR #4 rulings

1. **The leaf-kind suggestion** (`2dbfd7f`).
   - The ingest turn shows "Classifier suggests: PCN" with **Confirm** and **Not this**. The pdf/cad/xml picker is unchanged.
   - The platform does not emit a suggestion today. The step is **inert**: when the field is absent it renders nothing.
   - The field and verb names are proposals to Lane 1: `suggested_content_kind` on status, and `POST /ingest/{id}/content_kind`.
   - Screenshot: `sessions/2026-10-09-ingest-composer-suggestion.png`, on the branch.
2. **Promote and reject on the status card.** The note for ADR-0041 is in the packet `sessions/2026-10-09-packet-to-lane-1-leaf-kind-suggestion-and-adr-0041-notes.md` (`9bef790`). The ADR is Lane 1's to edit.
3. **"Already processed" twice** (`de44e9c`). The phrase now appears exactly once per turn, and a test counts it. Restoring the second label turns that test red with `expected 2 to be 1`. Screenshot: `sessions/2026-10-09-ingest-composer-duplicate.png`.

**An open question, which Lane 1 has to answer.** The review task's domain comes from the row's *declared* `content_kind` when the row moves into `review`. Neither cortex UI sends `content_kind` at the drop. If the human confirms the kind after review opens, the task was already filed without that domain. The question is in the packet.

## PR #5, the walk: what is unproven

- **Logins:** the Keycloak usernames and passwords are required environment variables. The runbook gives only the authz ids, so the walk does not guess them. The real Keycloak form has never been driven.
- **The composer drop path** was written from PR #4's source. Nothing has run it.
- **The mock answer:** the INSTANCES_BY_PROPERTY answer is hand-written, because there is no captured one.
- **The negative control passes:** an answer that comes back as a document fails with the roll-23 message.

## PR #6, frontend_version: decisions to check

- **What is sent:** the bundle's *own* baked sha, the same value its registration carries. The served sha from `/version.json` is only a cross-check.
- **The stale-tab gate:** it still reads `/version.json` before every registration post. "Once per load" applies only to the version read.
- **The flag's env key:** `VITE_SEND_FRONTEND_VERSION` is its own key, plumbed like `VITE_MOCK_GROUNDING`, not part of `VITE_FEATURES`. Say if you want it moved.
- **The honour arm:** it goes red with "the flag defaults on but the platform discards frontend_version — declare it on InterviewRequest first" when the default is flipped. The main session fired that mutant and read the message itself.

## Placed packet, received

lane/fin, `sessions/2026-10-10-packet-to-cortex-ui-a-mixed-board-export-answers-per-engine-documents.md`. Once IA PR #21 merges, `POST /export/package` on a board with any finance card answers with a per-engine `documents[]`. On a mixed board, today's button would then show `partial` with no download link. Committed in `9bef790`. **Not started**: it waits on #21, and you have not ordered it.
