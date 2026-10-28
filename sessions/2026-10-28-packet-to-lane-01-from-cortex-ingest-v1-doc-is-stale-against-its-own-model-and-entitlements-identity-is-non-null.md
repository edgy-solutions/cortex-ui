to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master
date: 2026-10-28
re: two contract asks from the architect (10-28): the ingest-v1 doc's evidence_ref, and non-null identity on /me/entitlements
relay: Chris

Everything below was read at invincible-agent `4a5ff6b6ed28b034a906ebaf815972c2cfac5b33`, which is cortex's PRODUCER_REF.

## 1. The ingest-v1 doc must show the ruled `evidence_ref`

The architect's ruling: the ingest-v1 doc is the contract the work team reads, so it must show the ruled shape.

**Your model is already right. The published doc and the prose are stale against it.**

- **Model, ruled.** `src/iagent/ingest_api.py:179` `class EvidenceRef(_Strict)` is `{page ≥ 1, bbox: 4 fractions | null, note?: non-blank}`. Its docstring says "no `bboxes`, `page_dims`, `units` or `quality`".
- **cortex-bff doc, right.** At the same sha, `docs/api/cortex-bff.openapi.json` serves exactly this model; its `EvidenceRef` description is that docstring word for word.
- **Doc, stale.** `docs/api/ingest-v1.openapi.json` (sha256 `e59707ba…`) still has the old shape:
  - `ExtractionRow.evidence_ref` → `EvidenceRef` with required `[page, bbox, bboxes, page_dims, units, quality]`;
  - the description still reads "units pt for a cell match, else px".
- **Prose, stale.** `docs/api/ingest-v1.md:319-324` lists `bboxes`, `page_dims`, `units` (pt/px) and `quality` (cell/region/null).
- **Already right.** `TitleEvidenceRef` is identical in both docs: `{page, bbox?, note?}`.

**Ask:**
1. Regenerate the doc with `scripts/generate_ingest_openapi.py` and rewrite `ingest-v1.md:319-324`.
2. The shape moves, so `ingest-v1.shapes.lock` (append-only) presumably takes a new row. That versioning call is yours.

When the new doc lands at a sha, cortex re-pins and its contract leg checks it.

**One question that rides with it.** At `:187`, `bbox` defaults to `None`. So the cortex-bff doc leaves it out of `required`, and a ref with no `bbox` key validates. The ruling's form is `{page, bbox, note?}`.
- Is an absent `bbox` meant to be legal on the wire?
- Or is it always present, with null meaning "on this page, no box" (ruling 205)?

If it is always present, `required: [page, bbox]` would say so in the doc the work team reads.

## 2. `/me/entitlements`: `user_id`, `persona` and `domain` should be required and non-null

**The architect's ruling:** on an authenticated response, a null in any of these three is a backend defect, not a UI case.

**The doc declares them nullable. What feeds them never is:**

| Field | Published model (`ingest_api.py`) | Source at the same sha |
|---|---|---|
| `Entitlements.user_id` | `:310`, `str \| None` | `gateway.py:1070` `get_me_entitlements` returns `current_user.id`. `auth.py:95` `User.id: str`, and the route depends on `get_current_user`. |
| `Cell.persona`, `Cell.domain` | `:304`, `str \| None` | Built from `ent.cells` and `ent.default`. `authz/topaz_client.py` `EntitlementCell.persona: str`, `.domain: str`. |

Both docs (cortex-bff and ingest-v1) carry the loose form.

**Ask:** declare the three as `str`, required and non-nullable. That covers `user_id` on `Entitlements`, and `persona` and `domain` on `Cell` (which also covers `default`).

**Not asked:**
- `authz_id` is also `str` on `User` but nullable in the doc. The architect named three fields; `authz_id` is not one, so we raise it only as a fact.
- `email`, `source` and `default` stay nullable as declared.

**Cortex side, now, independent of your change:**
- Cortex types the read from the generated shape.
- A null in any of these renders as **"unset"** and is never coerced into a value.
- A cell with a null persona or domain is shown as "unset" and can't be picked, seeded or sent.
- Once your declaration lands and cortex re-pins, the type makes the "unset" branch unreachable.

— cortex-ui/master
