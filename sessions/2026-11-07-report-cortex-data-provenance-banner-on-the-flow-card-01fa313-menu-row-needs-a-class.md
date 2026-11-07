# 2026-11-07: the flow card draws the `data_provenance` banner (`01fa313`); its menu row needs a `mesh:` class first; the case panel waits for 0.4.81

**Dispatch (the architect, via Chris, pasted by Chris):**

1. "0.4.81 is cut at f08217b2 with cortex 93d76e8; 0dc5366 is the 0.4.82 pin. #283 is in 0.4.81, rolling today."
2. "data_provenance rides every served table — flow and MULTI_SERIES rows gain it (fin serves; the projector row carries it; the card shows the banner). Ruled 11-07."
3. "The case-panel items are mine … yours to build once 0.4.81 is rolled: artifact link when served, offered options on a closed case, top-level stage. 'intake' is not a word in code — the runner serves the label for the received state with its stage declaration … Build against #283's served shape."

## Commit (master, pushed)

| sha | What |
|---|---|
| `01fa313` | `feat(flow-decomposition)`: draw the data_provenance banner |

Image for `01fa3134adb287b648b59d5fa36ffaf8269ea2ab`: `sha256:2b625433582820a489303dc7dfebc8e1526e0af7ba55a4a768d32637a9c13adb` (run 42398781600 succeeded). GHCR controls: the short tag `01fa313` and the full `f8fdd2b` sha (sessions-only) both return 404, and the full `0dc5366` sha returns 200 `sha256:6cf3367b…`.

## 1. The `data_provenance` banner on the flow card

**What fin serves:** one string, `f"{banner} Source: {urn}"` (`finance_agent/asset_inputs.py:119`, `dataset_provenance`). Before this, no cortex card read `data_provenance` at all, and no projector tuple carried it.

**What the card does:**

- It draws the banner verbatim as `[data-flow-provenance]` above the chart.
- It also draws it above a refusal, because a refusal's raw-fields table still shows figures.
- A blank string draws nothing.
- `readProvenance` is shared by the table reader and the refusal.

`FLOW_DECOMPOSITION_ROW` and `reads` gain the field: `("value_label", "render", "verdict", "data_provenance")`.

**Fixtures and tests:**

- A new absence, `data-flow-provenance`, is declared by GOOD only, so it flips both ways.
- Three Card arms: the banner is verbatim and precedes the svg; a blank string draws none; a refusal still shows it.

**Mutants fired** (all die on their own arm):

| Mutant | Dies on |
|---|---|
| banner dropped from the chart | GOOD's declares, plus "is drawn verbatim, before the chart" |
| banner dropped from the refusal | "a refusal still shows it" |
| blank string accepted | "a blank string draws none" |
| row drops `data_provenance` | `defineArchetype`: "reads field "data_provenance" is not in row.passthrough" |

**MULTI_SERIES has no banner yet.** Its row mirrors the producer under `projectedTupleParity` by exact equality, so cortex follows once Lane 1's row carries the field. The packet proposes appending `data_provenance` and asks for the sha.

## Gate (rootE, HEAD f8fdd2b + the 5 files; the 5 files `0dc5366` changed were re-synced too)

| Step | Result |
|---|---|
| check:transport | 0 |
| redproof | 0 |
| npm run test | 0. 313 files, 4743 passed, 1 skipped, 9 todo. The report mtime 11:55:20 is this run. |
| tsc | 0 |
| check:seals | 0. INSTRUMENT: 472 ran, 0 did not, 0 missing |
| build:bundle | 0 |

## 2. Lane 1 says the flow card is on no menu. True, and the binding needs a class first

Lane 1's 11-07 packet (untracked here, `…-the-flow-row-is-built-and-held-no-menu-carries-the-archetype.md`) reports:

- The projector row is built and sealed on `lane/01-flow-decomposition-is-projected` (`01ef9bcb`), with no PR. It is held because the declared-shape selection matches `render.shape` against registered menus, and no menu carries FLOW_DECOMPOSITION.
- The board item is committed in #284 (now on master at `f08217b2`).

**What I checked at invincible-agent `f08217b2`:**

- The 0.4.81 cut's `_PROJECTED_ARCHETYPES` has no flow row. The control is `MULTI_SERIES` at `main.py:981`.
- `values.yaml:107` pins cortex `93d76e8` → `13e8dd5a`.
- `fin:VarianceDecomposition` exists (`finance_extension.ttl:128`).
- **No `mesh:FlowDecomposition` exists** in any `.ttl`. The control is `mesh:MultiSeries` at `mesh_system.ttl:535`.

So a cortex menu row would be refused at registration (Contract D) until the class lands. **Not built.** Lane 1 has put the binding to you and the architect. The order if ruled: the class (invincible-agent), then the cortex `assembleCapabilities` row, then Lane 1's projector PR.

## 3. The case panel: cortex's, gated on the 0.4.81 roll

The served shape is read (`de9f5fee`, `src/iagent/case_projection.py`):

- `stage` is top level.
- `output_artifact.{artifact_id,label}`, where `label` may be null, so the card falls back to the id.
- `options` comes with `options_declaration`.
- The received state's label is step 0's declared `stage` (module docstring rule (c): the validator admits `stage` only on step 0 and on a non-grouped `human_await`).

So "intake" comes from the definition the case carries. Nothing is hand-written. Lane 1's 11-07 note to you says 0.4.81 awaits your values-diff approval, so it isn't rolled. **No code yet.** The packet asks Lane 1 to say when it is live.

## 4. The board item

Lane 1 pointed out a stale line, so it now says #283 merged at `de9f5fee` and is in the 0.4.81 cut, not yet rolled, with `updated: 2026-11-07`. The edit is placed in invincible-agent's working tree for Lane 1 to commit.

## Placed, uncommitted, in invincible-agent/sessions

`2026-11-07-packet-to-lane-01-cc-fin-architect-from-cortex-data-provenance-rows-the-menu-row-needs-a-class-the-case-panel-is-ours.md`

## Read, not acted on

- **gov, `2026-11-06-packet-to-cortex-ui-master-from-gov-capabilities-is-on-me-entitlements-in-290-switch-canexportbatch.md`.** `GET /me/entitlements` gains a required `capabilities: list[str]` (ingest-v1 1.7.0). Cortex would:
  - regenerate `ingestV1.ts`/`bff.ts`;
  - switch `canExportBatch` (`src/lib/reviewExport.ts:71`) from `groups.includes(AP_GROUP)` to `capabilities` including `ingest:exportBatch`;
  - delete `AP_GROUP`.

  Not done: not dispatched, and it needs #290 on master.

## For Chris

1. **The flow card's menu binding** needs `mesh:FlowDecomposition` in the ontology first. Lane 1 has asked you and the architect to rule. Until then, the 93d76e8 card draws nothing on 0.4.81, as its CHANGELOG says.
2. **0.4.82:** the architect named `0dc5366`. `01fa313` contains it and adds the banner, which stays dark until Lane 1's row carries the field. Should 0.4.82 take `01fa313` instead?
3. **gov's #290 `canExportBatch` switch:** shall cortex take it once #290 is on master?
