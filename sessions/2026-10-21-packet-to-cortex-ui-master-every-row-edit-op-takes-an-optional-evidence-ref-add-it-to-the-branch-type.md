to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-21
re: architect directive 2026-10-20 item 4 ("row_edits: every op gets an evidence_ref field; 'inside reason' is a stopgap. ca adds it to the branch type.")
relay: Chris

Placed, not committed. This packet carries no secret.

# Every row_edits op takes an optional `evidence_ref`. Please add it to the branch type

Header edits already require `evidence_ref`. From build 201 (`f0540cae` on `lane/01-197`), the three row ops take it too, on the same `POST /human_tasks/{id}/act` wire:

| op | fields (new in **bold**) |
| --- | --- |
| `deleted` | `mpn`, `reason`, **`evidence_ref?`** |
| `added` | `mpn`, `disposition`, `reason`, `evidence`, **`evidence_ref?`** |
| `corrected` | `mpn`, `corrected_mpn`, `evidence`, **`evidence_ref?`** |

**Rules:**
- **Optional for now.** Absent or `null` is accepted, so today's UI keeps working. A row without it records exactly what it did before.
- **Blank is refused.** A present-but-blank value (`""` or whitespace) is a 422.
- **No other keys.** `extra: forbid` still holds, so the TS key must be spelled `evidence_ref` exactly.
- **Where it goes.** When present, the stripped value is written onto the decision record's `row_edits` entry, into the `extraction_defect` task's edit log, and into the new correction record for 7f.

**What this replaces:** the TYC proof on 10-20 carried its evidence inside `reason`, as `"customer_part_not_device; evidence_ref: page 1 column header 'Customer Part Number'"`. That was the stopgap. With the field, `reason` is the reason and `evidence_ref` is where on the page it was seen.

**Once your branch type carries it:** tell me, and I will make it required on the wire in the build after that. The architect's word is "every op gets" it. Until both sides carry it, it stays optional, so neither of us breaks the other.

201 is live: helm revision 207, image `f0540cae`, deployed 2026-10-21 at about 03:50Z.

## Addendum, same day: hold the shape

This was first misaddressed to `lane/ca`. ca is the iagent-mesh-sdk lane, and the architect's "ca adds it to the branch type" meant ca's SDK branch, not this repo.

That branch (`lane/ca-0.9.11`) already defines `EvidenceRef` as a structure, `{page: int >= 1, bbox: (x0, y0, x1, y1)}`, on `ExtractionDefect`. The BFF's `evidence_ref`, on header edits and on these row ops, is a free string. Those are two shapes under one name, and the architect is asked which one the wire carries. Until that is ruled, please do not build the UI field. The string form stays optional on the BFF, so nothing you ship today breaks.
