# Report: cortex-ui two-day dispatch, items 1–5, overnight 2026-10-06 → 07

from: cortex-ui/master · re: the five-item two-day dispatch
HEAD: `dabeeac` · image: `dabeeac` → `sha256:7cd6fb272379ae59e9344141eb2d8a9299d86211ee85cd7797800d6a8b320118` (run 37573600255; controls: short 404, fake 404, 3ea967f 200)

## Commits

| sha | item | what |
|---|---|---|
| `f2fe2d2` | 1, 3b | WORKFLOW_CASE projected from the maintenance_bridge TS mirror (SDK `e7db475`), parity extracted by sha; S1000D illustration wired to a parts row's icn/hotspot_id (pure, unmounted) |
| `87092e4` | 3, 4 | DOORS extracted-table viewer, INERT; ingest card through review → promoted → label on the PCN26-117 fixture |
| `3d44ee0` | 5 | every VITE_ flag reads container config at start (`VITE_MOCK_GROUNDING` was build-time only); guard over 249 files, arms A–E, mutants R1–R6 red |
| `85bbf0f` | — | CI fix: the bridge seal gated on an SDK `.git`, not on the module file (run 37569496180 skipped its arms; check:seals failed). ⚠ Also swept in item 2's five staged renames — HEAD red until `68afc7a`. No image. |
| `68afc7a` | 2 | CONTRIBUTION_RANKING (baseline 10) and KNOWLEDGE_DOCUMENT (baseline 11) as packages, zero visual change |
| `dabeeac` | 4 swap | sealed on Lane 1's live PCN26-119 rev-175 capture; Lane 1's case_opened packet committed |

## Per item

1. **WORKFLOW_CASE.** Fixtures come from the real types. The /cases swap waits on Lane 1 serving it (lane/01-cases). 48 bridge field paths (work order, parts, picture, label, provenance) have no home in the card contract. **That is an ADR-0055 decision.**
2. **ADR-0055 step 2.** Two of three are done. **DELTA_SET is not packaged:** it has zero captures and no data-* absences, so there is nothing to seal "zero visual change" on. **Decision needed:** wait for a capture, or seal on fixtures only. The KNOWLEDGE_DOCUMENT fallback is producer-side (UNIVERSAL_ARCHETYPES), so it needed no special case. Mutants:
   - K1, K3 and K5 went red;
   - K2 (the wide pass) is invisible, recorded as 1ba333d did;
   - K4 is not fireable on the frontend.
3. **DOORS.** `mesh:DoorsExportArtifact` is a doc-tools PHANTOM_OUTPUT. The viewer renders a `build_positioned_index` record, inert; the name and envelope are asked of Lane 1. **Illustration:** icn/hotspot values are placeholders, since no producer emits them.
4. **Ingest.** The live capture shows the promote refused, as predicted: 422 `promotion_payload_invalid` at hop 7, with the fixture's message equal to the live one **byte-for-byte**. The real promoted → label path cannot be captured until Lane 1 carries the 7 payload fields. The swap's mutants:
   - L1–L3 went red;
   - L4 stayed green (near side: the capture has no unknown key).
5. **Runtime config.** Done. `bin/inject-env.sh` is stale (4 keys, never in the image); left in place, **delete it on your word.**

## Watch items
- **`ingestKindStatusParity` is red locally and green in CI.** The producer master added `EVENT` (`caf94a75`), and the CI pin `4c3b61a6` predates it. The next pin bump turns it red; decide on event ingests together with the /cases swap.
- **check:seals on `dabeeac`:** green in run 37573600255 — "Cross-repo seals must have RUN" and its redproof both succeeded with the SDK and producer checked out, so the `85bbf0f` gate fix holds.
- **Full suite locally:** 7 red. Five are 5s timeouts that pass in isolation. Two are local-only producer-checkout arms (taskKindParity "two agree", ingestKindStatusParity).

## Open with Lane 1
The packet is `sessions/2026-10-07-packet-to-lane-1-promote-422-witnessed-live-case-opened-answered.md`. It covers:
- §1, the 7-field payload ask;
- DOORS name and envelope;
- the OpenDDIL dump mode;
- E1, H1 and I1;
- DMC.
