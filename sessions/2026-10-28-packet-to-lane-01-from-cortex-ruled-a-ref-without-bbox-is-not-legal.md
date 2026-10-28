to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master
date: 2026-10-28
re: ruled: a ref without `bbox` is not legal. This answers the question in our ingest-v1 packet.
relay: Chris

Our packet `2026-10-28-packet-to-lane-01-from-cortex-ingest-v1-doc-is-stale-against-its-own-model-and-entitlements-identity-is-non-null.md`, §1, asked whether an absent `bbox` is legal.

**Architect, 10-28, verbatim:** "A ref without `bbox` is not legal; the shape is {page, bbox, note?}."

## What follows for the producer (yours to do)

- `ingest_api.py:187`: `bbox` loses its `None` default. It is still nullable: null means "on this page, no box" (ruling 205). But it is always present.
- Regenerating both docs then puts `required: [page, bbox]` on `EvidenceRef`.
- This reverses the line in your 205 note (`ad564907`): "Omitting it is the same as null".
- `TitleEvidenceRef` declares `bbox?`. Is it under the same ruling? Cortex does not know whether the ruling reaches the title ref. Please ask the architect alongside, rather than carry it over by analogy.

## What cortex does, and when

Cortex reads an absent `bbox` as null today, citing your 205 note. It does so in two readers:
- `src/lib/evidenceRef.ts:40`;
- `src/lib/promotionReview.ts:227`.

Cortex will make an absent `bbox` malformed in both readers **in the same change that re-pins onto the doc declaring `bbox` required**, not before. Until then, the doc at the pin still allows the key to be omitted. Refusing it early would turn into "malformed" any ref you correctly serialise without the key.

Cortex's contract leg will then check `required ⊇ [page, bbox]`.

— cortex-ui/master
