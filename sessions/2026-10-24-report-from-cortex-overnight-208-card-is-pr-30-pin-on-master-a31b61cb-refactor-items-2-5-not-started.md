to: invincible-agent/seat/architect
cc: invincible-agent/lane/01
from: cortex-ui/master (the owning lane), 2026-10-24 (overnight)
re: "to: cortex-ui/master — overnight, the API refactor", items 1-5, and "Pin for 208"
relay: Chris

This report carries no secret. Cortex has not rolled, primed or fired anything, and has made no cluster read. A copy is placed, not committed, in `invincible-agent/sessions/`.

# Overnight: the inventory is out, the 208 card is PR #30 (green), and master is pinned to platform master `a31b61cb`. Refactor items 2-5 have not started.

## What landed

| what | where | state |
|---|---|---|
| **Item 1: the inventory** | `docs/api/consumed-routes.md`, at `eef4f79`, with a copy placed for Lane 1 | reported before any refactor, as you asked |
| **208, the steward's card** | [PR #30](https://github.com/edgy-solutions/cortex-ui/pull/30), tip `911a769` | CI is green (run 40066303212) at `PRODUCER_REF` `e8b4f346` (the `lane/01-208` head). **It merges when 208 does**, then re-pins to the platform master sha that carries 208. |
| **The pin on master** | `f5dbf53` | `PRODUCER_REF` moves `938d7639` → `a31b61cb` (platform master, chart 0.4.66), the move Lane 1's 10-24 packet handed over |
| **The 208 packet to Lane 1** | `4ee0375`, with a copy placed | it covers the review_task_id defect, Q1 again, the card, and `evidence_ref` |

**The master image:** `4ee0375`, `sha256:b98809a3614b23456047ec8b84e4d44543603766d82df14dcd6b379040b23f77`.
- **How it was read:** from the GHCR API, anonymously. As a positive control, `e0c3c6d` returned its known `c02ee0d2…`. As a negative control, `f5dbf53`, which was not the push head, returned 404.
- **Monday's pin is unaffected.** `f5dbf53` changes only CI and two test files, so 0.4.66's pin of cortex `e0c3c6d` does not need to move.

## The pin move on master (`f5dbf53`)

- **doorFields:** `leaf` leaves `AWAITING_DOOR`, because the door declares it since `0843efed`.
- **rowEditsWireParity:** `f0540cae`, which is on master, gave the three row models an optional `evidence_ref`.
  - Cortex withholds it, per Lane 1's 10-21 packet.
  - The seal records it as WITHHELD. Arms check that it is on all three models and is optional.
  - This is the same change PR #30 carried, and PR #30 was rebased onto it.
- **Checks:**
  - **task_kinds:** one file differs, and only in a comment (the control shows 123 files changed in all).
  - **iagent-mesh:** v0.9.10 at both pins.
  - **Gate:** the full suite passes, 248 files and 3784 tests, against a git-archive export of `a31b61cb`. tsc is 0.
- **The negative control:** I ran the same tests with `938d7639`'s `gateway.py` as the sibling. The 10 changed arms go red, each for the right reason ("cortex sends leaf but the door does not declare it", and "evidence_ref is not a field of …").
- **Not read off the pods.** The sandbox is at 0.4.61 and frozen. Re-read once 0.4.66 rolls.

## PR #30: the steward's half of 208

**The card.** It draws `document_empty_confirm`, using the declared verbs:
- [No parts in this document];
- [It has parts — page N], which needs an integer page of 1 or more, and the act body sends `page` only with this verb;
- [Add a missed part], drawn disabled with the producer's own sentence.

**The outcome.** Cortex reports the server's `stage`, not `workflow_resumed`.

**The audience.** It is exempt from the contradiction check, through `AUDIENCE_POOL_OF`.

**The `no_parts` stage:**
- it counts as done, and polling stops;
- it is shown as a neutral line, not a failure, with no Retry;
- the leaf chip is locked.

**Testing.** 11 mutants were run, and each one turned its named arm red.

**One finding is deferred.** The chip's `LOCKED_STAGES` list is hand-kept. `/leaf` decides by a chain of stage branches, not a tuple, so there was nothing to seal it against. It goes to refactor item 3. Cortex also locks the chip at `failed`, where `/leaf` allows a change. That is the conservative direction.

## The dropper's half of 208 is parked on Lane 1

Placed packet: `2026-10-24-packet-to-lane-01-208-review-task-id-names-a-promotion-task-never-filed-the-steward-card-is-pr-30.md`.

- **A producer defect.** At `review`, `review_task_id` is always `_promotion_task_id(...)` (`gateway.py:11756` at `e8b4f346`). An empty notice therefore names a promotion task that is never filed.
- **Q1 still open:** does the status row carry `review_shape` and `account`?

## Refactor items 2-5: not started

You asked for the inventory to be read first. Item 2 also cannot start until one question is answered.

**Item 2 needs a source for `/openapi.json` at the pinned sha. None exists yet:**
- `a31b61cb` and `e8b4f346` commit no OpenAPI document;
- `lane/01-ingest-v1` (`288a3007`) has `docs/api/ingest-v1.openapi.json`, but it covers 10 of the 41 routes cortex calls;
- this box has no Python, so cortex cannot render it from `app.openapi()` at a sha.

That leaves two ways to start:
- **(a) Lane 1 commits the BFF's full `/openapi.json` on platform master.** Cortex's script reads it from `../invincible-agent` at `PRODUCER_REF`, as every seal reads the producer now. This is offline and runs at the pin, and I recommend it.
- **(b) The script pulls the pinned BFF image and fetches `/openapi.json` from a local container.** This needs Docker on the box and in CI, and an image digest per pin.

**Your call, or Lane 1's: (a) or (b)?**

**Items 3-5 come after item 2's client module.** I will take them in this order:
1. Stop refusing unknown stages and nullables (v1 §7). This is also the general fix for the `no_parts` freeze.
2. The registries, one at a time, each with a test:
   - `LOCKED_STAGES` against `/leaf`;
   - `OBTAINED_VIA` against `provenance.py`;
   - the leaf lists;
   - the reject codes;
   - the render-menu keys.
3. The dead paths:
   - the origin dispute, but only after inventory ask 3 is answered;
   - the `suggestedKind` prop;
   - the self-poll on `IngestStatusCard`;
   - `/canvas/seed`;
   - compile;
   - the `mine:"failed"` fallback.
4. The `documents` adapter.

**The inventory's asks (§7) are still open.** None has been answered yet. Asks 1, 3 and 6 block parts of the work above.

— cortex-ui/master
