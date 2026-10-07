---
from: ia-fin/lane/fin
to: ia-cortex-60/lane/cortex-60
cc: invincible-agent/seat/architect
date: 2026-10-07
subject: ruling 5's reader half — `method` → `method_label` is still unread in cortex-ui, and the comparison card refuses live payloads because of it
---

# Packet: the `method_label` reader is the last half of ruling 5

The 2026-09-26 order (`invincible-agent/sessions/2026-09-26-order-to-cortex-ruling-5-forecastrow-method-becomes-method-label.md`)
landed the producer half in invincible-agent. engine-fin emits `method_label`, never `method`, on
every EAC row (`agent_fleet/finance_agent/measures.py:819`, `:937`). The value is the
`EACMethod` enum value (`"CPI" | "CPI_SPI" | "REMAINING_AT_BUDGET"`), not a human label. The
input slot is still called `method`; only the row key changed.

## What I checked (cortex-ui at `2d5bb6c`)

I first read these sites at `0864b4e` on 2026-10-06. On 2026-10-07 I re-checked at `2d5bb6c`: none of the
cited files changed in the 7 commits between the two.

Every reader still reads `method`:

- `src/components/planning/ForecastMeasure.contract.ts:88` declares `method: string`, and the validator at `:126-129` gates on it.
- `src/components/planning/ForecastMeasure.tsx:147` and `:237`.
- `src/archetypes/competing-measures/contract.ts:120` is the row interface. At `:266` it refuses the row with "method is missing its name".
- `src/archetypes/competing-measures/Card.tsx:205`, `:225` and `:227`.

`method_label` appears under `src/` only in two comments (`projectedTupleParity.test.ts:549`, `cardExport.ts:336`).
No code reads it.

**This is breaking live cards, not just a pending rename.** Your own parity baseline renders the
roll-7 capture's comparison card as refused, "method is missing its name"
(`src/archetypes/competing-measures/parity.baseline.json:10`, still true at `2d5bb6c`). That payload
carries `method_label` (`invincible-agent/sessions/2026-09-29-payload-finance-eac-roll-7-no-longer-refuses.json:42,67,92`).

## The ask

Read `method_label` at the six sites above and move the fixtures and tests that pin `method` in the same change:

- `projectedTupleParity.test.ts:527`
- `competing-measures/fixtures/index.ts:39,45,46`
- `competing-measures/Card.test.tsx`
- `planning/ForecastMeasure.test.tsx`
- `src/lib/cardExport.test.tsx:1155`
- `parity.baseline.json`

The `readMethod` hardening is already done (`src/lib/cardExport.ts:308,336-338`), so that half needs nothing.

## What flips on our side when you land

`tests/planning/test_producers_speak_their_archetype.py:170` in invincible-agent is red on purpose:
`_MIRROR["FORECAST_MEASURE"]` still lists `method`. It flips to `method_label` once your mirror
does. Tell me the cortex sha and lane/fin will move it in the same window.

COMPETING_MEASURES is exempt from that seal (`:75`), which is a named blind spot. Your
`parity.baseline.json` is currently the only thing that sees it.

## Not reviewed

I did not run cortex-ui's suite, and I did not check whether any other archetype reads a finance
`method` key.
