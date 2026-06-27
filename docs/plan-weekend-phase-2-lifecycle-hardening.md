# Phase 2 plan — lifecycle-state hardening within the artifact collection

**Status:** Locked plan, ready to drive.
**Scope:** Client-side, mock-driven, no backend.
**Prereq:** Phase 1 landed — cortex-ui `4f359dc`.
**Banked finding driving this:** `[[phase-2-lifecycle-states-to-enumerate]]`.
**Discipline:** `[[verify-subtle-acceptance-by-inspection]]` extended to the
*honest* axis. Agent self-verifies *works*; user verifies *honest* and
*acceptable* by looking.

## Why this plan and not "harden the per-component states"

Phase 1 introduced FOUR new render states the one-shot UI never had:

1. **Pending artifact** — born pending, before routing/sources arrive.
2. **Failed artifact** — `pipeline_error` → `status: "failed"`.
3. **Finalized-with-partial artifact** — `stream_end` finalized a
   still-pending artifact with what it accumulated (three sub-shapes).
4. **Multiple-artifacts-in-collection** — canvas has N artifacts, one
   foregrounded, prior recallable in the store.

These are brand-new shapes, most likely to be un-art-directed because
nothing has looked at them yet. The history of this project's
silent-degrade catches lives in failure paths; Phase 2 treats them as
first-class. Per-component hardening (chart, doc, table) runs
alongside but doesn't *replace* lifecycle-state hardening.

## How you exercise each state — the mock scenario protocol

The mock emitter now parses a **leading scenario marker** off the
query. Set `VITE_MOCK_GROUNDING=1` (or click the dev toggle), then
type a query with one of these prefixes:

| Prefix | Scenario | What the artifact ends as |
|---|---|---|
| (none) or `@happy <query>` | Full success path | `status: "complete"`, full grounding + rendered_output |
| `@fail <query>` | pipeline_error at "retrieving" | `status: "failed"`, no final_payload, no routing |
| `@partial-no-payload <query>` | All stages + grounding fire, NO final_payload | `status: "complete"`, has routing/sources, `rendered_output: null` |
| `@partial-no-grounding <query>` | All stages + final_payload fire, NO route_decision/sources/graph_trace | `status: "complete"`, has rendered_output, empty HUD |
| `@empty <query>` | Full path but `final_payload.components: []` | `status: "complete"`, `rendered_output.components: []` |

The query body after the marker still drives the data heuristic
(`dashboard` / `superset` → catalog flavor; `grenade` / `assembly`
→ work-instruction flavor; default → maintenance flavor).

The real backend stream is **skipped** when mock-grounding is on, so
the artifact lifecycle is fully owned by the mock — no parallel-stream
interference.

## How you run it

```sh
cd cortex-ui
# One-time: install deps if you haven't.
npm install
# BOTH flags required for client-side-only dev:
#   VITE_NO_AUTH=true       — bypass the Keycloak gate (RequireAuth)
#   VITE_MOCK_GROUNDING=1   — own the timeline with the mock emitter
# Without VITE_NO_AUTH you hit a "Restricted Access" login screen and
# never reach the canvas; without VITE_MOCK_GROUNDING the artifact
# stays pending forever (no backend wired in local dev).
VITE_NO_AUTH=true VITE_MOCK_GROUNDING=1 npm run dev
# Open the URL Vite prints (usually http://localhost:5173)
```

## Enumeration — the states to drive, in order

### State 1 — pending artifact

**How to drive:** type any query (e.g., `who owns the customer 360
dashboard?`). The artifact is `pending` from submit until ~5.4
seconds (when `composing` completes and `final_payload` follows).

**What "works" looks like:** canvas shows a pending state; HUD
panels eventually populate as events arrive; no exceptions thrown.

**What "honest" looks like:**

- Canvas during pending: a clear "working on it" signal, NOT a
  blank or "awaiting" message (that would read as "nothing
  submitted yet").
- HUD before grounding events arrive: empty panels that read as
  "no data yet for this turn" — NOT pre-filled with stale data
  from a prior turn.
- Once events arrive: panels populate honestly, not synthesized.

**Your job:** look at the canvas during the 0-5.4s window. Is the
pending state distinguishable from "no query submitted"? Is the
HUD honest about not yet having data?

### State 2 — failed artifact

**How to drive:** type `@fail <query>` (e.g.,
`@fail rotor assembly checklist`).

**What "works" looks like:** canvas reaches an end-state at ~5.9s
(stream_end); no infinite spinner; the artifact's `status` is
`failed`.

**What "honest" looks like:**

- Canvas shows **"This attempt failed."** (the new failed empty-
  state copy, amber-rose tone) — NOT "awaiting mesh artifacts"
  (which would silently mask the failure as "nothing happened")
  and NOT a fake-complete render.
- ThinkingCard shows: `understanding`/`locating`/`choosing_action`
  as `done` (green checks), `retrieving` as `error` (red),
  `composing` as `incomplete` (amber HelpCircle — never reached).
  THE FOUR-WAY STATE DISTINCTION is the whole point: positive
  signals of success, positive signal of failure, honest signal
  of "never confirmed."
- HUD: routing card empty (no `route_decision` fired before
  failure); sources panel empty; graph-trace panel empty. Empty
  is honest — the engine didn't get far enough to produce
  grounding.

**Your job:** does the failure read as a failure, or does it read
as "nothing happened"? Silent looks-like-nothing is the
honest-degradation failure ADR-0023 explicitly modeled `status:
failed` to prevent.

### State 3a — finalized-with-partial: no rendered_output, has routing/sources

**How to drive:** type `@partial-no-payload <query>` (e.g.,
`@partial-no-payload who owns the customer 360 dashboard?`).

**What "works" looks like:** stream completes; artifact reaches
`status: "complete"`; no thrown exceptions.

**What "honest" looks like:**

- Canvas shows **"No components produced."** (the new empty-but-
  complete copy, amber tone) — explicitly different from
  "Working on it…" (pending) and from "This attempt failed."
  (failed). Three distinct empty states, three distinct meanings.
- HUD: routing card populated (a route_decision arrived);
  sources panel populated; graph-trace panel populated. The
  trust signals are intact even though the answerer-output is
  empty.

**Your job:** the failure mode here is "complete with no output
LOOKS like still-loading or like nothing happened." Verify the
three empty states are visually distinguishable.

### State 3b — finalized-with-partial: has rendered_output, no routing/sources

**How to drive:** type `@partial-no-grounding <query>` (e.g.,
`@partial-no-grounding rotor inspection`).

**What "works" looks like:** canvas renders the artifact's
components; artifact reaches `status: "complete"`.

**What "honest" looks like:**

- Canvas: renders the mock components (a KnowledgeDocument).
- HUD: routing card shows its own empty/awaiting state; sources
  panel shows empty; graph-trace empty. The HUD does NOT pretend
  to have routing it didn't receive — same honest-low-confidence
  discipline applied to "no signal at all" vs "weak signal."

**Your job:** canvas rendering shouldn't be mistaken for "fully
grounded answer" when the trust signals are absent. Verify the
HUD empty-state reads as "no grounding for this artifact" — not
just "nothing yet."

### State 3c — finalized-with-partial: empty components array

**How to drive:** type `@empty <query>`.

**What "works" looks like:** stream completes; artifact is
`complete` with `rendered_output.components: []`.

**What "honest" looks like:**

- Canvas: same "No components produced." amber empty state as 3a,
  but with HUD populated (this scenario fires all grounding
  events). The reading is "we routed successfully and produced
  zero components" — which is a valid honest answer (some
  queries genuinely have no components to render; the routing
  card carries the answer in its own way).

**Your job:** is "complete-but-zero-components" distinguishable
from "still pending" and from "failed"? All three end in the
canvas-empty path; the EMPTY-STATE COPY + tone is the
distinguishing signal.

### State 4 — multiple-artifacts-in-collection

**How to drive:** submit three queries in a row (don't wait
between them necessarily — they queue cleanly).

```text
who owns customer 360 dashboard?
rotor assembly checklist
m67 grenade work instruction
```

**What "works" looks like:** each query produces its own artifact
in the canvas store; the latest is foregrounded; prior artifacts
persist in the store.

**What "honest" looks like:**

- An **artifact-count badge** appears in the canvas top-right
  (`Artifact N of M`) once the collection has more than one
  entry. No metaphor commitment (no tabs, no spatial recall) —
  just a count so the collection growing is visible.
- The HUD always shows the foregrounded artifact's routing /
  sources / graph_trace — NOT an accumulation of all artifacts.
  (This is the per-current-artifact selector pattern Phase 1
  introduced. Verify it cleanly cuts to the current artifact.)

**Your job:** does the badge show `3 of 3` after three queries?
If you DON'T see prior artifacts in the UI, that's expected for
Phase 2 — the recall metaphor is deferred per ADR-0023. The badge
is the minimum-viable visible affordance proving the collection
grew.

### Per-component states (parallel track)

After lifecycle states pass, the per-component states get
hardened:

- KnowledgeDocument (covered by mock data above)
- Chart widget — including the banked
  `[[multi-dim-chart-normalizer-gap]]` (multi-dim "by X AND Y"
  queries collapse to duplicate-X bars).
- Tables, topology, hazard, digital-twin — exercise as time
  permits.

These run AFTER the lifecycle states because lifecycle-state bugs
will show through the per-component rendering anyway — fix the
foundation render first.

## The judgment protocol (per state)

For each state, the verdict is **three axes**:

1. **Works** — renders without exceptions; the right components
   mount; the artifact reaches its expected terminal state.
   *Agent self-verifies* (mechanical).
2. **Honest** — surfaces what the pipeline did (or didn't);
   doesn't synthesize; doesn't silently look-like-nothing-
   happened; the three end states (pending / failed / empty) are
   visually distinguishable.
   *User verifies by looking.* (Agent's good-faith attestation
   has the same blind spot the `Message.payload` catch demonstrated.)
3. **Acceptable** — the art-direction holds. Empty states have
   the right tone, the right copy, the right visual weight.
   *User verifies by looking.*

The user is in the loop on **honest** and **acceptable**. Agent
self-attestation on those axes will miss things — that's not a
knock on the agent, it's the structural reason the rule exists.

## When all states pass

Commit the Phase 2 fixes (mock-emitter extensions + empty-state
copy/tones + artifact-count badge + whatever else surfaces). The
hardening lands inside the foundation; the foundation grows
trust-worthy at each state.

Per-component states + the chart normalizer gap are a separate
arc that follows lifecycle hardening.

## When Monday's backend wires up

The mock emitter goes back to dev-only. The real gateway emits
the same events (`pipeline_stage`, `route_decision`, `sources`,
`graph_trace`, `final_payload`, `pipeline_error`, `stream_end`),
and the artifact lifecycle the mock just exercised runs against
real data. The Phase 2 hardening transfers — empty states, fail
states, partial states are all honest against real backend
behavior too (and probably MORE useful because the real backend
genuinely produces those states under load / failure / partial
data).
