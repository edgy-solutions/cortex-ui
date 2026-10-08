# Report: cortex-ui/master, 2026-10-08. Two packages, a11y sealed, MeshArtifacts has no wire

Written for: the dispatcher of the 2026-10-08 order, and the next cortex-60 beat.

## Pins and images (each confirmed from the run and GHCR, with controls: short sha 404, fake sha 404, known-good 3ea967f 200)

| sha | what | image |
|---|---|---|
| `73cbd67` | xml as the third file kind; PRODUCER_REF → 5cf7d879 | `sha256:1f689f2bb6c57aecdf6a7e3400b3d6cd3a7d3afc1a0609a7fe3437d946186190` (run 37784131500) |
| `942259f` | a11y: approval card + ingest status card | `sha256:401f76b3076fe694e58b347047f13e43fdbfbc9c88ab71455d35cbb2aeb5142e` (run 37786414138) |
| `f0da7f9` | packages: VARIANCE_TREE, MULTI_SERIES | `sha256:8aea74250a44fac6c3901ddc79c4f2cb4996f44b5b5a2c56b8b18cd7f7d2fe9d` (run 37787664678) |

**⚠ Don't roll 73cbd67 or later ahead of the BFF.** The deployed cortex-bff is `3e6d9e9f` (read from the pods 2026-10-08). That is 61 commits behind the producer pin, and it does NOT contain xml (`086a9cf0`). Every image from 73cbd67 on offers xml in the kind picker, and the deployed door refuses xml.
- Roll cortex past bd782c5 together with a BFF at or past 086a9cf0, never before it.
- The ia-fin packet's pin, `bd782c5`, is correct until then.

## 1. Seals as captures land: WAITING

None of the three captures has arrived:
- lot 3 DELTA_SET;
- a live `/cases/{id}`;
- promote → label.

Lane 1's own handoff (`2026-10-07-handoff-lane-01-master-at-5cf7d879-…`, L79-82) lists them as still to send. Promote is also blocked on the producer: `POST` promotion needs the 7 PAYLOAD_FIELDS, and gateway.py at origin/master still registers 3.

Between the pin (5cf7d879) and origin/master (5b66fdc3), nothing cortex mirrors changed. The only diff is presentation_agent's SDK lockfile.

## 2. ADR-0055 packages

| archetype | outcome |
|---|---|
| VARIANCE_TREE | **PACKAGED** (f0da7f9). 8 absences; 10 fixtures + 2 captures |
| MULTI_SERIES | **PACKAGED** (f0da7f9). 2 absences; 11 fixtures + 1 capture |
| SHORTFALL_GRID | **NOT PACKAGED.** It emits no payload-flippable data-*; the only one is `data-cell-inspector`, which appears only after a click. Same stop as DELTA_SET in 68afc7a. |
| ELICITATION | **NOT PACKAGED.** The contract reads `status` (Elicitation.contract.ts:216). `slot_disposition.py:611` writes it, but the presentation agent's flat row drops it. Packet: `2026-10-08-packet-to-lane-1-elicitation-status-is-dropped-by-its-own-row.md` |

**How the two packages are sealed:**
- Zero visual change: the moved cards differ from their originals only in their imports.
- Parity is byte-identical against baselines rendered at the pre-move HEAD.
- Mutants:
  - K1: a class change turns parity red;
  - K3: deleting a baseline entry turns the key-set and floor arms red;
  - K5: an undeclared read makes defineArchetype throw.

  All three went red on both packages.

**For a ruling:** both packaged cards read `valid_as_of`/`state_version` outside their rows. They are passed outside `pick(reads)`, following the CONTRIBUTION_RANKING precedent.
- `state_version` travels per envelope.
- `valid_as_of` appears nowhere in the producer at the pin, and in no capture.

**Waiting on a capture.** These have a producer row but no renderable capture; the only mentions are refusals in `presentation_provenance`:
- INTERVAL_TIMELINE
- PERIOD_SERIES
- STEP_LADDER
- THRESHOLD_GRID
- MATRIX_GRID
- DELTA_SET
- FORECAST_MEASURE
- SOURCE_LEDGER
- NAMED_HOLE

CANVAS_SEED also has a producer row, but there is no cortex card for it.

**Outside ADR-0055 §4.** These have no presentation-agent row: tasks, other emitters, artifact-level surfaces.
- APPROVAL_TASK
- TRIAGE_TASK
- GROUPED_REVIEW
- HAZARD_DECLARATION
- CHART_WIDGET
- ASSET_STATE_METRIC
- DECISION_RECORD
- INSTANCES_BY_PROPERTY
- PROCESS_TOPOLOGY
- WORKFLOW_OBSERVATION

## 3. MeshArtifacts consumer: BLOCKED on the producer, nothing built

- `MeshArtifacts` exists only on iagent-mesh-sdk `origin/lane/ca-0.9.9` @ 60e56c9 (`interfaces.py:779`: `get`, `list_by_kind`). The v0.9.8 release doesn't have it.
- No gateway route serves it on any of invincible-agent's 70 remote refs. The SDK's own docs say "Worked examples: none exist yet."
- None of cortex's six per-shape reads (/cases, /ingest/status, /reviews batch, /notices provenance, illustration bytes, export download) is an artifact of a registered `kind`.

Building a consumer now would mean inventing a route, or inventing a second kind vocabulary. The SDK forbids the second outright.

Packet: `2026-10-08-packet-to-lane-1-and-ca-mesh-artifacts-has-no-wire-to-consume.md`. It asks for three things:
- the route's shape;
- which reads it replaces;
- a release that carries it.

## 4. Accessibility pass: DONE (942259f)

**What changed (attributes only):**
- Both reason inputs carry `aria-label="Reason for decision"`.
- 6 refusal/error divs are `role="alert"`.
- The outcome/stage displays are `role="status"`.
- The approval verb button now has `type="button"`.

**Keyboard:** the census found no clickable non-controls, no suppressed outline, no tabIndex and no radiogroup in either card.

**Seals:** one `*.a11y.test.tsx` per card, with getByRole by name and an AST seal whose floors are set at the census counts. Mutants A1–A5 each went red for the named reason.

**Not done:** KindPicker's `role="radiogroup"` has no accessible name. It is outside the order.

## Local-only reds (CI is green for all three pushes)

The full suite at f0da7f9's tree had 4 reds in 3 files:
- `meshSdkParity` "names a RELEASE": known.
- `taskKindParity` "two, they AGREE": known.
- **New:** the 2 `ingestKindStatusParity` arms. The local invincible-agent checkout (e2207468) predates xml, and the seal says UNPINNED. Run in the peer harness against 5cf7d879, the file passes 14/14.
