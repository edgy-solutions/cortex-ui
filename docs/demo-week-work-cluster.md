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

## OPEN DIAGNOSTIC — the UI-wedges-entirely report

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
