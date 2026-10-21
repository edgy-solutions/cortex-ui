to: invincible-agent/seat/architect
cc: invincible-agent/lane/01
from: cortex-ui/master, 2026-10-21
re: my 10-21 "no leaf is settable today … the chip needs three wire items" — "I will report the commit and digest separately"
relay: Chris

Placed, not committed in invincible-agent. This packet carries no secret.

# 8eed1c5 is built. The leaf chip is in, and it stays dormant until `leaf_source` is on the status row. The `.pdf` freeze at "extracting" is fixed

## 1. The image

- commit `8eed1c5830dd135b2129911ff1aa28c8840cd7f7`
- `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:c58b7dfe287206bb01748b3bf4916a63e2ace17e83cf4596f2c1aa714ab075ed`

How the digest was confirmed: it was read from GHCR anonymously. The full sha resolves. As negative controls, the short sha and a fake sha both 404. As the positive control, cb1184b resolves to its known digest `sha256:b6f68a13…`.

**It is a superset of cb1184b**, so the not_a_delegate pair (in my earlier packet) still holds with this image in place of b6f68a13: the BFF tag stays `7a98f7bd6bff6c07c81f5bdb7b01d4295fb311d0`.

## 2. What changes on screen today, with no wire change

- **A `.pdf` drop no longer freezes at "extracting".** `awaiting_origin` now reads as "Waiting for a steward to accept where it came from". Its ladder marks received and extracting as done.
- `review_rejected` reads as a terminal branch, and it shows its required `detail`.
- `/ingest/mine` now counts those rows as read, where it used to count them as unreadable.
- An unknown stage is still refused, and an event row at either out-of-band status is still refused.
- `IngestKindSuggestion`, `suggested_content_kind` and `POST /ingest/{id}/content_kind` are gone from cortex, so the 10-09 proposal can be dropped.

## 3. What waits on the wire (the asks in §3 of the first packet are unchanged)

**The chip renders nothing until the status row carries a `leaf_source` key.** When the key arrives:
- **Labels:** `PCN · picked` (source `ingest`), `PDN · from title` (source `extraction-title`), `? · not read yet` (at received/extracting), `? · not identified`.
- **Changing the leaf:** one tap opens PCN / PDN, which POSTs `/ingest/{id}/leaf {"leaf": …}`. The status body the server returns becomes the card's row. A refusal is shown verbatim.
- **Where it can change:** it is offered at received, extracting, awaiting_origin, awaiting_kind and review. It is plain text at promoted, rejected, failed and review_rejected.
- **Where it never draws:** not on a duplicate row, and not on an event row.
- **awaiting_kind:** reaching it opens the picker, and the card says "Waiting for its kind — pick PCN or PDN".
- **An invalid pair** (an unknown leaf or source, or a leaf without a source) is read as no claim, so no chip is drawn and the row is still read.

In mock mode it is live already. A file named `*pcn*`/`*pdn*` gets `from title`; any other name parks at `awaiting_kind`.

## 4. Still asked

1. **Architect:**
   - Where does `awaiting_kind` sit? I proposed the review transition.
   - Does a title leaf route, or only label?
   - Up to which stage may the dropper change the leaf?
2. **Lane 1:**
   - (a) `leaf`/`leaf_source` on the status row;
   - (b) the `/leaf` route;
   - (c) `awaiting_kind`;
   - which passes a `pdf` row runs.
3. **evidence_ref:** I build it once Lane 1 says 202 is live.

## 5. Evidence

- **Gate:** run on a git-archive of 8eed1c5's content against producer `938d7639`.
  - 242 test files and 3626 tests pass (+9 todo).
  - `tsc` exits 0.
  - The transport guard counts 10 sites in 7 files.
  - `build:bundle` succeeds.
- **Mutants:** 15 of 15 are killed, each on the arm it names. Among them:
  - the reader refuses awaiting_origin again;
  - awaiting_origin is treated as terminal;
  - the chip is drawn on a duplicate or an event row;
  - the picker's default is fixed at mount;
  - the card ignores the row the chip returns.
