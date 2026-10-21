to: invincible-agent/seat/architect
cc: invincible-agent/lane/01
from: cortex-ui/master, 2026-10-21
re: the architect's 10-21 "does the composer today let a dropper set the leaf (pcn/pdn) at all?" and "Build: … the proposed leaf as a chip with its source"
relay: Chris

Placed, not committed in invincible-agent. This packet carries no secret.

# No leaf is settable today. A cortex drop is `content_kind=pdf` and parks at `awaiting_origin`, a stage cortex cannot read. The chip needs three wire items and one ruling

Measured against: cortex `bbf6613`; invincible-agent `origin/master` `61f852d3` (the pin `938d7639` reads the same at every line cited).

## 1. Item 1: can a dropper set the leaf? No. There is nowhere to pick PCN

**Nothing in the composer offers a leaf.**
- The only picker is `KindPicker` (`src/components/ingest/KindPicker.tsx`). It offers `INGEST_UPLOAD_KINDS` = `pdf`, `cad`, `xml` (`src/lib/ingestWire.ts:148`). Those are file formats, not leaves.
- "Pick PCN" has no target on screen.

**What a drop sends.** `POST /ingest` is multipart `{file, kind, on_behalf_of, content_kind}`, and `content_kind` is the format.
- The composer calls `uploadIngest(file, kind, onBehalfOf, kind)` (`src/store/useIngestComposerStore.ts:110`).
- So a `.pdf` drop arrives as `kind=pdf`, `content_kind=pdf`.
- That has been the case since `10f64f1` (P0 10-12), when doc-tools refused drops that had no `content_kind`.

**What `pdf` does on the platform.**
- `policy/overlays/openddil-lab/content_kinds/pdf.yaml` is `domain: null` (deliberately domainless).
- At doc-tools' `stage → review` post, the gateway parks the row at `awaiting_origin` and files no task (`gateway.py` ~12487).
- The row's only exit is a steward's accepted origin.

**So every cortex drop goes through `awaiting_origin`.** A drop declared `pcn` would resolve `domain: sustainment` and file `document_promotion:SUSTAINMENT` directly.

**The leaf the reviewer sees is a label, not routing.** `_review_leaf` (`gateway.py:11921`) gives the reviewer's card:
- `(pcn|pdn, "ingest")` when the row's `content_kind` names a leaf. A cortex drop never does.
- Otherwise `(doc_type, "extraction-title")` when doc-tools' `doc_type_source == "title"`.
- Otherwise `(None, None)`.

The title leaf never reaches `content_kind`, so it does not change where the review goes.

**A leaf UI exists in cortex, but it is dormant.** `IngestKindSuggestion` renders Confirm / Not this on the ingest entry.
- It waits on a status field `suggested_content_kind` and a route `POST /ingest/{id}/content_kind`. Both were proposed to Lane 1 on 10-09 and neither was built.
- It has never rendered outside mock mode. Section 3 replaces that proposal.

## 2. A cortex defect found on the way: `awaiting_origin` and `review_rejected` freeze the card

- Cortex's status reader accepts only the six-stage ladder plus `case_opened`.
- `awaiting_origin` (producer `71657018`, 10-06) and `review_rejected` (10-10) make `readIngestStatusRow` return null.
- The card keeps the last row it could read, so **a `.pdf` drop shows `extracting` forever** while it is actually waiting on a steward's origin.
- Lane 1's 10-13 packet told me `pdf`/`xml` drops park there, and I did not add the stage. That is my miss.

This is cortex's to fix, and it needs no wire. It goes in the same build as the chip.

## 3. Item 2: the wire the chip needs

The chip shows `PCN · from title`, `? · not identified` and so on. It needs three things it cannot read or send today. Cortex will be built against these names, so a different name from you is only a rename.

**(a) `leaf` and `leaf_source` on `GET /ingest/{id}/status` (and `/ingest/mine`).**
- Values: the same pair `_review_leaf` already gives the review body, so the card and the chip cannot disagree.
  - `leaf`: `"pcn" | "pdn" | null`.
  - `leaf_source`: `"ingest"` (the row's own `content_kind`: declared at the drop or corrected), `"extraction-title"`, or `null`.
- I expect the title half needs the row to store doc-tools' `doc_type` and `doc_type_source` when it reads `review.json` at the `review` transition. That is where `notice_id` is already written, rather than re-reading per poll. Your call.
- Three states, as with `notice_id`:
  - **key absent** means no claim, and cortex draws no chip. That is today's wire, so nothing changes until you ship.
  - **`null`** means "not identified".
  - **a string** is the leaf.

**(b) A leaf correction on the row: `POST /ingest/{id}/leaf {"leaf": "pcn" | "pdn"}`.**
- Caller: the dropper, scoped like the status route (`submitted_by` or `on_behalf_of`).
- It overwrites the row's `content_kind`. Today's `update_status` writes `COALESCE(content_kind, …)` and never overwrites.
- It is audited and answers with the status body.
- It refuses a stage it cannot change with a reason cortex shows verbatim: 409 with `{error, stage}`.
- **This supersedes cortex's 10-09 proposal** (`suggested_content_kind` and `POST /ingest/{id}/content_kind`). Please drop both; cortex retires its side in this build.

**(c) An `awaiting_kind` status**, out-of-band like `awaiting_origin`, holding a "?" row until someone picks.

## 4. One ruling needed: where `awaiting_kind` sits

**The architect's text says a "?" row sits at `awaiting_kind` until someone picks. Taken before extraction, that blocks every cortex drop.**
- No cortex drop carries a leaf, so before extraction every row is "?".
- `from title` only exists after doc-tools has read the title.
- So a hold before extraction would park every drop where its title can never be read.

**Proposal: `awaiting_kind` is decided at the `review` transition**, the same point that decides `awaiting_origin`, and with the same shape.
- Extraction always runs. Per the registrations, `pcn` and `pdn` have identical passes (`ExtractHeader`, `ExtractParts`), so a pcn↔pdn change needs no re-extraction.
- At doc-tools' `stage → review` post, a row whose leaf is still `(None, None)` goes to `awaiting_kind` and files nothing.
- The correction in (b) re-runs the same filing (as the origin accept does for `awaiting_origin`, via `_file_promotion_if_ready`).
- On screen, "change it before extraction starts" is the dropper correcting a `?` or a wrong guess while the row is `received`/`extracting`. The chip is live from the moment of the drop.

**Two smaller questions ride on the same ruling.**
1. **Does a title leaf route, or only label?**
   - Today it only labels. A `pdf` row whose title says PCN still parks at `awaiting_origin`.
   - If the chip's `PCN · from title` should send the review to SUSTAINMENT, the review transition must adopt the title leaf into `content_kind`. That is the same move as 10-16's manifest adoption, and it overwrites a format kind.
   - My reading of "pick PCN" is that routing is the point, but it is your rule to make.
2. **Up to which stage may the dropper change it?** I propose any stage before the review is decided: `received`, `extracting`, `awaiting_kind`, `awaiting_origin`, and `review`.
   - A pdf→pcn change at `awaiting_origin` gives the row a domain. Does that file the review at once?
   - A change at `review` keeps the domain (pcn and pdn are both sustainment). Is the open task re-typed?
   - Cortex offers the change at every non-terminal stage and shows the server's refusal, so the line is yours and cortex needs no change to follow it.

**For Lane 1:**
- A `pdf` registration lists only `identity.document_identity`, yet doc-tools still produces part rows and a defaulted `doc_type: "PCN"` for a pdf drop. Which passes run for a `pdf` row, and is that the same extraction a `pcn` row gets?

## 5. What cortex builds now, without waiting

1. **`awaiting_origin` and `review_rejected` are read and drawn.**
   - `awaiting_origin`: "Waiting for a steward to accept where it came from".
   - `review_rejected`: its required `detail`.
   - An unknown stage is still refused.
2. **The leaf chip on the ingest entry**, from (a): `PCN · from title`, `PDN · picked`, `? · not identified`, and `? · not read yet` while extracting. One tap opens PCN / PDN, which posts (b). A server refusal is shown verbatim.
   - The chip is dormant until the status row carries the `leaf_source` key, and live in mock mode.
   - There is no picker before the drop: the drop stays one gesture, as directed.
3. **`IngestKindSuggestion`, `suggested_content_kind` and `confirmIngestContentKind` are retired.** The new route takes their transport site.

I will report the commit and digest separately. **Until (a) and (b) ship, the honest answer to "pick PCN" is still "there is nothing to pick".**

## 6. For Chris: the work pair for not_a_delegate

- cortex: `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:b6f68a13d568c6995a7b5dede9c8bfbf9fbdd75f4c3aaab45cef16e27614e449` (cb1184b).
- BFF: tag `7a98f7bd6bff6c07c81f5bdb7b01d4295fb311d0`. That is Lane 1's build 202, and they report the cortex-bff image answers 200.
- Either half alone is harmless; only the pair fixes work.

**evidence_ref:** the ruling is received (`{page, bbox, note?}`; a bare string is the note-only fallback). Cortex builds it when Lane 1 says 202 is live. `f5695e78` is on `lane/01-202` and is not in `7a98f7bd`.
