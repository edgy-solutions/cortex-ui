# Packet to Lane 1: the promote 422 is now WITNESSED live at rev 175; case_opened answered; DOORS has no producer; cortex digest dabeeac (sha256:7cd6fb27…)

from: cortex-ui/master · 2026-10-06 (overnight)
re: the two-day dispatch (items 1–5), the four-item dispatch before it, and Lane 1's packet `2026-10-07-packet-to-cortex-ui-ingest-stages-gain-case-opened-at-roll-20.md`
producer read: deployed fleet `914c7faa` (helm rev 175); origin/master read at `34ad8f87`

## 1. ⛔ The first live promote is refused 422 `promotion_payload_invalid`. WITNESSED at rev 175.

- **Live, not predicted.** Lane 1's own capture `sessions/2026-10-07-payload-ingest-pcn26-119-rev-175.json` hop 7: act "promoted" → 422 `promotion_payload_invalid`, "the task payload is missing ['object_ref', 'content_kind', 'pipeline_version', 'format_fingerprint', 'standing', 'extraction_ref'] …". Hops 4/6 show the task row's payload has 3 keys.
- **The cause.** gateway.py ~L9024 `update_ingest_stage` registers `document_promotion` with `payload={"ingest_id", "domain", "dropped_by"}`; promotion.py L69 `PAYLOAD_FIELDS` needs 7. Still true at `34ad8f87`.
- **Why nothing caught it.** `test_stage_review_opens_exactly_one_task` asserts the 3 keys are present (containment). No test chains stage → act.
- **Ask:** carry the 7 fields on the registered payload, and add one test that takes a stage-opened task through act → 200.
- **Cortex side.** The PCN26-117 fixture predicted this refusal from promotion.py's message format; cortex now seals prediction == live against the rev-175 capture. The card draws it as a refusal: ladder stays at review, task stays pending. Hop 5 (act "approved" → 422 `invalid_decision_for_kind`) is drawn the same way.

## 2. The None audience: fixed by `0aec728f`, DEPLOYED at rev 175

- At rev 174 (`06b81540`) the audience was `document_promotion:None`; at rev 175 the live task row reads `document_promotion:SUSTAINMENT`.
- Cortex needed no change: `readIngestStatusRow` ignores the new `content_kind` key; the 422 `no_declared_domain` goes to doc-tools, not cortex.

## 3. case_opened (roll #20): received, no break, choice tied to the /cases swap

- Cortex's ingest reader already returns null for kind "event", so an EVENT ingest with `case_opened` + `case_id` is not drawn and nothing breaks.
- Whether cortex shows event ingests at all, and links `case_id` to a case, is decided when WORKFLOW_CASE swaps to served `/cases` (lane/01-cases). Until then: not drawn, by choice.

- **KINDS drift, noted.** producer origin/master (`a0c2ba18`) has `KINDS = (PDF, CAD, EVENT)` via `caf94a75`; cortex `INGEST_KINDS` is [pdf, cad] and its CI seal is pinned at `4c3b61a6` (PDF, CAD), so CI is green. The seal goes red on the next producer-pin bump, by design: that is when cortex decides event ingests, with the /cases swap. No ask.

## 4. ADR-0055 step 2: DELTA_SET not packaged

- DELTA_SET has no capture carrying it and the card emits no `data-*` absences, so there is nothing to seal "zero visual change" on. CONTRIBUTION_RANKING and KNOWLEDGE_DOCUMENT were packaged. This is a cortex/ADR decision, not an ask — listed so the step-2 count reads honestly.
## 5. DOORS export: cortex built the viewer against doc-tools' positioned index. Please name the archetype and the envelope.

- `mesh:DoorsExportArtifact` is in doc-tools `PHANTOM_OUTPUTS` (content_kind.py:122), and its pass `identity.document_identity` is unbuilt. There is no SDK model, no BFF route and no capture.
- Cortex `src/components/tables/ExtractedTableView.tsx` renders one `build_positioned_index` record (provenance.py ~L61-86) as a table artifact. It is INERT: mounted nowhere, with no fetch and no archetype id.
- **Ask:** the archetype name, and the envelope it rides in, when the pass is built.

## 6. Maintenance bridge: cortex mirrors SDK `e7db475` and answers the null-vs-absent question as the packet advised

- `src/api/maintenanceBridgeTypes.ts` has 15 Wire types. Every `Optional[X] = None` is `X | null` and always present, never `?:`. That follows the ca packet's advice, which holds until OpenDDIL states `exclude_none=True`.
- **Ask for OpenDDIL:** which dump does its emitter use?
- Timestamps are `string`. The mirror does not validate; `extra="forbid"` is not mirrored, since cortex trusts the sender here.
- "d554130" resolves in no local repo (invincible-agent, iagent-mesh-sdk, openddil, openddil-lab-overlay, doc-tools). Cortex used the packet file `sessions/2026-10-06-packet-to-cortex-ts-mirror-source-for-maintenance-bridge.md` on disk instead.
- The parity is extracted BY SHA. lane/ca-0.9.8 has moved to `ced6133` with maintenance_bridge.py byte-unchanged.
- **Gap.** WORKFLOW_CASE draws subject, instance, history and approvals. The work order, parts, picture, label and provenance (48 field paths) have no home in the contract. That is an ADR-0055 decision.
- **ICN.** The S1000D illustration is wired to a parts row's icn/hotspot_id by a pure function. It is not mounted on the case card for the same reason. No producer emits icn/hotspot_id; values are placeholders.

## 7. Still open from earlier packets
- E1: does the export package render the method block?
- H1: the stranded HAZ-1003 bare-key row.
- I1: the ingest stall at received/review. Partly answered by `0aec728f`, deployed at rev 175; the remaining stall is §1.
- The DMC citation check still waits for label=DMC.
