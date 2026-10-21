to: invincible-agent/lane/01, doc-tools/lane/7f
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-21
re: the architect's 10-21 leaf ruling ("after the title read, not before the drop"; "a confident title leaf sets the content kind")
relay: Chris

Placed, not committed in invincible-agent. This packet carries no secret.

# The leaf ruling on cortex: the ladder now matches. Before 202 freezes, I need one source vocabulary on both bodies, stored rather than derived, and the shape of the candidates

## 1. What cortex changed for the ruling

- commit `02e8974b2dcc54b1f442583728cd400cb929ac89`
- image: `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:46422e43488751241c8cd2d2ddc2c96528b380a8eec6e61d12e5fbadc933b43b`. Read from GHCR anonymously: the short sha and a fake sha 404; the 8eed1c5 control resolves to `c58b7dfe…`

Changes:
- **Ladder at `awaiting_kind`:** received is done, and extracting is still pending (the title has been read, parts have not been extracted). `awaiting_origin` keeps extracting done.
- **Mock mode:** the title read is extraction's first step. A pick at `awaiting_kind` sends the row back to `extracting`, and parts extraction then reaches `review`. **7f/Lane 1: is that what the real row does after a pick?** If the row goes somewhere else, tell me and I will follow it.

**The 202 pin stays `8eed1c5`, as the architect said.** That image is safe whatever 202 emits:
- The chip draws only a pair it recognises. An unknown `leaf_source` value draws no chip, and the row is still read.
- `02e8974` only changes how a stage that does not exist yet is drawn. It does not need to be in 202.

## 2. The ask that matters before 202 freezes: one `leaf_source` vocabulary, on both bodies

**The ruling and the code name the sources differently.**
- The ruling says `leaf_source=title`, and `corrected` for a dropper's or steward's change.
- The review body's `_review_leaf` (`gateway.py:11921`) emits `"ingest"` / `"extraction-title"` today.
- Cortex reads both bodies through closed lists, built on today's names:
  - **The status row (the chip):** an unknown value means no chip. That is safe, just dormant.
  - **The review body** (`src/lib/promotionReview.ts:261`): an unknown value becomes `null` without a word, and the card falls back to "PCN from the extraction". **If 202 ships `title`/`corrected` on the review body, the review card mislabels the source and nothing goes red.**

**Please pick one vocabulary for both bodies, and tell me the strings.** I will change both readers in one commit. My suggestion follows the architect's words:

| value | meaning |
|---|---|
| `title` | a confident title read |
| `corrected` | a dropper's or steward's change |
| `declared` | `content_kind` named a leaf at the drop (an API dropper; cortex never does) |

The third name is yours to choose. It only has to differ from the other two.

## 3. The source has to be stored, not derived from `content_kind`

`_review_leaf` returns `(ck, "ingest")` whenever the row's `content_kind` is `pcn`/`pdn`.

Under the ruling, a confident title leaf is written into `content_kind`. From then on, **every routed row reads as source `ingest`**:
- a declared leaf, a title leaf and a corrected leaf become indistinguishable;
- the chip's `PCN · from title` can never appear on a real row.

So `leaf_source` needs to be written where the leaf is written:
- `title` at the adoption 7f's dispatch makes;
- `corrected` on `POST /ingest/{id}/leaf`;
- `declared` at the door.

Both bodies then read the stored value. The `doc_type_source == "title"` branch can stay for pre-202 rows.

## 4. The candidates at `awaiting_kind`: their shape

The ruling says "Not confident → awaiting_kind with the candidates". Cortex needs a field for them on the status row.

My proposal: `leaf_candidates: ("pcn" | "pdn")[]`, ordered most likely first. The absent-key rule is the same as for `leaf_source`: absent means no claim, and cortex keeps PCN / PDN in fixed order.
- If 7f's title read carries a confidence or a reason (for example `title-ambiguous`), I would show the reason beside the picker. Name the field and I will read it.
- With only two leaves, the candidates mostly change the order and the explanation. Sending nothing is acceptable for 202.

## 5. Still open from my first packet (the ruling did not answer these)

1. **Up to which stage can the leaf change?** Cortex offers the change at every non-terminal stage and shows your 409 verbatim, so the line is yours, and cortex needs no change to follow it. Tell me the line so I can say it on screen.
2. **A steward's change: from where?** The ruling says "a dropper's or steward's change re-routes".
   - Does the steward use the same `POST /ingest/{id}/leaf`, scoped to the review audience?
   - Should the review card's kind line become the same chip?
   - I will build that once you say the route accepts a steward.
3. **For 7f: which passes does a `pdf` row run before the title read decides?** After the ruling, is it header/title first, then the leaf's passes?

## 6. Evidence for 02e8974

- **Mutants:** 4 of 4 are killed on their named arms:
  - each parked status's ladder;
  - where the mock reads the title;
  - where a pick sends the row.
- **Checks:** transport 10 sites / 7 files; tsc 0; build:bundle succeeds.
- **Full suite:** 3605 pass. The 22 that fail are producer-parity seals reading invincible-agent's local checkout (`e2207468`), the same set as before this change. The pinned-producer gate on `8eed1c5`, which shares the same ingest code apart from this diff, passed 3626 of 3626.
