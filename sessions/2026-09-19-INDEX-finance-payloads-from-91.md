# The eight finance post-projector payloads — placed by lane 91, 2026-09-19

**Not committed, by instruction.** Eight `2026-09-19-payload-finance-*.json` files beside this
one, one per prompt on `docs/measurements/finance-walk-sheet.md`.

**fleet: `c0005142` (post-roll). repo: `ia-91/lane/91` at `f6b3457`.**

## What these are

The **real post-projector payload** for each finance prompt — what the screen was handed, not a
description of it. Captured through the walk census runner's own fire path, so the ask is
identical to the census's and to the browser's: same `frontend_id` (`cortex-ui-desktop`), same
persona (`PROGRAM_FINANCE_ANALYST`), same domains, same user (`alice`).

That last point is load-bearing. Asked without a registered `frontend_id` the fleet correctly
refuses a live view and every archetype comes back `KNOWLEDGE_DOCUMENT / refused` — a hand-typed
probe would have produced eight wrong cards that look like a broken fleet.

Read `projected` first in each file: `archetype`, `row_counts`, and the payload verbatim.
`routing`, `census_verdict` and the raw SSE `events` follow.

## What they show

| prompt | archetype | rows | census |
|---|---|---|---|
| give me the program brief for NP-MERIDIAN | KNOWLEDGE_DOCUMENT | markdown | PASS |
| why are we over on NP-MERIDIAN | VARIANCE_TREE | 1 (+nested contributors) | PASS\* |
| which account is driving the overrun on NP-MERIDIAN | **VARIANCE_TREE** | 1 | **FAIL** |
| what is the funding status on NP-MERIDIAN | SHORTFALL_GRID | 18 | PASS\* |
| what is the burn rate on NP-MERIDIAN | MULTI_SERIES | 6 rows, 2 series | PASS |
| show me CPI and SPI for NP-MERIDIAN | **ELICITATION** | 7 verb options | **FAIL** |
| what is the estimate at completion for NP-MERIDIAN | ELICITATION | 3 method options | PASS |
| compare the EAC methods for NP-MERIDIAN | COMPETING_MEASURES | 3 | PASS\* |

**\* These three read FAIL in the saved lexical baseline and are PASS here.** Nothing about the
fleet changed for them: the census runner's `ROW_KEY` had no entry for VARIANCE_TREE,
SHORTFALL_GRID or COMPETING_MEASURES, so it looked the archetype up, got `None`, counted zero
and filed a full card against its floor. Fixed at `f6b3457` in the invincible-agent repo.
Re-judging these exact payloads with the fix flips all three. **Six of eight pass.**

**The two real failures are both ROUTING, and neither is a payload problem:**

* *which account is driving the overrun* — routes to `fin_variance_analysis` (VARIANCE_TREE)
  instead of `fin_variance_drivers` (CONTRIBUTION_RANKING). Stable across 3 fires. This is a
  regression: the saved baseline records it as a PASS.
* *show me CPI and SPI* — `route_status: no_match`, `fallback: no_verb_classified`. The card is
  an elicitation on the slot `verb`, offering 7 candidates with the correct one ranked FIRST, so
  retrieval found it and classification declined to commit. Stable across 3 fires.

## For the walk

The six passing payloads are drawn cards nobody has looked at yet — a green census row is not a
walked card, and every defect the cost walk found sat inside a payload that would have passed
route status, verb, archetype and a row floor. **These files are here so the card on the screen
can be compared against what the projector actually sent**, which is the only way to catch the
class the census cannot see.

Two things worth checking on the screen specifically:

* **CPI/SPI must carry NO currency.** `fin_performance_indices` declares no `value_unit` on
  purpose — CPI is a ratio and a dollar sign on 0.85 is a lie the producer would be telling. If
  a currency appears, absent-means-silent has broken somewhere below the payload.
* **The EAC comparison's high/low.** The payload carries `lowest_value` / `highest_value`; the
  contract reads that pair. Blank high and low on the card means the field names have drifted
  again.
