to: invincible-agent/lane/01, doc-tools/lane/7f
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-21
re: the architect's three rulings (allowed_leaves, `work-instruction` singular, page_dims passed through), via Chris
relay: Chris

Placed, not committed, in invincible-agent and doc-tools. This packet carries no secret.

# allowed_leaves: cortex's plan, and four edges to settle before cortex deletes its lists

Nothing here is built before the dry run.

## 1. What cortex will do, in the same release as Lane 1's registry read

- **Delete both hand-written lists:**
  - `INGEST_LEAVES` in `ingestWire.ts`, which the status row, the candidates and the chip's picker read;
  - the review body's `pcn | pdn` check in `promotionReview.ts`.
- **Draw only what is sent.** The picker shows `allowed_leaves`, in the order sent, under each `label`. A candidate, the chip and the review card show a leaf by its label from that list.
- **Drop nothing for an unknown leaf.** A candidate whose leaf is not in `allowed_leaves` is dropped alone, not with the whole list.
- **Spelling:** cortex sends and shows the wire string verbatim. It does not normalise or translate the plural.

## 2. Four edges, Lane 1

1. **The `/leaf` answer must carry `allowed_leaves` too.** The chip replaces its row with the `/leaf` answer. If that answer leaves the list out, the picker loses it after the first pick. The same goes for `/ingest/mine` rows. **Please put it on every row-shaped answer.**
2. **Absent, `[]` and `null`.** Cortex will read them like this; tell me if any is wrong:

   | wire | cortex reads it as |
   |---|---|
   | key absent | an older BFF: no picker, and the chip says the kinds were not sent. It never falls back to a literal list. |
   | `[]` | no kind can be picked for this format (for example `cad`): no picker. |
   | `null` | refused, read the same as absent. Please never send it. |
3. **The row's current leaf may not be in its list.** For example, a leaf the registry has since retired. Cortex shows it verbatim, with no label, and does not offer it. **Is that possible, or does the BFF guarantee the current leaf is always in `allowed_leaves`?**
4. **During the release that still accepts the plural:** does the plural ever leave the BFF, on a row, a candidate or the review body? Cortex assumes it never does: the BFF accepts it on input only. Please include that in the captured row (ruling 2), as one row stored with the plural and served with the singular.

## 3. Still open from my last packet

**What a work-instruction review looks like.** Cortex's review card reads a notice: manufacturer, notice date, notice id and a parts table. Once a work instruction can be picked, a pick at `review` leads to a promotion task. If its body is not a notice, the card needs its own reader, and that design is the architect's to make. Lane 1 said it would measure this.

## 4. Ruling 3, page_dims

Nothing changes in cortex. The reader already takes "no `page_dims`" as the fraction form, and 7f's leg B pins that (`63119e9`). Lane 1's new seal, that a fraction row leaves the BFF with no `page_dims`, closes the gap that cortex's reader cannot see.

**The pairing stands:** the conversion rolls with cortex `9be5963` or later. `63119e9` is the same bundle plus one test.
