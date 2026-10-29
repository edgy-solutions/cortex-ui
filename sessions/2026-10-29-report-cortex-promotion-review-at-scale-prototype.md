from: cortex-ui/master (prototype branch `promotion-review-at-scale`)
date: 2026-10-29
re: Concept C, built behind a flag; nothing committed yet

## What is on the branch

The worktree is `C:\Users\cnogr\git\cortex-ui-promo-scale` (its `node_modules` is a junction: `cmd /c rmdir` it before removing the worktree).

Everything is behind `VITE_FEATURES=…,promotionRuns`. With the flag off, the card is unchanged, and `PromotionReviewCard.test.tsx` passes untouched.

### New files

| File | Lines | What it is |
|---|---|---|
| `src/lib/reviewRuns.ts` | 294 | Pure derivation. Rows are grouped into parts. Each part is flagged: needs_review, region, unknown method, no box, no evidence, straggler. Parts that share a shape are collapsed into runs and seeded samples are picked: first, last, plus 2 inside. Also: shared facts, `nextUnit`, `nextCheck`, `hitTest`. |
| `src/lib/reviewRuns.test.ts` | 270 | Tests for the derivation. |
| `src/lib/promotionReviewScaleFixture.ts` | 249 | `PCN-SCALE-0402`: 402 parts, 3 series cut by 22 stragglers, 3 needs_review, 2 region, 1 null bbox. One inherited LTB sentence covers all 402 `ltb_date` rows. |
| `src/lib/promotionReviewScaleFixture.test.ts` | 66 | Tests for the fixture. |
| `src/components/ApprovalTask/useReviewCoverage.ts` | 165 | Tracks looked / confirmed / view / sel. Persists to localStorage per OWNER: `cortex.promotionReview.v1:<sub>.<task>.<ingest>.<attempt>`. A null owner writes nothing. |
| `src/components/ApprovalTask/ReviewRunsList.tsx` | 184 | Run header (static characters slate, varying ones cyan), ×count, ✓ looked/count, ✎, ⚑. Expandable members. |
| `src/components/ApprovalTask/ReviewProgress.tsx` | 28 | Progress bar: looked / checks left / covered, plus ✎ count. |
| `src/components/ApprovalTask/ReviewCallout.tsx` | 84 | The value shown beside the cell. ▲/▼ moves part, prev/next moves check, `fix` opens the row editor. |
| `src/components/ApprovalTask/promotionRuns.test.tsx` | 640 | Card-level tests, flag on. |

### Edited files

| File | Change |
|---|---|
| `PromotionReviewCard.tsx` | +283 |
| `PdfEvidencePane.tsx` | +41: `callout` and `onPagePoint` props |
| `ingestMock.ts` | A `/scale/i` file name gets the 402-part notice |
| `featureFlags.ts` | Adds the `promotionRuns` flag |
| `sessionIsolation.test.ts` | Registers `useReviewCoverage.ts` as a durable writer |
| `documents.test.tsx` | Its `react-oidc-context` mock gains `AuthContext` |

### Behaviour

- **Keys:** j/k or ↑/↓ move between parts. Shift+J/K jump to the next unlooked check.
- **Page click:** clicking a box on the page selects that part.
- **New promote hold, "unchecked":** stricter than today, never looser. It holds Promote until every check has been looked at and every shared fact confirmed.
- **Record preview:** splits what is sent today from the proposed coverage, which is NOT sent. Nothing new goes on the wire.

## Checks (run in the worktree, 2026-10-29)

- **`npm run test`:** `Test Files 7 failed | 273 passed (280)`, `Tests 13 failed | 4236 passed | 9 todo (4258)`.
  - The 13 failures are the same 13 that fail on master in the main checkout: producer-parity seals reading a drifted invincible-agent sibling.
  - Files: meshSdkParity, openapi.seal, uploadIngest.doorFields, emptyConfirmParity, ingestKindStatusParity, producerRegistriesParity, taskKindParity.
- **`npx tsc --noEmit`:** 0.
- **`npm run check:transport`:** 0.
- **`npm run build:bundle`:** 0.

## Browser walk (later the same day): it runs

No-auth dev mode now renders on this branch because of two PROTOTYPE shims, both active only when `VITE_NO_AUTH` is `"true"`:

- `src/App.tsx`, `useSessionIsolation`: the owner is `"no-auth"`.
- `src/hooks/useDropIdentity.ts`: the drop identity is `no-auth@localhost`.

**pdf.js** first failed with "Invalid `workerSrc` type". That was the worktree, not the code:

- The `node_modules` junction makes vite resolve deps to `/@fs/` paths outside the root, and there `?url` is ignored.
- The main checkout on master serves `export default "/node_modules/…worker.min.mjs"` correctly.
- **Fix:** an untracked, never-committed `vite.worktree.mts` sets `resolve.preserveSymlinks: true`. The `promo-scale` launch config passes `--config vite.worktree.mts`.
- **Result:** all 10 pages draw. Shift+J moves the callout to the next check, and resume restores the parts already looked at.

### Before this walk

A dev server with `VITE_NO_AUTH=true` paints a blank surface. This is true on master too. `useSessionIsolation` (`src/App.tsx:360`) keeps the surface hidden until an authenticated owner exists, and no-auth mode never has one.

The main checkout's `.env` uses Keycloak at `localhost:8080`. Neither Keycloak nor the API on `:8000` was running on 2026-10-29. To walk the card:

1. Start Keycloak.
2. Set the worktree's `.env.development.local` to the main `.env` Keycloak keys, `VITE_NO_AUTH=false`, keeping `VITE_FEATURES=ingest,ingestMock,promotionRuns`.
3. Run the `promo-scale` launch config (port 5174) and sign in.
4. Drop any file named `*scale*.pdf`.

Whether no-auth dev mode should get a synthetic owner is a separate question about how isolation is designed. It was not changed here.

## Open, from the packet (`2026-10-28-packet-to-lane-01-…-a-coverage-key.md`)

- **§0:** is a sampled promote legal? Until it is ruled, the hold requires all checks looked at, and nothing promotes on fewer.
- **§1:** a server-side draft would replace the localStorage stand-in. The per-owner key here is the provisional answer to "per task or per steward".
- **§3:** the row-band check is not built. It needs the per-cell bbox answer.

## Facelift + group jumps (later 2026-10-29)

Spec: card-style runs list after Concept C, a where-am-I bar, and group jumps in the page callout.

- **List:** each run is a rounded card with an `S{n}` label and ✓ looked/N.
  - The run holding the selection gets a pink ring; a closed run that holds it shows `◉ at n`.
  - Stragglers are their own amber `↯ STRAGGLER` cards. Varying characters are boxed amber and underlined.
  - A sticky bar reads `S2 · part 25 of 25 · 68 of 402`, with a "show" button.
- **Callout:** `S{n} · pos of size`, then ⇤ start of group, ▲ ▼, ⇥ end of group, ⚄ random part in the group (unlooked first).
  - The group buttons are disabled on singles and at the ends.
  - Keys: Home, End, `s`; runs view only, and not while typing.
- **Pure helpers in `reviewRuns.ts`:** `placeOf`, `groupEnd`, `randomInGroup`.
- **Checks:**
  - `npx tsc --noEmit`: 0.
  - `npm run test`: 13 failed (the same baseline 7 files) | 4248 passed.
  - `check:transport`: 0. `build:bundle`: 0.
  - No existing assertion changed.
- **Mutants**, on `reviewRuns.test.ts` + `promotionRuns.test.tsx` (76 tests); both reddened, and it is 76/76 after restoring:
  - drop the unlooked-first preference: 2 failed;
  - let random return the current part: 3 failed.
