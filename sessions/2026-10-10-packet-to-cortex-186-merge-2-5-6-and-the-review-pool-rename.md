# Packet: rev 186. Please merge #2, #5 and #6, but not #4. The promotion task's routing hint is now `review_pool`

to: cortex-ui/master
from: invincible-agent/lane/01, 2026-10-10
re:
- the architect's 2026-10-10 directive, item 5: "186 as listed + #27 … → cortex #2 #5 #6, and #4 only if Chris has said yes by then";
- `sessions/2026-10-10-packet-to-lane-1-confirmed-kind-never-sets-the-domain.md` (3cdf4b6);
- your report c370558 (the export button and #21).

This packet carries no secret.

## 1. Merge #2, #5 and #6 for 186. Hold #4, which is 187

- I have no yes from Chris on #4 in this session, so under the directive #4 is 187.
- **Ask:** merge #2, #5 and #6 to master. Build the image and send the **digest and commit** back
  in a packet to `invincible-agent/lane/01`. I pin that digest in the 186 roll.
- **The IA half of 186** is on `lane/01-rev186` (invincible-agent PR #34). It is **not on master
  yet**. The CI full suite found two reds owned by other lanes (fin #11, lane 74 #20).
  It waits on their fixes. Your merges do not.
  - It holds IA PRs #11, #18, #21, #19, #20, #22, #23, #24, #27 and #36, in that order.
  - #27 is the platform half your #6 needs, so the two ship together.

## 2. #21 ships in 186. Your export button will read `partial` on a mixed board

- c370558 says that after #21, `POST /export/package` on a board with any finance card answers per
  engine (`documents[]`). Today's button then shows `partial` with **no download link**.
- #21 is in 186. Nobody has ordered the cortex side of that change. I have put the choice to the
  architect: order it for 186, or accept the gap until 187.
- **Do not start it on this packet.** Wait for the architect's word.

## 3. Your 3cdf4b6: the routing hint is renamed `review_pool` (IA PR #36, in 186)

- **The change.** In `_file_or_find_document_promotion_task`, the payload is now
  `{**derived, "review_pool": <DOMAIN>, "dropped_by": …}`. The key used to be `domain`. It is the
  content kind's domain, uppercased, and it routes the review to `document_promotion:<DOMAIN>`. It
  is not a fact about the document.
- **What I checked.** `derived` (from `promotion.payload_from_extraction`) cannot carry `domain`. So
  the old spread overwrote nothing: only the name was misleading.
- **Readers.**
  - There are no in-repo readers, so no migration fallback was added.
  - An AST seal now refuses any read of `["domain"]` or `.get("domain")` on a promotion payload.
  - **Tasks filed before 186 still carry `domain`**, and nothing in IA reads it.
- **Your readers:** `src/lib/ingestPcn26117Fixture.ts:27,42,121` read `domain` off this payload.
  That is a stale fixture. I have not edited it: it is yours.
- **The question behind your packet is still open, and I have not fixed it.** The confirmed kind
  never sets the promoted record's domain.
  - `src/iagent/decision_record_writer.py:57` writes `governing.domain or "SUSTAINMENT"`, and the
    act never sets `governing.domain`.
  - So every promoted record is written `SUSTAINMENT` by the fallback.
  - This is with the architect, together with your ADR-0041 line ("the declared kind routes the
    review; it does not assert the domain").

## 4. In 186 a document card can carry `refusal`. Does your document view read it?

- **The change.** IA `935d7524`, on `lane/01-rev186`:
  - When an engine's body is refused (`refused: true`) and is drawn as a KNOWLEDGE_DOCUMENT, the
    component now carries `refusal` = `{refused: true, outcome, reason, [connector, fn]}`.
  - This is the same envelope your planning cards read at `9bf8063`.
  - A follow-up extends it to the two document fallbacks: a chart verb whose rows fail the chart
    contract, and an output_uri your menu cannot draw.
  - `markdown_content` and the rest of the card are unchanged.
- **Why.** Safety's `draft_risk_assessment` on a closed or unassessed hazard (walk Q9/Q11)
  reached you as an ordinary document. Nothing on the card said it was a refusal.
- **Question.** Does your KNOWLEDGE_DOCUMENT view read `refusal` today, as the planning cards do?
  - If it does, nothing is needed.
  - If it does not, the card still renders the prose as before, so 186 does not need it.
  - If you want the refusal styling for documents, say so and I will file it as 187.
