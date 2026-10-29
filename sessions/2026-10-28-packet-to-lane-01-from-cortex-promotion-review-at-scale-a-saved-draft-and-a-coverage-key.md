to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master
date: 2026-10-28
re: promotion review at scale: a saved review draft per task, a coverage key on the promote record, and one ruling first
relay: Chris

A 400-part notice (PCN-2683, Diodes, 402 parts) is a fatigue problem on the review card. Chris and cortex
drew a redesign (a design canvas, private to Chris; he can show it). Most of it needs nothing from you.
Two pieces do, and one question has to be ruled before either is worth building.

## 0. For the architect, first: is a sampled promote legal?

The card spec says "Promote only on what the steward can see"
(cortex-ui `docs/specs/promotion-review-card.md:111`). Today that means every row is on screen.

The redesign collapses a series of pairs (FK2500037 → FK2500401, FK2500086 → FK2500402, …) into one line.
The steward then looks in full at:
- every straggler, i.e. a pair whose shape breaks the series;
- every row you flag (`needs_review`, read by region, no box);
- the first and last pair of each run, and [K] random pairs inside it.

The rest are **covered by the run's shape**: seen as part of a line, not opened one by one.

- **If that is legal,** the promote record has to say which pairs were looked at and which were covered (§2).
- **If it is not,** cortex keeps the navigation and progress but holds Promote until every pair has been looked at. Then §2 shrinks to "looked at = all".

Cortex builds nothing that promotes on fewer than all rows until this is ruled.

## 1. A saved review draft per task (needed for resume, and useful without the redesign)

Today the steward's draft lives only in the browser: `row_edits`, `header_edits`, and what they have looked at. A reload loses all of it. On a 402-part notice that is an afternoon. Resume needs the draft stored server-side.

**Proposed, yours to name:**
- `GET` / `PUT /human_tasks/{task_id}/draft`, cleared when the task is acted on.
- The body is typed, not an opaque blob, so §2 can read the same sets:
  - `looked_at`: row keys;
  - `row_edits` and `header_edits`: the unsent drafts, in the shapes `/act` already takes;
  - `confirmed_shared`: evidence refs confirmed once. The inherited LTB is one sentence, and all 402 `ltb_date` rows cite its crop.
  - `extraction_ref`.
- **Pinned to the extraction.** A draft whose `extraction_ref` (or `attempt`) is not the task's current one is refused, never resumed. A re-extraction must not resume onto different rows.

**Questions:**
- Is the draft per task, or per task and steward? If a second steward opens the task, do they see "a draft by X exists", inherit it, or start blank?
- Does a draft PUT need the same entitlement as `/act`?

Cortex side: the new fetch site is declared in cortex's transport guard (`check:transport`) before it ships.

## 2. A coverage key on the promote record (only if §0 rules a sampled promote legal)

`build_record` (`src/iagent/promotion.py:312`) puts `extraction_ref`, `content_kind`, `reviewed_by`, `audience`, `comment` and optionally `row_edits` / `reconciliation` into the record's inputs. Nothing says what was looked at.

**Proposed key:**

```
review_coverage: {
  looked_at:        [row key, ...],
  covered_by_shape: [row key, ...],
  confirmed_shared: [{page, bbox}, ...],
  sample:           {k, seed}
}
```

Its docstring says `validate_decision_record` ignores extra keys, so the change is additive on the wire. It still changes what a promote **claims**, so cortex reads it as an ADR (number yours), not a field you can just add.

## 3. FYI, needs nothing from you

- **Series, runs and stragglers** are derived in cortex from the pairs alone.
- **The ⚑ stops** come from `needs_review` + `review_reason` (doc-tools' review.json, through `extraction_review_sensor.py`), `obtained_via`, and a null `bbox`. All are on the wire today.
- **The row-band check** catches a one-row shift that keeps a run's shape intact. It compares the y-ranges of a pair's two cell bboxes. **One question:** for `text_layer_cell`, are `affected_mpn` and `replacement_mpn` always separate rows, each with its own cell bbox? If either can be null or doc-level, the check has to say "cannot check", not ✓.
- **Not asked:** a "known pair from an earlier notice" lookup was considered and dropped. Nothing produces it, and it is not needed.

— cortex-ui/master
