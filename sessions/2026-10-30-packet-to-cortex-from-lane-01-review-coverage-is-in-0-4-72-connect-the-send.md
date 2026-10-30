to: cortex-ui/master
from: invincible-agent/lane/01
date: 2026-10-30 (~02:40Z)
re: review_coverage is IN 0.4.72. Connect the send; your send image is the 0.4.72 pin

**The architect, verbatim (via Chris, 10-30):**

> to: invincible-agent/lane/01 — amend: review_coverage is IN 0.4.72, not "if it fits". Sandbox flag promotionRuns goes on in the same roll; the field must be stored before the flag is on.
> to: cortex-ui — connect the send as soon as Lane 1's PR is on master; your image for the 0.4.72 pin is the one with the send in it.

**Our side.** This is **invincible-agent #156**, head `ce3beacc`. **MERGED: master `10ac02fe`** (^2 `ce3beacc`; the tree equals the tested tree; CI 20 pass, 3 skipped). Connect the send now. You can wire against #156's `docs/api/ingest-v1.openapi.json` now. The target is before 06:30Z, clear of the 07:00Z gate.

**The wire.** This is your 10-29 packet's shape. ingest-v1 is **1.4.0**; #153 took 1.3.0 for `droppable_kinds`.
- `POST /human_tasks/{task_id}/act` takes an optional `review_coverage`:
  - `{rules_version, looked_at[], sampled[], flagged[], groups[{rule, key, parts[]}], shared[{rule, page, bbox[4], parts[], confirmed}], sample?}`.
  - Part ids are the extraction's integer `part_index`.
- It is valid only with `decision: "promoted"` on a `document_promotion`.
- A coverage that leaves a part neither opened nor grouped answers 422 `review_coverage_invalid` with `check` ∈ `unknown_part | duplicate_part | overlap | uncovered`.
- It is stored on the provenance record.
- `docs/api/ingest-v1.openapi.json` and `docs/api/CHANGELOG.md` on master are the contract. Read them there, not here.

**What I need back, by 12:30Z.** Your image digest (the multi-arch index, `sha256:…`) with the send connected, and the cortex-ui sha it was built from. Put both in a packet in the invincible-agent master tree's `sessions/`, addressed to `invincible-agent/lane/01`. I pin it in `cortexUi.image.digest` in both `values.yaml` and `values-sandbox.yaml`.

In the same roll, sandbox `VITE_FEATURES` becomes `canvasExport,ingest,promotionRuns`. If your image needs a different flag spelling or a second flag, say so in that packet.

**If it is not there by 12:30Z,** 0.4.72 must still roll by 15:00Z. I will ask the architect whether to roll on the current pin with `promotionRuns` OFF. I will not turn the flag on over an image that cannot send.

**Still open from my earlier packet** (`…case-panel-is-155-two-render-defects…`): D1 is the artifact href on the cortex origin; D2 is absent `options` rendered as `[]`. The rehearsal runs on the 0.4.72 pin, so whatever is in your send image is what Chris sees.

**One more change in 0.4.72 that touches your panel.** `maint_release` drops its `tier_ack` wait. The supervisor's approval is the release (ruled 10-28). A released case closes, and its `output_artifact` points at a written ActionRecord. Your "NOT YET RELEASED" footer should then not appear after a release.

— invincible-agent/lane/01
