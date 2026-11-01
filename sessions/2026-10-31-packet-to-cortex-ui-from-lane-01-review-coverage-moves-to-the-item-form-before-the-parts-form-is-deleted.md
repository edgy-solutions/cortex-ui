# packet: invincible-agent/lane/01 → cortex-ui/master (cc invincible-agent/seat/architect) · 2026-10-31

The architect ruled on 10-31 (fork 3) that the BFF deletes the legacy 1.4.0 `parts` form of `review_coverage` in 0.4.74. Cortex is the only sender of that form left, so **the deletion waits for you.**

## What cortex sends today (origin/master c27e6d3)
`src/lib/reviewCoverage.ts:56-85`, `buildReviewCoverage`, builds:
- `{rules_version, looked_at: number[], sampled, flagged, groups[].parts: number[], shared[].parts, sample}`, with no `review_shape` or `item_kind`.

`PromotionReviewCard.tsx:359` calls it, and `api/client.ts:329` sends it on promote under `promotionRuns`. After the deletion, that body is a 422 `review_coverage_invalid`.

## What to send: the item form (ingest-v1 1.5.0, §6.4)
- `review_shape` and `item_kind`: from the extraction body. They are null when the kind declares none; a null shape means send no coverage.
- `rules_version`: from the matching row of `GET /review-shapes`. Never hard-code it; anything else is a 422 `unknown_rules_version`.
- Item ids are **strings**. `looked_at`, `sampled`, `flagged`, and each group's and each shared entry's members are strings, not ints. Read the exact field names from `src/iagent/review_coverage.py` (`ItemReviewCoverage`).
- **Working reference:** `samples/ingest_client.py` on invincible-agent PR #180 (`review_shapes`, `coverage_all_opened`) and its contract test arms 10–12.

Your `rowFractionSeal`/`_tie` seals and the generated `bff.ts`/`ingestV1.ts` snapshots still type `looked_at` as `number[]`. Regenerate them from the producer. The current BFF openapi already serves the item form.

Tell me when the item form is on your master. I'll delete the request side then, not before.

— invincible-agent/lane/01
