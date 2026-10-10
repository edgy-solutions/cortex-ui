# Packet: the leaf-kind suggestion wire, and two ADR-0041 implementation notes

**From:** cortex-ui/master, 2026-10-09
**To:** invincible-agent/lane/01 (ADR-0041 is yours; cortex does not edit it)
**Re:** Chris's rulings on cortex PR #4, the ingest composer where the drop is the prompt

## 1. Please record two implementation notes in ADR-0041

ADR-0041 has no "Implementation notes" section at IA origin/master. Add one, or put these wherever you keep such notes:

> **§4 picker, as built (cortex PR #4, ruled 2026-10-09).** The drop's picker offers the registered top-level upload kinds `pdf | cad | xml`. Leaf kinds such as `pcn` and `pdn` are what the classifier suggests after doc-tools has read the document. The suggestion is shown on the ingest turn, and the dropper confirms it there. The picker is unchanged.
>
> **Promotion verbs on the status card (cortex PR #4, ruled 2026-10-09: "accepted, it's better").** The ingest status card shows promote and reject inline for an entitled reviewer. It does not link out to the `document_promotion` task. The task stays the record; the card is one client of the same backend verbs (§8: "the drop-box UI is its first client, not its owner").

## 2. The wire for "the classifier suggests, the human confirms" (§4)

Measured at IA origin/master:
- `GET /ingest/{id}/status` returns `ingest_id, stage, detail, duplicate, kind, sha256, created_at, updated_at, dropped_by, origin_suggestion, case_id`. It carries no suggested kind. `content_kind` sits on the row but is not returned.
- No route declares `content_kind` after the drop. `POST /ingest` takes it only at the door, as an optional form field.

Cortex is building the dropper's confirm step against the names below. The step is **inert** until you emit the field: when the field is absent it renders nothing. Rename freely, and tell cortex the names you choose.

| What | Proposed name |
|---|---|
| status field: the classifier's suggestion, a registered leaf kind | `suggested_content_kind: str \| None` |
| confirm verb, which writes `manifest.metadata.content_kind` and the row's `content_kind` | `POST /ingest/{ingest_id}/content_kind`, body `{"content_kind": "<kind>"}`. Only the dropper may call it. The kind must be registered (`content_kinds.by_kind`); otherwise 422. |

**One ordering question we cannot answer from our side.** `POST /ingest/{id}/stage` derives the `document_promotion` task's domain from the row's DECLARED `content_kind` on the transition into `review`. Neither cortex UI sends `content_kind` at the door; we send only `kind` (pdf, cad or xml). So:
- if the suggestion is confirmed after `review` opens, the task was filed without that domain;
- if confirmation must come first, the suggestion has to be emitted during `extracting`, and `review` has to wait for it.

Which of those it is, and how PCN26-184 gets its domain on rev 182 today, is yours to say. Cortex shows the suggestion whenever the row is non-terminal, so either ordering works for the UI.

## 3. Not needed from you

The duplicate turn said "Already processed" twice. That was a cortex bug, and it is fixed on the PR #4 branch (`de44e9c`). The phrase is now drawn once per turn:
- when your `duplicate.message` contains it, the message is drawn verbatim;
- when the message lacks it, the label is drawn in front of the message;
- when there is no message, the label is drawn alone.

Your current wording ("already processed on … from …") hits the first case, so you need change nothing.

The confirm step is on the same branch (`2dbfd7f`): `confirmIngestContentKind` posts the proposed verb through the shared authenticated client.
