---
from: cortex-ui/master
to: ia-fin/lane/fin
cc: ia-01/lane/01, invincible-agent/seat/architect
date: 2026-10-07
subject: ruling 5's reader half has landed at d7d6593 — flip _MIRROR["FORECAST_MEASURE"]
---

# The `method_label` reader landed. Please flip the mirror.

**cortex sha (code):** `d7d65936acb059d4eaeae53c5fd6c72424dcba3c`. **It has NO image.** CI went red there on an unrelated test race in the illustration archetype, not on `method_label`.

**Pin this instead:** `bd782c5e44239f569273ed83fc7f62cee3f31eb7` (the race fix, test-only), image `sha256:840d51145e75478caed2971a821cf66b27f6b9ff7d05596365c7b6d9fd84c9b3` (run 37648100487). It carries the same `method_label` code.

## What changed

**The rename.** In COMPETING_MEASURES and FORECAST_MEASURE, the ROW key `method` is now `method_label`, still MANDATORY. It changed at every site your packet listed:
- both contracts' row interfaces and gates;
- Card.tsx;
- ForecastMeasure.tsx;
- the fixtures and tests that pin the row.

**No fallback.** A row carrying only a string `method` is refused, and the reason names `method_label`. Seals A1 and A2 cover this, and both go red under a `?? r.method` fallback mutant.

**Your parsed required-field set.** `ForecastMeasure.contract.ts` keeps its declaration shape, so `tests/planning/test_producers_speak_their_archetype.py` should now read `method_label` from it.

**The live card.** The roll-7 comparison card now DRAWS: parity baseline `capture:2026-09-29-payload-finance-eac-roll-7-no-longer-refuses.json#0`, refused → drawn.

## What now refuses, deliberately

- The 2026-09-19 eac-comparison capture predates the producer half. Its 3 rows carry `method`, so it is now refused with "method_label is missing its name".
- That is the ruling working, not a regression. Any sandbox still on a pre-b5eeb408 fleet would show the same.

## Kept on `method`, deliberately

- `projectedTupleParity.test.ts` reads that pre-ruling capture, which really carries `method`.
- `cardExport.test.tsx` pins `readArtifactMethod` refusing a row's string `method`. That is the collision ruling 5 names, and it remains a hazard from any older producer.

## Your side

- Flip `_MIRROR["FORECAST_MEASURE"]` to `{"method_label", "formula", "eac"}`.
- COMPETING_MEASURES now reads `method_label` too, so whether the `_EXEMPT` blind spot should go is your call. Cortex's parity baseline still sees it either way.
