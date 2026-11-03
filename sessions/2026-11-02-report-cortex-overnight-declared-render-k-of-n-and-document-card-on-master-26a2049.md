# 2026-11-02 overnight: declared render, k of n and the document card are on master at 26a2049

Dispatch: "the render block from presentation_agent (#185) read in the panel renderer; New Canvas k-of-n against the fixture; a fixture-driven pass of the document card with a sections[] payload so Lane 1's release lands on tested code. Report the digest for 0.4.76."

This supersedes the "#62 open" line in `2026-11-02-report-cortex-document-card-is-pr-62-item-form-on-master-k-of-n-still-blocked.md`.

## The digest

**Pin for 0.4.76: `26a204990572f7d46cb8ee208abb31c0d7327fe9`**
`sha256:3077dfa6e73a42658116faf27d29aaf4ad8a8b27f9df82bda192c30722e79104`

- **Run:** 41580339028 Build Containers, success. Build Frontend ran.
- **How it was read:** from GHCR by the full sha, token length 76.
- **Controls:**
  - `e06e08a`: 200, the same digest as when first read;
  - `a796ed1`, interior to this push: 404, as expected;
  - the all-zero sha: 404.
- **0.4.76 is not cut.** Its changelog does not mention cortex or the section universe yet.
- **The commit carrying this report builds no image.** It is sessions-only, so do not pin it.

**#62 digest, owed from the last dispatch:** `e06e08aa3f2b6b0f5fbd679041c532717aeda2f8` is `sha256:2ed53946a4c89f5cd68d675522e41009ec8538706e261b7188bdfec3e94a08f5`.

## How it landed

On master directly under R-009, not by PR, because the dispatch asks for a digest and only a master build has one. There are four commits:

| sha | what |
|---|---|
| 93df44b | re-pin the producer snapshot to aac9900b (0.4.75) |
| 9ea844f | the declared render, in the provenance panel |
| a796ed1 | k of n |
| 26a2049 | the document card |

## 1. The render block: there is nothing to read at the card, and the panel had a real defect

**`render` never reaches a component.** Presentation projects it flat before cortex sees it:

| `render` field | arrives as |
|---|---|
| `shape` | `archetype` |
| `series` | `series` |
| `value_label` | `value_label` |
| `target` | `reference` |

So I added no reader for a block that does not arrive. An arm shows what would happen if it did: a stray `render` key prints in the raw section.

**The defect was one layer up.** Since #185, every card the producer declared drew amber "card chosen (NOT declared for this type)" in the decision path, because only the older basis counted as declared. A declaration that failed to fit was invisible, because `declared_shape` and `declared_unfit` were dropped. Now:

- `declared_render` reads "card chosen (declared by the answer)";
- a fall-through names the shape and the producer's reason verbatim;
- any other basis is still not declared;
- a new producer seal fails on any basis cortex has not classified, read from the pin.

TCPI and VAC both draw through the interpreter with wire-shaped fixtures, whose series, target and label are tied to the two yaml rows. VAC's `reference.value: 0` is read as a value, not as absent.

## 2. k of n, against the fixture

Walked event by event through both fixtures. The walk found two defects:

- The latest event's total won, which could draw "6 of 5". The first total now stands within a run, and a re-send after a 409 starts a new count.
- A partial seed read "6 of 6 panels" just before the dialog said "4 of 6 panels seeded". It now reads "6 of 6 panels · 2 refused".

**This is still not live.** Board `01M6A9QDN1VP1N2GBNX3GA87NB` is open and the live runner claims no k. The field names stay PROPOSED. Mock mode has no template catalog, so this can't be walked by hand.

## 3. The document card, driven by a sections[] payload

Driven through `ApprovalTaskCard`, the real `useReviewShapes` and the real `buildActBody`. Arms cover:

- no `header` key;
- `page_end` absent, null, equal, below and valid;
- numeric `section_id`;
- `sections` missing or empty, and no `ingest_id`;
- duplicate ids;
- wrong-card payloads;
- ids sent verbatim;
- a `document.v2` overlay row.

**One defect found.** A payload claiming the document shape that could not be read fell through to the generic card with no word, and `whyNotDocumentReview` had no production reader. It now draws the refused line with the reason.

**Walkable by hand.** Under the `ingestMock` flag, drop a file named `*sections*`. I did not walk it in a browser, so the proof is the jsdom arms only.

## Evidence

- **Local gate on a fresh export of 26a2049, sibling at aac9900b:** transport, redproof, test, tsc, seals and bundle all exit 0. 4643 passed, 1 skipped, 9 todo.
- **CI:** 33 seal files, 471 arms ran, 0 did not; 12 redproof checks, 0 failed.
- **Mutants:** 24 fired, scored on the message, with the tree hash the same before and after. 23 died on the first pass. D8, a sections drop carrying the fixture's `ingest_id`, survived; I tightened its arm and it now dies.

## Corrections to my own work

- **`fin:DeclaredMeasureSeries` was a value I invented in the spec.** The implementer's red arm exposed the wrong claim that a declared card has no raw section. Every captured `MULTI_SERIES` has `subject_concept: null`, so the fixture now says null.
- **My first re-pin note was wrong.** It said the generated types change by their sha line only. `openapi.seal` failed on stale types; regenerating showed `EvidenceRef.note` narrows from `string | null` to `string`. I fixed the note before committing. `evidenceRef.ts` already refuses a blank or null note.

## Needs a decision

**Every projected package card shows a closed "Raw — 1 field" row for `subject_concept: null`.** The projector always writes the key, and no reader claims it. This is not new: it predates #185 and the parity baselines record it. I left it alone, because `STRUCTURAL` calls itself "a denylist of last resort", and the 10-07 ruling sends undeclared keys to the raw section.

Two ways to remove it:

- the projector omits the key when it is null, which fits its own docstring ("carried only if the producer supplied it") — **I'd take this one**;
- cortex excuses a null value.

An arm pins today's behaviour, and the producer seal names the line. Whichever way it goes, the arm changes.

## Still waiting

- **Section universe:** board `01M6A9QDN1NDKZ65PFYF9DQ123` is open. `_UNIVERSES` still serves only `part` at origin/master 121272dc. The document card stays unreachable until `sections[]` ships.
- **SDK v0.9.13, read:** `carries`, `applies_when` and card-only `ReviewShapeRow` shipped. The IA lock is still at v0.9.12. `readReviewShapes` skips a card-only row and keeps the rest, so a served one breaks nothing. A card-only `document` row would read as "no review shape is served".
- **Unchanged:** `capabilities` on entitlements (then `AP_GROUP` goes), `consumer`, `drop_leaves` labels, and the `meshSdkParity` re-extract.
- **Sandbox freeze:** still in force. No rolls.

## Packets placed (uncommitted, in invincible-agent/sessions)

- `2026-11-02-packet-to-lane-01-from-cortex-pin-26a2049-for-0.4.76-and-the-document-card-is-ready-for-sections.md`
- `2026-11-02-packet-to-fin-from-cortex-declared-tcpi-was-labelled-not-declared-fixed-at-26a2049.md`
