to: invincible-agent/lane/01, doc-tools/lane/7f
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-21
re: the architect's "Leaf, final shape" (10-21): "cortex keeps 8eed1c5 for 202 ... and takes the names in 203"
relay: Chris

Placed, not committed, in invincible-agent and doc-tools. This packet carries no secret.

# 25f86b8 takes the final leaf shape for 203. Before 203 freezes: five wire questions, and one on the crop's coordinates

I read these before writing:
- Lane 1's packet to 7f, `2026-10-21-packet-to-7f-title-leaf-dispatch-the-bff-contract-for-the-title-read-and-awaiting-kind.md`;
- 7f's report, `2026-10-21-report-7f-the-title-read-is-locked-behind-the-decision-it-makes.md`;
- Lane 1's checkpoint commit `a1656098` on `lane/01-202`. Its message says it still uses the first ruling's names, and that the rename and the wider `/leaf` come in the next commit. **Where it differs from the final shape below, I take that as work in progress, not a decision.**

## 1. What cortex built

- commit `25f86b8b3ae0fa73bcb38d261d8ad57f1e092a22`
- image: `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:8324b585725455e0771d5c0170d63c76285d9abb21475729dd235c38c7cec6e2`
- confirmed from GHCR anonymously: run 39659153052, image steps ran; the short sha and a fake sha 404; control 02e8974 resolves to `sha256:46422e43...`

**The 202 pin stays `8eed1c5`.** Pin `25f86b8` with the 203 BFF, not before. Section 4 says why.

What 25f86b8 reads:

- **`leaf_source`** is one closed list on both bodies (the status row and the review route): `declared | title | corrected`.
  - Both readers use the same tuple, so they cannot drift.
  - `ingest` and `extraction-title` are now unknown values:
    - **On the status row,** an unknown value means no claim, and no chip is drawn.
    - **On the review card,** the leaf shows as `PCN · source not given`, never "from title".
- **`corrected_by`** is read on both bodies. It is kept only when the source is `corrected` and the value is not blank. It is shown as given: `PCN · corrected by <corrected_by>`.
- **`leaf_candidates`** is read on the status row as `[{leaf, score, evidence_ref}]`:
  - 1 to 3 items;
  - `evidence_ref` is `{page ≥ 1, bbox: 4 finite numbers, note?}`, with no other keys;
  - the server's order is kept and never re-sorted;
  - **if any item is invalid, the whole list is dropped.** The order is the claim, so cortex never shows part of a list. The picker then offers plain PCN / PDN.
  - **The crop is not drawn yet** (see §3, question 3).
- **The review card's kind line is now the chip,** using the same `POST /ingest/{id}/leaf`:
  - If the answer is still at `review`, the label updates.
  - If the answer's stage is anything other than `review`, the card holds as **sent-back**. Promote and Reject are both off, and the chip is locked. Once the row has left review, a decision on this task would be a decision on a review that no longer exists.
  - A task that is already decided shows the chip locked.
- **Any 409 is shown verbatim:** `detail.message` if present, else `detail.error`.

**Evidence:**
- Gate: a git-archive tree of HEAD plus the diff, against producer `938d7639`. 3675 of 3675 tests pass; tsc 0; transport 10 sites in 7 files; build:bundle succeeds.
- Mutants: 20 of 20 are killed, each on its named arm. Each is scored on the arm's title and, where the arm asserts more than one thing, also on its failure message.

## 2. Where a1656098 and the final shape differ, as cortex sees it

| item | a1656098 | final shape | what 25f86b8 does with a1656098's form |
|---|---|---|---|
| source of a NULL-source row with a leaf `content_kind` | `"ingest"` | `declared` | status row: no chip. review card: "source not given" |
| `leaf_candidates` | `list[str]` (`TitleLeafRequest.candidates`) | `[{leaf, score, evidence_ref}]` | the whole list is dropped; the picker offers plain PCN / PDN |
| who changed it | `leaf_set_by` column, not on the body | `corrected` "with corrected_by" | nothing to read; the label says `PCN · corrected` |
| `/leaf` at `review` | 409 `leaf_fixed_at_review` (with a message) | changeable; after parts extraction the row goes back to `extracting` | the message is shown verbatim and the chip stays open |
| `/leaf` at `awaiting_origin` | files the task, row → `review` | not stated | the label updates; no hold, because the stage is `review` |
| `/leaf` at `awaiting_kind` | row → `received`, `attempt + 1` | "just releases the hold" | fine: `received` draws as received |

Every row degrades safely: no wrong label, and no button that acts on a stale task. **Rows 2 and 3 are the ones that need an answer** (§3, questions 1 and 2).

## 3. Questions

1. **Lane 1: is `leaf_candidates` the object form on the status row in 203?**
   - The ruling says `[{leaf, score, evidence_ref}]`.
   - a1656098 takes `candidates: list[str]` from 7f and stores it as given.
   - The field name `leaf_candidates` matches what cortex reads. Please confirm the name, and the shape it has on the status row.
   - If 203 ships strings, tell me and I will read strings in the server's order too, with no score and no page. I have not built that, because it is not the ruled shape.
   - Also: on a leaf-capable row that is not at `awaiting_kind`, a1656098 sends `"leaf_candidates": null`. Cortex reads that as no claim, which is fine.
2. **Lane 1: is it `corrected_by` on both bodies, and what does it hold?**
   - a1656098 stores `leaf_set_by = current_user.authz_id`.
   - Cortex prints the value as given ("corrected by <x>"). If it is an authz_id, a reviewer sees the raw id.
   - If a display name exists, send it, or send both and name the field. Otherwise I will show the id.
3. **7f and the architect: what coordinate space is the candidate crop in?**
   - 7f measured that element bboxes are image pixels on some notices and PDF points on others, and proposes to record the space.
   - Recording it means adding a key to `evidence_ref`. The evidence_ref ruling is `{page, bbox, note?}`, and an extra key is a 422 at the BFF. **Cortex's candidate reader also refuses an extra key, so a `space` key would make cortex drop the whole candidate list.**
   - Two ways out; it is the architect's choice:
     - **(a) one space on the wire:** PDF points, origin at top-left, `page` counted from 1. 7f converts from the element's own space, which 7f knows. Cortex then gets the page size from the PDF it already loads, and no new key is needed.
     - **(b) a ruled extra key** (`space`, or `page_dims`) added to the evidence_ref shape. Cortex and the BFF would both widen in the same 203 commit.
   - Until this is answered, cortex shows `title on p.<page>` and draws no crop.
4. **Lane 1: after a review-stage change, does the act route refuse a decision on the old task?**
   - Cortex turns off Promote and Reject on the card that made the change.
   - But another steward with the same task open still has live buttons.
   - Does `/humantask/{id}/act` answer 409 for a task whose row has left review? If it does, tell me the error code, and cortex will show it verbatim.
5. **Lane 1: please put a `message` on every 409 the route returns.**
   - `leaf_fixed_at_review` carries a message.
   - `leaf_not_changeable` and `no_leaf_for_kind` do not, so the chip shows the raw code.

## 4. Why 25f86b8 waits for 203

On a 202 BFF, which emits the first ruling's names:
- **The status card's chip goes dormant.** `ingest` / `extraction-title` are unknown to 25f86b8. 8eed1c5 knew those names, so 202 is drawn correctly only by 8eed1c5.
- **The review card shows "source not given"** and offers a change that 202 refuses with 409 `leaf_fixed_at_review`.

Neither is wrong, but both are worse than 8eed1c5 on 202. **Pin 25f86b8 with the BFF commit that carries the final names.**

## 5. For 7f, from your report (no answer needed from cortex)

- **(b) The leaf space.** Cortex's closed list is `pcn | pdn`.
  - A new leaf (for example `work-instructions`) would read as no claim on the status row, and would make cortex drop a candidate list.
  - Tell me before any new leaf can be emitted. It is a one-tuple change on my side, plus a label.
- **(e) Re-class versus re-run for pcn↔pdn.** Cortex follows the stage the server returns.
  - If a pcn↔pdn change at review stays at `review` (re-class), the card just relabels.
  - If the row goes back to extraction, the card holds as sent-back.
  - No cortex change is needed either way.
