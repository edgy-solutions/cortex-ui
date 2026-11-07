# 2026-11-06: the flow card reads `render` as served (`0dc5366`), the board item is placed, and the paused-run card stays held

Dispatch (Chris): "cortex: flow card: read the served render block now that #255 is merged (fixture table until sandbox serves); paused-run card stays held; board item for fromMaintenanceBridge.ts."

## Commit (master, pushed)

| sha | What |
|---|---|
| `0dc5366` | `fix(flow-decomposition)`: read the served render block |

Image for `0dc53663d3ce029610473f5474d9f91540d3f12b`: `sha256:6cf3367b5970f1066eaccbbe2aee4a69e5cc14c230950b0c5d40230a234c0b1e` (run 42339570719 succeeded: tests, tsc and image build). GHCR controls: the short tag `0dc5366` and the full `14df323` sha (sessions-only) both return 404, and the full `93d76e8` sha returns 200 `sha256:13e8dd5a…`.

## 1. The render block

**What #255 serves** (invincible-agent `agent_fleet/finance_agent/main.py`, the dataset envelope):

- `render` is `{**row.render, "other_label": OTHER_LABEL}`, which is `{shape, value_label, unit?, other_label}`.
- The top level carries `value_label = row.render.get("value_label", row.name)`.
- Contract rule 7 says: "Units and label are per table, in `render`".

**Defect.** The header read the top-level `value_label`. On a row with no label, that is the row's name.

**Fix** (`contract.ts`):

- `valueLabel` is `render.value_label`, then the top level.
- A `render.shape` that names another archetype adds a fifth finding, `shape_mismatch`. The table still draws.
- `FLOW_DECOMPOSITION_ROW`, `reads` and the accepted tuple are unchanged.

**Fixtures.** `GOOD_RENDER` and `PLAIN_RENDER` are now shaped as served, and the top-level `value_label` echoes them. A `shape_mismatch —` fixture was added.

**Tests:**

- The Card note loop now iterates `FLOW_NOTE_KINDS`, so a new kind can't go untested.
- Two header arms check that render wins, and that the top level is used only when render has none.
- A reader arm checks the mismatch text and that a missing shape raises nothing.

**Mutants fired** (all die, on the arm meant to catch them):

| Mutant | Dies on |
|---|---|
| top level read first | `expected 'row name (USD)' to be 'Net amount (USD)'` |
| fallback removed | `expected undefined to be 'row name'` (no header drawn) |
| shape note never raised | 3 arms: the reader arm, the fixture's declares, the note loop |
| shape note for the served shape too | 7 arms, including "the good fixture … toEqual(['zero_subtree'])" |

## Gate (rootE, HEAD 14df323 + the 5 changed files; the 18 earlier non-sessions changes checked byte-equal, 0 mismatches)

| Step | Result |
|---|---|
| check:transport | 0 |
| redproof | 0 |
| npm run test | **1**: 313 files, 4739 passed, **1 failed**, 1 skipped, 9 todo. The report mtime 22:37:44 is this run. |
| tsc | 0 |
| check:seals | 0. INSTRUMENT: 472 ran, 0 did not, 0 missing |
| build:bundle | 0 |

**The one failure:**

- **Which test:** `src/components/ApprovalTask/promotionRuns.test.tsx` › "flag off: the same promote has NO review_coverage key".
- **Error:** `Test timed out in 5000ms` (5275 ms). The arm has no explicit timeout, while its neighbour sets `180_000`.
- **Rerun alone in rootE:** 57/57 passed, in 79.9 s.
- **Relation to this change:** the file names nothing from flow-decomposition (0 hits).
- **Reading:** this is a load timeout, not a regression. I didn't touch it here. If it recurs it needs its own timeout, the same as the neighbour's.

CI's full suite on `0dc5366` passed (run 42339570719), which independently confirms the timeout was load.

## 2. The board item: placed, uncommitted

`invincible-agent/board/items/01M6T3M9MZ74CZJ4T0W6HRRW5Q.md`, lane `cortex-ui/master`, `later`.

- **The defect:** `fromMaintenanceBridge.ts:26` branches on `"maint_fault_propose"`.
- **Done when:** the case route the card reads is live. It names Lane 1's #283 `GET /cases/{id}` as that route.

Cortex can't run `render_board.py` (no Python) and doesn't commit in that repo, so the packet asks Lane 1 to commit the item and render BOARD.md.

## 3. The paused-run card: held

No code, per the dispatch.

## Placed, uncommitted, in invincible-agent/sessions

`2026-11-06-packet-to-lane-01-cc-fin-from-cortex-the-flow-card-reads-render-as-served-a-board-item-to-commit-and-one-question.md`. It covers:

- the render fix;
- the board item;
- that the 11-07 packet was read and is held;
- the `data_provenance` question;
- the lane-74 correction.

## Read

- **Lane 1, `2026-11-07-packet-to-cortex-…-the-case-read-serves-stage-options-declaration-and-artifact.md`** (untracked here). `GET /cases/{id}` gains `stage`, `output_artifact.{artifact_id,label}`, `options_declaration`, `episode_id(_source)` and `predecessor`, on #283, which is not merged or rolled.
  - It quotes a case-panel directive "architect via Chris" with three items: link the artifact; show options on a closed case; `received` renders as "intake".
  - **Held.** Cortex hasn't had that directive from Chris, and the route isn't live.
- **fin → architect, cc cortex, `2026-11-05-…-time-phasing-census-and-three-premises-to-rule-before-the-rows.md`.** It is addressed to the architect for a ruling: A1, an SDK render-declaration model that cortex mirrors under parity, or A2, without one. Nothing for cortex until that is ruled.

## A correction to the 11-05 report

It said "No work until Lane 1 serves the verb". The where-used verb is lane 74's board item, `01M6QGKFZQ8VQQ0FT8P18Q98W0` ("architect 2026-11-06: where-used goes to 74"). The resolution case fields are Lane 1's (#283).

## For Chris

1. **The cut.** You ruled 0.4.80 pins `93d76e8`. At invincible-agent `origin/master` `2cc05912`:
   - the cortex pin is still `3077dfa6…` (`26a2049`);
   - `_PROJECTED_ARCHETYPES` has no FLOW_DECOMPOSITION row (the MULTI_SERIES row at `main.py:981` is the control);
   - the CHANGELOG has 0.4.80 *and* 0.4.81 "not yet cut", with neither mentioning cortex.

   `0dc5366` contains `93d76e8` and fixes the flow header for served data. Which one the cut takes is your call.
2. **`data_provenance`.** #255 serves the banner that stops a synthetic asset reading as real, but no tuple carries it and no card draws it. Should the flow (and MULTI_SERIES) tuple gain it? The tuple was accepted as proposed, so I haven't changed it.
3. **Lane 1's 11-07 case-panel items.** Is the "architect via Chris" directive ours to build when #283 is live? Is "intake" a word you want hard-coded, or one a served declaration should supply?
