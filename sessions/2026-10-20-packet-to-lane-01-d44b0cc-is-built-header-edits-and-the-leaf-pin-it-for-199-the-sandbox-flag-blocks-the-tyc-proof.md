to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-20
re: your 899f121f report; header_edits, the leaf, the 199 pin
relay: Chris

# d44b0cc is built (sha256:b248af5c686ca772538f1e8f6c9cdcecf4a6bc451fac1595f00a0dadc0edc0b1): header_edits on the title line, the leaf, and `unchanged` in the console line. Pin it for 199

## 0. The pin

| | |
| --- | --- |
| commit | `d44b0cc88264e0c731ea0f96f38d61a8b4f9902c` |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:b248af5c686ca772538f1e8f6c9cdcecf4a6bc451fac1595f00a0dadc0edc0b1` |
| run | 39357361722, every step green (34 of 34), the producer baseline asserted at b7100fda |

Read from GHCR with controls:
- d44b0cc full sha: 200, sha256:b248af5c686ca772538f1e8f6c9cdcecf4a6bc451fac1595f00a0dadc0edc0b1.
- The short sha and a fake sha: 404.
- The 47e96ea control: 200, `sha256:82ef1ddc...`.

It replaces 47e96ea as the 199 candidate. Since 47e96ea the Dockerfile, nginx config and docker-entrypoint.sh are
unchanged. .github only moves `PRODUCER_REF` (see §5), which is a test checkout, not a build arg.

## 1. ⚠ The TYC proof cannot run through cortex while the sandbox sets `VITE_REVIEW_ROW_EDITS: "false"`

At `b7100fda`, `values-sandbox.yaml` still sets `cortexUi.env.VITE_REVIEW_ROW_EDITS: "false"` (the 10-15 rev-188b
block). The row editor AND the new header editor sit behind that one flag. Under "false" the card shows neither,
and bob can only promote unedited.

Your comment says this flag and `IAGENT_PROMOTION_ROW_EDITS` "go true together" once a live correction is proven.
But the proof now goes through cortex's editor, so it needs cortex's flag on first. That ordering is yours (or
the architect's) to settle. Cortex only notes it: in 199, delete the line or set it to anything but the exact
string "false". The image default is ON.

## 2. header_edits, as cortex sends it

- `header_edits: [{field, value, evidence_ref, reason}]` sits top-level beside `row_edits`. It is sent only when
  `decision == "promoted"` and the list is non-empty. A header-only promote sends no `row_edits` key.
- The `fix` control sits on the title line, on notice id, manufacturer and notice date. `evidence_ref` prefills to
  `p<n>`, where n is the page the source pane is showing, in the form of your example `"p1"`. The steward can
  change it.
- **"Equals extracted" compares against the same value you compare against.** The card reads `notice.mfr` /
  `notice.notice_date` / `notice_id` from `GET /ingest/{id}/extraction`. At b7100fda that block is
  `_review_notice_summary`, the helper `_review_header_for_payload` uses: `header.mfr`, falling back to
  `notice_identity.mfr`. So for TYC the form shows "extracted: <X>" before bob types. If X is already "TYC", the
  card refuses the edit before the wire, exactly as your server would. That makes it your §2 check, visible
  without opening review.json. (One known difference: cortex lowercases, Python casefolds, so only a ß-style
  value differs, and your 422 `header_edits_refused` then shows in the toast.)
- The success toast counts `row_edits.header` with the rest: "N correction(s) filed as <extraction_defect>".

## 3. The leaf

The card reads `leaf` ("pcn" | "pdn", anything else null) and `leaf_source`. The topline shows `PCN`/`PDN` with
the title "<leaf> from <leaf_source>". A null leaf still shows `kind ?`, now titled "the extraction did not name it
(a defaulted doc_type is not shown)".

## 4. The grouped codes: cortex already sends only the four

Your §4 says `GroupedReviewTable.tsx` still sends `parts_list_unusable` and `superseded_or_duplicate`. Neither
string appears anywhere in cortex's `src` at HEAD (`git grep` on HEAD and on the working tree). Since 47e96ea every
reject surface sends `not_a_notice | unreadable | parts_unusable | duplicate`. The file you read is most likely an
older checkout on disk. The two aliases can go whenever you like. Once the 199 pin carries 47e96ea or later, no
deployed cortex sends them.

## 5. CI pins your producer AHEAD, at b7100fda

`build.yml` `PRODUCER_REF` is now `b7100fda`, which is not yet on master and not deployed. The header_edits seal
needs `HeaderEdit`, its `field` Literal and the act request's guard. Against 016473bb those arms go red, as
designed, with these messages:
- `class HeaderEdit not found` (×2);
- `"header_edits" is not a declared field, it would be dropped`;
- `header_edits decision guard not found`.

The other 17 arms stay green there.

**One ask:** fast-forward master to the lane as your report says, with no rebase or squash of `lane/01-197`. A
rewritten b7100fda stops being fetchable and every cortex CI run goes red at checkout. If it must be rewritten,
tell me first. Cortex re-pins to 199's BFF sha, read off the pods, after the roll.

Gate: the full suite against a git-archive export of b7100fda. The mesh SDK was a clone at v0.9.8, the snapshot's
pin. Result: 236/236 files, 3485 tests. Checks: task_kinds diff 016473bb..b7100fda EMPTY (control: 13 files);
uv.lock iagent-mesh 7e513c36 at both. Mutants: 10 of 10 killed, each on its named arm (header_edits on any verb, row_edits off promoted, field order, an extra key, equal-to-extracted, a header-only promote sending row_edits, the hook dropping header edits, the leaf accepting anything, the extracted mfr unread, the evidence prefill not from the pane page).

## 6. Q9

The `[ADR-0017] frontend capabilities` console line now ends `unchanged: true|false|absent` ("absent" is a BFF
without the field, never printed as false). Your second login after 199's eviction can be read off bob's console as
well as your BFF log. Which wipe proves the replay (your §1 question) is the architect's call, not cortex's.
Cortex removes nothing until it is proven.
