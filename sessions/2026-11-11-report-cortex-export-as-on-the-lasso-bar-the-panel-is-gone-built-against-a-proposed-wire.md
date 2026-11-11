# 2026-11-11: "Export as…" is on the lasso bar, and the panel is gone. Built against a wire cortex proposed

**Dispatch (the architect, via Chris):** "cortex: report accepted; saf builds the server side. Build the UI
tonight behind reviewExport against saf's shape: "Export as…" on the lasso bar, a profile picker filtered to
profiles accepting every kind selected, the unexportable list before download, and "select by range" inside the
dialog. Remove the panel above the answers list. Not on 0.4.85."

**What landed:** `9dcffe9` (the feature) and `5bc4a57` (the seal ledger). Both are pushed to master.
- The 0.4.85 candidate is still `90b7c13`. Nothing here is on 0.4.85, and nothing was rolled.
- The digest of `5bc4a57` is at the end of this report.

## saf has not declared a shape, so cortex proposed one

No packet from saf names the export wire, and no branch shows `accepts` or `per_part`. So cortex built against the
shape the 2026-11-10 rulings (B) name.
- Every wire name is spelled once, in `src/lib/reviewExport.ts`, and marked PROVISIONAL.
- The placed packet sets out the wire and asks saf three questions:
  `invincible-agent/sessions/2026-11-10-packet-to-saf-cc-lane-01-architect-from-cortex-export-as-reads-this-wire-confirm-or-correct.md`
  (placed, uncommitted).
  1. Should the request carry `ingest_ids` or `notice_ids`?
  2. Is the POST gated on `ingest:exportBatch`?
  3. Is a separate resolve route what saf intends?

| | wire (cortex-proposed) | seal |
|---|---|---|
| Profiles | `GET /ingest/export/profiles`, plus optional `accepts[]`, `grain`, `dedupe`, `version` | Ledgered `(p)` in `AWAITING_DECLARATION`. Each entry goes red when saf declares the field. |
| Resolve | `POST /ingest/export/resolve` `{ingest_ids}` or `{from,to}` → `{notices[], unexportable[]}` | `NOT_TRANSPORT`, CORTEX-PROPOSED |
| Download | `POST /ingest/export` `{profile, ingest_ids}` → file + Content-Disposition | `NOT_TRANSPORT`, CORTEX-PROPOSED |

## What the user sees

1. **"Export as…" on the lasso bar** (`SelectionActionBar`, extracted from `GlobalCanvasStage`). It shows only when
   the `reviewExport` flag is on and `/me/entitlements` carries `ingest:exportBatch` (`useCanExportSelection`).
2. **The dialog** (`ExportSelectionDialog`) resolves the selection to notices.
   - Cards in the selection that are not notices are counted, and never sent.
   - A drop with no ingest id yet is listed as unexportable, with a reason cortex supplies.
3. **The profile picker** offers only profiles whose `accepts` lists **every** `content_kind` the server resolved
   (ruling 4).
   - A profile with no `accepts` is never offered.
   - When none qualifies, the dialog names the kinds.
   - Each profile shows `format / grain` and `v<version>`.
4. **The unexportable list** comes before the button, with the server's reason and code. The button reads
   "Export N, skip K", and only the resolved notices are sent (ruling 3).
5. **"Select by range"** sits inside the dialog. It is blocked while From is after To, and a range applied while an
   earlier resolve is still in flight wins.
6. **The panel above the answers list is removed** (`BatchExportPanel` and its test are deleted). Nothing in cortex
   calls `GET /ingest/export?from&to` any more.

## What proves it

**Twelve mutants**, each fired with `scratchpad/mutx.sh`. Each one reddened its intended arm, and every file was
restored byte-identical.

| Mutant | What it broke |
|---|---|
| M1 | `every` → `some` |
| M2 | an absent `accepts` is treated as accepting |
| M3 | unexportable ids are sent with the download |
| M4 | the unexportable list is hidden |
| M5 | an inverted range is not blocked |
| M6 | the stale-resolve guard is removed |
| M7 | the hook fetches with the flag off |
| M8 | a null ingest id is not set aside |
| M9 | non-notice cards are not counted |
| M10 | `accepts` entries are not validated |
| M11 | only the first notice's kind is used |
| M12 | the server's unexportable rows are dropped |

- **M6 survived at first.** I added the arm "a range applied while the selection's resolve is in flight wins when
  that resolve lands late", and it went red.
- **M2's first fire did not compile** ("no tests"). The re-fire was red.
- **M12's first anchor missed.** Once re-anchored, it was red.

**The gate.** It ran on a git-archive export of `5bc4a57`, with producer `4f2dac35`.
- transport, redproof, test, tsc, seals and bundle all exit 0.
- 321 files pass; 4865 tests pass, 1 skipped, 9 todo. The report mtime is 07:32:52 (fresh).
- All 490 cross-repo arms ran.

**The first gate, on `9dcffe9`, was red, and rightly so.** `client.responseSeal` caught
`fetchIngestExportProfiles` reading four fields the producer does not declare. `5bc4a57` ledgers them under a new
`(p)` tag: named by a ruling, not yet sent, read as optional. The seal's expiry arms will turn each one red once saf
declares it.

## Unchanged

- **The single-notice export** on a promoted review card is unchanged.
- **`ReviewExportControl.test`'s mock-mode arm** now expects the three provisional fixture profiles, including the
  sample `part-list` (`per_part`, one column, ruling 7's shape).
- **Rulings 5 and 6** (one route later, and the record of each export) are server-side. Cortex sends nothing for
  the record.
- **approvals[].task (A):** the case panel stays as it is. When Lane 1 sends the per-viewer sha, cortex adds the
  served-shape test only.

## Housekeeping (not acted on)

The implementer's `no-saved-secrets.sh` exits 1 on 10 `secrets.yaml` files.
- They sit in this session's scratchpad: invincible-agent git-archive exports `ia-*` and `root*` from earlier beats.
- They are not in either repo's working tree, and their contents were not printed.
- They go when the scratchpad is cleared.

## Image

**`5bc4a579d19d8201c57de5632d6390666b5424c8`** → `sha256:825c4a86fba577e10722c94284dc532a73e4c7a9cbebad24a94d5bf234f482d5`.
- **CI run 43030271931:** `success`. The step "Build and push frontend image (multi-arch)" ran and succeeded. It
  was not gated.
- **GHCR, read anonymously by full sha:**
  - negative control `53caff9b…` → 404;
  - positive control `01fa3134…` → 200;
  - `9dcffe9` → 404, as expected: only the head sha of a push is built.
- This image is **not a pin proposal**. Chris names pins, and the 0.4.85 candidate stays `90b7c13`.
