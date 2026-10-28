# PromotionReviewCard: the review card spec

**Status:** shipped (cortex-ui 0.3.0 onward). Cited by invincible-agent ADR-0062 §2 as the layout engine-r's `review` verb renders on.

**Owner:** cortex-ui. Any change to a region below is a change to this file, in the same commit.

**Code:**
- `src/components/ApprovalTask/PromotionReviewCard.tsx`, mounted by `ApprovalTaskCard.tsx` when the task carries an `ingest_id`;
- what it draws: `src/lib/promotionReview.ts`;
- the source pane: `src/components/ApprovalTask/PdfEvidencePane.tsx`.

**The layout in one line:** top line, rows left, source right, actions.

```
┌──────────────────────────────────────────────────────────────────┐
│ title · state                                                    │
│ kind · manufacturer · notice-date · parts · attempt · dropped-by │  ← top line
│ provenance · flags                                               │
├──────────────────────────┬───────────────────────────────────────┤
│ ROWS (5fr)               │ SOURCE (7fr)                          │
│ mpn | field | value | via│ the source PDF page, the row's        │
│ show · fix · undo · del  │ evidence outlined, or a caption       │
│ + add row                │ "on page N, no box"                   │
├──────────────────────────┴───────────────────────────────────────┤
│ note · [Promote | Promote with N edits] · [Reject ▸ 4 codes]     │  ← actions
└──────────────────────────────────────────────────────────────────┘
```

## 1. The top line

The title and the task state come first (`data-review-title`, `data-review-state`). Then the top line itself (`data-review-topline`), with one `data-topline` span per key, always in this order:

| key | shows | source |
|---|---|---|
| `kind` | the leaf chip (PCN / PDN, or awaiting kind) | `leaf`, `leaf_source` |
| `manufacturer` | the payload's value; the identity fallback is labelled as one; `—` when unknown | task payload `mfr`, then the header |
| `notice-date` | `—` when unknown | task payload `notice_date` |
| `parts` | `N parts`, or `? parts` when unknown | `part_count` |
| `attempt` | `attempt N` | `attempt` |
| `dropped-by` | the dropper of record | the dropper identity |
| `sha` | the source's content hash, shortened (the full hash is the tooltip) | the drop |

Under the top line:
- provenance (`data-review-provenance`);
- the flags list (`data-review-flags`), the rows' and header's evidence flags.

An unknown value is drawn as unknown (`—` or `?`), never as an empty string and never as a guessed value.

## 2. Rows, on the left

- A table (`data-review-rows`) with one row (`data-review-row=<key>`) per extracted row.
- **Cells:** `mpn`, `field`, `value`, `via` (`data-cell`). `via` is how the value was obtained.
- **Evidence note:** `data-evidence-note`, set to `inherited` (e.g. a date taken from the notice's sentence) or `region`.
- **Show** (`data-show-row`): moves the source pane to the row's evidence and centres the crop. Only the evidence pane scrolls, never the card.
- **Steward edits:**
  - **fix:** a corrected value;
  - **undo:** back to the extracted value;
  - **delete:** removes the row;
  - **add row** (`RowAddForm`).

  Header fields have their own edit forms (`data-header-*`). Every edit goes through the sealed act route; nothing is edited locally.

## 3. Source, on the right

The source pane (`data-pdf-pane`) renders the source PDF page that holds the selected row's evidence.

**Evidence** is `evidence_ref`, in the ruled shape `{page, bbox, note?}` (architect 10-21; `bbox` always present per the 10-28 ruling):

| `bbox` | the pane draws |
|---|---|
| 4 page fractions | an outline at that box (`data-evidence-outline`) |
| `null` | the page, captioned "on page N, no box" (`data-evidence-caption="no-box"`) |

A ref the reader refuses (malformed) is not drawn as if it were evidence. The row says so.

The outline's style follows the row's `obtained_via`: `evidenceQuality(obtained_via)`, drawn as `data-evidence-quality` with its caption. That is the only styling input besides the box. It is derived on cortex's side and never read from the ref.

**Divergence at this commit.** Both are removed in tracked follow-ups, and this section is the target.
- The reader still accepts the pre-ruling form `{page, bbox, bboxes, page_dims, units}`, scaling by `page_dims`. That branch is removed after the 0.4.71 roll.
- An absent `bbox` key still reads as null. It becomes malformed when cortex re-pins onto the ingest doc that declares `bbox` required.

## 4. Actions

- **The actions bar** (`data-review-actions`) holds a free-text note (`data-review-note`) and the verbs the task declares (`verbs`). Labels come from `verbLabel`.
- **Promote** (`data-verb="promoted"`):
  - labelled "Promote", or "Promote with N edits" when the steward changed rows;
  - offered only when the steward can see what is being promoted;
  - held, with the reason stated (`data-promote-held`), otherwise.
- **Reject** (`data-verb="rejected"`) opens the four ruled codes (`data-reject-code`). Confirm (`data-reject-confirm`) is disabled until a code is chosen.

  | code | label |
  |---|---|
  | `not_a_notice` | not a PCN/PDN |
  | `unreadable` | the source cannot be read |
  | `parts_unusable` | the parts list cannot be used |
  | `duplicate` | already promoted under another drop |

- **Every action is disabled** when the card is:
  - **blocked:** the refusal code `extraction_defect_not_filed` locks the card;
  - **acting:** a decision is in flight;
  - **sent back:** a leaf change returned the drop (`data-leaf-sent-back`).
- **A superseded task** holds the card (`data-review-replaced-by`).
- **A refused grouped act** names every reason, not the first.

## What a renderer of the `review` verb must keep

1. The four regions (top line, rows left, source right, actions), in that order.
2. The `data-*` names above. Cortex's tests and seals select by them.
3. Unknown is drawn as unknown; nothing is coerced.
4. Evidence is drawn only from `evidence_ref.bbox` in page fractions, styled by `obtained_via`. No `page_dims`, `units` or `quality` is read. That is the target; see §3 for the divergence today.
5. Promote only on what the steward can see. The verbs come from the task, never from a hard-coded list.
