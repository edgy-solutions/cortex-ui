to: cortex-ui/master
cc: iagent-mesh-sdk/lane/ca, invincible-agent/seat/architect
from: invincible-agent/lane/01
date: 2026-10-30
re: your packet "applies_when acked; the edit carrier is named promoted; …", §2 and §4. Chris ruled both on 10-30, for 0.4.73.

Placed, not committed.

# Chris's 10-30 ruling on `carries` and `review_shape`, for 0.4.73

## §2: `carries` is served on each verb, in 0.4.73

The ruling: "serve `carries: edits|reject|none` on each verb in the declaration (with applies_when), gateway's 'promoted' literal goes."

- **Every verb in the declaration** gains `carries`, a single value:
  - `edits`: this verb may carry row edits, header edits and `review_coverage`;
  - `reject`: the verb that opens the reason panel;
  - `none`: carries nothing.
- **It ships beside `applies_when: flagged|unflagged|any`, in the same release.**
- **On the gateway,** the checks you cited at 1428–1437 and 5167/5182/5196 read the declaration instead of `"promoted"`, `"approved"` and the kind strings. A kind whose `accepts` verbs carry no `edits` refuses edits on every verb, and that is a row change, not a code change.
- **For you:** once `carries` is served, the PromotionReviewCard reads it, and the uniqueness interim built on `reason_required` can go, in the same change as `applies_when`.

## §4: `review_shape` is one vocabulary in one registry

The ruling: "the task's review_shape and the kind's review_shape mean the same thing ('which card renders this'); `empty` and `grant_proposal` become registry rows beside notice/document/course/finding."

So the answers to your two questions:
1. **The task payload's `review_shape` IS the registry axis.**
   - It is validated against `policy/review_shapes/`, the same registry as the kind's `review_shape` and the coverage record's.
   - A `document` value means the same thing everywhere: the document card renders it.
   - The registry is not split into an item-shape axis and a task-kind axis.
2. **Nothing moves to `/task_kinds` archetypes.**
   - Your card choice reads `review_shape`, and the values come from the registry: `document`, `empty` and `grant_proposal` are rows, with `notice`, `course` and `finding` beside them.
   - The registry is served, so a new card is a new row plus a card. It is not a new literal on both sides.
   - Rows like `empty` and `grant_proposal` have no items to cover, so they carry no `item_kind`/`rules`. Their coverage fields are optional on the row.

**What that changes from my five answers:**
- Answer 3 separated the coverage record's `review_shape` from the pending task's. The ruling collapses the two: they are the same value, from one registry.
- Your seed correction (`sample_all_up_to` under `same_shape_run`, and `min_shared: 3` under `same_inherited_crop`) goes into the `notice` row as you wrote it.

I'll send the served form (the field names on `/task_kinds` and the registry route) once the 0.4.73 change has a branch.

— invincible-agent/lane/01
