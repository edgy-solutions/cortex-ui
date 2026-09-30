# Packet to Lane 1 — proposed wire for canvas export and the ADR-0041 ingest routes

from: cortex-ui/master · 2026-09-30 · measured at helm revision 159 (`ab9b2a4e`), invincible-agent HEAD `3c9374a6`

Cortex was asked to (1) move Export from the card to the canvas via `mesh:packageExport`, and (3) build the ADR-0041 ingest client "via Lane 1's routes". **Neither route exists yet**:

- `mesh:packageExport` is `package_export(recipient_scope, include_dataset)` on engine-cost (`agent_fleet/cost_agent/measures.py:1008`). It takes no answers, and **no gateway route reaches it or its `/artifact/{filename}`**. The gateway proxies only `/plan/measure/{fn}`, so `artifact_uri` points at an engine the browser cannot reach.
- **No ingest, upload, promote or reject route** exists in invincible-agent: 135 route decorators checked, with `/canvas/seed` and `/measure` as controls. doc-tools has no HTTP surface. `lane/01-ingest` has no commits yet.

As ruled by Chris, cortex builds both now **against the wire below**, behind flags and with one adapter per feature. When your routes land, cortex swaps the adapter and seals on a live capture. **Where your build differs from this, your build wins: tell us the field names and we move.** The proposal exists so the two lanes start from the same names, not so cortex can dictate them.

---

## A. Canvas export — `mesh:packageExport` over a canvas

**Audience is `recipient_scope`.** ADR-0047 §1 says there is no default recipient, so cortex never guesses one.

| route | body / response |
|---|---|
| `GET /canvas/export/recipients` | `{recipients: [{value, label}]}`: `RECIPIENT_SCOPES` filtered to what the caller may export to |
| `POST /canvas/export` | body `{answers: [{artifact_id}], recipient_scope, template_id?}` → the **Export** object |
| `GET /canvas/export/{export_id}` | → the **Export** object |
| `GET /canvas/export/{export_id}/artifact` | the file, **served by the gateway** with the per-recipient entitlement check the gating manifest ruled on 2026-09-14 |

**Export** = `{export_id, status: "producing" | "exists" | "failed", recipient_scope, artifact_uri?, artifact_sha256?, artifact_bytes?, artifact_filename?, algorithm_sha?, reason?}`

- `artifact_uri` must be the **gateway path**, not the engine's.
- **Cortex draws the link only when `status === "exists"` AND `artifact_sha256` matches `^sha256:[0-9a-f]{64}$`.** That is the re-read-from-disk hash (`measures.py:1198`), and it is the engine's evidence that the file exists. Anything else draws the status, never a link.
- If `recipient_scope` is missing, refuse with **409** `{reason: "recipient_required", options: [{value, label}]}`, the same options-bearing refusal as the verb's.
- **What we need from you:** today the verb packages engine-cost's own figures. A canvas's answers come from several engines (for program_finance, all six panels are finance verbs), so this is ADR-0049 composition. Whether `answers` is a filter, a manifest, or ignored in slice 1 is your ruling; cortex will send the list either way.

## B. Ingest — ADR-0041, first client

All ingest routes go on the gateway and are gated as §8 requires: an authenticated identity plus domain entitlement, deny-by-default.

| route | body / response |
|---|---|
| `GET /ingest/kinds` | `{kinds: [{kind_source_value, kind, domain_type, label?}]}`, **served from doc-tools `KIND_MAPPING`** and not restated (one row today: `work-instructions`) |
| `POST /ingest` (multipart `file`) | → **Status**, with `status: "awaiting_kind"` and `suggested_kind: string or null` (§4: the classifier suggests) |
| `POST /ingest/{ingest_id}/kind` | body `{content_kind}` → **Status**. It writes `manifest.metadata.content_kind`. An unregistered kind gets **422** `{reason: "unregistered_kind"}` |
| `GET /ingest/{ingest_id}` | → **Status** (cortex polls; an Electric shape later is fine) |

**Status** = `{ingest_id, filename, content_kind, suggested_kind, status, reason?, steps, duplicate, review, produced}`

- **`status`**: `awaiting_kind`, `queued`, `extracting`, `extracted`, `halted`, `promoted`, `rejected` or `superseded`. `halted` is §4's HALT and carries `reason`.
- **`steps`**: `[{step, state, started_at?, ended_at?, detail?}]`, where `state` is `pending`, `running`, `done` or `failed`. Cortex draws these as a StepLadder, and the timestamps as an IntervalTimeline.
- **`duplicate`**: `null` or `{identity: {issuer, document_number, revision}, of_document_id, of_ingest_id?, winner: "official" or "this", message}`. This is R3, and it is **on the same Status row**, so the duplicate message and the progress come from one projection and cannot disagree.
- **`review`**: `null` or `{task_id, can_act, verbs}`. **Promote and reject are NOT new routes.** §5 puts promotion on the existing approval plane, so the review is a HumanTask; cortex acts through the existing `POST /human_tasks/{task_id}/act`, and cortex-bff already re-checks `can_act`. The proposed verbs are `promoted` and `rejected`, declared by the overlay (cortex carries whatever verbs the declaration names). `can_act` here is for the viewing user and is used only to show the buttons; the server stays the authority.
- **`produced`**: `{instances, chunks, triples}`, i.e. §1's point that "the approver reviews the extraction".

### The label (§7), on the COMPONENT, not only the envelope

Put `unvouched_material` **on every component whose answer drew on unpromoted material**:

`{label: "Includes unverified user-contributed material", documents: [{document_id, ingest_id?, title?, content_kind?, obtained_via: "user-drop"}]}`

It must be component-level because the projector passes row-level fields and drops envelope-level ones; cortex has measured that more than once. Put it on the envelope as well if you like. Cortex draws a banner whenever `documents` is non-empty and never infers the label from anything else.

---

## C. program_finance, read as a package definition (dispatch item 2)

Read at `ab9b2a4e` (unchanged since `90fabab`), `policy/canvases/program_finance.yaml`:
- There is one shared slot, `program` (required).
- It has six finance panels (`finFundingStatus`, `finBurnRate`, `finPerformanceIndices`, `finVarianceAnalysis`, `finVarianceDrivers`, `finEacCalculation`).
- There are **no `package`, `recipient` or `audience` keys**, and nothing in the repo says "package definition".

For "its seed and its export are the same object", the template needs:

1. **A binding source for `program`.** Today the 409 is unconditional (`_unbound = sorted(_consumed)`, `gateway.py:2139`), and `CanvasSeedRequest` has only `canvas_type` and `template_id` (`:2022`). It needs `bindings: {program: …}`, subtracted from `_consumed`.
2. **One slot name.** The template says `program`; the finance verbs take `program_id`.
3. **A seeder that runs the template's panels.** The 501 ("Only 'portfolio' seeds today", `:2149`) sits behind the 409.
4. **A `package:` block in the template** naming its recipient (`recipient_scope`) and what the export carries. Then **one object answers both questions**: the seed reads `shared_slots` + `panels`, and the export reads the same panels plus `package.recipient_scope`. Cortex would send `template_id` on `POST /canvas/export` (section A) so the engine can read that block.
5. **Cross-engine packaging** (section A, last bullet), because every panel here is engine-fin and the verb is engine-cost's.

Cortex keeps presenting program_finance as needing a binding (`needsBinding`, `src/lib/templateCatalog.ts:147`) until item 1 lands.
