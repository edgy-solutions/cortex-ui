# Report — cortex overnight 10-30: the export format is read verbatim (#59), three items wait on 0.4.73's successor, DocumentReviewCard against test 4

date: 2026-10-30 (overnight) · lane: cortex-ui/master · relay: Chris

## The dispatch

> "export picker wired to Lane 1's #154 profiles for real (flag reviewExport stays off); case panel reads
> `carries`/`applies_when` when served; the capabilities list from entitlements once Lane 1 serves it; the
> card-declaration schema gets `layout` and `consumer` once Lane 1's PR lands; then a pass over DocumentReviewCard
> against the config rule's test 4."

**What "served" was checked against.** Upstream master moved during the night to `41230a7e`. That is #174, "0.4.73: the review-registry release", cut from `e2c03799`. Every "served / not served" below is read from that sha's `docs/api/cortex-bff.openapi.json` (v2.1.0, 114 schemas) and its source. That gives the most recent chart, but the rolled release is still 0.4.72 (`77fb1d73`), and nothing was rolled (the sandbox is frozen and no cluster was read).

## 1. Export picker on #154: PR #59

**Already real.** Since e772cca the live path (`reviewExportSource`, then `fetchIngestExportProfiles`, `downloadIngestExport` and `downloadBatchExport`) has matched 0.4.72's served shapes. `exportProfilesRead.test.tsx` already ran the real `request()` against a transport-level axios mock.

**The config-rule defect left (test 3, "overlay without code").** `readExportProfiles` refused the WHOLE body when any entry's `format` was not `csv` or `json`. Today the producer's `FORMATS = ("csv", "json")` matches. The day it adds a format, the picker would go empty, and no change to a row could bring it back. Cortex never branches on `format` on the live path; it uses it only for display and as a filename fallback. So `format` is now read like `granularity` (architect, 10-30): any non-empty string. An empty or non-string format still refuses.

**#59** (`fix/export-format-served`, `7100b82`):
- the reader arm is rewritten: `xlsx` passes, and `""`, `3` and absent each refuse;
- a new real-fetch arm sends an `xlsx` profile through `fetchIngestExportProfiles`, and the picker offers it as a third `data-export-profile`.

| mutant | arms that went red |
|---|---|
| the old closed union | both new arms (`expected null to deeply equal [{… 'xlsx' …}]`) |
| empty allowed | the reader arm |
| the format check removed | the reader arm |

Gate (rootE at `7100b82`): six steps exit 0, 4508 passed, `cross-repo arms that ran = 453, did not run = 0`. The flag `reviewExport` is untouched and stays off.

**Noted, not acted on.** 0.4.73 adds the door `can_export:<profile>` (#163) and the answer profiles (#171). Neither changes the shapes cortex reads.

## 2-4. Three items WAIT: none of their fields is in 0.4.73

Counts of the quoted key in the 0.4.73 OpenAPI, plus a grep of `gateway.py` and `human_tasks.py` at `41230a7e`:

| item | field | at `41230a7e` |
|---|---|---|
| 2 case panel | `carries`, `applies_when` | **0 and 0** in the OpenAPI. In source, `carries` appears only in prose and `applies_when` not at all. The gateway still checks `"promoted"` (`:1437`, `:1440`, `:1446`) and `kind != "grouped_review"` (`:5652`). |
| 3 batch control | `capabilities` on `/me/entitlements` | `Entitlements` = `{authz_id, cells, default, droppable_kinds, email, source, user_id}`, with no `capabilities`. |
| 4 schema | `consumer` on `FrontendCapability` | absent. `layout` is served (`string \| null`, untyped). |

- **Item 2.** Lane 1's 10-30 packet says `carries` was ruled "for 0.4.73", but 0.4.73 was cut without it. The packet below asks which release carries it.
- **Item 4.** `docs/specs/card-declaration.schema.json` already had both fields on cortex's side (0fd6d6d). Its two producer findings now cite `41230a7e`; that is the only change.

## 5. DocumentReviewCard against test 4 ("read what the server serves, not a copy")

**What the card reads, and where each value comes from:**

| what the card uses | where it comes from at 0.4.73 | test 4 |
|---|---|---|
| its verbs, and which is enabled with flags | the served declaration's `accepts` + `reason_required` (#56) | ✅ served |
| card choice: `payload.review_shape === "document"` (`documentReview.ts:66`, `ApprovalTaskCard.tsx:157`) | a registry ROW now: `policy/review_shapes/document.yaml` (`item_kind: section`, `rules: []`), served by `GET /review-shapes` | ❌ a literal copy of a served row name; cortex does not read `/review-shapes` |
| the payload keys `sections[]{section_id,title,page,page_end}` and `header{title,doc_id,revision,date}` | nothing serves them; cortex's 10-25 proposal ("ratify or rename") | ⏸ proposed, unratified; nothing to read |
| the act's `section_verdicts[{section_id, verdict: accepted\|flagged, note}]` | the gateway has 0 hits for `section_verdicts` | ❌ a private wire, where the server now has a contract (below) |

**The finding.** 0.4.73 serves an item-form coverage record, `ItemReviewCoverage {review_shape, item_kind, rules_version, looked_at, flagged, sampled, groups, shared, sample}`. The act checks it against the registry row (`gateway.py:5892-5910`, `row_problem`). Per-section "accepted / flagged" is exactly `looked_at` + `flagged` on a `{review_shape: "document", item_kind: "section"}` record. So the card's `section_verdicts` copies a contract the server now has.

**Why it cannot move yet, all on the producer:**
- `_UNIVERSES = {"part": _part_universe}` (`review_coverage.py:98`). `universe_for("section")` raises LookupError, so a document coverage would answer 503 `review_coverage_unverifiable`.
- No content kind declares `review_shape: document`. In the openddil-lab overlay only `course`, `pcn` and `pdn` declare one.
- No producer sends a section list on a task payload.
- `/review-shapes` is not on the rolled 0.4.72 (`77fb1d73`: 0 hits). It arrives with 0.4.73.

**No code tonight.** The packet below asks lane 01 the three questions that decide the change. Once 0.4.73 rolls, the read is:
- `/review-shapes` goes into a store, beside `/task_kinds`;
- DocumentReviewCard renders only when the served registry has its row, and takes its item noun from `item_kind`;
- the card's per-section verdicts become the item-form coverage.

These ride the planned 0.4.73 commit (`review_coverage` item form + `review_task_kind`).

`empty`, `grant_proposal` and `promotion` are "card-only rows, not here" per the registry README. They wait on an SDK release that makes `item_kind` and `rules_version` optional. Until then a registry-gated card choice would break those three cards, so only the `document` card can gate on the registry, once it is served.

## Packets

**Committed with this report:** cortex's placed packets, all read. That is three from lane 01 dated 10-28, the 10-29 export / droppable-kinds packet, two lane/gov packets dated 10-29 (can_export rulings), the 10-29 promotion-review-at-scale handoff (landed as #53), and the 10-30 "carries is ruled" packet.

**Placed (uncommitted) in invincible-agent `sessions/`:**
`2026-10-30-packet-to-lane-01-from-cortex-carries-acked-not-in-0-4-73-document-card-needs-a-section-universe.md`

## Open items (cortex)

- #57, #58 and #59 are open for review.
- On the 0.4.73 roll:
  - the `review_coverage` item form and `review_task_kind`;
  - read `/review-shapes`;
  - DocumentReviewCard's verdicts as item coverage, once lane 01 answers.
- `carries` + `applies_when`, when served: delete #56's and #57's interims.
- `capabilities` on entitlements, when served: delete `AP_GROUP`.
- `consumer` on `FrontendCapability`, when served: the schema doc's finding closes.
- `drop_leaves` labels (SDK v0.9.11).

## Image

Nothing merged overnight. **Pin to `421fbbe` (`sha256:e3992d05b5930e459ccf515bba75d0939d200e4c4c560d6db5514b30a1a993d3`), the last built sha on master.** This report and the schema-doc line are a sessions/docs-only push, which builds no image. #59 has no image until it merges.
