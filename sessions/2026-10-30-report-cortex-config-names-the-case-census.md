# 2026-10-30 report: cortex-ui checked against "config names the case"

**Trigger:** the architect's standing rule of 2026-10-30, relayed by Chris. Nothing in an API, wire type, route,
engine or UI may hard-code a workflow, kind, domain, group, program, recipient or customer shape. It comes with four
tests to run before any PR.

**Method:**
- Grepped the hand-written, non-test `src/` for domain literals:
  - the kind names `pcn` and `pdn`;
  - the group `alert-processors`;
  - `notice` / `notice_part`;
  - verb names.
- `src/api/generated/` is listed separately, because it is the producer's wire.
- `kind ===` branches on discriminated-union tags (`result.kind === "empty"` and the like) are mechanism, not cases,
  and are excluded.
- **This is a census by grep.** It finds literals that are SPELLED. A case encoded some other way (a filename regex,
  an archetype named for a domain) is only partly covered.

## A. Cortex's own hard-codes: violations on our side

| # | site | what it hard-codes | fails test | can it be fixed today? |
|---|---|---|---|---|
| A1 | `src/lib/reviewExport.ts:30` `AP_GROUP = "alert-processors"`, used by `canExportBatch` | a group | 2, 3 | **No.** The producer gates on capability `ingest:exportBatch`; `Entitlements` (generated) serves neither groups nor capabilities. Needs a served grant. The `// GAP:` is already recorded. |
| A2 | `src/lib/reviewExport.ts:32,46`: `granularity` is closed to `notice_part \| notice`, and the reader refuses any other value | a domain shape | 2, 3 | **Yes, on the reader.** Read it as an opaque string. But the producer's wire closes it too (C2), and #148's `answer` profiles would trip both. |
| A3 | `src/components/ingest/DropLeafRow.tsx:10-14`: `[PCN] [PDN] [Not sure]` | the kinds and their labels | 2, 3, 4 | **Partly.** `droppable_kinds` is in the generated `Entitlements` (#153), so the SET can be served. The LABELS wait on `drop_leaves [{leaf, label}]` (SDK v0.9.11, lane 01's 10-28 and 10-29 packets). Lane 01: "`droppable_kinds` alone does not let you remove the literals, because it has no labels." |
| A4 | `src/lib/promotionReview.ts:121,287`: `leaf: "pcn" \| "pdn" \| null`; any other leaf reads as `null` | kinds | 2, 3 | **Yes.** Carry the leaf as a string. Today a third kind would show as "?" on the review card. |
| A5 | `src/store/useIngestComposerStore.ts:136`: a leaf is sent only if it is `pcn` or `pdn` | kinds | 2, 3 | **Yes,** once A3 reads the served set: send any served choice. |
| A6 | `src/lib/taskDeclaration.ts:199` `offeredVerbs`: `["approved", "rejected"]` when there is no declaration | verbs | 2, 4 | **Ruling needed.** It is a fallback for a task with no served declaration. Under test 4 the honest form is "no options declared", not two invented verbs. The case panel's D2 fix (fe4d787) leans on this. |
| A7 | `src/components/ApprovalTask/PromotionReviewCard.tsx:139`: the label is built by upper-casing the leaf | a label | 1 (soft) | Use the served label when A3's `drop_leaves` lands. |

**Fixtures and mocks, recorded but not counted:**
- `src/lib/ingestMock.ts` (filename regexes `/pcn/i`, `/pdn/i`; `leaf_candidates`);
- `FIXTURE_154_PROFILES` in `reviewExport.ts`.

They are mock mode only. `FIXTURE_154_PROFILES` is sealed against the producer's `policy/exports/*.yaml` and the
live picker reads the served route, so it does pass test 4.

## B. Domain nouns on the wire we read: the producer's, reported and not ours to change

| # | where it shows on our side | what the producer's wire hard-codes |
|---|---|---|
| C1 | `src/api/generated/{bff,ingestV1}.ts`: `leaf: "pcn" \| "pdn"`, and `LEAF = ["pcn","pdn"]` (re-exported as `INGEST_LEAVES`, `src/lib/ingestWire.ts:251`) | the kinds as a closed enum on every leaf field |
| C2 | `bff.ts:379,889`: `granularity: "notice_part" \| "notice"` | a domain shape as a closed enum |
| C3 | `batch.notice_type`, `batch.notice_id` (`GroupedReviewTable.tsx:464`, `TaskContextCard.tsx:30`) | a domain noun as a field NAME (fails test 1: it should be an item kind and id, carried as values) |

These come into cortex through the generator, so cortex's closed unions in A2, A4 and A5 MIRROR them. Opening our
readers alone would accept values the producer's own schema forbids. Making the change on both sides at once is the
honest order.

## Proposed order (nothing changed yet)

1. **A4 and A2's reader:** open the closed unions to strings. This is cortex-only, gated, and rendering is unchanged
   for pcn and pdn. It touches the leaf / granularity seals, which need redproofs.
2. **A3 and A5:** take the set from `droppable_kinds` now, keep the label table until `drop_leaves` ships, and send
   whatever was chosen.
3. **A1, A6, C1-C3:** a packet to lane 01 and the architect.
   - A1 needs a served grant.
   - A6 needs a ruling on the no-declaration fallback.
   - C1-C3 are the producer's wire.

**Open:** the plan-recipient rows per answer. Under this rule "recipient" is config, a policy-rail row. Whatever
those rows turn out to be, cortex reads them from the server and never names a recipient.
