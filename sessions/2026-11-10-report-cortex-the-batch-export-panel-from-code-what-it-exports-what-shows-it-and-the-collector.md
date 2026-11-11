# 2026-11-10: the batch export panel, from code. What it exports, what shows it, where its columns come from, and the collector

**Dispatch (the architect, via Chris):** "report from code on the bulk export panel shown above the answers list on
0.4.84. Change nothing yet." Four questions:
1. what it exports;
2. what decides whether it shows;
3. where its columns come from;
4. whether the answer collector still exists, and what "export selected as a table" would take.

Nothing was changed. Cortex is read at `8e32f5b` (0.4.84). Every file named here is identical at `90b7c13` (0.4.85)
and at HEAD (`git diff --stat 8e32f5b HEAD` over them is empty). The producer is read at the pin
`4f2dac35fa108c6904e7762b2b9dc644e14be40d`, from git objects, not the working tree.

## Short answers

1. **It exports ingested notices, not answers.** It takes every notice promoted in a date range, through one
   server-side profile, as CSV or JSON. It has no "one kind" filter and no "selected" mode.
2. **It shows when the `reviewExport` flag is on AND `/me/entitlements` lists `ingest:exportBatch`.** It does not
   depend on any kind being present or any data being in range. Sandbox's `VITE_FEATURES` has no `reviewExport`,
   so the panel never mounts there.
3. **The server's export-profile rows (`policy/exports/*.yaml`) supply the columns.** The UI writes none, and the
   content-kind row declares none.
4. **The collector exists.** It is the stage's lasso selection and its action bar. Exporting a selection has no
   server route that fits as it stands: the one that takes answer ids is recipient-scoped, and its columns are
   declared per recipient profile, not per kind.

## 1. What it exports

The panel is `src/components/ingest/BatchExportPanel.tsx`. `AnswersPanel.tsx:374-375` mounts it once, above the
list. The button calls `GET /ingest/export?profile=&from=&to=` (`reviewExport.ts` `EXPORT_BATCH_PATH`, which the
`downloadBatchExport` function in `api/client.ts` calls).

**Which records.** The producer route is `ingest_export_batch_route` in invincible-agent `src/iagent/gateway.py`
at `4f2dac35`.
- It takes every ingest **promoted** in `[from, to]`. The range is in UTC days with both ends included, measured
  by the decision record's `acted_at` (`PgDecisionLedger.promoted_between`).
- **Domain-scoped:** only notices whose promotion domain is one of the caller's entitlement-cell domains are
  included. A caller with no cells gets an empty file.
- **Limits:** at most 92 days and 500 notices. Past either limit the route refuses with 422
  `export_range_too_large`.
- **All or nothing.** If any notice in the set cannot be exported, the whole export is refused 422
  `export_notice_unreadable` and names that `ingest_id`. The causes:
  - the notice is missing, or not promoted;
  - it was promoted with steward corrections (`export_corrections_not_applied`);
  - its extraction is refused;
  - it is an event-kind ingest (404, which surfaces as the 422).
- The route has no kind filter. It assumes everything promoted is a notice with an extraction. I verified only the
  event-kind arm above. I did not trace what a promoted non-notice kind (for example `s1000d-data-module`) does in
  `render_rows`.
- **No selection.** The UI sends a profile and two dates, nothing else. Answers (chat artifacts) are not part of
  this export at all.

**Which columns and format.** The **profile** the user picks decides both.
- The profile list comes from `GET /ingest/export/profiles`. Its rows are `{name, format, granularity, label}`.
- The two profiles served at `4f2dac35`:

  | profile | format | granularity | columns |
  |---|---|---|---|
  | `default-csv` | csv | `notice_part` (one row per notice part, plus a `no_parts` row) | 13: Ingest, Notice, Leaf, Manufacturer, Manufacturer source, Notice date, Part, Affected MPN, Replacement MPN, LTB date, `notice_date_ambiguous`, `ltb_date_ambiguous`, `no_parts` |
  | `default-json` | json | `notice_part` | 19: the same, plus "obtained via" and "evidence" for each of Affected MPN, Replacement MPN and LTB date |

- The file is named by the server's `Content-Disposition`: `ingest-export.<profile>.<from>_<to>.<format>`. The UI
  falls back to `<from>_<to>.<profile>.<format>`.

**One gap the panel has today.** The route also checks `can_export:<profile>`, which is **deny by default**.
`GET /ingest/export/profiles` lists every valid profile to any authenticated caller. So the picker can offer a
profile the caller will be refused at download (403 `not_entitled_to_export`, drawn as "Refused (403): …"). The
panel does not filter profiles by that capability, because `/me/entitlements` is the only place it could read
that from, and the panel does not look for `can_export:*` there.

## 2. What decides whether it shows

`BatchExportPanel` returns `null` unless **both** of these hold:

1. **The flag.** `isFeatureEnabled("reviewExport")` is true (`src/lib/reviewExportFlag.ts`). That is the case when:
   - `reviewExport` is in `VITE_FEATURES`, which the chart's env map sets and `docker-entrypoint.sh` injects at
     container start; or
   - one browser has `localStorage["cortex.reviewExport"] === "1"`, which is a per-browser override only.
2. **The capability.** `canExportBatch(await fetchEntitlements())` is true. That means the `capabilities` list on
   `GET /me/entitlements` contains `"ingest:exportBatch"` (`reviewExport.ts` `EXPORT_BATCH_CAPABILITY`, served
   since invincible-agent `c3b51ed7`, #290).
   - A failed entitlements read, or a body without `capabilities`, means the panel is hidden.
   - The profile list must also load. A failed profile read hides the panel too.

**Not conditions:** whether any data is in range, and whether any kind is present. With zero profiles, the panel
still shows and says "No export profiles are configured."

**Sandbox:** `helm/invincible-agent/values-sandbox.yaml:1081` sets
`VITE_FEATURES: "canvasExport,ingest,promotionRuns"`. There is no `reviewExport`, so the panel returns `null`
before it reads entitlements.

**At work:** that deployment's values are in no repo I can read. Whether the panel shows there through the real
flag and capability, or through `reviewExportMock`, I cannot say from code.
- **The mock matters.** `reviewExportMock` substitutes a fixture entitlements body that holds the capability. It
  also makes **downloads synthetic**: every cell reads `synthetic <column>`.
- **To settle it:** one line of work's `VITE_FEATURES` from `helm get values`. If it contains `reviewExportMock`,
  the files exported at work are not real.

The comment at `AnswersPanel.tsx:374` still says "AP group". That is stale: the gate has been the capability since
#290 (capability, never group). It is comment-only, and I have left it for the redesign beat.

## 3. Where the columns come from

**The server's export profile rows. The UI writes none, and the content-kind row declares none.**
- The columns are `columns[].output` in `policy/exports/<name>.yaml`. invincible-agent
  `src/iagent/export_profiles.py` loads them. The vocabulary is doc-tools 7f's `batch-column-map.md`
  (`source: {field, row_field, absent_row}`, `on_unresolvable` / `landing`, `format: iso8601`).
- **The UI never sees the live columns.** `GET /ingest/export/profiles` serves only
  `{name, format, granularity, label}`. The columns exist only in the file the server writes.
- The only columns spelled in cortex are `FIXTURE_154_COLUMNS` in `src/lib/reviewExport.ts`. They are used only
  for the `reviewExportMock` synthetic file, and `reviewExport154.test.ts` checks them against the producer's
  profiles.
- **The content-kind row has no column field.** `policy/overlays/openddil-lab/content_kinds/pcn.yaml` carries
  `kind, domain, review_shape, passes, outputs`.
- **No profile is tied to a kind.** A review-export profile names a `granularity` (`notice_part`), not a kind. It
  applies to whatever is promoted in the range.

A second, separate profile language already declares columns for **answers**:
- It lives in `policy/exports/answers/*.yaml` (fin's directory; loader `agent_fleet/utils/answer_exports.py`;
  sample `plan-answers.yaml`).
- Each row declares `kinds`, an explicit list of verb IRIs, and `columns` drawn from a closed set of answer
  fields: `answer_id, question, summary, verb, subject, program, status, valid_as_of`.
- Its granularity is closed to `answer`, so it writes one row per answer.
- It is keyed by **recipient**, not by kind. A scope appears in at most one profile, and the profile lists the
  kinds that recipient takes.
- `policy/export_profile_sources.yaml` registers three such sources: `review-export`, `answer-export` and
  `fin-cdrl`.

## 4. The collector, and "export selected as a table"

**It exists.** It is the lasso multi-select on the global stage (`c57554d`, "Stage 4 — lasso multi-select + action
bar").
- **The state** is `GlobalCanvasStage.tsx:155`, `const [sel, setSel] = useState<string[]>([])`. It holds the ids
  of the lasso'd stage cards.
- **The tray** is `GlobalCanvasStage.tsx:888-927`, the selection action bar. It floats at `bottom-20`, above the
  canvas dock (`DockBar`), and reads "N selected → Add to [canvas …] [+ New] [×]".
- **When it shows:** `isGlobal && !focusId && !marquee && sel.length > 0`. That means the global stage, with no
  card focused and no lasso being dragged.
- **Its destinations:** each existing canvas (`addItemAuto(c.id, id)` for every id) and a new canvas
  (`createCanvas` and then the same). Each one clears the selection.
- **What it is not.** It is not above the prompt itself. The prompt (`InputBar`) is in the stream pane
  (`NeuralStream.tsx:30`), and the tray is on the stage beside it. The answers list has no multi-select of its own:
  a row drags one answer at a time (`AnswerChitGhost`).
- **The selection is mixed.** The lasso picks every card on the stage, including task cards (`TASK_ARTIFACT_PREFIX`)
  and ingest cards (`INGEST_ARTIFACT_PREFIX`). `canvasAnswerIds` in `src/lib/canvasExport.ts` already separates
  answers from those cards for the canvas export.

**What "export selected as a table" would take.**

- **Cortex side (small).** Add one more destination button to the action bar, next to "Add to".
  - It sends the selected answer ids, reusing `canvasAnswerIds`, and saves the returned file with `saveBlob`.
  - It is gated like the other exports: a flag plus a served capability.
  - It inherits the bar's show-condition: global stage, no focused card. Unlike the other destinations, it needs no
    canvas and places nothing.
  - It should not draw a column picker or name a column. The columns come from the server (config names the case).
- **The server side is where the work is.** No route fits as it stands:

  | route | takes ids? | columns declared by | fit |
  |---|---|---|---|
  | `GET /ingest/export?profile=&from=&to=` (the panel's) | no, a date range | review-export profile, by granularity | it takes no selection at all, and it exports notices, not answers |
  | `GET /ingest/{id}/export?profile=` | one ingest id | the same | one file per ingest, notices only |
  | `POST /export/package` (`answers: [ids]`, `canvasExport`) | yes, answer ids | answer-export profile, **per recipient**, listing the `kinds` it takes | the closest. It writes one row per answer from the closed set of answer fields. But it is a governed disclosure: it needs a `recipient_scope` (409 with none, 403 if the caller may not export to it, ADR-0047 §1, never a default), and it refuses each answer whose verb is not in that recipient's `kinds` |

- **"Columns declared by the kind" has no home today.** Neither the content-kind row nor any answer-kind row
  carries columns. Every column list lives in an export profile, keyed by name (review export) or by recipient
  (answer export). The redesign needs a producer change in one of two forms:
  - **(a)** a `columns` block, or a reference to a profile, on the kind's own registry row, served where cortex
    already reads kinds;
  - **(b)** an ids-taking export route that resolves each selected item's kind to the profile that kind declares.
- **Three questions for the ruling, not for cortex:**
  - **A mixed selection.** A selection that spans kinds could produce one table per kind, one file with a section
    per kind, or a refusal naming the kinds. Today's `/export/package` already splits a mixed board per engine
    into `documents[]` (ruled 2026-10-09). That is a precedent.
  - **Answer columns.** Should the columns be the answer's **payload fields**, which differ per archetype (the
    0.4.85 option-data work showed how nested those are), or the closed set of answer **metadata** fields that
    answer-export profiles take today?
  - **Recipient.** Is "export selected" a recipient-scoped disclosure, which inherits ADR-0047's no-default rule
    and the recipient picker, or a personal download gated only on a capability, as the batch export is?
- **What the panel becomes.** Its date range is a different selection: "everything promoted in a window". If the
  panel folds into the collector, that population needs its own way to be selected. One option is a stage filter
  that lassos promoted ingests by date. Otherwise the range export stays a separate entry point.

## Read this beat

- `sessions/2026-11-10-packet-to-cortex-from-lane-01-approvals-task-is-the-architects-call-not-on-0-4-85.md`
- `sessions/2026-11-11-packet-to-cortex-from-lane-01-approvals-task-is-ruled-the-gateway-serves-it-after-0-4-85.md`.
  It reads: "The gateway serves it, on the train after 0.4.85." Cortex will not match the held row and will not
  draw the task card in place. An absent `task` means "not yours to act on". Lane 1 places a packet when the
  gateway PR opens. This agrees with Chris's "keep the panel as it is until that lands", and the 0.4.85 report
  (`c51f932`) records that ruling. The question in our 11-10 packet is now answered.

Both packets are left untracked, as the others are.
