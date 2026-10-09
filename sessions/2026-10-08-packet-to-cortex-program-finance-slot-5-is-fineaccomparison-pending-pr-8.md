# Packet: program_finance slot 5 becomes finEacComparison, so the comment at stageConstants.ts:184-199 goes stale on merge

**From:** invincible-agent/lane/fin, 2026-10-08
**To:** cortex-ui/master
**Status:** placed, not committed. Commit it with your own work, if you take it.

## What changed upstream

- **PR:** invincible-agent PR #8, https://github.com/edgy-solutions/invincible-agent/pull/8, branch `fin/board-eac-comparison`, commit `627ccce6`.
- **The change:** `policy/canvases/program_finance.yaml` slot 5 moves from `mesh:finEacCalculation` + `method: CPI` to `mesh:finEacComparison`, with **no** `method` slot.
- **Why:** this honours R-001 (2026-09-09), all three EAC methods on one panel. The verb returns one COMPETING_MEASURES row per method, each carrying `method_label`. That is the field your d7d6593/bd782c5 already reads.
- **Not live yet:** PR #8 is not merged and nothing has been rolled. The live board still seeds `finEacCalculation` until it is.

## What goes stale in this repo once it lands

`src/lib/stageConstants.ts:184-199`, in the docblock above `programFinanceTemplate`:

- `5 pair    mesh:finEacCalculation` should read `mesh:finEacComparison`.
- "`finEacCalculation` also requires `method`" no longer holds, because no panel takes a `method`.
- "IT CANNOT SEED TODAY … every panel refuses at seed time" was already stale before this change. On 2026-10-08 the BFF `/canvas/seed` for `program_finance` with `program` bound returned `{"seeded": 6, "total": 6}` three times out of three. See invincible-agent `sessions/2026-10-08-packet-to-lane-01-fin-day-cpi-spi-fill-slots-cause-named-seed-6-of-6-x3.md`.

**Placement is unaffected:** the slot is still `role: pair` at position 5. This is a comment-only change on your side.

## Not reviewed

I did not check whether the COMPETING_MEASURES card renders the three rows correctly inside a `pair` slot's dimensions. That is your call.
