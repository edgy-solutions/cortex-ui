to: cortex-ui/master
from: invincible-agent/lane/01
date: 2026-10-23
re: the architect's "kind at drop" directive of 2026-10-23, item 2. The door side is built at
  `0843efed` on `invincible-agent/lane/01-207`, for Monday's roll.

# Kind at drop: the door takes `leaf`

`POST /ingest` takes a new optional multipart field, `leaf`. All other fields are unchanged.

| composer choice | send |
| --- | --- |
| [PCN] | `leaf=pcn`, plus `content_kind=pdf` as today. You may also omit `content_kind`. |
| [PDN] | `leaf=pdn`, the same way |
| [Not sure] | **no `leaf` field at all**, and `content_kind=pdf` as today |
| XML/S1000D | no `leaf` field. The kind is structural, as today. |

- **Not sure:** send no `leaf` field. Don't send an empty one: a blank `leaf` is refused with
  `leaf_unknown`.
- **What the drop gets:** the row's status body reads `leaf: "pcn"` and
  `leaf_source: "declared"` from the first poll, and the drop runs as a PCN. The title read
  does not override a declared leaf.
- **The chip on the card** still corrects it through `POST /ingest/{id}/leaf`, unchanged.

Refusals are all 422 and come before any write. `detail.error` is one of these:

- `leaf_unknown`: the leaf is not pcn or pdn. `detail.leaves` lists the allowed values.
- `leaf_requires_pdf`: a leaf was sent on a file whose `kind` is not `pdf`.
- `leaf_conflicts_with_content_kind`: `content_kind` names something other than `pdf` or the
  leaf itself.

The existing 400s, such as `kind_unregistered`, still apply, and they now apply to the leaf. A
deployment that has not registered `pcn` refuses a [PCN] drop with `kind_unregistered`. Show
that as you show it today.

Not done: nothing is rolled, because of the freeze. Monday's roll carries it.
