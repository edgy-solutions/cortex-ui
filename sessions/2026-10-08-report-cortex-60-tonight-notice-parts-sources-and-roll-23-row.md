# Report: cortex-ui/master, 2026-10-08 (tonight). Notice-parts sources bound; roll-23 row

Written for: the dispatcher of tonight's "which parts does <notice> affect" order, and Lane 1 for roll #23.

## Commits and image

| sha | what | image |
|---|---|---|
| `c582803` | the notice-parts sources binding | none (not the head of its push) |
| `3d5a0e1` (`3d5a0e104aa79d54912ef98a2c5ce760c2f085d7`) | the `mesh:NoticePartSet` row, on top of c582803 | ``sha256:83366dd5fc614d431c320574d0b77685b63574b6d53f3c15846d894c1dd63243`` (run 37865492808, 0 steps skipped) |
| this commit | sessions only | none (gated, by design) |

Pushed at 19:37 CDT. The digest was read from GHCR at 19:40 CDT, with controls: the short sha 404s, a fake sha 404s, known-good 3ea967f gives 200.

## 1. Tonight's order: BOUND, but on a derived fixture, because the capture was not found

**The capture.** The order says it is in Lane 1's roll-22 report. At 19:04, 19:20 and 19:30 CDT, no roll-22 report was on any invincible-agent ref. The newest is `cf4a456d` (17:16), the lane/74-notice-parts merge. So the seal is built on the producer's own source and test values, and it says so:
- **Producer source:** invincible-agent `cf4a456d`:
  - `notice_parts.py` `_source()`;
  - `gateway.py` `_project_sources` and `_sources_event_payload`.
- **Values:** `tests/test_notice_parts_provenance.py`, i.e. PCN26-182; parts 5530-182 and 5530-183; dropped by alice; promoted by bob; floor `{user-drop, [], 0}`; plus the unpromoted control.

An **arrival arm** scans `sessions/*.json` (32 files today) and goes red when a notice-parts capture lands. That is the hook for swapping the fixture for the capture.

**Where the fields actually travel.** This decided the design:
- The SSE `sources` event carries `{sources, provenance_floor}`.
- **Electric never can.** `AnswerArtifactBundle` has no `provenance_floor`, and `answer_artifact_writer.py` writes only the base Source props. So `dropped_by` / `promoted_by` and the floor die before the projection.
- Cortex therefore holds them client-side in a new `Artifact.source_provenance`, written from SSE under the `sse:sources` tag.
- `sources` itself stays Electric-only. The Hop-3 "sources does NOT write sources" arm is still green, and a new arm proves it.

**`mpn` (may be absent).** `_project_sources` passes only these extras: `matched_for`, `provenance`, `obtained_via`, `ingest_id`, `dropped_by`, `promoted_by`. Both `mpn` and `notice_id` are dropped. So on the wire today, **mpn IS absent**.
- The card shows `MPN …` only when the key arrives, and never parses it from the `P/N …` label.
- If Lane 1 wants it shown, `mpn` must be added to that extras tuple. Nothing on cortex's side has to change.

**What renders (SourcesTrail).**
- The floor, via the existing `ProvenanceFloorLabel`, above the list: a quiet `user-drop` chip when promoted, the unverified banner with the ingest id when not.
- Per part: the URI (`data-source-uri`), `MPN` when present, `dropped by …`, and `promoted by …`.
- A `"graph"` source type was added to the `Source` union, because notice_parts emits it.

**Seals and mutants.** Each mutant went red for the named reason:
- M1: drop the dropped-by chip;
- M2: the client drops the floor;
- M3: the hook writes `sources`;
- M4: mpn derived from the label;
- M5: promoted_by ignored.

The Electric-survival arm also passes: an Electric row without extras leaves `source_provenance` and its tag intact.

**Known limit.** `source_provenance` is client-held, so a page reload loses the banner and chips for that answer. Electric's row has nothing to rebuild them from. The fix is producer-side: persist the floor and extras through the writer and projector.

## 2. Lane 1's roll-23 ask: the row, DONE (`3d5a0e1`); Chris chose (a)

- **The row:** `mesh:NoticePartSet` → `mesh:InstancesByProperty`, SAFETY_ENGINEER and SUSTAINMENT_ENGINEER / SUSTAINMENT, `INSTANCES_BY_PROPERTY_CONTRACT`, exactly as Lane 1's packet asked (committed with this report).
- **The choice:** Chris chose **(a) master + the row**. So roll #23's cortex brings in, besides the row:
  - c582803, the binding above;
  - f0da7f9 and f358cc6, which are parity-sealed and render byte-identical to before the move;
  - 0e8c998, which is test-only.
- The noAbsence ruling, (a) vs (b), is still open. It does not change what renders.
- Lane 1 had the sha by message at about 19:38. The packet `2026-10-08-packet-to-lane-1-roll-23-pin-is-3d5a0e1.md` records it, with the digest.

## Gates (local, on 3d5a0e1's tree)

- tsc: 0.
- check:transport: 0.
- build:bundle: 0.
- Full vitest: 2681 passed, 5 failed. The five reds:
  - the four known local-only reds (meshSdkParity "names a RELEASE", taskKindParity "two, they AGREE", and the 2 ingestKindStatusParity arms);
  - one 5 s timeout in `sessionIsolation`'s file walk under full-suite load. Alone, it passes (54/54, together with the row's and binding's tests).

## Placed packets committed here

- `2026-10-08-packet-to-cortex-rev-180-elicitation-and-pin-are-live.md`: ELICITATION is live, and the pin is 942259f.
- `2026-10-08-packet-to-cortex-one-binding-row-noticepartset-for-roll-23.md`: the roll-23 ask.

## Still open

- **ELICITATION packaging:** Lane 1's fix is on master and live at rev 180. It needs a PRODUCER_REF bump (now 5cf7d879) and the mirror tuple change (disposition required, status optional). It was deferred tonight for the deadline.
- **noAbsence:** the (a)/(b) ruling.
