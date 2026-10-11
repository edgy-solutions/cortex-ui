# Report: four dispatch items, and the 186 and 187 pins

**For:** Chris. **From:** cortex-ui/master. **Date:** 2026-10-10.

## Pins

| Rev | Commit | Digest | Contents |
|---|---|---|---|
| 186 | `865c0805aaf57fbbbf934cb26ae42da6b7b57b0a` | `sha256:2c45d36a87d8f773a11ee79b5d54233a6f566e66b07b645d61b324f2e5f8a536` | #2, #5, #6 |
| 187 | `15d6f95bf54d8ac4bf892acf96c4e5b4671f891f` | `sha256:ecf9ba88cebb82b47d65814719cf91aeaedad8f5cf289bd8ed2c502daae88f7f` | adds #7, #4, #8, #9 |

- Every digest was read from GHCR with controls (short sha 404, fake 404, `3ea967f` 200), and every build ran with 0 image steps skipped.
- Lane 1 has the 186 pin in `66b053c`. The 187 pin is in `sessions/2026-10-10-packet-to-lane-1-rev187-pin-and-three-wire-asks.md`.

## The four items

| # | Item | PR | State |
|---|---|---|---|
| 1 | A refused document keeps its prose | #7 → `ec3248e` | Merged. The refusal header draws first, then the `markdown_content`. |
| 2 | #4 amendments | #4 → `d528b0b` | Merged. Details below. |
| 3 | Review card | #9 → `15d6f95` | Merged, **behind `VITE_REVIEW_ROW_EDITS`, OFF**. Details below. |
| 4 | Hazard refusals (saf) | #8 → `c36abbe` | Merged. Details below. |

**Item 2, the #4 amendments.**
- The kind is inferred, and the user is asked only when it is ambiguous. In that case nothing is pre-selected and Send stays held until they pick.
- "My drops" persists per user and re-fetches status.
- A duplicate shows the original's id and live status.
- PCN walk #5 was updated to match, and the mock walk passes 3/3.

**Item 3, the review card.**
- Built: delete-row, add-row, corrected badge with the extracted value struck through, and a three-reason Reject. There is no retry button.
- **Why everything is behind the flag:** the platform has no row-edit field. It also answers grouped `rejected` with **501 `grouped_reject_not_wired`** (gateway.py:3593-3600), so Reject is gated too.
- An honour arm turns red if the flag defaults on before the platform is ready.
- Click-from-evidence was not built: the evidence pane is a placeholder with no selectable text.

**Item 4, hazard refusals.**
- `hazard_closed`, `not_assessed` and `unknown_hazard` get headlines.
- The `hazard_id` chip and `gap` line render only when those keys arrive. The platform's `_refusal_envelope` strips them today, so the hazard is named only in the `reason` text.

**Mutants.** Every item's mutants were fired, and each went red on its intended assertion. That includes two from #4 that I sent back because they had gone red for the wrong reason.

## Asked of Lane 1 (in the 187 packet)

1. Add `hazard_id` and `gap` to `REFUSAL_ENVELOPE_OPTIONAL`.
2. Wire grouped `rejected` to `submit_decision` and keep the comment. Proposed: a `reason_code` field (`not_a_notice | parts_list_unusable | superseded_or_duplicate`).
3. Declare a `row_edits` field (`deleted` / `added` / `corrected`) on `HumanTaskActRequest`. The flag stays off until 2 and 3 land.

Sent earlier (`ed47e82`):
- a duplicate drop mints a row, which was ruled a server bug;
- a `GET /ingest?mine=1` list route;
- the cad extension table.

## Still open

- **Export `documents[]`.** Waits on the architect. IA #21 ships in 186, so a mixed board's export button reads `partial` with no link until then.
- **DELTA_SET seal.** Waits on Lane 1's lot 3 capture.
- **Worktrees.** About 10 stale ones are under `.claude/worktrees/`, and cleanup is safe now that their PRs are merged. I haven't done it unasked.
- **Not run.** No new screenshots for #8 or #9 (no registry-card harness). The live PCN walk has never been driven against the sandbox.
