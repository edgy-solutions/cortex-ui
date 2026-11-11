# 2026-11-11: "Export as…" aligns to saf's #356 once it merges, and rides 0.4.85 with it or not at all

**Ruling (Chris):** "cortex: when saf's wire lands, align src/lib/reviewExport.ts to it; the (p) register entries go
red and you clear them. Your image rides 0.4.85 with saf's PR, or not at all."

This replaces "Not on 0.4.85" for the export work. The current candidate remains `90b7c13` until an aligned image
exists.

## Where saf's wire is

saf's wire is invincible-agent PR **#356**: branch `lane/saf-export-profile-server`, head `82fd079b`. It is
**OPEN and unmerged**, so cortex has not changed anything yet. The map below was read from the branch, and will be
re-read from the merged sha.

| | cortex today (`5bc4a57`, proposed) | #356 | on alignment |
|---|---|---|---|
| `accepts` | absent → never offered | `null` when absent = **any kind** (decision 3) | follow saf: `null` offers it; flip the "never offers" arm |
| `version` | non-empty string | **int**, required | read a number |
| `dedupe` | boolean | **list of column names**, `[]` default | read a string list |
| `grain` | any non-empty string | `per_notice` / `per_part` | still shown verbatim, with no closed list |
| resolve | `POST /ingest/export/resolve` | **none** | kinds come from the cards; unexportable comes from `check_only` per profile |
| download | `POST /ingest/export {profile, ingest_ids}` | `POST /ingest/export/notices {notice_ids, profile, check_only?}` | `notice_ids` carries ingest ids (the route iterates them as `ingest_id`) |
| unexportable | `{ingest_id, notice_id, reason_code, reason}` | `[{ingest_id, reason}]`, where reason is a code | show the code verbatim |
| any unexportable at download | n/a | **422** `export_notices_unexportable`, no file | send only the ids `check_only` cleared |
| range | resolve `{from,to}` | **no ids-in-range form**. Only the old `GET /ingest/export?from&to`, which builds the file directly | **open: asked of saf** |

## Two hazards that make "with saf's PR, or not at all" the right coupling

1. **Master's reader refuses #356's listing.** `5bc4a57` refuses the whole profile list when `version` is not a
   string, `dedupe` is not a boolean, or `accepts` is present but not an array. #356 serves an int, a list and
   `null`. The per-card export (`ReviewExportControl`) reads the same list, so an unaligned master image against a
   deployed #356 breaks the single-notice export too.
   - `90b7c13` ignores the new keys and is safe against #356.
   - So **no cortex sha between `5bc4a57` and the alignment may be pinned while #356 is deployed**.
2. **The dialog posts routes #356 does not serve.** Unaligned, the dialog posts `/resolve` and `POST /ingest/export`
   and gets a 404/405. That would be visible, not silent, but it is still broken.

## What clears on alignment

- **The response seal.** When the producer pin moves to a sha containing #356, the four `(p)` entries in `client.ts`
  `AWAITING_DECLARATION` go red. That holds if #356 types the listing; to be checked against the generated
  `bff.ts`. Cortex clears them in the same commit.
- **The request seal.** The two CORTEX-PROPOSED `NOT_TRANSPORT` entries are replaced by a declared row for
  `POST /ingest/export/notices`.
- **The capability seal** moves from the GET row to the POST row, which #356 adds to the manifest.

## Open, asked of saf (placed packet, updated)

"Select by range" (ruling 4) needs the ids in a range, before download, with their unexportable list (ruling 3).
#356 has no such form. One option is a `from/to` form on `/ingest/export/notices` whose `check_only` returns the ids
it resolved; the other is a ruling that range stays on the old GET.
