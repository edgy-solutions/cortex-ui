# Routes cortex consumes

Every call cortex-ui makes to the BFF (`cortex-bff`, FastAPI app `src.iagent.gateway:app`). Each entry gives the route, the
method, the fields cortex sends and reads, and the component that makes the call.

- **Who it is for.** This is the list Lane 1's ingest-v1 doc must cover. It is also the population that
  the contract seal for the whole UI will be keyed on.
- **ingest-v1 already exists.** It is on `lane/01-ingest-v1` at `1fb9e242`, not merged. Cortex's reads of its 13 routes are
  joined against its committed `docs/api/ingest-v1.openapi.json` in §1a. Everything else here is joined against the BFF's
  full OpenAPI.
- **As of:** cortex-ui `master` at `0288915`, 2026-10-23, plus `e0c3c6d` (PR #29, kind at drop, merged while this was written: it adds only `leaf` on `POST /ingest`).
- **Status:** the inventory only. Nothing in `src/` has changed yet. The refactor that follows it (one typed client,
  derived registries, dead paths out, a `documents` adapter) lands after this has been read.

## Against which producer

| | platform sha | `cortex-bff` image index digest | paths | ops |
|---|---|---|---|---|
| **pinned** (cortex CI `PRODUCER_REF`, `build.yml:168`) | `938d7639f89695ee88fc768739c7a3faf360a40b` | `sha256:c1ab0ba0f4d066715d4f1b83700744b49c1c732b79f16af63d0098d2f47f0352` | 66 | 67 |
| **platform master** | `0c227330e94a34d576fc5b0f30f88d65e52d2678` | `sha256:828004232fee4c74c2ea6fb89de35d9b59fdf1ad604b7e580f4fd72e852fc948` | 67 | 68 |
| **ingest-v1** (`lane/01-ingest-v1`; contains 207 `0843efed` and 208 `d5061ffb`) | `1fb9e242` | no image read; the committed snapshot `docs/api/ingest-v1.openapi.json` (`info.version` 1.0.0) | 13 | 13 |

The OpenAPI was dumped **offline from the image**: no network, no services, no cluster.

```
DOCKER_CONFIG=<empty dir>  docker run --rm --network none --entrypoint python \
  ghcr.io/edgy-solutions/invincible-agent/cortex-bff@<digest> \
  -c "import json,sys; from src.iagent.gateway import app; sys.stdout.write(json.dumps(app.openapi(), sort_keys=True))"
```

The app imports with no services (the neo4j driver is lazy, `init_db` runs in lifespan), and `/openapi.json` is on.
The image tag is the **bare full sha**; a short sha 404s.

## The findings, first

1. **On today's shas, responses are almost entirely undeclared.** Cortex calls 37 producer routes, and only **2** declare a
   2xx schema: `POST /decision_subgraph` and `POST /register_frontend_capabilities`. Cortex reads only declared fields on both.
   **ingest-v1 (`1fb9e242`) covers 10 of the routes cortex calls**: 9 with an `extra="forbid"` JSON model, and `/source`,
   which returns bytes. Against
   it, the response seal is **not clean** (§1a):
   - **Undeclared reads:** cortex reads `origin` and `extraction_defect` off the status row, and v1 declares neither. Both
     cortex features behind them are dark by contract.
   - **Nullability:** cortex refuses a row whose `sha256`, `kind`, `created_at` or `updated_at` is null. v1 types all four
     `| null`.
   - **Unknown stages:** cortex refuses a row whose `stage` it does not know. v1 §7 says: "treat a value you do not
     recognise as 'not finished'."

   The remaining live routes stay undeclared: canvas, plan, interview, export, cases, `/task_kinds`, reviews, provenance
   and access requests. The seal cannot reach them until they gain a `response_model=`.
2. **Requests are declared, and cortex sends nothing undeclared** on any present route. The two exceptions:
   - `leaf` on `POST /ingest` is the kind-at-drop field: cortex sends it since PR #29 (merged as `e0c3c6d`); the producer takes it at `0843efed` on `lane/01-207`, not yet on platform master. FastAPI drops it silently until then.
   - `table` on `/electric/shape` is a passthrough proxy that declares no params.

   The request-side seal can be generalised from `uploadIngest.doorFields.test.ts` to every route now.
3. **Three routes cortex calls do not exist on either sha:**
   - **`POST /artifacts/reevaluate`** fires on every plan-version change and is silently swallowed.
   - **`POST /analyze`** backs the Superset publish button, which always toasts "unreachable".
   - **`POST /ingest/{id}/origin/dispute`** was cortex-proposed and never built.

   `POST /ingest/{id}/leaf` is absent at the pin and present on master.
4. **The 208 hazard, measured.** Today a status row whose stage is `no_parts` is refused whole (`readIngestStatusRow` returns
   null). The store's poller and the card both keep the last row: `if (next) setRow(next)`. So a confirmed-empty drop
   **freezes at "review" and keeps being polled**. On the next reload it **vanishes from the rail**, because `GET /ingest/mine`
   counts it as `unreadable` and nothing displays that count. §5 and the 208 packet have the details.
5. **Hand-kept registries:** 8 are sealed against the producer and 12 are not (§4). Four of the unsealed ones can be sealed
   against the producer today:
   - the out-of-band statuses `awaiting_origin`, `review_rejected` and `awaiting_kind`, which are all in master's `ALL_STATUSES`;
   - `INGEST_LEAVES`;
   - `INGEST_LEAF_SOURCES`;
   - **`OBTAINED_VIA`, which is already behind.** The pinned producer's `provenance.py` has had a sixth rung,
     `steward-corrected`, since `177eaf85` (10-14). SDK `lane/ca-0.9.11` adds a seventh, `steward-entered`.
     Cortex knows five. `readProvenanceFloor` returns null on an unknown rung, so a component whose floor is a
     steward rung **loses its provenance label silently**. Because the steward rungs are the last ones, any
     steward-touched source makes them the floor.
6. **There is no live "suggestion flow."** `IngestKindSuggestion` was deleted in `8eed1c5`. What remains:
   - **Its orphans:** `KindPicker`'s `suggestedKind` prop and the `origin_suggestion` fixtures.
   - **Unreachable UI:** `/workflow/compile` and its overlay, and `/canvas/seed` (reachable only from a console global).
   - **Unused by the live mount:** the per-card self-poll in `IngestStatusCard` (§6).

## 1. The census

How to read the table:
- **pin / master:** whether the route is in that sha's OpenAPI.
- **req:** whether every field cortex sends is declared. ✓ means yes; ✗ means at least one undeclared field (see the note).
- **2xx:** the declared response schema. `none` means `{}`.

| # | method | route | cortex fn (`src/api/client.ts` unless stated) | live consumer | pin | master | req | 2xx |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/ingest` | `uploadIngest` :1017 | composer submit, `useIngestComposerStore.ts:110` | ✓ | ✓ | ✓ (✗ `leaf`, sent since `e0c3c6d`; declared in v1) | none |
| 2 | GET | `/ingest/{id}/status` | `fetchIngestStatus` :1036 | `useIngestStatusStore.pollDue` (rail poller) | ✓ | ✓ | ✓ | none |
| 3 | GET | `/ingest/mine` | `fetchIngestMine` :1048 | `useIngestStatusStore.loadMine` | ✓ | ✓ | ✓ | none |
| 4 | POST | `/ingest/{id}/retry` | `retryIngest` :1059 | `IngestFailureExtras` Retry → store | ✓ | ✓ | ✓ (no body) | none |
| 5 | GET | `/ingest/{id}/extraction` | `fetchIngestExtraction` :1068 | `PromotionReviewCard.tsx:259` | ✓ | ✓ | ✓ | none |
| 6 | GET | `/ingest/{id}/source` | `fetchIngestSource` :1089 | `PdfEvidencePane.tsx:123` | ✓ | ✓ | ✓ | none (bytes) |
| 7 | POST | `/ingest/{id}/leaf` | `correctIngestLeaf` :1152 | `IngestLeafChip.tsx:108` (rail card and review card) | **✗ absent** | ✓ | ✓ | none |
| 8 | POST | `/ingest/{id}/origin/dispute` | `disputeIngestOrigin` :1131 | `IngestStatusCard.tsx:281` | **✗ absent** | **✗ absent** | n/a | n/a |
| 9 | GET | `/export/package/recipients` | `fetchExportRecipients` :930 | `CanvasExportButton.tsx:84` (flag `canvasExport`, off) | ✓ | ✓ | ✓ | none |
| 10 | POST | `/export/package` | `startCanvasExport` :945 | `CanvasExportButton.tsx:98` | ✓ | ✓ | ✓ | none |
| 11 | GET | `/export/package/artifact/{filename}` | `downloadExportArtifact` :960 | `CanvasExportButton.tsx:146` | ✓ | ✓ | ✓ | none (blob) |
| 12 | GET | `/me/entitlements` | `fetchEntitlements` :56 (bare axios, not `api`) | `App.tsx:416` → `usePersonaStore`, `dropIdentity` | ✓ | ✓ | ✓ | none |
| 13 | GET | `/me/human_tasks` | `fetchMyHumanTasks` :116 | `seedHumanTasks.ts:51` ← `App.tsx:110` | ✓ | ✓ | ✓ | none |
| 14 | POST | `/human_tasks/{task_id}/act` | `actOnHumanTask` :222 (`buildActBody` :204) | `useTaskAct`, `GroupedReviewTable`, `IngestStatusCard`, `TriageTaskCard` | ✓ | ✓ | ✓ | none |
| 15 | POST | `/access_requests` | `createAccessRequest` :258 | `AccessDeniedCard.tsx:50` | ✓ | ✓ | ✓ | none |
| 16 | GET | `/reviews/{workflow_id}/batch` | `fetchReviewBatch` :295 | `useTaskArtifactSync.ts:44` → `GroupedReviewTable` | ✓ | ✓ | ✓ | none |
| 17 | GET | `/notices/{notice_id}/provenance` | `fetchNoticeProvenance` :313 | `EvidencePane.tsx:30` | ✓ | ✓ | ✓ | none |
| 18 | GET | `/task_kinds` | `fetchTaskKinds` :911 | `useTaskKindStore` ← `App.tsx:364` | ✓ | ✓ | ✓ | none |
| 19 | GET | `/cases/{case_id}` | `fetchCaseResponse` :1110 (raw fetch) | `DeepLinkLanding.tsx:48`, `IngestStatusCard.tsx:107` | ✓ | ✓ | ✓ | none |
| 20 | GET | `/electric/shape?table=human_task_projection` | `electricHumanTasks.ts:81` (ShapeStream) | `App.tsx:111` | ✓ | ✓ | **✗** `table` (and Electric's own params) undeclared | none |
| 21 | GET | `/electric/shape?table=answer_artifact_projection` | `electric.ts:275` (ShapeStream) | `App.tsx:92` | ✓ | ✓ | **✗** as row 20 | none |
| 22 | POST | `/interview/stream` (SSE) | `streamInterviewResponse` :431 | `useInterviewAgent.ts:685` | ✓ | ✓ | ✓ | none (SSE) |
| 23 | POST | `/canvas/seed` | `requestPortfolioCanvasSeed` :533 | **none**: console global only | ✓ | ✓ | ✓ | none |
| 24 | GET | `/plan/state_version` | `fetchPlanStateVersion` :564 | `planVersion.ts:89` ← `useLiveViewRefresh` | ✓ | ✓ | ✓ | none |
| 25 | POST | `/plan/scenario` | `forkPlanScenario` :580 | `planDrag.ts:41` | ✓ | ✓ | ✓ | none |
| 26 | POST | `/plan/scenario/{scenario_id}/reschedule` | `reschedulePlanProject` :603 | `planDrag.ts:61` | ✓ | ✓ | ✓ | none |
| 27 | POST | `/artifacts/reevaluate` | `requestReevaluation` :622 | `useLiveViewRefresh.ts:103` | **✗ absent** | **✗ absent** | n/a | n/a |
| 28 | POST | `/workflow/compile` | `compileWorkflow` :631 | **none**: unreachable phase | ✓ | ✓ | ✓ | none |
| 29 | GET | `/me/canvases` | `fetchCanvases` :644 | `useCanvasPersistence.ts:29` | ✓ | ✓ | ✓ | none |
| 30 | PUT | `/me/canvases` | `saveCanvases` :648, `saveCanvasesUrgently` :841 (raw fetch, keepalive) | `useCanvasPersistence.ts:61,89` | ✓ | ✓ | ✓ | none |
| 31 | POST | `/canvas/lineage_edges` | `fetchLineageEdges` :662 | `GlobalCanvasStage.tsx:168` | ✓ | ✓ | ✓ | none |
| 32 | GET | `/mesh/config` | `getMeshConfig` :677 | `meshPersonaConfig.tsx` → `StageCard`, `SemanticInterpreter` | ✓ | ✓ | ✓ | none |
| 33 | POST | `/decision_subgraph` | `fetchDecisionSubgraph` :689 | `DecisionMap.tsx:40` | ✓ | ✓ | ✓ | **`DecisionSubgraphResponse`** |
| 34 | POST | `/register_frontend_capabilities` | `registerFrontendCapabilities` :733 | `App.tsx:181` | ✓ | ✓ | ✓ | **`RegisterFrontendCapabilitiesResponse`** |
| 35 | GET | `/health` | `healthCheck` :743 | `useAgent.ts:16` (gates nothing) | ✓ | ✓ | ✓ | none |
| 36 | POST | `/analyze` | `publishToSuperset` :757 | `SemanticInterpreter.tsx:837` | **✗ absent** | **✗ absent** | n/a | n/a |
| 37 | GET | `/fleet/version` | `fetchBffVersion` :814 | `BuildStamp.tsx:85` | ✓ | ✓ | ✓ | dict |
| 38 | GET | `/templates` | `fetchTemplates` :879 | `useTemplateStore.ts:47` ← `DockBar.tsx:99` | ✓ | ✓ | ✓ | none |
| 39 | GET | `/data_module/figures?uri=` | raw fetch, **two sites**: `InlineFigures.tsx:142`, `FiguresSlideIn.tsx:77` | `CanvasPane.tsx:327`, `SourcesTrail.tsx:100` | ✓ | ✓ | ✓ | none |
| 40 | GET | `/graph/node/{node_id}` | raw fetch `NodeInspector.tsx:41` | `Layout.tsx:9` (prints the raw JSON) | ✓ | ✓ | ✓ | none |
| 41 | GET | `/federated_image?src=` | raw fetch `FederatedImage.tsx:58` | knowledge-document card, `EvidenceCard` | ✓ | ✓ | ✓ | none (blob) |

**Not BFF routes, listed so the population is closed:**
- `GET {content_path}` (`fetchIllustrationContent` :1167). The path is producer-chosen, from an ILLUSTRATION payload, and must
  pass the `gatewayRelativePath` guard. No producer route serves ICN bytes today.
- `GET /version.json`, same-origin static from nginx: `bundleFreshness.ts:38` and `frontendVersion.ts:25`.
- Keycloak/OIDC through `oidc-client-ts`.

**Already in 208, not yet called:** `POST /ingest/{id}/empty` (the dropper's door). It is absent on both shas; it is built on
`lane/01-208` at `d5061ffb`.

**Transport, common to every call:**
- **The axios `api` instance** sends `Authorization: Bearer`, `X-Trace-Id` (per request) and `X-Session-Id` (per tab).
- **The raw-fetch sites** (rows 19, 30-urgent, 39, 40 and 41) and `fetchEntitlements` do **not** send the two correlation
  headers.
- **Every site outside `client.ts`** carries a `transport-exception:` declaration, which `npm run check:transport` enforces.

## 1a. Against ingest-v1 (`1fb9e242`): what cortex reads, and what the model declares

Every v1 model is `extra="forbid"`, and the producer's `conftest.py` validates every 200 body the tests drive through a
v1 route. So "not declared" means the producer's tests would refuse it: it does not arrive.

| route → model | cortex reads, declared | **cortex reads, NOT declared** | **nullability cortex refuses** | declared, cortex does not read |
|---|---|---|---|---|
| `GET …/status` → `StatusBody` | ingest_id, sha256, kind, stage, created_at, updated_at, duplicate, detail, case_id, content_kind, failure.*, attempt, notice_id, leaf, leaf_source, corrected_by, leaf_candidates, review_task_id (parsed) | **`origin`** (v1 has `origin_suggestion`); **`extraction_defect`**; `task_id` and `superseded_task_id` (these are on `LeafResponse` only, which is right: cortex reads them off `/leaf` through the same reader) | `sha256`, `kind`, `created_at` and `updated_at` are `\| null` in v1; cortex refuses the row on any of them | `dropped_by`, `artifacts`, `origin_suggestion`, **`hold_reason`**, `review_task_id` (parsed, never used) |
| `GET /ingest/mine` → `MineListing` | items (as above), next | | as above, per item | |
| `POST /ingest` → `IngestAccepted \| IngestDuplicate` | ingest_id, duplicate.{of_ingest_id, message} | | `DuplicateRef.message` is `\| null` | stage, detail, object_prefix, workflow, origin_suggestion |
| `POST …/retry` → `RetryReopened \| RetryFiled` | attempt (`RetryReopened`) | | | **`stage`**: cortex sets the row to `received` locally, but `RetryFiled` (from `awaiting_origin`) returns its own stage and `task_status` |
| `GET …/extraction` → `Extraction` | rows[].{mpn, row_index, part_index, field, extracted_value, obtained_via, needs_review, review_reason, evidence_ref.{page, bbox, page_dims, units}}, notice.{mfr, mfr_source, notice_date}, notice_id, attempt, part_count, rows_without_evidence, leaf, leaf_source, corrected_by | | | match_confidence, source_snippet, evidence_ref.{bboxes, quality}, notice.mfr_parent, review_ref, relocated_to, content_kind |
| `GET …/source` → bytes | | | | |
| `POST …/leaf` → `LeafResponse` | leaf, leaf_source, corrected_by, stage, task_id, superseded_task_id | | as for status | as for status |
| `GET /me/entitlements` → `Entitlements` | cells.{persona, domain}, default, authz_id, email | | | user_id, source |
| `GET /me/human_tasks` → `HumanTasksListing` | tasks[].{id, task_id, workflow_id, audience, kind, status, title, summary, requested_by, subject_ref, created_at, payload, declaration.{kind, declared, archetype, badge, title, accepts, reason_required}} | | | email, workflow_service, promise_name, case_id |
| `POST /human_tasks/{id}/act` → 7-way `anyOf` | workflow_resumed (`ActGeneric`), extraction_defect (`ActPromotion`, a string), accepted, reason, resolved_count, review_dispatched (grouped) | `row_edits.{corrected, added, deleted, header}`: v1 types `ActPromotion.row_edits` as a bare `object`, so its keys are undeclared | | task_id, decision, rows_resolved, grant_written, record_id, replayed, reject_code, … |
| `POST …/empty` → `EmptyConfirmed \| EmptyHasParts` (preview) | not called yet | | | |

**Requests against v1:**
- `HumanTaskActRequest` now declares `page` (and `extra="allow"`).
- `IngestEmptyRequest` is `{decision: confirmed_no_parts|has_parts, page?}`, `extra="forbid"`.
- The `/ingest` form takes `leaf`.
- Cortex sends nothing undeclared to any v1 route.

**The enums v1 already gives**, each of which retires a cortex hand list (§4):
- `leaf` and `leaf_source`;
- `EvidenceRef.units` and `quality`;
- `Notice.mfr_source`;
- `IngestEmptyRequest.decision`;
- `HumanTaskActRequest.reason_code` (the four reject codes);
- `RetryFiled.task_status`.

`stage`, `kind` and `failure.reason_code` stay plain `string`. For `stage`, that is deliberate (v1 §7).

## 2. Per route: what is sent, what is read, what refusals are read

**Vocabulary.**
- **validated:** the reader refuses or nulls on a wrong type or value.
- **passthru:** a type or non-blank check only.
- **3-state:** absent, null and a value are kept distinct.

Fields marked **unread** are typed or parsed but consumed by nothing.

### 2.1 Ingest: the routes ingest-v1 must cover

**`POST /ingest`** (multipart; the `Content-Type: multipart/form-data` header is load-bearing, P0 10-08)
- **Sent:**
  - `file`;
  - `kind`, one of pdf|cad|xml; the composer refuses cad client-side;
  - `on_behalf_of`, the `authz_id` from `/me/entitlements`;
  - `content_kind`, always equal to `kind`.
  - Since `e0c3c6d` (PR #29) it adds `leaf` (pcn|pdn) only on a PDF drop answered PCN/PDN; it is never sent blank.
- **Read, new drop:** `ingest_id`, a non-empty string (opaque, `sha256:<hex>` or a uuid).
- **Read, duplicate:** `duplicate.message` and `duplicate.of_ingest_id`. On a duplicate, `ingest_id` and `stage` are deliberately not read.
- **Unread:** `stage`, `detail`, `object_prefix`.
- **Refusals** go through `readIngestRefusal`, for any 4xx with a readable `detail`:
  - the message comes from a string, `.message`, `.error`, or the FastAPI array `detail[].msg`;
  - `detail.error` becomes the code; `detail.registered[]` is drawn too.
  - Named in comments: 400 `kind_unregistered`, 400 `content_kind_required`, 403, 413 and 422. PR #29 added `leaf_unknown`, `leaf_requires_pdf` and `leaf_conflicts_with_content_kind`.

**`GET /ingest/{id}/status`** goes through `readIngestStatusRow` (`src/lib/ingestWire.ts:474`). **A null return refuses the whole row.**
- **Required and validated** (any failure nulls the row):
  - `ingest_id` and `sha256`, both non-empty;
  - `kind`, in `INGEST_KINDS`;
  - `stage`: null, or a value in `INGEST_STAGES`, or one of `awaiting_origin|review_rejected|awaiting_kind`, or `case_opened` on an event row;
  - `created_at` and `updated_at`, epoch ms numbers (strings are refused);
  - `duplicate`: null, or `{of_ingest_id, message}`.
- **Cross-rules:**
  - `stage: null` requires a `duplicate`;
  - `detail` is required for `rejected`, `failed` and `review_rejected`.
- **Optional:**
  - `detail`, passthru;
  - `case_id`, on event rows only; a value of `""` refuses the row;
  - `origin` (`ingestOrigin.ts:85`, cortex-proposed): `status` (resolved|unresolved), `document_type`, `owner_domain`, `program`, `evidence_label`, `steward_task_id`, and `evidence[]{source, excerpt?}`.
- **3-state optionals**, omitted from the parsed row unless valid:
  - `leaf`, `leaf_source` and `corrected_by`, as a pair rule;
  - `leaf_candidates[]`: 1..3 items of `{leaf, score 0..1, evidence_ref{page, bbox|null, note?}}`. One bad item voids all;
  - `extraction_defect`: `{task_id, edits}` or null;
  - `review_task_id`, `task_id`, `superseded_task_id`, `notice_id` and `content_kind`;
  - `failure`: `{reason, reason_code, step, run_id, pin_digest, failed_at}`;
  - `attempt`, an integer ≥ 1.
- **Unread:** `object_prefix`. `review_task_id` is parsed and read by nothing.
- **Refusals:** 404 only (`isIngestNotFoundError`), deliberately read as "not found or not yours". Any other error is retried on the next tick.
- **Consumers:**
  - the rail's single poller, `useIngestStatusStore.pollDue`, every 2 s; a `failed`+`timeout` row is re-read every 30 s, and the poller stops on `ingestPollingDone`;
  - the retry-409 re-read;
  - the readers `IngestStatusCard`, `IngestLeafChip`, `IngestFailureExtras`, `ingestArtifact.ts:95-110` and `AnswersPanel.tsx:663`.

**`GET /ingest/mine`**
- **Sent:** `limit=50`, and `before=<next>` from page 2 on. It follows up to 10 pages; a repeated cursor stops the walk.
- **Read:** `items[]`, each through `readIngestStatusRow` (unreadable items are counted and dropped), and `next`. No `total` is read.
- **Refusals:** none by code. Any failure on page 1 sets `mine: "failed"`, the pre-191 fallback.

**`POST /ingest/{id}/retry`**
- **Sent:** no body. The producer declares an optional `IngestRetryRequest{pin_digest}`, which cortex never sends.
- **Read:** `attempt` only (inline cast). The row is then set locally to `received`.
- **Refusals** (`readIngestRetryRefusal`): 409 `not_failed` triggers a re-read; any 403 gives "can't be retried from here" (comment: `retry_is_pin_driven`).

**`GET /ingest/{id}/extraction`** goes through `readExtraction` (`promotionReview.ts:245`).
- **Rows:**
  - `rows[]`; a row with no non-blank `mpn` is dropped and counted;
  - per row: `row_index`, `part_index`, `field`, `extracted_value`, `obtained_via`, `needs_review` and `review_reason`;
  - `evidence_ref`, 3-state: `page`, `bbox` (null means page-only), `page_dims{width,height}` (absent means the bbox is in page fractions), and `units` (carried, unused).
- **Top level:**
  - `notice_id`, `attempt`, `part_count` and `rows_without_evidence`;
  - `notice.mfr`, `notice.mfr_source` (header|identity) and `notice.notice_date`;
  - `leaf`, `leaf_source` and `corrected_by`.
- **Cross-checks:** `part_count` against the distinct `part_index`, and `rows_without_evidence` against the rows with no evidence.
- **Refusals** go through `reviewRouteFailure`, by status, with `detail.error` shown:
  - a plain 404 reads "route not served here yet", stale text (§6);
  - 403 reads "not entitled".
  - Named, not branched on: `ingest_not_found`, `not_entitled`, `no_extraction_ref`, `extraction_rows_absent`, `extraction_unbound`, `extraction_unreadable` and `artifact_store_unreachable`.

**`GET /ingest/{id}/source`**
- **Read:** body bytes as an arraybuffer, handed to pdf.js; `content-type` and `status` are kept for the error text. The bytes are sniffed by magic number to name what came back.
- **Refusals:** as for `/extraction`. Named: `source_absent`, `source_unbound`, `artifact_store_unreachable`.

**`POST /ingest/{id}/leaf`**
- **Sent:** `{leaf: "pcn"|"pdn"}`.
- **Read:** a status row (through `readIngestStatusRow`), giving `leaf`, `leaf_source`, `corrected_by`, `stage`, `task_id` and `superseded_task_id`. `attempt` is unread.
- **Refusals** (`readActRefusal`: needs `detail.error` and `detail.message`): `unknown_leaf`, `no_leaf_for_kind`, `leaf_not_changeable`.

**`POST /ingest/{id}/origin/dispute`** (**absent on both shas**)
- **Sent:** `{on_behalf_of}`.
- **Read:** `steward_task_id`, passthru.
- **Refusals:** 404/405 reads "This server does not accept origin disputes yet."

### 2.2 Export (behind `canvasExport`, off)

**`GET /export/package/recipients`**
- **Read:** `recipients[]{value, label}`. One bad item voids the list.

**`POST /export/package`**
- **Sent:** `{answers:[{artifact_id}], recipient_scope}`. `template_id` is declared and never sent.
- **Read:**
  - `export_id`, `recipient_scope`, `status` (producing|exists|failed|partial);
  - `documents[]{engine, answers[], status, export_id, recipient_scope, artifact_uri?, artifact_sha256?, artifact_bytes?, artifact_filename?, algorithm_sha?, reason?, reason_code?, outcome?, template_id?, lots_disclosed[]?, sections[]?}`;
  - the same artifact and outcome optionals at the top level.
  - **Unread:** the top-level `reason_code` and `template_id`.
- **Refusals:** 409 `detail.reason=recipient_required` with `detail.options[]`; 403 with `detail.recipient_scope`.

**`GET /export/package/artifact/{filename}`**
- **Read:** a blob. The URI must start `/export/package/artifact/`.

### 2.3 Tasks, governance, cases

**`GET /me/entitlements`**
- **Read:** `cells[]{persona, domain}`, `default`, `authz_id` (3-state: absent falls back to the OIDC email), `email`.
- **Unread:** `user_id`, `source`.

**`GET /me/human_tasks`**
- **Read:** `tasks[]`, with `id` and `task_id` required, plus `workflow_id`, `audience`, `kind`, `status` (cast, not validated), `title`, `summary`, `requested_by`, `subject_ref`, `created_at`, `payload` (an object or a JSON string) and `declaration` (only if the key is present).
- **Unread:** the top-level `email`.
- **`payload` sub-fields** are read per card: `ingest_id`, `notice_id`, `mfr`, `notice_date`, `attempt`, `part_count`, `dropped_by`, `suggestion`, `evidence`, `warnings`, `reason_code` and `pages`. **`review_shape` is read by nothing.**

**Electric `human_task_projection`** (row 20)
- **Read:** the same columns as `/me/human_tasks`, minus `declaration`. `payload` arrives as a JSON string.
- An Electric upsert **replaces** a REST-seeded row, so `declaration` is lost on live rows, and the card falls back to `/task_kinds`.
- `must-refetch` is not handled.

**`POST /human_tasks/{task_id}/act`**
- **Always sent:** `{decision, comment}`.
- **Conditional:**
  - `overrides{[mpn]:{disposition, reason}}`, when non-empty;
  - `row_edits{deleted, added, corrected}`, only on approved|promoted when non-empty;
  - `reason_code` (the four), only on `rejected`, and only from `GroupedReviewTable`;
  - `header_edits[{field: mfr|notice_id|notice_date, value, evidence_ref, reason}]`, only on `promoted`.
- **Never sent:** `on_behalf_of` (declared).
- **A by-design reading:** the `document_promotion` reject carries its code **as the comment** (`<code>` or `<code>: <note>`), which is
  the producer's own rule (`tests/test_a_promotion_reject_names_one_of_four_codes.py`).
- **Not in `buildActBody`:** `page`. Without it, 208's `has_parts` cannot be sent.
- **Read:** `workflow_resumed`, `extraction_defect`, `row_edits.{corrected,added,deleted,header}`, and, in `GroupedReviewTable`, `accepted`, `reason`, `resolved_count` and `review_dispatched`.
- **Unread:** `task_id`, `decision`, `rows_resolved`, `status`, `corrections`.
- **Refusals:**
  - 422 `invalid_decision_for_kind` with `detail.allowed[]` is adopted as the verb menu;
  - 409 `task_already_resolved` (`detail.decision`, `acted_by`, `acted_at`);
  - `row_edits_invalid` (`detail.problems[]`), `row_edits_not_for_kind`, `reason_code_required` (`detail.codes[]`), `stale_extraction` (`detail.new_task_id`), `task_unresumable`, `workflow_resume_failed`, `ingest_node_absent`, `promotion_store_unavailable`;
  - FastAPI `detail[].loc/msg`.

**`POST /access_requests`**
- **Sent:** `{asset, reason, domain?}`.
- **Read:** `request_id`.
- **Unread:** `status`, `approvers`.

**`GET /reviews/{workflow_id}/batch`**
- **Read:** `batch_id`, used as the act task id, `notice_id`, `notice_type` (PCN|PDN), `extraction_warnings`, and `items[]{mpn, needs_review, proposed_disposition, replacement_mpn, ltb_date, subject}`. All are unvalidated casts.
- **Unread:** `notice_fingerprint`, `approver`.

**`GET /notices/{notice_id}/provenance`**
- **Read:** `items[]{mpn, field_path, value, source_snippet, page_number, bboxes, page_dims, region, match_method, match_confidence, crop_url, page_image_url}` and the top-level `page_image_url`. All are unvalidated casts.

**`GET /task_kinds`**
- **Read:** `composed === true`, then `kinds{}`, where each entry's `kind` must equal its key. Each entry gives `declared` (required boolean), `archetype`, `badge`, `title`, `accepts[]` and `reason_required[]`.
- **The canvas archetype** still comes from the hand table `REGISTRY` and not from the served `archetype` (§4).

**`GET /cases/{case_id}`** (raw fetch)
- **Read:**
  - `subject_ref`;
  - `instances[]{workflow_id, status, current_stage, definition{id, name, domain_stages, participants, steps[{id, kind}]}}`;
  - `history[]`, `options[]`, `approvals[]{workflow_id, step_id, status}`, `output_artifact`.
- **Refusals:** 404 → `not_found`; 503 → `runner_unavailable`; any other status → `http_<status>`. The error body is not read.

### 2.4 Interview, canvas, plan, system

**`POST /interview/stream`** (SSE)
- **Sent:** `frontend_id`, `frontend_version?` (flag), `message`, `session_id`, `current_graph_json?`, `artifact_id?`, `active_persona?`,
  `active_domains?`, `bound_slots?`, `spoken_slot?`, `spoken_answer?`, `answering_artifact_id?`. The field names are sealed against
  gateway.py. `seed_panel` is declared and never sent.
- **Read, per event:**
  - `context_update{type, data[]}`;
  - `final_payload`/`ui_payload` (a production no-op: Electric owns it);
  - `chat_message.content`;
  - `stream_end`;
  - `pipeline_stage{kind, status, elapsed_ms}`;
  - `pipeline_error{kind, message}`;
  - `route_decision` (no-op);
  - `sources{sources[]{uri, mpn, obtained_via, ingest_id, dropped_by, promoted_by}, provenance_floor}`, the one production write;
  - `graph_trace` (no-op);
  - `access_denied{denied_assets, subject, domain, message}`.

  Any other event name is dropped.
- **Refusals:** a non-2xx or wrong content-type is a generic stream error; a 401 alerts and redirects.

**Plan routes**
- **`GET /plan/state_version`:** sends `state_ref?`; reads `state_version`.
- **`POST /plan/scenario`:** sends `{scenario_id, name}`; reads nothing; a 409 is swallowed.
- **`POST /plan/scenario/{id}/reschedule`:** sends `{project_id, start, end}`; reads `version` and `ops[]`.

**Canvas persistence**
- **`GET /me/canvases`:** reads `canvases[]`, stored verbatim.
- **`PUT /me/canvases`:** sends `{canvases}`.

**`POST /canvas/lineage_edges`**
- **Sent:** `{subjects:[{answer_id, urn}]}`.
- **Read:** `edges[]{from, to}`.

**`GET /mesh/config`**
- **Read:** `personas{key:{label, icon, color, bg}}`.

**`POST /decision_subgraph`** (typed)
- **Sent:** `{class_uris, verb_iris?, subject_uri?}`.
- **Read:** `available`, `reason`, `live_nodes[].uri`, `ancestor_chain`, `context_nodes[].uri`. Every one is declared by `DecisionSubgraphResponse`.
- **Unread:** `live_edges`.

**`POST /register_frontend_capabilities`** (typed)
- **Sent:** `{frontend_id, frontend_version, capabilities[]}`.
- **Read:** `accepted`, `frontend_id`, `unchanged`, all declared.
- **Unread:** **`rejected`** (declared). Cortex detects a partial accept only by `accepted !== sent.length`.

**Health, version, templates**
- **`GET /health`:** reads the status only.
- **`GET /fleet/version`:** reads `self.git_sha`.
- **`GET /templates`:** reads `composed === true`, `templates[]{template_id, title, description, template_ref, panels, shared_slots[]}` and `unreadable[]{template_id, reason}`.

**Media and graph**
- **`GET /data_module/figures`:** reads `figures[]{uri, label, url, rendering_origin}`. There are two sites with duplicated local interfaces, and they disagree on whether `url` is nullable.
- **`GET /graph/node/{id}`:** dereferences nothing; the JSON is printed raw.
- **`GET /federated_image`:** reads a blob; 403 means "not entitled".

**Electric `answer_artifact_projection`** (row 21)
- **Read:** `id`, `status` and `durability_status` (all required), plus `created_at`, `updated_at`, `valid_as_of`, `watermark`, `valid_until`,
  `duration_ms`, `question_text`, `summary`, `message_id`, `resolved_intent`, `rendered_output`, `produced_by`, `produced_for`, `routing`,
  `sources`, `graph_trace`, `graph_trace_alternates`, `derived_from_artifact_id`.
- **Messages:** `must-refetch` resets the stream.

## 3. Producer routes cortex does not call (platform master)

- **Possible derivation sources for §4:** `PUT /ingest/processable-kinds` (a writer; there is no GET), `GET /ingest/retries`, `POST /ingest/{id}/stage`.
- **New on master:** `POST /ingest/{id}/title_leaf`.
- **Answers (PR #28 work, not on cortex master):** `GET /answers`, `/answers/{id}/body|archive|unarchive`.
- **Others:**
  - `GET /artifacts/{id}`, which is typed;
  - `/bpmn/catalog`, `/bpmn/save`, `/compile`, `/orchestrate`;
  - `/cases/{id}/action`, `/cases/{id}/signals/{signal}`;
  - `/instances_by_property`, `/node_details/{id}`;
  - `/plan/baseline/op`, `/plan/measure/{fn}`, `/plan/scenario/{id}/commit|op`;
  - `POST /reviews`, `/seed/portfolio_canvas`, `/triage_tasks`, `GET /version`, `POST /ingest/events`.
- **Internal:** the `/internal/*` routes, six of them.

## 4. Hand-kept registries

| registry | where | values | sealed? | to become |
|---|---|---|---|---|
| `INGEST_KINDS` | `ingestWire.ts:141` | pdf, cad, xml, event | ✓ `ingestKindStatusParity.test.ts` vs `ingest_status.KINDS` | an OpenAPI enum, once the status response is typed |
| `INGEST_UPLOAD_KINDS` | `ingestWire.ts:149` | pdf, cad, xml | ✓ same test, vs `FILE_KINDS` | an enum on `POST /ingest` `kind` |
| `INGEST_STAGES` | `ingestWire.ts:178` | received, extracting, review, promoted, rejected, failed | ✓ same test, vs `STAGES` | stays a string in v1 by design (§7 of ingest-v1: unknown means "not finished"); keep the parity seal, and stop refusing unknowns |
| duplicate, case_opened | `ingestWire.ts:190,197` | | ✓ same test | an enum |
| **out-of-band statuses** | `ingestWire.ts:203-227` | awaiting_origin, review_rejected, awaiting_kind | **✗**, but all three are in master's `ALL_STATUSES` | seal now vs `ALL_STATUSES − STAGES − {duplicate, case_opened}`; 208's `no_parts` then reds it until added |
| **`INGEST_LEAVES`** | `ingestWire.ts:237` | pcn, pdn | **✗** | **v1 `StatusBody.leaf` enum (pcn, pdn)**: derive from the snapshot |
| **`INGEST_LEAF_SOURCES`** | `ingestWire.ts:242` | declared, title, corrected | **✗** | **v1 `StatusBody.leaf_source` enum**: derive from the snapshot |
| `INGEST_KIND_NOT_YET_ACCEPTED_REASON` | `ingestWire.ts:160` | {cad} | cortex policy | delete when 7f's cad row is live |
| `INGEST_FAILURE_TIMEOUT`, `…_KIND_UNREGISTERED` | `ingestWire.ts:394` | timeout, kind_unregistered | **✗** | a `reason_code` enum (the field is open today) |
| `LOCKED_STAGES` (leaf chip) | `IngestLeafChip.tsx` | promoted, rejected, review_rejected | **✗**, a copy of the server's `leaf_not_changeable` rule | a server-sent `leaf_changeable` on the row |
| reject codes | `promotionReview.ts:183`, `GroupedReviewTable.tsx:81` | not_a_notice, unreadable, parts_unusable, duplicate | ✓ `rowEditsWireParity.test.ts` vs `PROMOTION_REJECT_CODES` | **v1 `HumanTaskActRequest.reason_code` enum**: derive from the snapshot |
| `HeaderEdit.field` | `client.ts` | mfr, notice_id, notice_date | ✓ `rowEditsWireParity.test.ts` | an enum |
| `mfr_source` | `promotionReview.ts` | header, identity | ✓ same test | **v1 `Notice.mfr_source` enum**: derive from the snapshot |
| task-kind `REGISTRY` (archetype + badge) | `taskKindRegistry.ts` | grouped_review, pcn_disposition, access_request, workflow_ack, extraction_refusal | ✓ `taskKindParity.test.tsx` (YAML) | `/task_kinds`' served `archetype`, which cortex already receives and ignores |
| fallback verbs | `IngestStatusCard.tsx:87`, `useTaskAct` | promoted/rejected; approved/rejected | **✗** | delete once `/task_kinds` is guaranteed |
| `HumanTask.status` | `useHumanTaskStore.ts:27` | 6 values, type only | **✗** | an enum |
| export statuses | `canvasExport.ts` | producing, exists, failed, partial | **✗** | an enum |
| SSE event names | `client.ts:335-408` and 2 copies | 11 events | **✗** (three hand copies) | one table; the stream has no OpenAPI, so it needs a producer-side list |
| `PipelineStageKind` | `types.ts:55` and 3 copies | understanding … composing | **✗** | an enum |
| `CORTEX_UI_CAPABILITIES` | `src/registry/` | the menu cortex SENDS | cortex is the origin | stays (this is cortex's declaration) |
| `OBTAINED_VIA` / provenance rungs | `ingestWire.ts:61` | direct, etl, warehouse, manual-export, user-drop | **✗**, and 1 behind the pin (`steward-corrected`), 2 behind SDK 0.9.11 (`steward-entered`) | seal now vs `src/iagent/provenance.py`; an unknown rung nulls the floor label |
| `METHOD_TONE` | `EvidenceCard.tsx:48` | unique, region_preferred, ambiguous, not_found | **✗** | an enum on the provenance response |

## 5. What today's build does with 208

This is measured on master `0288915`, and answers Lane 1's question in `2026-10-23-packet-from-lane-01-208-…`.

- **`review_shape`:** read by nothing in `src/`, so any value is invisible.
  - A `document_promotion` task with `review_shape: "empty"` draws as an ordinary promotion card: "The extraction has no rows.",
    with Promote and Reject.
- **Kind `document_empty_confirm`:** draws as a generic TASK card with **no buttons**, blocked twice:
  - if `/task_kinds` does not declare it, it is undeclared;
  - if it does, the audience `document_promotion:<D>` contradicts the kind (`audienceKindContradiction`), and that check
    wins over every other state.
  - `payload.source` and `payload.account` are not drawn.
  - The rail card never attaches the task, because it looks only for `kind === "document_promotion"`.
- **Stage `no_parts`:** refused whole by `readIngestStatusRow`.
  - **Poller and card:** both keep the last row, so the drop sits at "review" and is re-polled indefinitely.
  - **On reload:** `/ingest/mine` drops it into an `unreadable` count that nothing displays, so the drop is gone from the rail.
- **The doors:** `buildActBody` has no `page`, and there is no client function for `POST /ingest/{id}/empty`.

**Roll order:** cortex's card and the `no_parts` stage must land before (or with) 208's BFF.

## 6. Dead or suspect paths, to go in item 4

| path | evidence | plan |
|---|---|---|
| `POST /artifacts/reevaluate` (`requestReevaluation`, `useLiveViewRefresh.ts:103`) | the route is absent on both shas; it fires on every plan-version change, and a 404 is swallowed | ask the producer: it is unbuilt, so delete the call; or is it named differently? — **deleted in this PR** |
| `POST /analyze` (`publishToSuperset`) | absent on both shas; every error toasts "Analyst Service unreachable" | ask; if unbuilt, remove the Publish button — **deleted in this PR** |
| `POST /ingest/{id}/origin/dispute`, `origin` on the row, `ingestOrigin.ts` | cortex-proposed and never built (`/internal/origin/write` exists; the public dispute route does not) | ingest-v1 states whether `origin` is on the row; if not, delete — **deleted in this PR** |
| `/workflow/compile`, `useCompileWorkflow`, `CompileButton`, `CompilationOverlay`, `useMockWorkflowBuilder`, `WorkflowCanvas`, `BPMN*` types | the interview phase starts `active`, and only these components enter blueprint/compiling | delete — **deleted in this PR** |
| `/canvas/seed`, `seedPortfolioCanvas.ts` window global | only `window.__cortexSeedPortfolioCanvas`; its header says "Remove when the phrase routes end to end" | delete — **deleted in this PR** |
| `IngestStatusCard` self-poll (:303-352), `initialRow`, `pollIntervalMs`, the non-store retry branch | the only live mount (`IngestEntryBody.tsx:58`) passes `fromStore` | delete, and move the tests to the store path — **deleted in this PR** |
| `mine: "failed"` and the "fleet before 191" fallback, `myDrops.ts` as an id source | pre-191 | delete the fallback, and keep `myDrops` for the **filename** only (the status row does not carry it); ask ingest-v1 for `filename` — **deleted in this PR** |
| suggestion-flow orphans: `KindPicker.suggestedKind`/`suggestionValid`, the `origin_suggestion` fixtures | `IngestKindSuggestion` was deleted in `8eed1c5` | delete — **deleted in this PR** |
| stale text: "route not served here yet (lands with 193)" (`promotionReview.ts:448`), "NOT LIVE until 193" (`ingestWire.ts:659`) | 193 has rolled | reword — **deleted in this PR** |
| `/health` | gates nothing (`isConnected` is hard-coded true) | keep or delete; it is not load-bearing |
| `/graph/node/{id}` | dereferences nothing; prints raw JSON | keep (a debug pane), and type it as `unknown` |
| duplicated `Figure` interfaces (`InlineFigures`, `FiguresSlideIn`) | they disagree on `url`'s nullability | one reader, in the client module |
| typed-but-unread fields | `review_task_id`, `email`, `user_id`, `source`, `rows_resolved`, `status`, `approvers`, `notice_fingerprint`, `live_edges`, `ServiceVersion.*` minus `git_sha` | drop them from cortex's types; the generated types carry what the producer declares |

## 7. Asks for ingest-v1 (Lane 1) and the producer

ingest-v1 (`1fb9e242`) already answers most of what this section first asked: response models on the ingest routes,
the leaf enums, `mfr_source`, the reject-code enum, and `page` on the act body. What is left:

1. **Which sha does cortex pin for the response seal?** Cortex will generate types from `docs/api/ingest-v1.openapi.json`
   and seal its reads against it, exactly at the pinned producer sha. That file exists only on `lane/01-ingest-v1`. Cortex
   pins it as a reviewed snapshot until it merges, then moves `PRODUCER_REF` to the merge. Is `1fb9e242` the right sha to
   snapshot, or is there a later one?
2. **`extraction_defect` on the status row.** Cortex reads `{task_id, edits} | null` there, from the 10-11 packet (rev 188),
   to show "a steward corrected this drop". v1's `StatusBody` does not declare it. Was it dropped, or never built? If it was
   dropped, cortex deletes the reader and the rail's "corrected" line.
3. **`origin` on the status row.** It is not declared; v1 has `origin_suggestion`. Cortex will delete `ingestOrigin.ts`, the
   dispute button and `disputeIngestOrigin`, unless you say otherwise.
4. **The four nullables cortex treats as required:** `sha256`, `kind`, `created_at`, `updated_at`. When is each null on a
   row a dropper can read? Cortex will stop refusing the row on them either way, but it needs to know what to draw.
5. **The rest of the routes cortex calls** (§1 rows 9–41 outside v1) have no response model. `/task_kinds`, `/cases/{id}`,
   `/reviews/{id}/batch` and `/notices/{id}/provenance` matter most, because a card's verbs or evidence come from each. Do
   they enter v1, or a sibling contract?
6. **Rule on the three absent routes** (§6, first three rows): built elsewhere, renamed, or dead.
7. **Declare `table`** on `/electric/shape`, or rule that the proxy is exempt from the request seal. `/electric/shape` and
   `/interview/stream` have no OpenAPI response by nature, and need a producer-side list (columns; event names) that a test
   can read.
8. **`ActPromotion.row_edits` is a bare `object`.** Cortex reads `corrected`, `added`, `deleted` and `header` counts from it.
   Please give it a model.

## How this was produced

- **Inventory:** three read-only surveys of `src/` (ingest and export; tasks and governance; interview, canvas and system). They
  were checked against a census of every route literal in non-test `src/`, which added `/me/entitlements`.
- **OpenAPI:** dumped from the two image digests above. ingest-v1 was read from `git show 1fb9e242:docs/api/ingest-v1.openapi.json`
  and `ingest-v1.md`.
- **The join:** a node script over both dumps gave presence, declared params and body fields, and the 2xx schema.
- **Request field lists:** read from the producer's request models and compared with the bodies cortex builds.
- **Spot checks:** `readIngestStatusRow`'s unknown-stage branch, its four callers, the `no_parts` keep-last, and the reject
  code-as-comment rule.
