to: invincible-agent/seat/architect
cc: invincible-agent/lane/01, invincible-agent/lane/74
from: cortex-ui/master (the owning lane), 2026-10-22 (overnight into 10-23)
re: "to: cortex-ui/master — the cortex API", items 1-4
relay: Chris

This packet carries no secret. Since the order, cortex has not rolled, primed or fired anything, and has made no cluster read. Copies are placed, not committed, in `invincible-agent/sessions/`.

# Ready to roll on Monday: merge [PR #28](https://github.com/edgy-solutions/cortex-ui/pull/28) (`overnight/10-23-cortex-api`, tip `fc63d79`). That merge builds the image.

| item | what Monday gets | default |
|---|---|---|
| 3 | **The dropper's PROMOTE is disabled**, with the reason shown; Reject stays open. | on |
| 4 | **DeferralRiskCard has its own render.** It was the last row on 74's sheet still drawn by the key/value fallback. | on |
| 2 | **`/ingest/mine` pages past 50**, with a Load older control. **This changes what users with more than 50 drops see:** see §2. | on |
| 1 | `/answers` summaries plus `/answers/{id}/body` on open. | **dark**, behind `answerSummaries` (§1 says why) |
| 3 | The "reviewing: <who>" courtesy marker. | **not built**: no wire field exists (§3). |

No image was built tonight. The branch runs CI as a PR into master. After the merge, the pin is the merge's sha, confirmed from GHCR. A sessions-only push builds nothing.

**The local gate** (on the tree that was committed):
- `check:transport` passes (10 sites).
- `tsc` and `vite build` (`build:bundle`) are clean.
- vitest: 3811 pass and 6 fail. **All 6 read the sibling checkout, which is not at the pin**: `meshSdkParity` (1), `rowEditsWireParity` (3) and `taskKindParity` (1, where `invincible-agent` on `lane/ca-resolve-instance-adoption` and `ia-01` at rev 185 disagree with each other).
- The only file those tests read that the branch touches is `client.ts`, and its diff only adds lines.

PR #28's CI checks the producer out at `938d7639`, so its result is the one that counts. The PR is based on master, not stacked, so the gate runs. Its result: **green** ([run 39899515869](https://github.com/edgy-solutions/cortex-ui/actions/runs/39899515869)). The full suite, `tsc` and the transport guard all pass at the pin, so the six local reds were the sibling checkout. The image builds in the Docker step, and on a PR only the GHCR login and the push are skipped.

## 1. `/answers` paged summaries and `/answers/{id}/body` (dark)

**What is built.**
- Under `answerSummaries`, the rail is fed from `GET /answers` pages (size 50, page by page, with a Load older control), and the server search uses `q`, debounced 300 ms.
- Electric streams summary columns only: the shape sends `columns` without the six body columns. The flag-off shape is unchanged and sends no `columns` param.
- A body is read for **the one answer the reader opens** (`CanvasPane`, via `useOpenedAnswerBody`). The read is de-duplicated while in flight and a no-op once loaded. A failed read shows Retry.
- A live summary upsert never erases a body already read.

**The seal: "the list render requests no bodies."** It lives in `AnswersPanel.bodies.test.tsx` and measures at the wire, not at the client function. Every `XMLHttpRequest.open` and `fetch` is recorded, so a body read through any path is counted. The arms:
- **Control:** a real `fetchAnswerBody` through the client is seen.
- **The list render:** 50 body-less rows in TIME, TOPIC, TYPE and GRAPH make **0** body requests.
- **Opening:** a row press with the real `CanvasPane` mounted makes **exactly 1**, for that id. Pressing it again keeps the count at 1.
- **Search:** a server search makes 0 body requests, and the arm also checks that the search itself reached `/answers?…q=`.

**Mutants: 13 of 13 killed on their named arms.** They cover:
- an upsert erasing a loaded body;
- flag off sending `columns`;
- a body column in the summary set;
- the frontier filter removed;
- the rail reading every body;
- the older frontier used as the cutoff;
- the repeated-cursor guard removed;
- a failed older page wiping the drops, and the same for the answers;
- a body for the wrong id accepted;
- opening reading nothing;
- no de-duplication;
- the hook re-firing on every body state.

Four survived the first pass, and each was a gap in the tests, not a wrong assertion:
- **The seal leaked between tests.** Its hanging requests left their ids in `ensureBody`'s module-level in-flight set, so after the first mode the rail mutant read no body in TOPIC, TYPE or GRAPH. Each test now uses a fresh id prefix.
- **Nothing tested `loadOlderAnswers`** or two concurrent `ensureBody` calls. Arms were added for both.
- **The re-fire mutant hung the run instead of failing it.** The failed-read arm now makes later reads hang, so the mutant fails with "called 2 times".

**`ts` unit, verified.** `answer_artifact_projection.created_at` is `BIGINT`, "epoch ms" (`create_answer_artifact_projection.sql:31,178`). The BFF sends `int(created_at)` unscaled. Cortex stores it as `created_at` with no conversion.

**Why it stays dark.** Its route does not yet carry what the full-row path shows:
- **No `sources`, `graph_trace` or `graph_trace_alternates`** on `/answers/{id}/body`. An opened answer would show no sources and no graph trace.
- **No archetype on a list item.** `type` is the kind, not the archetype, so TYPE grouping and the archetype chip have nothing to read until the body is open.
- **No `is_ask` flag and no `derived_from_artifact_id`.** The ask marker and the follow-up thread cannot be drawn from the list.
- **GRAPH clusters** fall back to `subject.label`.
- **Cortex's side, still open:** the StageCard and the global canvas read the artifact directly, not through `useOpenedAnswerBody`. Under the flag, a stub would show empty there until the opened body lands. The Loading and Retry view is tested through the hook, not through `CanvasPane`'s markup. Cortex fixes both before it asks for the flag to default on.

### The asks for Lane 1, so the flag can default on

1. **On `/answers` items:**
   - `archetype`: `coalesce(rendered_output->>'archetype', rendered_output->'components'->0->>'archetype')`, the raw string;
   - `is_ask`: true when any `components[*].archetype = 'ELICITATION'`;
   - `derived_from_artifact_id`.
2. **On `/answers/{id}/body`:** `sources`, `graph_trace` and `graph_trace_alternates`.

Cortex does not guess these names. If Lane 1 spells them otherwise, cortex reads them as spelled.

## 2. `/ingest/mine` past 50 (on; it changes behaviour)

`useIngestStatusStore` reads one page (`limit` 50) and keeps `next`. Load older sends `next` back as `before`, with no page cap. The guards:
- a cursor handed back twice stops paging;
- a failed older page keeps every row already read and offers the page again;
- a purge while a page is in flight drops that page;
- a drop seen on two pages is listed once.

**The behaviour change.** The rail interleaves answers and drops. When drops have another page, answers **older than the oldest loaded drop are hidden** behind Load older, instead of being drawn beside a drop list known to be incomplete. With the flag off, answers are fully loaded, so a user with more than 50 drops will see this on Monday. Before tonight, drops past 50 were missing with nothing on screen to say so. Cortex keeps the change. If the architect would rather show those answers and say "older drops not loaded", it is a one-line change in `railPaging.ts`.

## 3. The dropper's disabled PROMOTE (on) and the courtesy marker (not built)

**PROMOTE.** The rule mirrors `promotion.py` `_excluded_attesters`:
- `dropped_by` must be a dict, and its non-empty `authz_id` and `on_behalf_of` are compared exactly with the viewer's `authz_id` from `/me/entitlements`. The OIDC email is never used.
- On a match, PROMOTE is disabled and reads "Promote is off: you dropped this document, and someone else must attest its origin. Reject is still open."
- The hold shows before the extracted rows load. Reject is untouched, as is the server's own 403 `dropper_cannot_attest_origin`, which still prints if anything gets past.

Arms: 9 in `dropperHold.test.ts` and 5 on the card. Mutants: 9 of 9 killed on their named arms. Two of them first survived on fixture gaps (an email that did not equal the dropper's id, and no rows-loading arm); both were fixed before the count.

**The courtesy marker: not built.** "Against Lane 1's 204 shapes": spec 204 carries generations, the stale task and superseded. None of the following has a reviewer or viewing field: spec 204, `gateway.py`, the rulings, the ADRs, sessions, or `lane/01-207`. Cortex will not draw a name it has to guess. **Proposal for Lane 1 and the architect:**
- the task row carries `reviewing: {authz_id, display, since} | null`;
- it is set by a heartbeat, e.g. `POST /human_tasks/{id}/viewing` → 204, and expires about 60 s after the last beat;
- cortex beats while the card is open and draws "reviewing: <display>" for anyone else.

It is a courtesy, not a lock: PROMOTE stays enabled for the second reviewer. Rule the shape, or point cortex at one that exists, and the marker is about an hour's work.

## 4. Render menus: what still falls to the key/value fallback on 74's sheet

**`DeferralRiskCard` (Q3's follow-on) now has a render** (`src/renders/DeferralRiskCard.tsx`), registered by `output_uri`. The binding stays KNOWLEDGE_DOCUMENT by ruling. It is drawn from `assess_deferral_risk`'s three branches; the fixtures are derived from `entities.py` at `938d7639`, and the function is byte-identical at HEAD. They are not a live capture.
- **The count is load-bearing.** `critical_items_checked` is printed in every branch, and its absence is said in amber, never dropped.
- **Deferral has three states.** "Re-opens", "is not re-opened: the work order is not deferred" and "whether this deferral re-opens it is not stated" are three different facts.
- Severity and probability show as "carried from the hazard". A `drafted` assessment reads "DRAFTED: no risk level or acceptance is set here".

Tests: 6 arms. Mutants: 10 of 10 killed on their named arms.

**What remains on the sheet:** none of Q1-Q12 falls to the fallback any more.
- Q1, Q8, Q10 and Q12 are tasks.
- Q3, Q4, Q5, Q9 and Q11 draw the refusal block. Lane 74's overnight report has Q9 now grounding a closed hazard, with its verb refusing it, so it still draws the refusal block.
- Q2 is CONTRIBUTION_RANKING and Q7 is MULTI_SERIES.
- **Q6 needs your call.** The sheet expects CONTRIBUTION_RANKING; cortex draws FailureRecordSet as KNOWLEDGE_DOCUMENT with its typed render (201). Both look right, and the sheet and the binding disagree. Rule which one moves.

**Archetypes that still have no typed render:** besides the generic archetypes, the only `output_uri`s with a typed render are the three safety ones (RiskAssessmentDraft, FailureRecordSet, DeferralRiskCard). A KNOWLEDGE_DOCUMENT carrying any other structured reply still draws StructuredFields. None of those is on 74's sheet tonight.

## Not done, and why

- **A label from ca** (`label`, e.g. "PCN"): ruled, and it ships with `arrives_as`/`review_shape` on `lane/ca-0.9.11`, untagged under the freeze. Cortex has nothing to do until it is tagged.
- **After the dry run, unchanged:** allowed_leaves, the review-row note, the retry_reason label, the review_shape document card, the row-edit evidence_ref, and the PRODUCER_REF bump.
