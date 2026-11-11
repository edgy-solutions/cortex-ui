# 2026-11-11 — cortex aligns "Export as…" to saf #356 (6a4175a2); held until the merge, pushed at a255a8e

**To:** Chris, the architect · **cc:** saf, Lane 1
**From:** cortex-ui/master lane
**Commits:** `f1210ce` (the alignment), `963b3c3` (a seal re-anchored for producer master drift), `a255a8e`
(re-pin to the #356 merge `8c3eb9af`), all on master, **pushed 2026-11-11** after #356 merged
**Rides:** 0.4.85 with #356, or not at all

## What was asked

Architect, via Chris (2026-11-11): align `src/lib/reviewExport.ts` to #356's wire and clear the (p) entries. Add
"Export as…" to the review page for the notice under review. Show "Select by range" only if 6a4175a2 serves a range.
Hold the commit and push it when #356 merges.

I read saf's packet first:
`sessions/2026-11-11-packet-to-cortex-ui-master-from-saf-356-exportable-states-the-state-names-as-served-and-the-reviewed-sample-profile.md`.

## 1. Wire alignment

- **Snapshot.** Re-pinned to the producer at `6a4175a2eef941a46976cda86f7b0bbf5a1b95cb`
  (`lane/saf-export-profile-server`, PR #356, open). `cortex-bff.openapi.json` sha256 is `61b529a4…`, and
  `SOURCES.json` was updated to match. `PRODUCER_REF` in `build.yml` moves to the same sha; its comment says the commit
  is held, and that it re-pins to the merge sha before the push.
  - Check 2: the task_kinds/review_shapes diff is empty. The control `aac9900b..6a4175a2` shows 5 files, so the probe
    is live.
  - Check 3: `uv.lock` moves iagent-mesh v0.9.15 → v0.9.19.
- **Listing.** `readExportProfiles` reads `accepts` (null means any kind), `grain`, `version` (an integer),
  `dedupe` and `exportable_states`. It type-checks each key when present and tolerates one that is absent. That is the
  11-11 lesson from 5bc4a57: a strict reader of a new key refused the whole list.
- **Route.** `POST /ingest/export/notices` sends `{notice_ids, profile}`, plus `check_only: true` for the pre-check.
  The key is omitted, not sent as false, because the body is `extra="forbid"`.
  - Picking a profile runs `check_only`, and its `unexportable[{notice_id, reason, state?}]` are listed before the
    download.
  - The download sends only the cleared ids.
  - A 422 `export_notices_unexportable` (the state changed after the check) adds the server's rows to the ones already
    shown. It does not replace them, because the retry must not resend an id the check blocked.
- **(p) register cleared.** The four `(p)` `AWAITING_DECLARATION` entries for `GET /ingest/export/profiles`
  (`accepts`, `grain`, `dedupe`, `version`) and their `(p)` sentence are gone from `client.ts`. The
  CORTEX-PROPOSED entries are gone from `client.requestSeal.test.ts`. `reviewExportCapability.producerSeal` now reads
  `POST EXPORT_NOTICES_PATH`. The cortex-proposed resolve route and `ExportScope` are removed.
- **Lasso targets.** For each selected notice, the kind comes from the status row's `content_kind`, falling back to the
  component. The state is the row's `stage` as served; saf's packet says these are the names `exportable_states`
  lists. Neither file spells a state, kind or profile name; the fixtures use `synthetic-state-a/b`.

## 2. "Export as…" on the review page

`ReviewExportAs` is mounted in `PromotionReviewCard` for the notice under review. It is the same dialog and the same
route as the lasso. It renders only when all of the following hold:

- the viewer holds `ingest:exportBatch` (the notices route's gate);
- the status row has a stage;
- at least one profile's `exportable_states` contains that stage.

The dialog offers only those profiles. A `state_not_exportable` row, from the check or from a 422, renders as
`<id>: state_not_exportable (state: <state>)`. The gate is re-read on every render, so turning the flag off after the
profiles load hides the button again.

## 3. Select by range — hidden

`6a4175a2` serves no range form on `POST /ingest/export/notices`: the body is `notice_ids` only, with
`extra="forbid"`. The range control is removed from the dialog. A comment in `reviewExport.ts` says it returns when
the route declares a range. The old promoted-only GET range route is not used for this flow.

## Step 1 — owed to the architect

**At v0.4.84 (`8e32f5b`), nothing in cortex exports a notice that is not promoted.**

- The per-card control (`ReviewExportControl`) renders only at `promoted`.
- `BatchExportPanel` used the promoted-only GET range route.
- The single-notice GET route returns 409 `ingest_not_promoted`.

After this commit, the only way to export a non-promoted notice is the new notices route, which the server gates on
`exportable_states`.

## Gate

The gate ran on a git-archive export of `f1210ce`, with the producer exported at `6a4175a2` (2782/2782 files):
transport, redproof, `npm run test` (with the report's mtime printed), tsc, seals and `build:bundle`.

**First run, on `f1210ce`: red.** transport, redproof, tsc, seals and bundle all exited 0. The test step exited 1:
322 files, 1 failed; 4905 tests passed, 1 failed (report mtime 14:47:59).

The failure was `presentationProvenance.producerSeal`'s arm "the row's target reaches the flat `reference` key". It
was **not caused by #356**:

- The producer rewrote that derivation on **master**, in `ab3fc16d` ("a measure's row declares where it reads").
- The literal `reference=dict(rnd["target"])` is present at the current pin `4f2dac35`, but absent at `origin/master`
  and at `6a4175a2`.
- No commit on #356 touches `measure_verbs.py`.

So any re-pin past `4f2dac35` would have reddened this arm, whatever it carried.

**Fix:** `963b3c3ed5fbaa4744fe3a9270e12b187aca8576`, also on `hold/356-align`. The claim still holds; only its
spelling moved. The arm now reads the four spans that carry it:

- `series, reference = _check_series(rnd` — a MULTI_SERIES row;
- `return series, dict(target)` — `_check_series` hands back the target;
- `dict(rnd["target"]) if rnd.get("target") else None` — any other shape;
- `reference=reference,` — the row carries it.

Each span had one mutant fired in the producer export. All four reddened, each with its own message. The fourth
mutant was first written so that its replacement still contained the anchor, so it never mutated anything; I re-fired
it with a real removal. The export was confirmed byte-identical to `6a4175a2` afterwards.

**Second run, on `963b3c3`:** cut off when the session restarted; superseded by the third run.

**Third run, on `a255a8e`: green.** This is the re-pin to the merge `8c3eb9af`, and it includes `963b3c3`.
- **Inputs:** git-archive exports of both repos (cortex at `a255a8e`, producer at `8c3eb9af`).
- **Steps:** transport, redproof, tsc, seals and bundle all exited 0. Tests: 322 of 322 files passed; 4906 passed,
  1 skipped, 9 todo (report mtime 22:29:55Z, written by this run).
- **Seal instrument:** 490 cross-repo arms ran, 0 did not run, 0 files missing from the report.

## Mutants (17 planned, plus 3 re-fires)

Each mutant was fired alone against its intended test files. An arm only counts if it reddens.

| id | mutation | result |
|---|---|---|
| N1 | `profilesFor`: some-state → every-state | red |
| N2 | `accepts: null` refuses the profile | red |
| N3 | a profile with no `exportable_states` is offered | red (3) |
| N4 | an unknown kind blocks an `accepts` list | red |
| N5 | an unknown state blocks the offer | red |
| N6 | `check_only: false` sent instead of omitted | red |
| N7 | the download sends all ids, not just the cleared ones | red (2) |
| N8 | a stale check result is not dropped | red |
| N9 | download enabled with no check | anchor missed (not fired) |
| N9b | the same, re-anchored | **survived** → added the arm "a failed check leaves the download disabled" |
| N9c | the same, against the new arm | red |
| N10 | the 422 rows replace the check's rows | red |
| N11 | the `(state: X)` text dropped | red |
| N12 | the review button ignores an unknown stage | red |
| N13 | the review button ignores the capability/flag | **survived** → added the arm "hides again when the flag goes off" |
| N13b | the same, against the new arm | red |
| N14 | a non-string `state` accepted in an unexportable row | red |
| N15 | a non-integer `version` accepted | red |
| N16 | the lasso state is never read from `stage` | red |
| N17 | `accepts`: every-kind → some-kind | red (2) |

The implementer's first build also had a defect that no mutant was needed to find: a 422 replaced the check's rows,
so a retry would have resent ids the check blocked. I fixed it as the join described in §1 and added an arm for it
(N10 reddens that arm).

## Questions

1. **Two export controls on a promoted notice.** `ReviewExportControl` still renders at `promoted`. It uses the GET
   single route, gated on `can_export` only. When a profile lists the promoted stage, `ReviewExportAs` sits beside it.
   I kept the old control so a viewer who holds `can_export` but not `ingest:exportBatch` does not lose export.
   Retire it, or keep both? This is the architect's call.
2. **Mock mode.** `FIXTURE_PROFILES` list synthetic states, so in mock mode the review button shows only for a
   synthetic stage, never a real one. This is deliberate (config names the case), but a demo in mock mode will not
   show it.
3. **saf: manifest wording.** At `6a4175a2`, the gating manifest's `POST /ingest/export/notices` row still says
   "promotion" in its preflight description. This may be stale, since the route now gates on `exportable_states`. It
   is cosmetic, but worth fixing before merge.
4. **saf/Lane 1: PR title.** At 14:44 on 2026-11-11, #356 was still OPEN with head `6a4175a2`, and its title still
   reads "… notice route (not on 0.4.85)". The ruling puts it on 0.4.85, with cortex riding along. The title is
   presumably stale; whoever owns it should correct it, so the release notes don't contradict the ruling.

## #356 merged: re-pinned, gated, pushed

#356 merged at `8c3eb9afe2b1f843b265662a4b0f63170898669e` (second parent `6a4175a2`). The architect accepted
`963b3c3` and ruled, via Chris: push when the gate on `a255a8e` is green, with "select by range" hidden. Range is not
on 0.4.85; saf adds a range form (with `check_only`) on the next train, and cortex unhides range then. The navigator
answers wait for Lane 1's ADR.

- **Re-pin `a255a8e`.** Both OpenAPI snapshots are byte-identical to `6a4175a2`'s. Check 2: the task_kinds and
  review_shapes diff `6a4175a2..8c3eb9af` is empty (control `aac9900b..8c3eb9af`: 1 file). Check 3: iagent-mesh stays
  v0.9.19; edgy-dag-tools moves 0.13.0 → 0.14.0, and no cortex code reads it.
- **Lane 1's check.** I ran the merge's three served rows through the branch's own `readExportProfiles` and
  `profilesFor` (a throwaway probe, deleted afterwards, 1 of 1 passed):
  - `review` → `part-list-reviewed` only;
  - `promoted` → `default-csv`, `default-json`, `part-list-reviewed`;
  - `extracting` and `received` → none, so the button is hidden.
- **Push.** Master fast-forwarded `31a769b..a255a8e` (`f1210ce`, `963b3c3`, `a255a8e`) and was pushed alone, so the
  pushed head is a code sha that builds an image. CI run `43112504700`.
- **Digest:** `ghcr.io/edgy-solutions/cortex-ui@sha256:cb902ea0b5876a8d3ebf97147bb931fe43775781bc32bce9955deef96f6e3b12` (tag `a255a8eb7d273804a0a131f3c8aec2209373b54d`). Read from the registry API with the full sha; negative control `53caff9b…` → 404, positive control `01fa3134…` → 200. Run `43112504700` concluded success, and its "Build and push frontend image (multi-arch)" step ran (not gated). Sent to Lane 1 for the 0.4.85 pairing PR: `invincible-agent/sessions/2026-11-11-packet-to-lane-01-cc-architect-from-cortex-a255a8e-is-built-cb902ea0-export-as-aligned-to-356.md`.
