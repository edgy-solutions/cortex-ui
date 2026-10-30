# 2026-10-30 report: the review_coverage send is connected (image e0346d51 from 42c470c)

**Directive:** "connect the send as soon as Lane 1's PR is on master; your image for the 0.4.72 pin is the one with the send in it."

**Contract:**
- `sessions/2026-10-29-packet-to-cortex-from-lane-01-review-coverage-ruled-part-index-ints-groups-server-checks-the-union.md` (the ruling)
- `sessions/2026-10-30-packet-to-cortex-from-lane-01-review-coverage-is-in-0-4-72-connect-the-send.md` (the connect)

## Result

| | |
|---|---|
| cortex-ui sha | `42c470c0df30c65921323117e3dcf922f1d63766` (head of push 0eaea12..42c470c) |
| CI run | `40994259186`: success, image steps ran |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| digest | `sha256:e0346d515b38523b877e3f469ee7f8cfe0d5c56ca2887782437382f453a903f6`, an OCI index for linux/amd64 and linux/arm64 |
| controls | 71c7691 (non-head) returns 404; 0eaea12 still returns `sha256:b95a373c…` |
| producer pin | invincible-agent `10ac02fe` (#156), for the OpenAPI snapshots and `PRODUCER_REF` |

The packet back to lane 01 is placed, uncommitted, at
`invincible-agent/sessions/2026-10-30-packet-to-lane-01-from-cortex-the-send-is-connected-digest-e0346d51-from-42c470c.md`.

## Commits (master)

1. `40725cc` test(review): buildActBody omits review_coverage rather than sending it undefined
2. `9d7b0e9` ci(pin): re-pin the producer snapshot to 10ac02fe (OpenAPI + generated types)
3. `274f869` feat(review): the promotion card sends review_coverage, sealed against the declared schemas
4. `71c7691` ci(pin): PRODUCER_REF 47502b35 -> 10ac02fe
5. `42c470c` test(api): the response seal names GET /ingest/export/profiles, newly declared at 10ac02fe

## Gate

The gate ran in a CI-layout root, with the sibling a git-archive export of 10ac02fe. Steps:
- check:transport, redproof, `npm run test`, tsc, check:seals and build:bundle all exited 0;
- Tests: 4448 passed and 9 todo, across 295 files;
- INSTRUMENT: 441 arms ran, 0 did not run, 0 missing.

The worktree run had four failures:
- **Three were artifacts.** They came from the dev-checkout sibling, which is on a lane branch rather than the pin, and they pass in the CI layout.
- **One was real.** The response seal had no entry for the newly declared `GET /ingest/export/profiles`. Commit 5 fixed it.

## Behaviour (flag `promotionRuns` only; with the flag off nothing changes and no key is sent)

- The promote act carries `review_coverage`, built by `buildReviewCoverage`. The wire type is tied to the generated `ReviewCoverage` at compile time.
- The key sets equal the declared schemas in both directions, because all three are `additionalProperties:false`.
- **Promote is held** while `coverageProblem` finds a failure. It checks:
  - the server's four checks;
  - `rows_not_drawn`, a row with no mpn that would come back `uncovered`;
  - `part_without_index`.

  **Judgment call to note:** a document with an undrawable row can no longer be promoted under the flag. The alternative was to let the server refuse it with a 422.
- **The body is sealed at the real axios adapter:**
  - the union of `looked_at` and every `groups[].parts` equals the fixture rows' distinct `part_index` set;
  - with the flag off, `Object.hasOwn` is false.

## Open

- **Case panel D1 and D2** (lane 01's #155 packet) are NOT in this image: the artifact href resolves against the cortex origin, and absent `options` reads as `[]`. **Yours to rule** whether they go into an image before the rehearsal.
- **`fetchIngestExportProfiles`** still reaches a now-declared op untyped. The follow-up is to move it onto `request()`. It sits behind `reviewExport`, which is off.
- **`flagged ⊆ looked_at`** holds in practice, because the card opens every flagged part, but nothing on either side seals it.
- **Lane 01's per-choice consequence literal (#51)** is still open from before.
