# 2026-11-08: canExportBatch reads the served capability; the case panel reads #283; the impact card waits for a served body

**Dispatch (pasted):** "cortex: impact card from the served where-used table (group by the
declared key; absent ≠ 0 rendered as absent); case-panel items against 0.4.81's served shape;
regen types when #290's master sha is named; canExportBatch switch."

## Commits (master, pushed)

| sha | What | Image |
|---|---|---|
| `96adc3f` | re-pin and regen at invincible-agent `c3b51ed7` (#290); `canExportBatch` reads `capabilities`; producer seal | `sha256:73777cfa4ffc7ddd689c07d9eaf9b14e5c85fb695bd6c11aab7de27e038e1100` |
| `3bc503d` | case panel against #283: artifact id, options declaration, case stage, guard | `sha256:c64ffd0ba2504c6726e3f4ee30e79c86baa6644f9779758cb6206f30c106f5bd` |

How the digests were checked:

- Each was read from GHCR with the full sha.
- Negative control: `53caff9` (sessions-only) gives 404.
- Positive control: `01fa313` gives `sha256:2b625433…`.

Both shas went through the full gate first, against a git-archive export of `c3b51ed7` placed as
the sibling:

| sha | Files | Tests passed |
|---|---|---|
| `96adc3f` | 314 | 4750 |
| `3bc503d` | 315 | 4764 |

Transport, redproof, tsc, seals and the bundle were 0 for both.

## 1. Regen and switch: done (`96adc3f`)

- The openapi snapshots and generated types are taken from `c3b51ed7` (ingest-v1 1.7.0), and
  `PRODUCER_REF` is re-pinned to it.
- Re-pin checks, `aac9900b..c3b51ed7`:
  - the old pin is an ancestor;
  - the sample overlay adds `safety_finding_review.yaml`;
  - iagent-mesh moves v0.9.12 → v0.9.13.
- `canExportBatch` is now true exactly when `capabilities` contains `EXPORT_BATCH_CAPABILITY`
  (`"ingest:exportBatch"`). `AP_GROUP` is deleted: capability, never group.
- The mock reads `FIXTURE_ENTITLEMENTS` through the same reader.
- New `src/lib/reviewExportCapability.producerSeal.test.ts` checks two producer facts:
  - the key is a row of `policy/capability_grants.yaml`;
  - `GET /ingest/export` is gated on `can_invoke(<key>)`.

  Three mutants each reddened their arm with the right message:
  - key case → 2 arms failed;
  - path → "no GET … entry";
  - producer gate → "not gated on the key".
- **Live:** 0.4.81 serves no `capabilities`, so the control stays hidden there until a cut carries
  #290 together with a cortex pin at or after `96adc3f`.

## 2. Case panel: two of three (`3bc503d`)

The served shape was read from `src/iagent/case_projection.py` at `c3b51ed7`.

- **Artifact.** The link is named by `label`, else `artifact_id`. The `released_at` half of the
  condition is kept: the producer never serves an undated artifact, and fixture 6's
  "prepared, not released" absence depends on it.
- **Options on a closed case.** They were already drawn whatever the stage, and are now tested on
  a served-shape body.
  - `options_declaration` is drawn as `definition_id · version`.
  - A served `null` declares `data-options-declaration-absent`, which is registered in the
    absence census and flipped by fixture 4.
- **Top-level `stage`.** It is drawn verbatim in the top line.
- **The guard** now also checks `output_artifact.uri`, `artifact_id`/`label`, `stage` and
  `options_declaration`.
- **Mutants.** Four (the artifact_id fallback, the case stage, the declaration absence, the guard
  uri) each reddened the intended arm.
- **Not built: the received row's label.** The served `_step_payload` has no `stage`, and
  `received` is a case-level transition, so it names no instance and carries no step_id. The
  architect said "the runner serves the label"; Lane 01 said "no field changes on my side". Cortex
  names the conflict and the one-line field. It does not spell the word. The pane keeps "no step
  recorded" for that row, which is true.

## 3. Impact card: gated, nothing built

- Nothing is served:
  - invincible-agent master `46df4825` has no `where_used`, `qty_per` or `ImpactRow` in `src/`,
    `docs/api/` or `policy/`;
  - the SDK `ImpactRow` has three fields, and the ruled row has nine.
- The packet asks lane 74 for four things:
  - the route and its capability;
  - where the group key is declared;
  - a wire capture with four rows: `qty_per` with the key missing, `null`, `0`, and a real
    number;
  - the ADR-0065 §4 refusal as it arrives on the wire.

## Placed, uncommitted, in invincible-agent/sessions

- `2026-11-08-packet-to-lane-01-cc-architect-gov-from-cortex-switch-landed-case-panel-two-of-three-received-needs-one-served-field.md`
  covers:
  - the switch sha;
  - asking for `01M6A9QDN1H2BGHWGD1407KPXM` to move to review;
  - the case panel;
  - the received-label conflict.
- `2026-11-08-packet-to-lane-74-cc-lane-01-ca-from-cortex-the-impact-card-waits-for-a-served-where-used-body.md`

## Next

- **fromMaintenanceBridge** (`01M6T3M9MZ74CZJ4T0W6HRRW5Q`) is unparked by 0.4.81 live.
- **The received label**, once Chris rules who serves it.
- **The impact card**, once lane 74 serves a body.

worktrees: under wt\<lane>\ (0 moved, 0 pruned, 0 under %TEMP%). `git worktree list` shows only
the main checkout. The gate roots in the session scratchpad are `git archive` exports, not
worktrees.
