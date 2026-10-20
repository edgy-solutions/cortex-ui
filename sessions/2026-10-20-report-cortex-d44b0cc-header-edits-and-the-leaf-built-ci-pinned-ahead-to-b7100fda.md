# 2026-10-20 report: d44b0cc is built (header_edits, the row editor, the leaf); CI is pinned ahead to b7100fda

Written for: the next cortex-ui session, and Chris.

## What landed

`d44b0cc88264e0c731ea0f96f38d61a8b4f9902c` is on master and built, image
`ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:b248af5c686ca772538f1e8f6c9cdcecf4a6bc451fac1595f00a0dadc0edc0b1`.
- **Run:** 39357361722, 34 of 34 steps green.
- **GHCR controls:** the short sha and a fake sha return 404; 47e96ea resolves to `sha256:82ef1ddc…`.

Changes:
- **Row editor:** fix, delete or add rows, sent as `row_edits` on `promoted`.
- **Title-line editor:** corrects `mfr`, `notice_id` and `notice_date`, sent as `header_edits` on `promoted` only.
  - The prefill `evidence_ref` is `p<n>`, from the pane's new `page()` getter.
  - A value equal to the extracted one is refused. The extracted value is `/extraction`'s `notice` block, which
    is the server's own `_review_notice_summary`.
- **Both editors:** they sit behind `VITE_REVIEW_ROW_EDITS`, and the 503 lock covers them.
- **Leaf:** the topline shows the leaf (PCN or PDN). A null leaf stays `kind ?`.
- **ADR-0017 console line:** prints `unchanged: true|false|absent`.

## How it was proven

- **Full suite:** 236 of 236 files, 3485 tests. It ran against a git-archive export of b7100fda, with the mesh SDK
  as a local clone at v0.9.8, the snapshot's pin. This removed the 198 gate's one environmental red,
  meshSdkParity's "pin names a RELEASE".
- **Static checks:** tsc, check:transport and build:bundle are clean.
- **Mutants:** 10 of 10 killed, each on its named arm. The script is `scratchpad/mut199.mjs`.
- **Seal against 016473bb:** 4 HeaderEdit arms go red with named messages. The other 17 arms stay green.

## CI pin: AHEAD of the fleet

`PRODUCER_REF` is now b7100fda, on `origin/lane/01-197`. The fleet is still on 016473bb.
- The build.yml ledger entry says to re-pin to 199's BFF sha, read off the pods, once 199 rolls.
- Lane 1 was asked not to rebase or squash the lane. A rewritten sha stops being fetchable, and every CI run would
  go red at checkout.

## Open items, owned elsewhere

- **Sandbox flag (Lane 1):** `values-sandbox.yaml` at b7100fda still sets `VITE_REVIEW_ROW_EDITS: "false"`. Until
  it is lifted, bob cannot make the TYC correction through cortex. Raised in the packet, §1.
- **Old reject-code aliases:** Lane 1's report said cortex still sends them. Cortex does not (`git grep` on HEAD
  finds neither), so Lane 1 can drop the aliases.
- **Q9:** which wipe proves the replay is the architect's call. Cortex removes nothing until it is proven.

The packet is `sessions/2026-10-20-packet-to-lane-01-d44b0cc-is-built-header-edits-and-the-leaf-pin-it-for-199-the-sandbox-flag-blocks-the-tyc-proof.md`.
It is placed uncommitted in invincible-agent's `sessions/`; the copies are byte-identical.

## Next for cortex

1. After 199 rolls, read the BFF sha off the pods and re-pin `PRODUCER_REF`.
2. Run a Chromium probe of the editors on the published digest. jsdom cannot see a browser-only failure.
3. Still open: when a task returns 404, open it by `case_id`.
