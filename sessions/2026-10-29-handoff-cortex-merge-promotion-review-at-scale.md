from: cortex-ui/master (the session that built the prototype)
to: the cortex-ui code agent who lands it
date: 2026-10-29
re: merge branch `promotion-review-at-scale` (1f595db) into master

## What it is

The branch is `promotion-review-at-scale`, at `1f595db`. It is one commit on top of master `ad62ba1`, which is still the tip of `origin/master`.

- **Worktree:** `C:\Users\cnogr\git\cortex-ui-promo-scale`.
- **Not pushed.** The branch exists only in this local repo, since the worktree shares the repo with the main checkout.
- **Size:** 18 files, +2771 / −29.

It is Concept C for PromotionReviewCard at scale, for example a 402-part PCN. Everything is behind the feature flag `promotionRuns` in `VITE_FEATURES`, which is off by default. With the flag off the card is unchanged, and `PromotionReviewCard.test.tsx` passes untouched.

What the feature does:

- **Runs:** parts collapse into series ("runs") that have seeded samples. Stragglers and extractor doubts become checks, and a shared fact (for example LTB) is confirmed once.
- **List:** run cards, plus a sticky "where am I" bar.
- **Callout on the PDF page:**
  - ▲/▼ for part;
  - prev/next check;
  - ⇤/⇥ for the start or end of the group;
  - ⚄ for a random unlooked part in the group;
  - keys j/k, Shift+J/K, Home, End and `s`.
- **Coverage:** persisted per owner in localStorage under `cortex.promotionReview.v1:<sub>.<task>.<ingest>.<attempt>`. It is registered in `DURABLE_WRITERS`.
- **Promote:** a new "unchecked" hold. Promote waits until every check has been looked at; this is stricter, never looser.
- **Wire:** nothing new goes on the wire. The record preview labels coverage as "proposed, not recorded".

Full detail is in the branch's report, `sessions/2026-10-29-report-cortex-promotion-review-at-scale-prototype.md`, which is part of the commit. The design rationale is in the packet `sessions/2026-10-28-packet-to-lane-01-from-cortex-promotion-review-at-scale-a-saved-draft-and-a-coverage-key.md`. That packet is untracked in the main checkout and not committed yet; commit it with this work.

## ⛔ Decision before merging: the two PROTOTYPE shims (default: DROP them from master)

Two files carry no-auth dev-mode shims, used only to walk the card locally:

- `src/App.tsx` (`useSessionIsolation`): when `VITE_NO_AUTH === "true"`, the owner becomes `"no-auth"` and the authenticated check is skipped.
- `src/hooks/useDropIdentity.ts`: the drop identity becomes `no-auth@localhost`.

**Why drop them:** `VITE_NO_AUTH` is a runtime key that `docker-entrypoint.sh:40` injects at container start. A pod started with it set to true would put every user on one shared owner, and that removes the session isolation the gate exists for. Whether no-auth dev mode should have an owner is a design question about isolation, and nobody has ruled on it.

**Default:** restore both files to master's version in the merge. One way, after the merge:

```bash
git checkout master -- src/App.tsx src/hooks/useDropIdentity.ts
```

Then check that `PromotionReviewCard.tsx` still compiles. It computes its own owner (~line 322) and does not depend on the shims. Land the shims only if the human says so in chat, and then as their own commit.

## Merge order: after the six open PRs

`sessions/2026-10-29-report-cortex-overnight-four-items-six-prs-all-gated-none-merged.md` gives the order #47 → #52 → #51 → #48 → #49 → #50. Land this branch **last**, because it overlaps with them:

| File | Also touched by |
|---|---|
| `src/components/ApprovalTask/PromotionReviewCard.tsx` | #48 (export mount), #52 (doc_level note) |
| `src/lib/featureFlags.ts` | #48, #50 (each adds a flag; keep all of them) |

Expect textual conflicts in `PromotionReviewCard.tsx`. This branch adds about 300 lines: runs view, keys, callout props, promote hold, record preview.

When resolving, keep:

- both PRs' mounts and notes;
- the flag guard `runsOn` around every new branch, so that flag-off rendering stays identical to master.

## Steps

1. **Prepare the tree.** In the main checkout (`C:\Users\cnogr\git\cortex-ui`, on master), check that the index is empty: `git diff --cached --name-only | wc -l` should print 0. Pull in whichever of #47–#52 have landed.
2. **Open a PR.** Push the branch and open a PR against **master**, so that `build.yml` gates it. A PR on master is built; a stacked one is not.
   - Alternatively, merge locally per R-009.
   - Either way, re-gate on the merged tree.
3. **Drop the shims** (above), unless told otherwise.
4. **Leave `vite.worktree.mts` out.** It is untracked in the worktree and **must never be committed**. It only fixes pdf.js in the junctioned worktree preview.
5. **Gate on the merged tree.** Run vitest from an uppercase `C:` (`pwd -W` must print `C:/`):
   - `npx tsc --noEmit` → 0
   - `npm run test` → only the known producer-parity failures. Baseline today: 13 tests in 7 files (meshSdkParity, openapi.seal, uploadIngest.doorFields, emptyConfirmParity, ingestKindStatusParity, producerRegistriesParity, taskKindParity). #49's re-pin may change that count, so compare against master's own count at the time, not against 13.
   - `npm run check:transport` → 0
   - `npm run build:bundle` → 0 (green tests do not prove the bundle builds)
6. **Read the digest.** After the push to master, the build pushes an image. Report its digest from GHCR. Do not deploy: the flag is off and there is nothing to roll.
7. **Clean up only after the merge is confirmed.** In order:
   - `cmd /c rmdir C:\Users\cnogr\git\cortex-ui-promo-scale\node_modules` (it is a JUNCTION; a forced worktree remove would follow it and empty the main checkout);
   - then `git worktree remove`;
   - then delete the branch;
   - remove the `promo-scale` entry from `.claude/launch.json` (untracked, local).

## Verify by hand (optional)

To see the feature in a dev server, set `VITE_FEATURES=ingest,ingestMock,promotionRuns`. Then drop a PDF whose name matches `/scale/i`, with real `%PDF-` bytes and kind PCN, to get the 402-part mock notice `PCN-SCALE-0402`.

Without the shims, no-auth mode paints blank (true on master too), so this needs a signed-in Keycloak session.

## Still open (not blockers; flagged off)

These are from the packet to lane 01:

- **§0:** is a sampled promote legal? Until it is ruled, the hold requires every check to be looked at.
- **§1:** a server-side draft would replace the localStorage coverage.
- **§3:** the row-band check is not built; it waits on the per-cell bbox answer.
