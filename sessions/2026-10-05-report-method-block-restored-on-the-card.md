# Report: the method block is restored on the card

**From:** cortex-ui/master · 2026-10-05
**Re:** "Restore method-block rendering on the card (formula, inputs, bound_defaulted, producer_sha); retiring the card export was not meant to retire the reader."

## Digest: it changed from d4bb0d2

**Pin 3ea967f8679da93f6e08011551ab36840ba354e3: `sha256:8b9299407305a45e7df133d24fd3e69d9921dee9a00b1cf7dcb7b8d42fe4c9c8`.**

- **The build:** run 37334871560, 34 steps, 0 skipped.
- **How the digest was read:** from the GHCR API, by the bare full sha.
- **Controls:**

  | Control | Result |
  |---|---|
  | short tag | 404 |
  | fake sha | 404 |
  | known-good d4bb0d2 | 200 (`sha256:c8a03678…`) |

- **Producer pairing:** unchanged. Use a producer at or after 1c10e28c; the deployed fleet is 4c3b61a6.
- **Don't pin this report commit.** It is sessions-only, so it has no image.

## What changed

**The lookup moved out of the retired button.** It is now `readArtifactMethod` in `src/lib/cardExport.ts`.
- It reads the component level first, then the envelope level.
- It is keyed on whether the `method` key is present, and has three outcomes:

| Outcome | Meaning | What the card draws |
|---|---|---|
| present | a readable block | the block |
| unreadable | a key was sent, but `readMethod` refused it | that it was not readable; this is never collapsed into absent |
| absent | the wire pops an unset method | nothing |

**`MethodBlockView` draws the block** with the export's semantics:
- the formula;
- the inputs, with units, and the absent mark where a unit is not stated;
- the bound, in three branches; a bound of 0 is a stated bound;
- `bound_defaulted`, as a tri-state;
- `producer_sha`.

**It is mounted inside `AnswerBody`.** That covers all five answer surfaces:
- StageCard, on both branches;
- CanvasPane, at two sites;
- PinnedAnswerCard.

Under a fallback, nothing is drawn when any component was withheld.

**The seal** runs the producer's executed `model_dump` (`src/lib/methodBlockPacketCapture.json`) through `AnswerBody`.

**projectedTupleParity:** the dated KNOWN GAP arm from 2026-10-04 is flipped. The card reads `method` again. The repo-wide row-guard and the census floor stay.

**Mutants:** M1–M7, plus bound-0 truthiness. Each one reddened its named arm.

## Effect on the rev-171 packet

Ask E1 ("does the server-built package render the method block?") is **no longer a gap on cortex's side**: the card draws the block again.

Whether the exported package also carries it is still worth knowing, but it no longer blocks anything here.

## Still waiting

- **DMC citation check:** waits for `label` = DMC on maintenance retrieval citations.
- **WORKFLOW_CASE check:** waits for `/cases/{id}`.
