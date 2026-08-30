# Demo-week work cluster

Standing checklist for the cortex-ui lane. Items are recorded with the evidence that
produced them, so a decision can be re-checked rather than re-argued.

Nearest gate: the dress rehearsal. Venue is **work** — decided 2026-08-22.

---

## The cluster session

Six items need the work cluster and close in one sitting. Listed together because they share a
prerequisite, not because they are one task — four are outside this lane and are recorded here
only so the session is planned against a complete list.

1. Forced rollout + **in-pod** verify (this lane — see below)
2. Denial observation (this lane — see below)
3. Tasks-badge warm-up click (this lane — see below)
4. `LLM_BASE_URL` / pool-size read
5. alice's `PORTFOLIO_PLANNING` entitlements
6. H200 latency measurement

---

## Pre-flight (before the rehearsal)

- [ ] **Tasks-badge warm-up click.** Click "Jump to next pending task" once during warm-up.
      Two birds: it exercises the one `setCurrentArtifact` path whose id is computed rather
      than read off a rendered row, and it guarantees `useTaskArtifactSync`'s reconcile has
      run before anyone clicks it live.
      *Why it is a warm-up line and not a fix:* traced all four live call sites; three take
      their id from rendered rows or are guarded (`PersonalCanvas.tsx:114` returns null for a
      pin whose artifact is absent). The badge computes `taskArtifactId(t.id)`, and
      `taskToArtifact` assigns `taskArtifactId(task.id)` — same field, so the id-key mismatch
      this could have been is not there. Residual risk is a cold-start click landing before
      the first reconcile. Recovery if the canvas ever blanks: `clearCanvas`.

- [ ] **Denial observation** (needs the work IdP and a denial-triggering asset — runs in the
      cluster session above).
      Trigger an `access_denied`, then watch how long the composer stays disabled.
      Sub-second re-enable → runbook line, done. Hangs to timeout → it is the visible
      beat-risk and warrants the chrome-side fix.
      *Why the number cannot come from here:* the window is exactly `access_denied` →
      stream end, and that is server-determined. The client never self-terminates — the
      handler does not abort and does not clear the turn refs (pinned,
      `useInterviewAgent.test.ts:566` and `:585`). Nothing in this repo documents cortex-bff's
      post-denial stream behaviour.
      Fix shape if needed, proposed not applied, and it is a PAIR: `InputBar` keys on the same
      signal the surface keys on, AND `sendMessage`'s guard stops keying on
      `mutation.isPending`. Chrome alone is worse than the defect — it produces a composer that
      looks alive and silently eats input. See the open diagnostic below before shipping
      either half.

- [x] **Venue decision — DECIDED: work** (2026-08-22). The draft-persistence protection must
      therefore actually *deploy*, not merely exist in a registry. Everything below is live.

- [ ] **Forced rollout + in-pod verify.** CI builds `:latest` on push to master, but
      `helm/cortex-ui/values.yaml:10` sets `imagePullPolicy: IfNotPresent` and the
      per-frontend `pullPolicy: Always` override on line 22 is commented out. A node already
      holding a cached `:latest` will NOT re-pull, so the registry advances while the pod
      keeps serving the old bundle. Procedure:
      1. Confirm the registry carries the post-`ec06052` build (CI green for that SHA).
      2. `kubectl rollout restart` the frontend deployment — or flip the commented-out
         `pullPolicy: Always` if this is going to keep recurring.
      3. **Verify in the RUNNING CONTAINER, not the deployment spec.** The spec says what was
         asked for; only the running container says what is being served. Read the pod's
         resolved image digest, not `values.yaml` and not the Deployment's image string.
      Without step 3 the failure mode is indistinguishable from a broken fix: "draft
      persistence is deployed" and "draft persistence sits in a registry no pod has pulled"
      look identical from outside. This project has hit that stale-image shape enough times
      to classify it.

---

## Waiting on another lane

- [ ] **Engine P emits `value_unit: "USD"` on the cost-curve payload.** The frontend half is
      shipped (`a03a960`): `value_unit` is an optional contract field, registration picked it
      up automatically because `expected_fields` derives from the contract, and the axis
      renders `$1.5M` the moment an answer declares it. Until then it reads `1.5M` — correct,
      just not money-flavoured — because the renderer will not guess a unit the payload never
      sent. Worth doing for the whole money family at once (`planFundingGap` and any
      funding-flavoured payload), not just the cost curve, so they all render alike.
      **No frontend change is needed when it lands.**

- [ ] **Four producer declarations the frontend is already waiting on.** Three complete the
      planning cards' data vocabulary and are Engine P payload-assembly work; the fourth is a
      gateway write-point field for the answers list. The frontend half of each is built,
      tested, and waiting — each renders the moment a producer declares it, with no frontend
      change. Grouped because they are one half-day of work, and because *one side done, the
      other never asked* is the death this list exists to prevent.

      1. **`value_unit`** on the money family (cost curve, funding gap). Shipped frontend:
         `a03a960`. Until it arrives the axis reads `1.5M` rather than `$1.5M` — correct, just
         not money-flavoured, because the renderer will not guess a unit the payload never
         sent.
      2. **A `baseline` series on `PeriodSeriesRow`.** The row today is
         `{period, capex, expense, total, cap, over_cap, overage}` — there is no baseline, so
         the mockup's ghost bars **cannot render at all**. This is not a bolt-on field: the
         evaluation carries both series only when the card's scope includes a comparison, which
         is scenario-dependent — the diff machinery reaching the period payload, `plan_diff`'s
         sibling concern. The mockup's "ghost = baseline" annotation was quietly specifying a
         contract extension.
      3. **A `risk_flag` VOCABULARY from the schedule producer** — `MOVED` on op-touched bars,
         the FS-violation value on constraint-breaching ones. **The mechanism already exists:**
         `IntervalRow.risk_flag` is a generic styling key that the renderer deliberately never
         interprets ("styles an unknown string and stops"), and it is already threaded through
         to the task as `$risk_flag`. So: **emit values, do not add fields.** A parallel
         violation field would duplicate a seam that is already generic by design.

      4. **`duration_ms` on the answer artifact** — how long the pipeline took, stamped at the
         same write point that flips `status` → `complete`. Shipped frontend: `340c969`; the
         answers list renders it under the clock time the day it arrives and shows nothing
         until then.

         **Why the producer and not us.** `updated_at - created_at` is free and wrong four
         ways: `updated_at` is overwritten with the CLIENT clock on merge so it records when a
         browser saw a row, it bumps again on substrate-stale marks so the duration grows after
         the fact, it mixes server and client clocks so the difference can come out negative,
         and the live and reload paths disagree — the same answer showing two durations
         depending on whether the tab was open.

         **Capture-or-lose-forever, and this one is visible.** Every artifact already in the
         substrate will read with no duration, permanently. The list shows absence as absence
         rather than `0s`, so the effect is a mixed list, not a wrong one — but the sooner it
         lands the smaller the permanent hole.
      *Not built on purpose:* the badge that renders `risk_flag`. A badge with nothing to badge
      is declared-but-unwired manufactured deliberately — the shape this repo spent a week
      converting from accident into finding. It is an hour's work whenever the flags exist, and
      a better hour, because there will be a real value to red-proof against.

- [ ] **Post-roll: re-ask a DA question and read the card's SQL footer.** One question, and it
      discriminates stale-image from real defect — which is the only way anything gets
      classified now. The footer showing a bare "SQL:" with nothing after it was fixed in
      `e5cb7fb` (it now renders only when a query exists), so a card still showing the empty
      label is proof the pod has not pulled. Once it HAS pulled, the check becomes a real one:
      does the footer show the ANALYTICAL query (the GROUP BY the agent composed) or the
      tool-level fetch (`SELECT * FROM dataset LIMIT 10`)? The evidence panel already carries
      the fetch, so if the footer shows it too, the composed query never reached the
      `sql_query` contract field and that is a payload-assembly item to file — honest
      provenance, but the shallowest link in the chain.

---

## The four planning archetypes are UNREACHABLE until the hardened renderers land

Established by another lane, 2026-08-24. The registered archetype is selected correctly —
`INTERVAL_TIMELINE`, `PERIOD_SERIES`, `THRESHOLD_GRID`, `MATRIX_GRID`, all `source=registered`
— and then the `fallback-designui` path **discards it and emits a bar chart**. So all four
components exist, are contract-tested, and **never receive a payload**.

Two consequences for this lane:

- **Hold verification, not confidence.** The card vocabulary built against those contracts is
  not wasted — it is pre-verified and waiting. Components and hardened renderers are both
  projections of the same `.contract.ts` shapes, so the vocabulary becomes reachable *already
  correct* when the arms land. Unreachable-but-tested is the intended intermediate state of a
  two-sided build.
- **Do not screenshot-verify the four planning widgets** until the renderers land. Any visual
  check today verifies the fallback's guesses, not the components.

Note what this implies about behaviour already believed shipped: `PeriodSeries`'s cap line and
`ThresholdGrid`'s breach treatment are both correct against their contracts and **have never
actually rendered**. Their correctness is contract-verified, not observed.

**The fallback is an LLM, and that makes it nondeterministic on the demo's critical path.**
`b.DesignUI()` picks the chart shape generatively per request, so identical data renders or
fails run to run — the gantt's "intermittent" failure was a fair coin landing differently, and
CHART-DATA-NOT-RENDERABLE and a clean draw are the same coin's two faces. **A beat that worked
in rehearsal can fail in the room, with no change anywhere.** This is a category nothing else
here tolerates: counts predicted, phrasings certified at n≥3, and then the last hop rolls dice.

**Measurement caveat for when the renderers land:** the before/after must hold the question set
fixed and run n≥2 per side. A single-run comparison could catch the fallback on a lucky draw
and understate the fix — the nondeterminism finding applies to measuring its own removal.

---

## What of tonight's work IS reachable

Split recorded so nobody re-debugs reachable code looking for an archetype fault:

- **Reachable now** — card sizing (`fd64749`), the `portfolio_planning` type + chrome +
  template (`0827ad0`), and the interpretation strip + freshness stamp (`be9fe1a`). These live
  on `StageCard` and the canvas, so they render regardless of which component draws the card
  body.
- **Unreachable until the arms land** — anything inside `PeriodSeries`, `ThresholdGrid`,
  `IntervalTimeline`, `MatrixGrid`.

---

## FINDING — `elapsed_ms` is declared on BOTH sides and has never been sent

**2026-08-28.** Found while scoping answer durations. Not fixed: it is a one-line producer
change in another lane, and it is not what makes a duration appear in the list.

`gateway.py:2323` — the `_stage()` helper that emits every `pipeline_stage` SSE event — takes
`elapsed_ms: int | None = None` and includes it only when non-None. **No call site anywhere in
the file passes it.** So the field is omitted from every event ever emitted.

The frontend has been ready the whole time: `client.ts:276` parses it, `api/types.ts:342`
declares it (*"ms since pipeline_start; used by ThinkingCard for elapsed display"*), and
`ThinkingCard` has an `elapsedMsOverride` branch that exists solely to consume it. That branch
has never executed.

**Why it is worth a line of theirs.** The live ticker currently derives elapsed from the
CLIENT`s clock — earliest observed step `startedAt` to now — so it measures browser-observed
stream time, not pipeline time, and it starts whenever the first event happens to arrive.
Passing the value the gateway already has replaces an approximation with a measurement.

**What it does NOT do:** put a number in the answers list. `elapsed_ms` rides an SSE event and
dies with the stream, so it is unavailable on reload and for any answer you were not watching.
That is `duration_ms` on the artifact — separate ask, filed above.

**Third species of the same shape this week**, after the tree-shaken seed global and the
`risk_flag` badge: a seam declared at both ends, consumed by working code, and never produced.
The recurring tell is that nothing is broken — the optional field is simply absent, the
fallback path is reasonable, and no test can fail. **A consumer is not evidence of a producer.**

### Adjacent, same file: two `formatElapsed` implementations that disagree

`ThinkingCard.tsx:59` and `@/lib/formatDuration` format the same elapsed differently — 2500ms
reads `2s` in the thinking card and `2.5s` in the answers list and the live capsule; 63s reads
`1m 3s` versus `1m 03s`. The lib version is now the shared one (`useLiveStages` re-exports it
as `formatElapsed`); `ThinkingCard` keeps its private copy because unifying them changes a
shipped display and `<1s` becoming `0.4s` is a visible change during demo week. **Post-demo:**
delete the private copy — one import, and the two surfaces stop disagreeing about the same
number.

---

## SUPERSEDED 2026-08-28 — the phrase routes, so neither trigger is needed

**The seeding intent now routes end to end.** `build the portfolio canvas` classified as
`seed Portfolio Canvas` at high confidence via `seedPortfolioCanvas`, Engine F projected
`CANVAS_SEED` with five slot-ordered ids, and the consumer composed the board. Compare
2026-08-26 21:38 in the answers rail — *No direct match — no verb classified* on the same
phrase. The capability registration landed between them.

So the console trigger below is scaffolding for a gap that is closed, and
`seedPortfolioCanvas.ts` says in its own header *"Remove when the phrase routes end to end."*
**Not removed during demo week** — it is inert unless called, and deleting it also deletes the
subject of the reachability guard. Post-demo cleanup, filed here so it is not forgotten.

The entry below is kept for the finding it carries, which outlived its procedure.

### Original entry — the manual trigger existed and Lane 1 could not see it

**2026-08-27, `bc55a48`.** Lane 1's `manual-seed-trigger-tonight.md` says *"no store is
exposed on `window` — I checked, there is no debug global"* and on that basis has the operator
drag the five returned artifacts onto a canvas by hand, in slot order.

**That check was correct about the running app, and the fault was ours.**
`src/lib/seedPortfolioCanvas.ts` installed `window.__cortexSeedPortfolioCanvas` and said so in
its own comment, but nothing on the entry path imported the module, so the bundler dropped it
whole and the side effect never ran. Measured against the artifact, not argued: building the
previous `App.tsx` gives 0 occurrences of the global in `dist/`, the current one gives 1.
They checked the running app; our comment described the source. **The bundle is the truth.**

It is fixed. After the next rollout, replace the hand-composition step with:

```js
await window.__cortexSeedPortfolioCanvas();  // returns the new canvas id, or null
```

This matters beyond convenience. Hand-dragging tests the operator's dexterity and re-asserts a
slot order a human retyped; the call composes through the same receiver the answer path uses, in
the order the server declared. It converts the half that plan honestly conceded it could not
test — *the seeder's own placement* — into the half it does.

**Requires the rollout.** `imagePullPolicy: IfNotPresent` means a pod already holding `:latest`
will not re-pull, and the failure mode is silent: the global is simply undefined and the console
call reads as if the fix were never made. If `typeof window.__cortexSeedPortfolioCanvas` is
`"undefined"`, that is a stale image, not a broken fix — fall back to hand-composition and roll.

*The guard, not the import, is the finding.* The module's six tests passed the entire time: a
test importing the function directly creates the very edge the application was missing, so it
proves the mechanism and never that anything can reach it. Same species as
`draggable={!gesturing.current}`. `seedPortfolioCanvas.reachability.test.ts` now walks the
import graph from `main.tsx` and requires EVERY module installing a `__cortex*` global to be on
it — the law rather than the path, because the next scaffolding global is the one that will be
unreachable.

---

## FINDING — three grids, two row-identity field names

**2026-08-30.** Filed, not chased. `THRESHOLD_GRID` and `SHORTFALL_GRID` key their rows on
`subject_id`; `MATRIX_GRID` keys them on `row_id`. Anything that walks grid rows GENERICALLY
hits this, and the first thing that did got it wrong.

`naturalContentHeight` read only `subject_id`, so for a matrix it fell through to counting
CELLS — sizing a 5×4 matrix as though it had twenty rows, a card four times too tall,
**arrived at confidently**. Fixed there; the underlying disagreement stands.

### The failure shape is new and belongs beside the oracle law

**A fixture authored from the implementation tests the implementation against itself.** The
unit tests could not see the bug because the fixture used the field name the code expected —
expectation and system shared a source, so their agreement proved nothing. The render test
caught it immediately, because the real component was the independent source.

Same confound as the oracle law in a different costume, and the same resolution: the check
must not derive from the thing being checked.

### Why it is filed rather than fixed

Renaming a payload field is a producer decision with a migration behind it, and the demo does
not need it. What the next generic row-walker needs is to KNOW, which is what this entry is.
---

## CORRECTION — nothing writes filled slots into `resolved_intent`

**2026-08-29.** The dispatch for `a-resolved-relative-period-must-be-disclosed` said
*"everything needed is on the wire"*. **It is not**, and the frontend half was built anyway —
to the producer's own declared shape — so this is a waiting consumer, not a broken renderer.

What was verified, in the engine repo rather than inferred:

- `gateway.py` sets `resolved_intent` ONCE, from `/plan`'s `intent_extraction`, which runs
  **before** slot filling.
- `git grep 'resolved_intent['` over the engine repo returns **nothing**. No code path updates
  it after the slots are filled.
- The ontology service DOES produce the disclosure data — `{outcome, spoken, instance_id,
  instance_label, candidates}` — but it lives on `fill_slots`' response and never reaches the
  artifact bundle.
- `accepted[name] = resolved_id` is a plain string, so `parameters` values are scalars. The
  claim that *"referent cases carry `spoken` beside `instance_id`"* is true of the RESOLUTION
  MAP, not of the artifact the card reads.

**This is why live cards show an action and no slots.** Not a rendering bug — there is nothing
to render. Recorded so it is not re-diagnosed as one.

### The frontend half, shipped and waiting

`slotValue` previously rendered any object slot as a single `…`, so a referent disclosed
nothing even when one arrived. It now renders **`spoken → resolved`**, because the disclosure
is BOTH: only the resolved value hides that a narrowing happened, only the spoken form hides
that it succeeded. An unresolved referent renders `spoken (unresolved)` and never a resolution
that did not occur.

### The producer ask

**Write the slot resolution onto the artifact's `resolved_intent`** — the accepted values plus
the resolution map, at the point the slots are filled. Capture-or-lose-forever: an artifact
written without it can never be told what the reader actually said.

A resolved PERIOD has no declared shape at all yet. The renderer reads a `value` key as a
fallback so a plausible shape is not dead on arrival, but that name is **read, never required**
— the producer decides it, and this entry should be corrected when they do.
---

## ADR-0017 registration — the baseline, and how to verify a new row

**2026-08-29, `pending`.** Recorded here rather than re-derived: the finance bindings
are coming, and "the count incremented" needs something to increment FROM.

### Baseline — was 23 rows / 17 archetypes; now **26 rows** after Engine F

```
APPROVAL_TASK | ApprovalTaskCard | mesh:HumanApprovalTask
ASSET_STATE_METRIC | SupplyTable | mesh:FreshnessReport
CANVAS_SEED | consumer:canvasSeedFromArtifact | mesh:CanvasSeedResult
CHART_WIDGET | ChartWidget | mesh:DatasetAnalysisReport
DECISION_RECORD | DecisionRecord | mesh:DecisionArtifact
DELTA_SET | DeltaSet | mesh:EffectSet
GROUPED_REVIEW | GroupedReviewTable | mesh:PartObsolescenceReviewBatch
HAZARD_DECLARATION | WarningCard | mesh:TagFilterResult
INSTANCES_BY_PROPERTY | InstancesByPropertyView | mesh:InstancesByProperty
INTERVAL_TIMELINE | IntervalTimeline | mesh:ContributionSequence
INTERVAL_TIMELINE | IntervalTimeline | mesh:IntervalSchedule
KNOWLEDGE_DOCUMENT | MarkdownRenderer | mesh:AssetProfile
KNOWLEDGE_DOCUMENT | MarkdownRenderer | mesh:CatalogListing
KNOWLEDGE_DOCUMENT | MarkdownRenderer | mesh:ImpactSet
KNOWLEDGE_DOCUMENT | MarkdownRenderer | mesh:KnowledgeRetrievalResponse
KNOWLEDGE_DOCUMENT | MarkdownRenderer | mesh:OwnershipFact
KNOWLEDGE_DOCUMENT | MarkdownRenderer | mesh:SchemaDescription
MATRIX_GRID | MatrixGrid | mesh:MaturityMatrix
PERIOD_SERIES | PeriodSeries | mesh:PeriodCostSeries
PROCESS_TOPOLOGY | ProcessTopologyCard | mesh:LineageTopology
SHORTFALL_GRID | ShortfallGrid | mesh:FundingGapSet
THRESHOLD_GRID | ThresholdGrid | mesh:LoadThresholdGrid
WORKFLOW_OBSERVATION | WorkflowObservationView | mesh:WorkflowObservation
```

**The precedent in that table is the argument against minting new finance archetypes.**
`INTERVAL_TIMELINE` already serves two subjects and `KNOWLEDGE_DOCUMENT` six. One archetype
serving many output classes is the NORMAL case here, not the exception — so the bar for a new
component is not *"this output class is new"*, it is **"no existing archetype's contract can
carry these fields"**. The grid-splitting ruling refused a fourth deficit-coloured grid on
exactly this reasoning.

### Engine F added three rows, not six — and the shortfall is the finding

| verb | subject | archetype | status |
|---|---|---|---|
| `fin_burn_rate` | `fin:BurnRateSeries` | `PERIOD_SERIES` | bound |
| `fin_funding_status` | `fin:FundingStatusGrid` | `SHORTFALL_GRID` | bound (accommodation A1) |
| `fin_performance_indices` | `fin:PerformanceIndexSeries` | `PERIOD_SERIES` | bound (accommodation A2) |
| `fin_variance_analysis` | — | none | **build** — emits a TREE; nothing in the arm nests |
| `fin_eac_calculation` | — | none | **build** — METHOD is half the answer |
| `fin_variance_drivers` | — | none | **build** — a RANKING, not a filtered instance table |

`persona_fit` / `domain_fit` are READ from the finance agent's own `OWNER_PERSONA` and
`DOMAINS` (`agent_fleet/finance_agent/main.py`), not inferred from the subject matter. A
guessed persona advertises to the wrong audience and nothing here fails.

**The cortex-side question the table could not answer is YES, for a better reason than
assumed.** `PERIOD_SERIES` tolerates an absent `value_unit` because **it never reads the field
at all** — see the characterization test beside the component. The contract declares it,
`expected_fields` advertises it, and neither the interpreter nor the component touches it.

**That corrects an entry in this document.** The producer queue says Engine P emitting
`value_unit` on the cost curve needs *"no frontend change"*. True for `CHART_WIDGET` and
`SHORTFALL_GRID`, which thread it to `formatAmount`. **False for `PERIOD_SERIES`, which is the
cost curve's own archetype.** Wiring it is also not the obvious one-liner: Engine F's CPI/SPI
are dimensionless ratios and its `amount_unit` rename is the only thing today preventing a
currency being promoted onto a ratio chart. Whoever connects the field owns that case.
### The log now reports both sides

It used to print `resp.accepted` alone — the SERVER's count, not what the client offered, and
no names either way. A row the client sent and the server silently dropped was invisible,
because the two numbers never appeared together. **And a count can be exactly right for the
wrong state:** 22 offered, 22 accepted, one refused, and the number is correct FOR THE
REJECTION. That cost a session on `CANVAS_SEED`.

The console now names what was SENT beside both counts, and warns when they disagree. Two
instruments: the console says what left, a graph query says what landed, and the gap between
them is visible instead of inferred. **Verify by name. A count still cannot say WHICH.**

### Two laws this verification runs into

1. **A genuine RELOAD, not an HMR refresh.** `registeredRef` fires the registration once per
   authenticated page load and nothing server-side triggers it. An HMR update leaves the ref
   set, so the effect never re-runs and the console shows the OLD row set — indistinguishable
   from a row that failed to register.
2. **A stale pod serves the old bundle with the old row set**, which looks *exactly* like a row
   that failed to register. This is the check-the-running-image law meeting the lazy-trigger
   law in one sentence, and it is the failure mode that will bite the Engine F verification
   first. Read the pod's resolved image digest before concluding anything about a missing row.

### What counts as evidence that a row RENDERS

A real Engine F payload after its prime. **Not a fixture, and not a screenshot.** A captured
payload was acceptable for verifying a recognizer's SHAPE — that is a claim about parsing. A
render is a claim about a component's behaviour against real data, and the only honest evidence
is the real thing on screen.
---

## SPEC (not built) — the drill-in drawer and the computed-context tooltip

Captured while the mock's answers were fresh, so the build reads a spec instead of
re-deriving one from a conversation. **These are specifications, not commitments** — nothing
below is built, and the same payload-sourcing rule governs them as everything else on a card:
**a field with no backing in the payload does not render.** If the mock shows a field the
evaluation does not carry, that is a producer declaration to file, not a value to compose.

### The drill-in drawer — field layout (from the competitor mock's project drawer)

Adopted as the spec. Layout, in order:

1. **Breadcrumb** — `Strategy / Initiative / Phase`.
2. **Description.**
3. **Fields** — owner, business owner, priority, status, type.
4. **Window + phase confidence.**
5. **Funding table** — `org · type · status · amount`, each row carrying its risk tag.
6. **Capability chips** — `name → level`.
7. **Target chips** — `name (type)`.

**VIEW-ONLY for demo week.** The mock's editable fields — priority, status, per-row funding
status — are typed ops and post-demo by standing ruling. Record them as the eventual write
surface and **leave room in the layout for the controls without rendering them**, so the
editable version is a behaviour change rather than a re-layout. Same discipline as the
interpretation strip's per-slot elements, and for the same reason.

**Still to fill from the mock before building** — not guessed here, because fabricated
structure in a spec is trusted precisely because it looks authoritative:

- Which payload field backs each group. `window` and `confidence` have obvious homes
  (`resolved_intent.parameters`, `routing.*.confidence`); the rest need naming.
- Whether capability chips and target chips can both be absent, and what shows then. The house
  rule says nothing-not-a-placeholder, but the mock may disagree and should be asked.

**RULED (2026-08-25): the funding table is a DRILL-IN QUERY, so the drawer is a LIVE VIEW.**
It is not the rows the card already drew. Consequences, all inherited rather than invented:

- It carries its own `valid_as_of` per evaluation (ADR-0042 §4) and displays it — mount the
  existing `FreshnessStamp` rather than writing a second one.
- The statelessness rule applies at panel scale: **a drawer showing funding rows from
  mount-time memory is the cached-label defect, one level up.** Re-evaluation replaces content
  wholesale; the drawer keeps no rows of its own.
- Its refusals are a live view's refusals — an evaluation that returns nothing renders the
  deliberate-empty, not an empty table.

The BUILD stays post-demo; only the ruling is settled, so the morning does not re-open it.

**Already available to build against:** the interpretation strip renders slots as discrete
keyed elements (`data-slot`), so the drawer can reuse that vocabulary rather than inventing a
second one, and the freshness stamp is a component the drawer can mount as-is.

### The computed-context tooltip — density standard

The standard as named: a tooltip carries the **computed context** behind a value — what it was
measured against and how it was derived — rather than restating the label.

**What this repo has already settled and the standard should inherit:**

- A tooltip that cannot say anything true says nothing. `ThresholdGrid` already models it:
  `"no contributors recorded"` rather than an empty tooltip or an invented cause.
- Absence renders as absence — the em dash for an uncounted value, `as of —` for an unknown
  evaluation time. A tooltip must not fill a gap with a plausible default.
- Structured values are not stringified at a reader (`…`, not `[object Object]`).

**The bar, from the mock's own tooltips** — these are the standard, quoted:

> "reaches Adopted by end of horizon, first delivery Q2 '27"
> "3 capabilities, mean maturity 2.3/4"
> "no funded activity in view"

**One sentence stating the claim the cell makes, with its numbers.** Not the label restated.
Note the third: the honest-empty case is itself a computed claim ("no funded activity **in
view**"), not a shrug.

**Every figure sourced from payload fields — never derived client-side.** The
client-side-measures prohibition applies to tooltips too: a mean computed in the browser is a
measurement with no verb behind it and no `output_uri`, which is exactly what ADR-0042 §3
forbids. If the mock's tooltip shows a number the payload does not carry, that is a producer
declaration to file, not an arithmetic to add.

**Already shipped as the working model:** `ShortfallGrid`'s cell title reads
"<committed> committed of <required> required, <secured> firm — short <shortfall>", every
figure read from the payload and the shortfall never re-subtracted. `ThresholdGrid`'s
"no contributors recorded" is the honest-empty form.

---

### Workspace chrome — warning→filter interaction (deferred build)

**Threshold warnings click-apply their scope.** In the mock, a warning reading
"Wichita · Q3–Q4 · up to 4 concurrent" is clickable: it applies that target's filter and
navigates to the evidence. Builds when the chrome surface exists, not before.

### Heads-up: `risk_flag` vocabulary is growing to five values

Lane 1 is emitting `funded` / `at-risk` / `unfunded` as `risk_flag` VALUES on the schedule
payload, alongside the constraint/move values, with precedence
`constraint-violated > moved > at-risk/unfunded`.

**No action.** `IntervalTimeline` styles the strings it knows and ignores the rest by
construction — that is the generic-param pattern working as designed. Recorded only so the
eventual badge work knows the vocabulary is five values rather than two.

Worth noting for the competitive packet: the competitor mock colours its gantt bars by funding
risk using **"At Risk" / "Unfunded"** — this renderer's incumbent `risk_flag` vocabulary,
converged independently from the same customer prompt.

---

## Per-mount I/O in per-card components — swept 2026-08-25, ONE instance, now fixed

Recorded because the result was NEGATIVE. "We looked and it is fine" leaves nothing behind
and decays into folklore faster than any finding does; six months from now the difference
between a ten-minute re-run and a one-line lookup is whether this table exists.

### The species

**A correct-looking `useEffect(..., [])` doing I/O is only correct if the component's mount
count is bounded — and in a per-artifact component, mount count is a function of session
data.** The hook's correctness therefore *degrades as the user uses the product*: invisible at
seed scale, structural at real scale. It hides precisely because every individual mount is
doing the right thing.

One historical violation: `useMeshConfig` inside `SemanticInterpreter`, which mounts once per
card. A session holding seventy answers issued ~seventy simultaneous `GET /mesh/config` for a
global, immutable, byte-identical payload — enough to saturate cortex-bff's event loop, make
`/health` miss its readiness window, get the pod pulled from the service endpoints, and have
the edge answer 404 with no CORS headers while `kubectl get pods` read Running 1/1. Fixed in
`a7ab9ae` with a module-level shared promise; the guard mounts seventy, because "one fetch" is
trivially true for a single mount whether or not a cache exists.

### Preference order for I/O in anything rendered per artifact

1. **Handler-triggered** — mount count of zero by construction. Not a mitigation; a shape in
   which the failure mode cannot exist. The task cards do this.
2. **Effect keyed on the data's identity** — bounded by *distinct data*, not by mounts.
3. **Module-level cached promise** — bounded to one per session, with failure clearing the
   slot so a rejected promise cannot poison the cache.
4. **Per-mount effect** — unbounded by session data. This is the defect.

### The teaching case

**`DecisionMap` is category 2 done right, and it is the sharpest example in the sweep:**
genuinely per-card, genuinely fetching, and safe because its deps are the artifact's own
identity (`[routing?.about.uri, graphTrace.length, alternates.length]`) plus a `cancelled`
guard. It fetches per distinct routing rather than per mount. *Key the effect on what makes
the data different, and mount count stops being the multiplier.* A reviewer who understands
why `DecisionMap` is fine will not write the next `SemanticInterpreter`.

### Sweep method and result (2026-08-25)

Method: the sixteen modules importing `@/api/client` or `@/lib/electric`, cross-referenced
against mount cardinality; plus a general grep for `}, []);` effects containing a
fetch/subscribe across `src/`, which returned exactly one non-test match
(`useCanvasPersistence`'s store subscription — App-level, correct).

| Component | Mounts | Mount-time I/O | Verdict |
|---|---|---|---|
| `SemanticInterpreter` | per card | yes, `[]` deps | **the instance — fixed in `a7ab9ae`** |
| `DecisionMap` | per card | yes, keyed on artifact identity | clean (category 2) |
| `TriageTaskCard` | per task card | no — keydown listener; I/O in handler | clean |
| `GroupedReviewTable` | per review card | no — local draft cache | clean |
| `ApprovalTaskCard` | per task card | no — I/O in handler | clean |
| `EvidencePane` | once | keyed `[noticeId]`, `live` guard | clean |
| `PersonaPicker`, `GlobalCanvasStage`, `AccessDeniedCard` | once | — | clean |
| `useCanvasPersistence`, `useTaskArtifactSync`, `useAgent`, `useInterviewAgent`, `seedHumanTasks` | App-level, once | — | clean |

**Result: zero further hits.** `SemanticInterpreter` was the pattern's only instance, so this
entry is prophylactic rather than remedial. A component added after this date is outside the
covered set — judge it against the preference order above rather than assuming the sweep
covered it.

---

## INTERVAL_TIMELINE — step 1 DONE, step 2 outstanding

**2026-08-25, corrected 2026-08-27.** The backend was correct end to end (routing → verb →
`mesh#IntervalSchedule` → `source=registered` → `INTERVAL_TIMELINE` → `render_ui 200`) while
the card drew a left-hand table beside an empty chart region. Two distinct pieces of work, and
only the first was a defect. The first is now fixed; the second is still deferred.

### Step 1 — THREE things, not one. RESOLVED 2026-08-25; corrected 2026-08-27.

**This entry originally said `all.css` makes a working gantt. That was false**, and it stayed
in the document for two days as a confident one-line fix that would not have worked. Corrected
here rather than deleted, because the shape of the error is the useful part: a diagnosis that
explains SOME of the evidence reads as complete, and the missing pieces are invisible until
someone applies the fix and finds it insufficient. The stylesheet WAS wrong. It was also not
sufficient, and the entry did not say so.

What it actually took, all three:

1. **`all.css`, not `style.css`** — the package exports two sheets and the partial one carries
   the grid/table rules but not the bar rules (see the table below). Necessary, not sufficient.
2. **A `WillowDark` theme wrapper** — SVAR's stylesheet is written against a theme scope. Load
   the CSS without the provider and the rules exist and match nothing, which is why the bars
   stayed invisible after step 1 alone.
3. **A `Locale` provider, with BOTH locale packages** — `gantt-locales` carries the UI labels,
   `core-locales` carries the calendar words. Passing one is not enough. And the scale dialect
   is **strftime** (`%M %Y`), not `MMM yyyy` — a pattern with no `%` prints itself, which is
   exactly what the header was doing.

The last one is worth keeping for its own sake: wrong dialect and missing calendar produce the
**same blank-looking header**, and this component had both at once. Two independent faults with
one symptom is why the first two diagnoses each looked right and each left the header wrong.

| Export | File | Size | Class selectors |
|---|---|---|---|
| `./style.css` | `dist/index.css` | 32 KB | **151** |
| `./all.css` | `dist-full/index.css` | 150 KB | **478** |

**Landed in `50b986d` (all.css), `4cba2ae` (WillowDark), `8e5a4b8` + `015dd9f` (Locale, both packages), `2b714aa` (the strftime dialect).**

Why the symptoms match exactly, recorded so the diagnosis is re-checkable rather than
re-derived:

- The **left table renders correctly** — the grid/table rules ARE in the partial sheet.
- **Task labels sit at date-correct x positions** and move with horizontal scroll — so SVAR's
  layout engine is working. Geometry is fine.
- **No bars** — the bar rules are among the 327 missing selectors AND the theme scope they are
  written against was absent. Both had to be fixed; the stylesheet alone left them invisible.
- **The scale reads literal `MMM yyyy`** — NOT a stylesheet problem, which is the half the
  original entry got wrong. Formatting a date is the LOCALE's job, and the pattern was in the
  wrong dialect besides. CSS could never have fixed it, and saying it would have was the error.

**This is NOT a sizing problem, and the `minHeight` instinct would have been a dead end.**
Nothing is collapsed; the elements are unstyled. A height fix would have papered over a
stylesheet import and left the bars invisible. Recorded because the sizing hypothesis was
reasonable, widely held for a day, and wrong.

### Step 2 — the mockup treatment, which is real work

Even fully styled, SVAR's default gantt looks like **SVAR's gantt**, not the mockup. The mockup
carries bars coloured by funding risk, `MOVED` / FS-violation badges on bars, grouped initiative
rows, and a dependency-violation marker. None of that is free.

The mechanism exists: SVAR's `Gantt` accepts a **`taskTemplate`** prop (confirmed in
`node_modules/@svar-ui/react-gantt/types/index.d.ts`), and the `--wx-gantt-*` theme custom
properties are already loading, so colour is a variable override rather than a fork.

This is the same work as the deferred `risk_flag` badge item, and it now has a live surface to
apply to — which it did not before tonight. It stays deferred; it also stays blocked on the
producer emitting the `risk_flag` vocabulary (see the producer-declarations entry above).

**Sequencing: the three fixes above make it a working gantt; `taskTemplate` + theme variables
make it yours.** Do not attempt the second before the first — styling a component whose
stylesheet, theme scope and locale are not applied means fighting defaults that are not in
effect.

---

## Runbook (during the demo)

- **The UI stops responding entirely — typing AND clicking** → **reload the tab.** The answers
  persist (they are artifacts, rehydrated by Electric) and the wedged state is client-side
  only. See the open diagnostic below; until it is resolved this is the only recovery.
  *Free read attached:* if the half-typed prompt survives the reload, the pod is running the
  post-`ec06052` image and draft persistence is live. If it does not, the pod has not pulled
  the new image — which is the forced-rollout item, answered for free.
- **Do not return to GRAPH mode after a new answer lands.** GRAPH is ordered by the input
  array with no content key, and `GlobalCanvasStage.tsx:120` passes `artifacts` raw — so
  component membership, tie-breaks and ring rotation all shift when an unrelated answer
  arrives. Rings rotating under the room's gaze is unforced instability. TIME / TYPE / TOPIC
  are order-independent and safe to revisit.
- **Canvas blanks after clicking an answer** → `clearCanvas`. `setCurrentArtifact` accepts an
  id not in the collection and still latches `currentArtifactSetByUser`, which disables the
  auto-foreground that would otherwise recover.
- **Do not double-press Enter.** A second Enter during a turn is silently dropped by the
  `mutation.isPending` guard — no message, no feedback.

---

## RESOLVED — the "UI wedges entirely" report was a SILENT STATE, not a hang

**2026-08-24.** A second "everything is stuck" report resolved to something more useful than a
wedge. The session was fully responsive. The persona bolt genuinely would not respond — that
part was real and IS the bug — but not because anything was frozen: with no entitlements
loaded, `PersonaPicker` renders a deliberately inert branch (`pp-static`, `aria-hidden`, **no
click handler at all**), confirmed from the live DOM. Nothing to click, and — until this was
fixed — nothing said so. The reader could not distinguish "inert by design" from "frozen", so
a working app was reported as hung.

That matters far beyond the one session, because **"an ungated sibling component is also
unresponsive" was the load-bearing evidence for hypothesis B below** — the reason a whole-page
render loop looked like the only explanation. That premise is gone: the sibling was never
unresponsive, it was non-interactive. Hypothesis B loses its main support, and hypothesis A
(a latched turn state, which only ever explained the composer) is back in contention for the
ORIGINAL report — whose "can't change permissions" half was very plausibly this same misread.

Also settled from that DOM: the composer input carried **no `disabled` attribute**, so
`phase === "active"` and `isProcessing === false`. The send button's `disabled` was correct —
`!value.trim()` on an empty box. And the console held only five Recharts container warnings:
no `Maximum update depth exceeded`, no `getSnapshot should be cached`. A page in a render
storm is noisy; that console was quiet. **Do not treat those Recharts warnings as evidence of
a loop** — they are charts measuring an unlaid-out container, and a symptom at most.

What remains genuinely open is narrow: whether the ORIGINAL report's "cannot ask questions"
half was a real latched turn (hypothesis A) or also a misread. That needs a reproduction where
someone types a character and reports whether it appears — not an impression of stuckness.

### The real finding underneath

**The inert bolt explains nothing about itself.** It has no tooltip, no cursor change, no
copy — so its honest-degradation state is indistinguishable from a frozen UI, and it misled
the person who built it. A one-line `title` ("No entitlements loaded — persona selection
unavailable") would have prevented this entire diagnostic. Silence is not honesty when the
user cannot tell absence from breakage.

---

## SUPERSEDED — the two hypotheses (kept for the reasoning, not the conclusion)

Witnessed live: after a turn, the composer would not accept input **and** the persona picker
would not respond. Two hypotheses, and they need different fixes, so nothing ships until one
is ruled out.

**Hypothesis A — latched turn state** (`mutation.isPending` never clears). *Contradicted by
the code on two points:*
  - `PersonaPicker.tsx` contains no reference to `isProcessing`, `phase`, or any turn state.
    Its only gate is `hasEntitlements()`, and it renders as a SIBLING of the input, not inside
    anything the composer disables. A latched turn cannot touch it.
  - The reported placeholder ("Connected to mesh") only renders when `isProcessing` is FALSE
    (`InputBar.tsx:66-74`), and `isDisabled` keys on that same flag. A composer showing that
    string with `phase === "active"` is not disabled. The two reported symptoms are mutually
    exclusive under A.

**Hypothesis B — the main thread is not yielding** (render loop / re-render storm). Fits both
symptoms: an ungated sibling going unresponsive alongside the input is what a loop looks like,
and under a loop the placeholder keeps whatever the last committed render produced, which
reconciles the observation A cannot. Candidate triggers, all already characterized:
`useInterviewAgent`'s selectorless `useInterviewStore()` subscription; the `useCurrent*`
identity loop the ceiling tests exist to catch; the mutable process-global `EMPTY_*` constants
as a live perturbation path.

**Three observations, any one decides it** (to be taken in the wedged tab or a reproduction):
  1. **Console** — "Maximum update depth exceeded" or "getSnapshot should be cached" confirms
     B outright.
  2. **CPU** — pegged means B; idle-but-unresponsive means A.
  3. **Does the persona bolt open its palette on click?** If yes, the picker is fine and the
     two symptoms are separate reports. If no, it is B.

**Why the fix cannot be guessed.** If B, keying the chrome on the surface's signal changes
nothing — the page is not rendering — and the real fix is selector-scoping
`useInterviewAgent`, the state-machine-adjacent change deferred as too risky for demo week;
the demo-week disposition then becomes a runbook posture, not a hot fix. If A, the chrome-only
fix is **actively harmful**: `sendMessage` drops on `mutation.isPending`
(`useInterviewAgent.ts:638`), so re-enabling the input without also changing that guard yields
a composer that looks alive and silently eats input — strictly worse than a visibly dead one.
If A, the fix is the PAIR (chrome signal + guard), never the chrome alone.

---

## Post-demo queue (ranked)

1. **The provenance map misattributes two keys.** `electricUpsertArtifact` tags
   `question_text` / `message_id` as `electric:*` while the LOCAL value wins — the tag loop
   runs before the merge decides. Ranked first because the map is the app's only witness to
   who wrote what, and the interview hook's Hop-3 absence probe rests on it. A provenance
   system that misattributes is worse than none, because it is trusted.
2. **The freeze fix.** `useInterviewAgent` destructures `useInterviewStore()` with no
   selector, subscribing every `useAgent()` consumer to the whole store; every SSE event
   re-renders the surface. A re-render storm, not a slow function — which is why a static
   trace of the submit path found nothing. 33 characterization tests now exist to make the
   fix safe. Real work with a real regression surface.
3. **`AuthProvider` harness + silent-renew verification** against the work IdP's real token
   lifetimes. `b3adc56` has been on published master since 2026-07-23 and has never been
   verified there. The parking window closed; the remedy is coverage, not extraction.
4. **Dependabot batch + manifest cleanup.** 18 advisories, all with fixes available. Triaged:
   nothing is in the deployed serving path — the Dockerfile is multi-stage and stage 2 is
   nginx, so `node_modules` never ships; `serve` appears only in `npm start`; `@aws-sdk` is
   in `dependencies` but imported nowhere. `axios` is the only advisory that reaches the
   browser bundle, and its NO_PROXY issue is a Node-adapter path. Moving `serve` to
   `devDependencies` and dropping the unused AWS SDK removes 5 advisories by correcting the
   manifest rather than upgrading anything.
5. **`useCanvasStore` findings cluster** (12 filed, all pinned as characterization):
   the defeated reuse optimisation (`rendered_output` compared by reference while
   `taskToArtifact` mints a fresh object per call for every archetype but `GROUPED_REVIEW`),
   `question_text` never compared, empty patches churning rows, unbounded provenance orphans,
   no dedupe by id, the write-only `isRevealing` latch with zero readers, and
   `createPendingArtifact` silently resetting `activeTab` to `"ALL"`.
6. **THE TWO TASK-ADAPTER DEFECTS LAND TOGETHER OR NOT AT ALL.** Read this before touching
   either. `taskArtifactContentEqual` never compares `question_text`, so an edited task body
   is judged unchanged. Separately, `rendered_output` is compared BY REFERENCE while
   `taskToArtifact` mints a fresh object every poll, so the reuse optimisation is defeated and
   cards churn. They MASK EACH OTHER: the churning object drags the edited text along, so the
   comparison defect is invisible exactly where the churn defect operates. **Fixing the churn
   alone converts a performance defect into a correctness defect** — edits would start
   vanishing from cards that currently show them. The churn fix is the tempting one, because
   it is the visible performance win in the cluster below, and the regression would ship
   silently behind a faster canvas. Both tests are named for their findings, so fixing either
   one turns exactly one test red; that is the gate, do not route around it.

7. **The canvas's render economy** — a coherent cluster rather than scattered items, all
   characterized before anyone touches the code: the re-render storm (item 2 above), the
   defeated reuse optimisation in `taskArtifactContentEqual`, `updateArtifact` churning on
   empty patches, and `useCurrentArtifact` re-rendering on ANY patch to the foregrounded row
   (panels needing one field should take the field hook). Mechanism, churn sources, and fix
   targets are all pinned.
   Also in this group as a **correctness-of-claim** item: `stageLayout`'s header states the map
   reuses the list's buckets "in the same order". Membership agrees; ORDER does not. The list
   re-sorts clusters by size with unresolved last (`AnswersPanel:604-612`); the layout orders
   by recency of first appearance. The claim holds for TIME alone — so either the code or the
   comment is wrong, and both surfaces currently ship believing the comment.

8. **The phantom card, and the non-null assertion behind it.** `connectedComponents` seeds
   adjacency from the stage's ids but then adds whatever an edge NAMES, so a stale edge
   pointing at a removed or filtered row emits a `positions` entry for an artifact that does
   not exist — promoting a real singleton into a labelled 2-ring orbiting an empty slot. It
   stops short of a crash only because components always start from a real id, which makes
   `byId.get(comp[0])!` safe today. That assertion is one traversal-order change away from a
   TypeError, so fix the seeding rather than the symptom.

9. **Freeze the three `EMPTY_*` selector constants.** They are mutable and process-global: a
   consumer's `.push()` or in-place `.sort()` poisons every later mount for the process
   lifetime. Cheap and well-pinned — and the test already says that freezing them will turn it
   red, that this is an improvement, and that the reader should update the test rather than
   revert. The blast radius stays contained only because the three constants are separate
   instances, so do NOT "tidy" them into one shared empty; that consolidation is pinned
   against.

10. **`access_denied` is not terminal** — it never clears the turn refs, so events after the
   denial keep driving the HUD behind an access-denied surface.
11. **Stale origin URL.** `origin` points at `process-spawner.git`; GitHub reports the repo as
   `edgy-solutions/cortex-ui`. Harmless while the redirect stands; every clone and CI
   reference breaks at once when it is retired. Fold into the next repo-touching chore.

---

## Characterization campaign

Coverage: **7.12% → 13.21% → 15.5%** of lines, each figure measured against a clean tree with
`all: true` so untouched modules cannot be hidden from the denominator.

Done: `useComposerDraft` (10), `sessionIsolation` (13), `useInterviewAgent` (33),
`useCanvasStore` (50), `useCanvasStore.selectors` (20). Suite: 15 files / 230 tests, ~7s.

In flight: `answerDisplay` + `stageLayout` in `lib/` — pure functions, no mocking, and they
decide what is literally read on screen. The invariants that matter there are
never-synthesize (a missing summary degrades to the question as a LABEL, never dressed up as
an answer) and list/map agreement (the canvas groups via the same helpers the sidebar list
does, so a test asserting only coordinates would pass while the two surfaces disagreed).

Rules that carried the campaign, kept here because each was earned by a red-proof:
- **Characterize, don't repair.** Behaviour that looks wrong is filed, not fixed.
- **Value plus provenance tag.** Where Electric is the boundary, assert both — Electric writes
  the same correct value, so a wrongly-sourced write is invisible to a value-only assertion.
- **Every derived guard needs a positive control.** A derivation that silently returns nothing
  passes vacuously and reads as coverage while being none.
- **A completeness check needs a behavioural arm.** Presence-in-source and effect-at-runtime
  are different claims: importing a store and forgetting to call it satisfies the first and
  leaks anyway.
- **When a guard blocks a legitimate change, ask what stronger property it was
  approximating.** Threading the unit through a closure broke a wiring guard that named one
  callback by name. Loosening it was the easy path; instead it became "a tickFormatter is
  present" PLUS a new arm that every axis uses the SAME one — because two axes with different
  formatters would render one in dollars and one bare on the same card. The refactor that
  threatened the guard ended up extending its coverage.
- **A formatter's unit tests prove it works; only a wiring guard proves it runs.** Deleting
  `tickFormatter` from every axis left the whole formatter suite green. A correct, unused
  formatter is exactly the broken axis you started with — the render-layer form of
  presence-in-source versus effect-at-runtime.
- **The red-proof is design feedback, not just verification.** A mutation that fails to go red
  means either a weak guard (add a test) or a weak mutation (rewrite the mutation) — telling
  those apart is the judgment the technique requires.
- **A test for a runaway condition must bound its own runaway.** A broken selector never
  reaches an assertion — it renders forever — so a render-loop test without a ceiling fails by
  hanging the suite, which is worse than not existing. The ceiling belongs above a stable
  result and below the framework's own limit, so the error that fires NAMES the cause instead
  of surfacing as a generic depth crash.
- **A derived guard should enumerate, not enumerate-and-hope.** The selector sweep derives its
  population from the module's exports, so a sixth selector carrying the trap fails by
  existing rather than by someone remembering to add it to a list.
- **A test may state its own obsolescence condition.** The mutable-empties test says plainly
  that freezing those constants would turn it red, that this would be an improvement, and that
  the reader should update the test rather than revert the fix — so a cheap improvement arrives
  welcomed instead of fought.
