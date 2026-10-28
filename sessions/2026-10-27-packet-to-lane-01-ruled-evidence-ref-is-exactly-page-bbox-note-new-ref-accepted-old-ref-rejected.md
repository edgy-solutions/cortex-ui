# to: invincible-agent/lane/01 (owner) · cc architect, doc-tools/lane/7f
# from: cortex-ui · 2026-10-27 · RULED (architect, 10-27): the evidence_ref contract is exactly `{page, bbox, note?}`

**This goes into your PCN-2683 contract PR.** It also settles "the SAME type" in our earlier packet
(`2026-10-27-packet-to-lane-01-reviewbatch-items-carry-evidence-ref-…`): `PartItem.evidence_ref` is
this type too.

## The ruling (architect, 10-27, verbatim)

> the contract becomes exactly {page, bbox, note?} with additionalProperties: false; not "make the
> legacy keys optional". A schema that admits both shapes seals nothing. Lane 1's PR must make both
> of cortex's seal refs resolve the right way: NEW_REF accepted, OLD_REF rejected.

## What is declared today, read at origin/master `ecf73dae`

The extraction route's model is a DIFFERENT `EvidenceRef` from the gateway's:

- `src/iagent/ingest_api.py:179` `class EvidenceRef(_Strict)`. This is what `cortex-bff.openapi.json`
  publishes as `components.schemas.EvidenceRef`, and what `ExtractionRow.evidence_ref` points to:
  `page, bbox, bboxes, page_dims, units ("pt"|"px"), quality`, all of them required, with
  `additionalProperties: false`. This is the pixel form.
- `src/iagent/gateway.py:1165` `class EvidenceRef(_BaseModel)` is the steward-edit request model. It
  is ALREADY the ruled shape: `page` (int ≥ 1), `bbox` (4 finite numbers, or null), `note?`, with
  `extra: forbid`. It reaches the document only as untyped `anyOf [{}, null]` on
  `AddedRow`/`CorrectedRow`/`DeletedRow`/`HeaderEdit`.

## The two refs that must resolve (cortex `src/lib/rowFractionSeal.test.ts`)

The values come from doc-tools' committed fixture `tests/fixtures/sustainment/row_fraction_seal.json`.

| ref | value | today, against ingest_api's EvidenceRef | after your PR |
|---|---|---|---|
| `NEW_REF` | `{page: 3, bbox: [0.131176, 0.416818, 0.388824, 0.433182]}` | REJECTED: missing bboxes, page_dims, units, quality | **ACCEPTED** |
| `OLD_REF` | `{page: 3, bbox: [223, 917, 661, 953], page_dims: {width: 1700, height: 2200}, units: "px"}` | REJECTED: missing bboxes, quality | **REJECTED**, by the extra keys (and by the bbox range, if you declare it) |

OLD_REF is rejected today only because two keys are missing. That is the wrong reason. Once the PR
lands it must be rejected because `page_dims` and `units` are not keys of the contract.

## The ask

1. **Declare the extraction row's `evidence_ref` as the ruled shape**, with
   `additionalProperties: false`:
   - `page`: integer ≥ 1.
   - `bbox`: 4 numbers in [0, 1] (`minItems/maxItems: 4`, `minimum: 0`, `maximum: 1` on the items),
     or null. Null follows spec 205 as the gateway model reads it ("stated on this page, no box we
     can draw"). If the ruling means bbox is never null, drop the null; cortex reads both.
   - `note`: optional, non-blank.

   Reusing gateway.py's model, or making both one class, is your call. One class means the
   published schema cannot drift from the request check.
2. **`PartItem.evidence_ref`**: the same schema, optional (per the earlier packet).
3. **Regenerate `docs/api/cortex-bff.openapi.json`** in the same PR.

## The consequence we can see and you own

7f's packet (same day, in this directory) measured that the deployed doc-tools, v0.2.2, already
emits `{page, bbox, note?}` with no `page_dims`. The rowFractionSeal header's line that OLD_REF "is
what the deployed doc-tools image still writes" is out of date. The hazard that remains is rows
stored BEFORE `b08468f`. If `Extraction` is a validated `response_model`, those pixel-form rows fail
validation at serve once `extra` is forbidden. So either:
- the route converts pixel + `page_dims` to fractions when it serves (doc-tools' converter is the
  rule: `x / width`, `y / height`); or
- stored rows are migrated.

7f predicts that PCN-2683's 915 rows are fraction rows which the current model serializes with
`page_dims: null`. Cortex's reader sends any present `page_dims` key down the page_dims path, so
those rows fail there. Cortex #37 (on master, not yet rolled; the sandbox is frozen) names the check
per row. If 7f is right, the banner after the next roll reads "915 page_dims is not an object", and
its sample line shows `page_dims: null` verbatim. The reader stays strict about that `null` on
purpose: under the ruling, a served `page_dims` key of any value is a contract violation.

## What cortex does at the merge

- Re-pin `PRODUCER_REF`, re-take the snapshot, and regenerate the types.
- Add a seal arm that validates NEW_REF and OLD_REF against the regenerated
  `components.schemas` evidence_ref, and requires NEW_REF accepted and OLD_REF rejected **by a key
  not in the contract**, not by a missing one.
- Change nothing else in that commit. Cortex's own `EvidenceRef` type is local
  (`src/lib/promotionReview.ts`), not generated, so the build does not move. Retiring the reader's
  `page_dims` branch is a separate commit, once no served row can carry it.
