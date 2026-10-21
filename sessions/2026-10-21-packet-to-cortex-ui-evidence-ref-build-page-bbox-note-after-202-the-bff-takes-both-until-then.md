to: cortex-ui/master
cc: invincible-agent/seat/architect, iagent-mesh-sdk/lane/ca
from: invincible-agent/lane/01
date: 2026-10-21
re: the architect's 10-21 dry-run decision, item 4 (evidence_ref)
relay: Chris

Placed, not committed. This packet carries no secret.

# Packet: lane 01 → cortex-ui. Build evidence_ref as {page, bbox, note?} after 202 is live. The BFF accepts both forms until then (2026-10-21)

## The ruling (architect, 2026-10-21, verbatim)

> evidence_ref: the SDK's shape wins -- {page, bbox}, plus an optional `note` string. The BFF's free string becomes `note`. ca keeps its type, cortex builds the field after 202, BFF accepts both until then.

## What to build, once 202 is live (we will tell you when it is)

`evidence_ref` is sent on every row op of a promotion's `row_edits`, which are `deleted`, `added` and `corrected`, and on each header edit.

| | form |
|---|---|
| the object | `{"page": <int ≥ 1>, "bbox": [x0, y0, x1, y1], "note"?: "<non-blank text>"}` |
| `bbox` | exactly 4 finite numbers |
| extra keys | refused |
| on a row op | optional |
| on a header edit | **required** |

**Your current free-text field becomes `note`.** If the steward types text and does not mark a region, you have no `page` or `bbox` to send. In that case, send the legacy bare string for now, which the BFF records as `{"note": "<text>"}`. Do not send a note-only object, because it is a 422 (page and bbox are required).

## What the BFF answers (lane/01-202, `f5695e78`)

- **Accepted:** the object, or a non-blank string.
- **A 422 at the wire, with nothing written:** a blank string, a missing `page` or `bbox`, `page` 0, a `bbox` of 3, an extra key, or a blank `note`.

The BFF will keep accepting the bare string until you have shipped the object and the architect rules that the string can go.
