---
from: cortex-ui/master
date: 2026-10-07
order: "Read method_label on finance components. DELTA_SET and /cases seals when Lane 1's captures land. Re-pin meshSdkParity to v0.9.8 once ca pushes."
---

# Report: method_label, SDK v0.9.8, and the illustration race

Written for: the human rolling cortex, and the lanes that pin it.

## Pin

| sha | what | image |
|---|---|---|
| `1e70904` | meshSdkParity → v0.9.8@e9739681 | sha256:3435e7c3f0b42ca1d70ed1605e16ac255a37243c6d6b84b56db641181e768f7b |
| `d7d6593` | method_label reader (ruling 5, consumer half) | **NONE.** CI went red on the race below |
| `bd782c5` | illustration test race fix (test-only) | sha256:840d51145e75478caed2971a821cf66b27f6b9ff7d05596365c7b6d9fd84c9b3 (run 37648100487) |

**Roll `bd782c5`.** It is the first sha that carries method_label and has an image.

## 1. meshSdkParity re-pinned to v0.9.8 (`1e70904`)

- ca pushed v0.9.8. The extractor's `--write` moved provenance v0.9.5@ceab07a → v0.9.8@e9739681.
- The mirrored sources are byte-identical. CI's "both peers present" step went green.
- **Local only:** the SDK disk sits on ca's diverged `lane/ca-0.9.9` branch, so `the pin names a RELEASE` is red on this box. CI checks out the pinned sha with tags.

## 2. method_label (`d7d6593`)

- **The change:** a straight rename. COMPETING_MEASURES and FORECAST_MEASURE rows now read `method_label`, which is MANDATORY, with no fallback to `method`.
- **Seals:** A1, A2 (a lone `method` refuses, naming `method_label`) and A3 (draws into `[data-method]`). Mutants M1–M3 all went red.
- **Parity baseline:**
  - roll-7: refused → **drawn**.
  - The 2026-09-19 eac-comparison capture: drawn → **refused**. It predates the producer half; this is the ruling working.
- **Packet to ia-fin:** `2026-10-07-packet-to-ia-fin-method-label-landed-flip-the-mirror.md`. It asks them to flip `_MIRROR["FORECAST_MEASURE"]`.

## 3. The illustration race (`bd782c5`)

- **The CI failure:** CI on d7d6593 failed in `fromPartRow.test.tsx`, hotspot "found" with zero highlighted elements. That is the third sighting of this flake.
- **The cause:** `drawn` is committed in render, but `Card.tsx` appends the SVG in a passive effect, so `settle()` could read the gap.
- **Proven:** I planted a 60ms delay on the append.
  - Under the old settle: 4 arms red across all three files, including the CI arm.
  - Under the new settle: 44/44 green with the delay still in place.
- **Card.tsx is unchanged.**

## Waiting

- **DELTA_SET (lot 3) and the live GET /cases capture:** neither has landed. Checked invincible-agent origin/master and `sessions/`. The seals follow when they arrive.
- **Held for the human:**
  - Lane 1's xml-KINDS packet, which waits on 086a9cf0 merging;
  - ia-gov's three CLAUDE.md rules.
