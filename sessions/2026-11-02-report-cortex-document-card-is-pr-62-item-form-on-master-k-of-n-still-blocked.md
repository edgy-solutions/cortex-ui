# 2026-11-02: the document card is PR #62; the item form is on master; "k of n" is still blocked

Dispatch: "review_coverage item-form switch (PR), then the New Canvas 'k of n' against Lane 1's served progress when it lands, then the DocumentReviewCard build when the three answers arrive."

Supersedes `2026-10-31-report-cortex-overnight-item-form-is-pr-61-k-of-n-and-document-card-blocked-on-lane-01.md` on two points:
- Item 3 is no longer blocked.
- 0.4.74 pins cortex **c27e6d3** (invincible-agent `9f833cd0`), not 5cc4241. So it excludes #60, #61 and #62.

## 1. Item form: done

#61 merged as `8afc0e7663cdd3dbb2c8edb8792e06192629421a`, digest `sha256:8c60760d075b774aa607c0ddabab06ea98e6e6537a3cba3dde32a2436f1268f5`.

The digest was read from GHCR by full sha. Control b3f54fc returned 200 and an all-zero sha returned 404. Image step succeeded in run 41510748078.

Lane 1 has the sha and the ordering note: a release pinning cortex at 8afc0e7 or later has to roll before the parts form is deleted. c27e6d3 still sends parts, behind the `promotionRuns` flag.

## 2. New Canvas "k of n": still blocked

Lane 1's item 01M6A9QDN1VP1N2GBNX3GA87NB was open and not served when last checked (10-31). No newer packet has come. `src/lib/seedProgress.ts` keeps its PROPOSED names.

## 3. DocumentReviewCard: PR #62, open, CI green

- **Branch:** `feat/document-review-card-served`, head 2197f91, based on master 8afc0e7. Not stacked, so the CI gate ran.
- **Board:** 01M6A9QDN1Z65JPF81HJTQX901.
- **Card choice:** the card draws only if `GET /review-shapes` serves a `document` row.
  - While loading: no actions.
  - No row, or a failed fetch: a line says why, then the rest of the chain draws.
  - A task not claiming the shape never fetches.
- **Send:** item-form coverage on the one verb taking no reason, with `item_kind` and `rules_version` from the row, `looked_at` every `section_id`, and `sample: null`. The flagged ids and notes fold into the reason of a reason verb, which carries no coverage.
- **`section_verdicts`:** gone from `src/`; the containment seal asserts it has no home.
- **Dormant:** no payload carries `sections[]` and no kind declares `document`. No re-pin. `sections[]` and `header` stay PROPOSED.
- **Mutants:** 33 fired, 33 killed, scored on the message; tree hash unchanged. Two first-round kills did not prove the arm they should have:
  - D2 died on the loading line before the "no acting button" assertion. D2b adds a button to the panel, and that assertion catches it.
  - D6 failed 87 arms on a missing mock export, and its named arm died on `undefined.then`. The arm now returns a pending promise, and D6b fails on its own `not.toHaveBeenCalled`.
- **Local gate (fresh export, producer at 41230a7e):** transport, redproof, test, tsc, seals and bundle all exit 0. Tests: 4596 passed, 1 skipped, 9 todo. INSTRUMENT: 32 files, 456 arms ran, 0 did not.
- **CI run 41518115111:** Build Frontend passed with the same INSTRUMENT, and 12 redproof checks with 0 failed. A PR pushes no image, so the digest comes at merge.
- **Not exercised:** a real `sections[]` payload. The tests use cortex's own fixture.

### Open for others

- **Lane 1:** keep `sections[]` and `universe_for("section")` in one release (01M6A9QDN1NDKZ65PFYF9DQ123). Separated, every document promote answers 503 `review_coverage_unverifiable`.
- **Architect and Lane 1:**
  - Which kind declares `review_shape: document`. Lane 1 put this to the architect; undecided. The card waits on it.
  - `flagged` is always empty on a promote today, so the server never records a flagged section in a document coverage. Changing that needs a served verb valid alongside flags, or coverage allowed on the reason verb.

## After #62 merges

1. Report the master digest.
2. Send Lane 1 the sha.

After 0.4.75: a seal reads `sections[]` from the served payload, then the PROPOSED marks go.

## Packets placed (uncommitted, in invincible-agent/sessions)

- `2026-11-02-packet-to-lane-01-from-cortex-the-item-form-is-on-master-8afc0e7-pin-it-before-the-parts-form-goes.md`: the pin, the ordering note, and this build as #62.

## Still waiting / notes

- **Lane 1:** `carries` and `applies_when` (01M6A9QDN1X5Z55D7DDQJNP4TX); `capabilities` on entitlements, then `AP_GROUP` goes, and `consumer` (01M6A9QDN1H2BGHWGD1407KPXM); `drop_leaves` labels.
- **Fin:** a capture of TCPI's `components[*].archetype`. Not received.
- **`meshSdkParity`:** snapshot `sdk_ref` v0.9.8 against the producer's v0.9.12; needs a separate re-extract.
- **Sandbox freeze:** still in force, so no rolls, and "on sandbox" for New Canvas waits.
- **Scratchpad secrets:** `no-saved-secrets.sh` exits 1 on eight `secrets.yaml` Secret files left in the session scratchpad by earlier helm exports. They were not read, printed or committed, and they have not been cleaned up.
