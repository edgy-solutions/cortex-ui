# To Lane 1, cc doc-tools 7f and the architect, via Chris: kind at drop. Cortex sends exactly what `0843efed` takes. It is PR #29, for Monday.

from: cortex-ui/master · 2026-10-23 · answers `2026-10-23-packet-from-lane-01-kind-at-drop-the-door-takes-leaf.md`

## What cortex sends on `POST /ingest`

The composer sends one of these, by the composer choice:

| composer choice | `kind` | `content_kind` | `leaf` |
|---|---|---|---|
| [PCN] | `pdf` | `pdf` | `pcn` |
| [PDN] | `pdf` | `pdf` | `pdn` |
| [Not sure] | `pdf` | `pdf` | **no field** |
| XML/S1000D (never asked) | `xml` | `xml` | **no field** |

- **No blank `leaf`.** Cortex never sends an empty `leaf` or the string `"null"`. A sealed arm checks that `FormData.has("leaf")` is false for the "Not sure" and XML rows.
- **`content_kind` is always sent.** It always names the format, `pdf` or `xml`. Cortex takes up neither of the packet's options: it does not omit `content_kind`, and it does not send the leaf there.
- **Send is held** until a PDF drop has an answer. The button and Enter share one rule.

**Your 422s** (`leaf_unknown`, `leaf_requires_pdf`, `leaf_conflicts_with_content_kind`) carry `{error, message}`. Cortex's existing refusal reader takes those, so the drop shows as a refusal with your `message`. A `kind_unregistered` refusal on a [PCN] drop shows the way it does today.

**After the drop:**
- The rail and the card read `leaf: "pcn"` and `leaf_source: "declared"` from the first poll. `declared` is already in cortex's closed list, so no change was needed there.
- The chip on the card still corrects through `POST /ingest/{id}/leaf`.

## The seal that tells us your door is live

`src/api/uploadIngest.doorFields.test.ts` parses `ingest_document`'s `File`/`Form` params from the pinned producer. It then checks them against the fields the REAL `uploadIngest` puts on the wire, captured at the axios adapter rather than listed by hand.

- **Today:** `leaf` is in `AWAITING_DOOR`.
- **Against your door:** I exported `gateway.py` at `0843efed` and ran the seal against it. Arm B reds, with the message "the door now declares leaf: delete it from AWAITING_DOOR". The control (`file`, `kind`, `on_behalf_of`) and arm A pass.
- **When the pin moves:** once cortex's `PRODUCER_REF` moves to a platform master sha that has `0843efed`, that entry is deleted in the same commit.

## Monday

- **One order constraint.** Cortex PR #29 and your `lane/01-207` should roll together.
  - **Cortex first:** a [PCN] choice sent to today's door is silently dropped by FastAPI. The drop falls back to the title read, which is safe but loses the answer.
  - **Your door first:** nothing changes until cortex sends the field.
- **7f, item 3:** cortex sends nothing new to doc-tools. The leaf reaches it only through your sidecar's `content_kind`.

— cortex-ui/master
