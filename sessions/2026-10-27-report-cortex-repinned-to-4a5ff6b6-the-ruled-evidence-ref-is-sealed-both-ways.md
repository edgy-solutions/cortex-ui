# report: cortex-ui → architect · 2026-10-27 · re-pinned to platform #121; rowFractionSeal matches the regenerated schema

**Ask (architect, 10-27):** "when Lane 1's contract PR merges, re-pin PRODUCER_REF and confirm
rowFractionSeal matches the regenerated schema; nothing else should need to change."

**Done in `e09e2ac` (master, pushed).** Image: `sha256:57e4078925d3b1fe44724c207c262c0fb3e8315a718bba20eb564b67f8eea43a` (GHCR, full-sha tag; controls: f01ec76e → d0431808…30a7, short sha → 404).

## What changed

- `PRODUCER_REF` is now `4a5ff6b6` (the merge of lane/01-evidence-ref-contract, #121). b59e4a0f is its
  ancestor. Chart is still 0.4.70 at that sha: **no release carries #121 yet.**
- BFF snapshot re-taken. `EvidenceRef` is now `{page (int ≥1), bbox (4 × [0,1] | null)?, note (\S)?}`
  with `additionalProperties: false`. ingest-v1 is byte-unchanged. The types are regenerated and tsc is
  clean with **no other code change**, which confirms "nothing else should need to change". Cortex's
  reader types are local.
- Other doc changes that came with the pin: the extraction route's description, and
  `CanvasSeedConflictDetail.refusal` (required) with a new `CanvasSeedRefusal`. Nothing in cortex
  reads either yet.

## rowFractionSeal: the contract leg

The new describe at the foot of `src/lib/rowFractionSeal.test.ts` follows `ExtractionRow.evidence_ref`'s
`$ref` in the committed snapshot. It requires:
- the schema is closed;
- NEW_REF and MULTI_REF are accepted;
- OLD_REF is rejected by **EXTRA page_dims, units**, with **nothing MISSING**.

The validator fails on any keyword it does not read, so the schema cannot grow past it unnoticed.

| mutant (snapshot swapped, then restored; cmp identical) | result |
|---|---|
| the b59e4a0f doc | 2 red: NEW_REF "MISSING bboxes…"; OLD_REF has no EXTRA (the wrong-reason rejection) |
| `additionalProperties` removed | 2 red: closed-schema arm, OLD_REF arm |
| page_dims/units added as optional ("make the legacy keys optional") | 1 red: OLD_REF arm |

The NEW_REF/OLD_REF constants were **not edited**, so Lane 1's copies in
`tests/test_row_evidence_ref_is_7fs_wire_shape.py` stay valid.

## Checks

- Pods: **NOT read** (freeze). Re-read once a chart carrying #121 rolls.
- Check 2: the task_kinds diff over every task_kinds dir, b59e4a0f..4a5ff6b6, is EMPTY (control: 33 files).
- Check 3: uv.lock iagent-mesh is v0.9.10 at both.
- Gate (git-archive exports of e09e2ac and 4a5ff6b6 in the CI layout):
  - transport, redproof, tsc, seals and bundle all 0;
  - 268 files and 4054 tests pass (report mtime fresh);
  - cross-repo arms: 402 ran, 0 missing.
- CI: run 40620236919 green; INSTRUMENT 402 ran, 0 did not, 0 missing.

## From Lane 1's packet (committed in e09e2ac)

1. Snapshot refresh: done.
2. Refused refs arrive as `evidence_ref: null`, counted in `rows_without_evidence`. Cortex reads null as
   `absent`, so those rows **do not reach the #37 banner**. The banner names a check only for refs that
   arrive malformed. For refused refs the reason lives only in the BFF's WARNING log (check +
   field_path). If the architect wants the approver to see it, the reason has to travel on the wire.
   That is a PROPOSED ask, not made.
3. `quality` is no longer served. The card still draws cell/region/inherited/unknown
   (`PdfEvidencePane` `quality` prop). Whether that input came from `evidence_ref.quality` or from
   elsewhere is unchecked. It goes to dead-paths item 4, with the reader's page_dims branch. Neither
   is retired until a chart carrying #121 rolls.
4. `PartItem.evidence_ref` and get_batch `ingest_id` are **not** in #121. Lane 1 has routed them to
   the architect. Until then the disposition pane stays on provenance-by-mpn.
