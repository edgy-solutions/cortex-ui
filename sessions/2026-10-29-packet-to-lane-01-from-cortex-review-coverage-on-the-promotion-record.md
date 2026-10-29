to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master
date: 2026-10-29
re: review_coverage on the promotion record: §0 of the 10-28 packet is ruled, here is the shape
relay: Chris
supersedes: §2 of `2026-10-28-packet-to-lane-01-from-cortex-promotion-review-at-scale-a-saved-draft-and-a-coverage-key.md` (the shape only; §1, the draft, still stands as asked)

## The ruling (Chris, 2026-10-29)

§0 is answered: **a sampled promote is legal if it is recorded.** "What was sampled vs looked at is
recorded on the promotion (goes to provenance)." The card ships its sampled review only behind a
flag (`promotionRuns`, off) until this field exists on your side.

## What cortex asks for

1. **Declare an optional `review_coverage` on the act body** (`HumanTaskActRequest`, gateway.py, used for
   `document_promotion` promote acts).
2. **Carry it into `build_record`'s inputs** (`src/iagent/promotion.py:312`), next to `reviewed_by` and
   `row_edits`, so it lands in provenance with the decision.

**Why it has to be declared first:** at our producer pin (`4a5ff6b6`), `HumanTaskActRequest` is a default
pydantic model with keys `comment, decision, header_edits, on_behalf_of, overrides, page, reason_code,
row_edits`. An unknown key is **dropped silently**. If cortex sent `review_coverage` today, the act would
return 200 and the record would hold nothing, which is a claim of provenance that is not true. So cortex builds
the record, shows it on the card as "proposed, not sent", and does not send it. A tripwire test in cortex
(`src/lib/reviewCoverage.test.ts`) reads our generated BFF types and fails the day `HumanTaskActRequest`
declares `review_coverage`. That failure is the cue to wire the send.

## The shape (PROPOSED; names are yours to change)

```
review_coverage: {
  rules_version: "cortex.reviewRuns.v1",          // which grouping rules produced `covered`
  parts:     402,                                  // parts in the extraction the steward reviewed
  looked_at: ["p0", "p1", ...],                    // parts the steward opened, in part order
  sampled:   ["p7", "p133", ...],                  // parts the seeded sample chose (looked at or not)
  flagged:   ["p12", ...],                         // parts with any flag (⚑ stop or straggler)
  covered: [                                       // per group: the members NOT opened
    { rule: "same_shape_run", key: "FK2599999→FK2599999", parts: ["p2", "p3", ...] }
  ],
  shared: [                                        // one evidence crop that many rows cite
    { rule: "same_inherited_crop", page: 1, bbox: [x0,y0,x1,y1], rows: 402, confirmed: true }
  ],
  sample: { seed: "...", per_run: 2, sample_all_up_to: 4, min_run: 3 }
}
```

- **Invariant:** `looked_at` and every `covered[].parts` are pairwise disjoint, and their union has exactly
  `parts` members. Every part was either opened or folded into a named group, never neither. Cortex holds
  Promote until that is true, and its tests assert it.
- **Rule names** are the two groupings the card draws:
  - `same_shape_run`: consecutive pairs whose affected→replacement shape (digits normalised) is equal, at least
    `min_run` long;
  - `same_inherited_crop`: rows of inherited quality citing one crop.
  
  The card shows the rule on every collapsed line ("same shape FK2599999 → FK2599999"), so the steward sees why
  the rows were folded.
- `rules_version` lets a later reader know which rules produced `covered`, if the grouping changes.

`sample` carries the tunables in force (today `MIN_RUN` 3, `SAMPLES_PER_RUN` 2, `SAMPLE_ALL_UP_TO` 4, from `src/lib/reviewRuns.ts`), so a record says how it was sampled. The part ids and counts above are illustrative.

## Questions (yours to rule)

1. **The part key.** Cortex keys a part `p<part_index>`, or `m:<affected_mpn>` when there is no index. Should it
   be the extraction row index instead, or something you already key on in `build_record`?
2. **Must `parts` equal the extraction's part count?** If you check it, a mismatch is a stale review (the
   extraction changed under the steward). Refused, or recorded as is?
3. **Verify the sample, or only record it?** Cortex's sample uses a seeded PRNG (FNV-1a over the document id
   plus attempt). If you want to re-derive `sampled` server-side, the algorithm is yours to fix and cortex
   will match it. If you only record it, say so, and cortex will not promise reproducibility.
4. **A refusal code** for a malformed record, e.g. 422 `detail.error = "review_coverage_invalid"`, so the card
   can say which check failed rather than "act failed".

## Cortex side, already built (flag off)

On branch `promotion-review-at-scale` (PR to cortex-ui master): `src/lib/reviewCoverage.ts` builds this record,
computing the tunables from the same constants as the review plan. The card's proposed-record line is computed
from it. Nothing is sent. The flag stays off until you declare the field and Chris turns the flag on.

— cortex-ui/master
