# Report: cortex-ui/master, 2026-10-08 (day). Pin placed, two no-absence packages, Friday dry run

Written for: the dispatcher of the 2026-10-08 "day" order, and the next cortex-60 beat.

## Commits and images

Each image was confirmed from the run and GHCR, with controls: the short sha 404s, a fake sha 404s, known-good 3ea967f gives 200.

| sha | what | image |
|---|---|---|
| `f358cc6` | SHORTFALL_GRID and DELTA_SET packages (`noAbsence`) | `sha256:528c7d7f336e38c67b02431e20cedbc3496f9b276683e588a996b01e17b14202` (run 37808036776, 0 steps skipped) |
| `0e8c998` | the Friday Playwright dry run | `sha256:27983ac25bd318b69561d0fc6f6526704dffadc67261ed8e1aaba6635ae75e94` (run 37811115605, 0 steps skipped) |
| this commit | sessions only | none (gated, by design) |

## 1. Pin: 942259f, placed by Lane 1

- Roll #21 reported: invincible-agent `3e73bdc8`, `docs/measurements/2026-10-08-lane-1-roll-21.md`. Helm rev 178 failed at the prime hook, which a concurrent doc-tools roll had orphaned, but the workloads rolled.
- The deployed BFF is `b16ae935`. It contains xml (`086a9cf0`), so the hold on bd782c5 is lifted.
- Cortex's packet named `942259f` → `sha256:401f76b3…`.
- Lane 1 placed it (`42940f40`, values-sandbox `cortexUi.image.digest`) on `lane/01-merge1008`, after measuring it independently (the full tag resolves; abbreviated and altered tags 404). That pin is **not rolled yet**. The sandbox still serves `840d5114` (bd782c5), rev 179.

## 2. Packages

**SHORTFALL_GRID and DELTA_SET: PACKAGED (`f358cc6`), but NEEDS YOUR RULING.**

What f358cc6 adds:
- `defineArchetype` takes `noAbsence: { reason }`.
  - An empty `absences` without it throws, and so do both together and an empty reason.
  - Every fixture's `declares` must be `[]`.
- Each package has three seals:
  - a population seal: no `data-*` name flips across fixtures + captures (SHORTFALL_GRID: 10 + 1; DELTA_SET: 8 + 0);
  - parity, byte-identical to baselines rendered before the move;
  - an **arrival arm**: it scans every `sessions/*.json` and goes red when a capture of the archetype lands outside the named list. That is DELTA_SET's lot-3 hook.
- Mutants K1, K3, K5, N1, N2 and N3 each went red for the named reason on both packages.

**The ruling question.** On request, Lane 1 amended ADR-0055 (`85ae3891`, on lane/01-merge1008): "a value the card BRANCHES on is the card's claim, so it needs an attribute". Cortex ran that test as a census over the same population:

| card | class tokens that flip | tags that flip | plain colour branches |
|---|---|---|---|
| SHORTFALL_GRID | 70 | 9 | cell colour on `state`; header dot rose/amber/cyan; "N short" |
| DELTA_SET | 41 | 4 | dot rose/emerald by degraded count; per-effect text colour |

Part of each count is the empty/refusal state and row multiplicity, which are not claims. The colour branches are claims. **So under the amendment, `noAbsence` is false for both cards.** The seal is green anyway, because it checks only attribute names.

- **(a) Recommended:** attribute the colour branches, declare them as absences, have the fixtures flip them, and add a class-flip arm to the `noAbsence` seal so the mechanism stays honest for a card that really has no branch.
- **(b)** Keep `noAbsence`, and Lane 1 narrows the amendment.

Packet: `2026-10-08-packet-to-lane-1-by-the-amendments-own-test-both-no-absence-cards-branch.md`.

**ELICITATION: WAITING on invincible-agent master.** Lane 1's fix, `3345597b` (sealed by `f1365e7f`), makes `disposition` required and `status` optional. It is on lane/01-merge1008. Cortex mirrors at PRODUCER_REF, never at a lane branch, so packaging follows the merge and the PRODUCER_REF bump.

## 3. Friday dry run: BUILT (`0e8c998`), with the label step as fixme

- **Run:** `npm run e2e:friday`. It is not in build or CI. Result: 2 passed and 1 fixme, about 20 s, on three runs.
- **Setup:** the real app, real client fetches, and a `.test` API host. Every route is served from an existing capture or a built-fixture hop.
- **Walk A:** drop → kind → review → reason → promote → `promoted` (hop 4b, the HYPOTHETICAL seven-field payload).
- **Walk B:** the same walk up to the act, ending in the 422 `promotion_payload_invalid` the live gateway gives today. Friday's human will see B, not A, until Lane 1 carries the 7 payload fields.
- **Assertions:**
  - the act body EQUALS `{decision, comment: trimmed reason}`;
  - the ApprovalTaskCard is on screen, fed from the `/me/human_tasks` row;
  - both reason boxes are found by their accessible name;
  - the census of unrouted calls must equal `[]`.
- **Label: `test.fixme`.** A component carrying `provenance_floor` reaches the browser only via `/electric/shape answer_artifact_projection`, which has no capture.
- **Uncaptured boot calls:** nine are answered 503 `not_captured` and named. The capture ask is in the packet.
- **Mutants:** E1–E5 each went red at the named step. E5, which removes the aria-label, takes the 60 s timeout to fail.
- **Setup notes:**
  - `VITE_NO_AUTH` alone leaves a blank page, because App.tsx waits for a `sub`. The dry run seeds a fake OIDC session in sessionStorage (test-only).
  - `@playwright/test` is pinned at 1.64.0. npm audit 6 → 6 (1 moderate, 5 high); deps 604 → 607.

## 4. MeshArtifacts: CLOSED as not applicable

Lane 1: `GET /artifacts/{id}` now gates through `GatewayArtifacts.get` with the same body, and has no list route. Of cortex's six per-shape reads, it replaces none. Its kind, `answer-artifact`, is unregistered, so cortex builds nothing.

## Local-only reds (unchanged)

The two `ingestKindStatusParity` arms run against the unpinned local invincible-agent checkout. Both are known; the file passes in the peer harness at 5cf7d879.
