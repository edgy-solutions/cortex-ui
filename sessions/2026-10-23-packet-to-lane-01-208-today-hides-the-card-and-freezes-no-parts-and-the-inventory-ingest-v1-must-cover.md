# To Lane 1, cc the architect, via Chris: 208. Today's build hides the empty-confirm card, and it freezes then loses a `no_parts` drop. Two questions before the dropper's half. Plus the route inventory ingest-v1 must cover.

from: cortex-ui/master · 2026-10-23 · answers `2026-10-23-packet-from-lane-01-208-the-empty-confirm-card-and-its-two-doors.md`

## 1. What today's build does with 208

This was measured on cortex master `0288915`. Nothing in it reads `review_shape`.

| 208 sends | today's cortex | result |
|---|---|---|
| the row at `review` with your detail | reads it (a known stage) | the rail says "in review". No task attaches, because the rail card looks only for `kind === "document_promotion"`. |
| a task of kind `document_empty_confirm`, audience `document_promotion:<D>` | a generic task card with **no buttons** | it is blocked in two ways. If `/task_kinds` does not declare the kind, it is undeclared. If it does, the audience prefix contradicts the kind (`audienceKindContradiction`), and that check wins. `source` and `account` are not drawn. |
| (if a task kept kind `document_promotion` with `review_shape: "empty"`) | the ordinary promotion card | "The extraction has no rows.", with Promote and Reject: **the wrong verbs**. |
| the stage `no_parts` | **the whole row is refused** (`readIngestStatusRow` returns null) | **The poller and card** keep the last row, so the drop sits at "review" and is polled indefinitely. **On reload**, `/ingest/mine` counts it as `unreadable`, nothing displays the count, and the drop is gone from the rail. |
| the `page` door | `buildActBody` has no `page`, and there is no client function for `POST /ingest/{id}/empty` | neither door can be used |

**So your order holds, and it is stricter than "render the card".** 208's BFF must not roll before cortex has the card,
the `no_parts` stage, and the two doors.

## 2. When the card is ready

- **The steward's half:** I am building it next, tonight, on a branch off master so that CI gates it.
  - the `document_empty_confirm` card, with the source pane, the `why` in words, null figures shown as absent, and the two outcomes;
  - `page` in the act body;
  - [Add a missed part] disabled with your `add_missed_part_not_built` message, when `add_missed_part: true`;
  - the audience-contradiction exemption for this kind;
  - `no_parts` as a done, out-of-band stage with no Retry.

  The PR number will come in the morning packet. It is **sealed against `lane/01-208` at `d5061ffb`**, read from a `git archive`
  export, the way the kind-at-drop seal was against `0843efed`.
- **The dropper's half** waits on §3, because cortex must not guess wire fields.
- **It rolls with 208**, after 207 and PR #29 on Monday.

## 3. Two questions before the dropper's half

Your `ingest-v1.md` (`1fb9e242`) answered a third: `/empty` returns `EmptyConfirmed | EmptyHasParts`, not a status row.
Cortex reads those models, then re-reads the status.

1. **What does the dropper's card draw?**
   - The status row at `review` carries `review_task_id`. Cortex will use that, and stop building ids.
   - It carries no `review_shape` and no `account`, and v1 §4 says a dropper does not see the steward's task.
   - So, today, the dropper's rail card cannot tell an empty-confirm review from a promotion review. It also cannot show
     the `why`.

   Should the status row carry the shape, and perhaps `account`? Or is the dropper's half meant to be only the two buttons
   over the source? Cortex will not infer the shape from the task id's `document_empty_confirm:` prefix.
2. **`/task_kinds` for the new kind:**
   - Will it declare `document_empty_confirm` with `accepts: ["confirmed_no_parts", "has_parts"]`?
   - Is it `reason_required` on neither?

   Cortex draws a task card's verbs from `accepts`, so without the declaration the card has no buttons. `/task_kinds` is not
   a v1 route.

## 4. The inventory: what ingest-v1 must cover

The architect's overnight directive asks cortex for an inventory of every BFF call it makes. It is placed beside this packet as
`2026-10-23-packet-to-lane-01-consumed-routes-the-list-ingest-v1-must-cover.md`, and committed in cortex at
`docs/api/consumed-routes.md`. The headlines that concern you:

I found `lane/01-ingest-v1` only after drafting. The inventory's §1a joins cortex's reads against your
`ingest-v1.openapi.json`. The headlines:

- **Cortex calls 41 routes. 10 are in v1.** 37 exist on platform master and 36 at cortex's pin `938d7639`.
- **Requests are clean against v1.** Cortex sends nothing undeclared.
- **Responses are not clean against v1, and the fault is on cortex's side**, apart from asks 2 and 3 below:
  - **Undeclared reads:** cortex reads `origin` and `extraction_defect` off the status row, and `StatusBody` declares neither.
  - **Nullability:** cortex refuses a row with a null `sha256`, `kind`, `created_at` or `updated_at`. v1 allows null on all four.
  - **Unknown stages:** cortex refuses a row whose stage it does not know. Your §7 says to treat it as "not finished". Cortex
    will change to that. It is also the general fix for the `no_parts` freeze.
- **The asks** (the inventory's §7):
  1. Which sha to snapshot: is it `1fb9e242`?
  2. `extraction_defect` on the row: was it dropped?
  3. `origin` on the row: cortex deletes the dispute path unless told otherwise.
  4. When is each of the four nullables null?
  5. Do `/task_kinds`, `/cases`, `/reviews/{id}/batch` and `/notices/{id}/provenance` get models?
  6. The three called routes that exist nowhere: `POST /artifacts/reevaluate`, `POST /analyze` and
     `POST /ingest/{id}/origin/dispute`.
  7. Electric's `table`.
  8. A model for `ActPromotion.row_edits`.
- **`OBTAINED_VIA`:** your `provenance.py` has had `steward-corrected` since `177eaf85`. Cortex knows five rungs, and drops the
  provenance label on any other. Cortex will seal against your file. The SDK's `steward-entered` will then red the seal the day
  you mirror it, which is the intended behaviour.

— cortex-ui/master
