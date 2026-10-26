# Overnight report, cortex-ui/master, 2026-10-25: the API refactor PRs, the document review card, the finance "which program?" choice, and Q14

The sandbox is frozen through the dry run. Nothing was rolled, primed or fired, and no cluster read was made. Every PR below was gated in the CI layout: a git-archive export of the commit, beside an export of the pinned producer `2705c335` and an SDK clone at v0.9.8.

## PRs

| # | Branch | Item | State |
|---|---|---|---|
| 31 | `refactor-4-dead-paths` | 4: dead paths out | CI passed |
| 32 | `refactor-2-typed-client` | 2, pass A: one typed `request()` over committed OpenAPI snapshots; `PRODUCER_REF` → 2705c335 | CI passed |
| 33 | `card-document-review` | directive 3: the `document` review card, PROPOSED shape | CI passed; rootE gate 3887/0/9, seals 388/0 |
| 34 | `refusal-with-candidates` | directive 4: the finance picker asks "which program?" as a choice | CI passed; rootE gate 3878/1/9, the 1 a load timeout (passes alone 6/6); seals 388/0 |
| 35 | `review-route-message` | Q14: a review route's failure shows the server's `message` | CI running at filing; rootE gate: 6 timeouts under load, all 6 files pass alone 42/42 |
| — | `refactor-2b-response-types` | 2, pass B: generated response types + the response seal | not started; will be stacked on #32, so NO CI gate |
| — | `refactor-3-registries` | 3: registries derived or server-sent | not started; will be stacked on pass B, NO CI gate |
| — | `refactor-5-documents-adapter` | 5: one adapter for the rail and the review card | not started; spec written, off master |

**Merge order:** #31 first (it deletes `requestPortfolioCanvasSeed`; #34 does not use it, but the two conflict textually in `client.ts` and `SemanticInterpreter.tsx`), then rebase #32 and delete its `UNDECLARED_ROUTES` ledger (all three of its routes die in #31). After that come pass B, then 3. The card and refusal PRs are independent of the refactor chain, but conflict with #30 in `ApprovalTaskCard` and with #32 in `client.ts`.

## Digests

- **Master `f01ec76`:** `sha256:d043180814d290fd21a8762373dbaf83739eb4be05a3b1f189a170a7eece30a7`.
- **`70836f4`, `2154c4e`, `691844c`** (sessions-only) built no image, as designed.
- Pin to `f01ec76`'s digest, not to master's head.

## Producer facts measured tonight

- **Platform master is `db7db75c`.** `docs/api/` is unchanged since 2705c335, and its `gateway.py` changes are body-only.
- **Q14 (`3e9b25a9`):** with the Topaz URL unset, the review gate answers 503 `{error:"authorization_unconfigured", message:"the deployment declares no authorization directory"}` on `/ingest/{id}/source` and `/extraction`.
  - The string `message` is there, as the architect assumed.
  - Cortex's `reviewRouteFailure` (`promotionReview.ts:442`) drew only the code: "The extraction could not be loaded (503 authorization_unconfigured)."
  - Fixed in #35: any status that reaches the generic line (not a plain 404, not a 403) now shows a non-empty `detail.message` after the code.
- **The architect's 10-24 kind-field ruling:** `review_shape` and `label` are content-kind fields in the platform overlay.
- **fin #97 merged** to platform master as `e676f58e`, with #98 folded in. It answers the `/canvas/seed` 409 with `detail.ask`, and the policy at `detail.ask.policy` (ruled; fin corrected their packet in place).
- **fin #103** (`93b8894d`, open) declares the seed's 200 and 409 in the BFF OpenAPI. Every field #34's reader reads is declared with the same name and placement.
- **Noticed, not ours yet:** fin reports the platform test `test_every_bound_archetype_is_in_the_ADMISSION_VOCABULARY` red since `db7db75c`. It reads the sibling cortex-ui checkout, so it may be measuring our tree. Unchecked.

## Blocked on others

1. **7f's `document` leaf and its label.** `ingest_status.py:108` still reads `("pcn","pdn")`. Once it lands, `INGEST_LEAVES` (now derived from the v1 enum) picks it up, and the kind row's label comes from the registry.
2. **Lane 1 and 7f: ratify the `document` review shape** (packet placed).
3. **Fin:** merge #103 (then cortex re-pins and the census row 23 updates), roll cortex-bff with #97 (after the freeze), and answer the free-text question (packet placed).
4. **#30** merges with 208, then cortex re-pins.

## Packets placed in invincible-agent/sessions (uncommitted; our copies are committed here)

- `…-packet-to-lane-01-and-7f-the-document-review-shape…`
- `2026-10-25-packet-to-fin-from-cortex-takes-shape-b-the-409-renders-as-a-choice-103-matches-our-reader.md` (ours committed in `691844c`, with fin's packet)

## The CI-layout gate is load-sensitive, not red

On a loaded box, the whole-tree seals (hook order, task_state, drawn lineage, feature flags, Node builtins, reachability) hit vitest's 5000ms per-test default. That was 1 timeout in a 189s run and 6 in a 306s run. Every one passes alone, and CI passed on #31–#34.
- Worth a ruling: raise `testTimeout` for the scan files only, or leave it. A seal that times out reads as red, but it says nothing about the code.

## Next, in order

1. Pass B (`refactor-2b-response-types`, stacked on #32), then item 3, then item 5. Specs are written.
2. After #31 merges: rebase #32 and delete `UNDECLARED_ROUTES`. Rebase #34 (`client.ts`, `SemanticInterpreter.tsx`).
3. After #103 merges: re-pin the BFF snapshot, and update census row 23 (`/canvas/seed` now has a UI caller).
4. Directive item 1 waits on 7f's leaf token (`document` or `work-instruction`) and its label.
