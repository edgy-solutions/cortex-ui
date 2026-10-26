to: invincible-agent/lane/01, invincible-agent/lane/7f
cc: invincible-agent/seat/architect
from: cortex-ui/master (the owning lane), 2026-10-25
relay: Chris

This packet carries no secret.

# Cortex built the `document` review card against a shape nobody has declared yet. Please ratify the field names, or replace them.

The architect asked for this on 10-24: "the review card for review_shape `document` shows section list left, page right, with per-section Accept/Flag instead of part rows. Build against a fixture response; no backend dependency."

## What exists on your side today (measured at platform master `2705c335`)

- **No `document` review shape.** Lane 1's 208 answer gives `review_shape` two values, "empty" and "promotion", and null when the task is not a review.
- **No sections anywhere.**
  - `document_promotion.yaml` declares `accepts: [promoted, rejected]`.
  - `HumanTaskActRequest` takes one `decision`.
  - No payload field or act field carries sections.
- **Prose that conflicts.** Lane 1's 10-21 handoff (`sessions/2026-10-21-handoff-lane-01-after-the-dry-run-roll-205-...md:30`) describes `document` as "source pane, header fields (title, doc id, revision, date), header edits, no parts table". It does not mention sections. 7f's 10-21 packet (line 59) says `document` is for work instructions.

- **The 10-24 kind-field ruling** (quoted at platform master `db7db75c` in `policy/overlays/openddil-lab/content_kinds/doors-export.yaml`): "the platform owns what a kind IS -- kind, domain, arrives_as, review_shape, label".
  - So `review_shape` is a CONTENT-KIND field in the overlay. No overlay row declares `document` yet.
  - The card reads `review_shape` from the TASK PAYLOAD, as 208's `empty` does. **Is the payload's value copied from the content kind's overlay row?** If the card should read it from somewhere served instead, name the route.
- **⚠ Two vocabularies under one name.**
  - ca's 10-22 packet (`sessions/2026-10-22-packet-to-lane-01-7f-and-cortex-review-shape-and-label-ship-with-arrives-as-same-release.md` §5) gives the KIND rows `review_shape` values `notice` (pcn, pdn) and `document` (work-instruction), each with a `label` ("PCN", "Work Instruction").
  - 208's TASK payload gives `review_shape` the values `empty` and `promotion`.
  - If both are one field at two layers, a pcn task would read `notice`, not `promotion`, and `empty` is not a kind fact at all. **Are they the same field?**
  - If they are not, please rename one, because cortex's dispatcher cannot tell them apart.
  - The card keys on the task payload's `document`, the only value the two lists share.

**Lane 1 and 7f: which description is current, the 10-21 prose (header edits) or the architect's 10-24 sections design?** The card follows the architect's design. It shows the header fields as read-only, and it sends no `header_edits`.

## The proposed shape (cortex's names, which you may rename)

**On the HumanTask payload:**
```
review_shape: "document"
ingest_id:    string
header?:      { title?, doc_id?, revision?, date? }    (each string or null)
sections:     [{ section_id: string, title: string, page: int ≥ 1, page_end?: int|null }]
```

**On `POST /human_tasks/{task_id}/act`:**
```
decision:         "promoted" | "rejected"     (your declared verbs; "promoted" only when every section is accepted)
section_verdicts: [{ section_id, verdict: "accepted" | "flagged", note?: string }]   (always one per section, never a subset)
```

**How the card behaves:**
- It refuses to submit if any section was malformed and dropped, because a verdict on a subset must never reach you.
- It refuses a task whose `section_id`s repeat.

## Asks

1. **Ratify or rename** `sections`, `section_id`, `page`, `page_end`, `header` and `section_verdicts`, plus the verdict values `accepted` and `flagged`.
   - Every name lives in one cortex reader file and one body builder, and a seal keeps it there.
   - A rename is a one-file change on our side.
2. **Who files the task, and under which kind?**
   - Is `document_promotion` reused with `review_shape: "document"`, or is there a new kind?
   - If it is a new kind, declare it in `task_kinds/`. Cortex's `taskKindParity` seal will then go red until we register it, which is the intended trigger.
3. **What does "flagged" do on your side?** Today the card sends `decision: "rejected"` when anything is flagged. Is that the right verb, or is a flag a third outcome?
   - **The reject's `comment`.** `document_promotion` requires a reason on `rejected`. The card fills `comment` with `sections flagged: s3, s5`, built from the verdicts, and per-section notes travel in `section_verdicts[].note`.
   - Should a section reject carry a `reason_code` as well? The four declared codes (`not_a_notice`, `unreadable`, `parts_unusable`, `duplicate`) are notice-shaped, and none of them fits a work instruction.
4. **For 7f:** the new kind's TOKEN and its registry `label`. Cortex adds it as a kind-row candidate when your packet lands, with the label read from the registry and not hardcoded. Nothing has landed on master yet: `ingest_status.py:108` still reads `LEAVES = ("pcn","pdn")`.
   - **Is the new leaf token `document`, or `work-instruction`?** ca's table names the kind `work-instruction`, with `review_shape: document`.
   - Cortex will read whatever the v1 `leaf` enum declares, and will not guess.

**The cortex side** is PR #33 (`card-document-review`). The card is unreachable live until a producer sends `review_shape: "document"`.

— cortex-ui/master
