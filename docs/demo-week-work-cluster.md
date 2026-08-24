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
      Fix shape if needed, proposed not applied: `InputBar` keys on the same signal the
      surface keys on. Keeps the change in chrome, out of the turn's state machine.

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

## Runbook (during the demo)

- **Canvas blanks after clicking an answer** → `clearCanvas`. `setCurrentArtifact` accepts an
  id not in the collection and still latches `currentArtifactSetByUser`, which disables the
  auto-foreground that would otherwise recover.
- **Composer stays disabled after the refusal beat** → it re-enables when the stream ends; do
  not reload. Duration pending the denial observation above.
- **Do not double-press Enter.** A second Enter during a turn is silently dropped by the
  `mutation.isPending` guard — no message, no feedback. Plausibly the literal experience
  users report as "frozen".

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
6. **`access_denied` is not terminal** — it never clears the turn refs, so events after the
   denial keep driving the HUD behind an access-denied surface.
7. **Stale origin URL.** `origin` points at `process-spawner.git`; GitHub reports the repo as
   `edgy-solutions/cortex-ui`. Harmless while the redirect stands; every clone and CI
   reference breaks at once when it is retired. Fold into the next repo-touching chore.

---

## Characterization campaign

Coverage: **7.12% → 13.21%** of lines in one night, measured against a clean tree with
`all: true` so untouched modules cannot be hidden from the denominator.

Done: `useComposerDraft` (10), `useInterviewAgent` (33), `useCanvasStore` (50),
`sessionIsolation` (13). Suite: 14 files / 210 tests.

Next: **the `useCurrent*` selector slice** — `useCurrentArtifact`, `useCurrentRouting`,
`useCurrentSources`, `useCurrentGraphTrace`, `useCurrentGraphAlternates`. Their real invariant
is that hoisted `EMPTY_*` constants prevent a "Maximum update depth exceeded" loop, which is a
render-loop property a store-level test cannot observe — `renderHook` territory, same class as
the freeze finding.

Then: `stageLayout` / `answerDisplay` in `lib/`.

Rules that carried the campaign, kept here because each was earned by a red-proof:
- **Characterize, don't repair.** Behaviour that looks wrong is filed, not fixed.
- **Value plus provenance tag.** Where Electric is the boundary, assert both — Electric writes
  the same correct value, so a wrongly-sourced write is invisible to a value-only assertion.
- **Every derived guard needs a positive control.** A derivation that silently returns nothing
  passes vacuously and reads as coverage while being none.
- **A completeness check needs a behavioural arm.** Presence-in-source and effect-at-runtime
  are different claims: importing a store and forgetting to call it satisfies the first and
  leaks anyway.
- **The red-proof is design feedback, not just verification.** A mutation that fails to go red
  means either a weak guard (add a test) or a weak mutation (rewrite the mutation) — telling
  those apart is the judgment the technique requires.
