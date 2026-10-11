# Packet: `npm run walk` is ready, and the first live run is yours

**From:** cortex-ui/master, 2026-10-11
**To:** invincible-agent/lane/01
**Re:** Chris's dispatch: "Walk harness: npm run walk with PCN + HAZ + FRACAS, creds via WALK_<USER>_* env, exit code pass/fail, mocks proven; Lane 1 does the first live run." Also: "a Playwright test that the stale-tab pill appears when /version.json differs — Lane 1 can flip that live on the next roll."

## 0. The pin (optional)

| | |
|---|---|
| commit | `b56b685770ffa58ce9eeba44a8870430fdaa5a4c` (merge of #12) |
| digest | `sha256:079a04e70cd5ac34b9243523a683992ffeba524671fb497552c0ca90ef32b381` |
| run | 38118806973, success, 0 of 29 build steps skipped |

#12 changes tests, configs and the README only. `src/` is untouched, so the app in this image matches `a00f44c` (`sha256:277d21a7…`, the previous packet) apart from its version sha.

**Pin either.** The walk runs from a checkout and does not care which image is deployed.

The digest was read from the registry API. Controls: the short sha 404s, a fake sha 404s, and `3ea967f` returns 200.

## 1. Running it

Run it from a cortex-ui checkout at `b56b685` or later:

```
npm ci
npx playwright install chromium
WALK_BASE_URL=… WALK_BOB_USER=… WALK_BOB_PASSWORD=… \
WALK_ALICE_USER=… WALK_ALICE_PASSWORD=… WALK_PCN_PDF=… \
npm run walk
```

- **Exit code:** 0 means every step of every selected walk passed. Anything else is a failure.
- **Output:** a summary table on stdout, and the JSON in `walk-out/`.
- **Selecting walks:** `WALK_ONLY=haz,fracas` runs only those. The default is `pcn,haz,fracas,stale`.
- **Missing credentials:** a missing variable **fails** the walk and names the variable. It never skips.
- **Optional variables:** `WALK_NOTICE`, `WALK_EXPECT_PARTS` and `WALK_KC_*_SELECTOR`. `e2e/walk/README.md` has the full table.

## 2. What the two open-defect steps assert

| Step (as bob) | Today, live | Passes on | Fails on |
|---|---|---|---|
| `draft a risk assessment for HAZ-1004` | Abstains: "I could not find anything called 'HAZ-1004'" | a domain card, or a refusal with a non-empty `data-refusal-outcome` | abstain, not-grounded, attempt-failed |
| `what failures are recorded for part 5530-184` | rev 185: NOT GROUNDED (`no_verb_classified`) | a FRACAS card, or a named refusal | the same |

The step detail names the arm it saw (the archetype or the refusal outcome), so the table shows what your fix produced.

**HAZ:** the architect has not ruled which answer is right, so either (a) or (b) passes.

**FRACAS:** a card must carry a `Ranking`/`Trends` heading **and** its own text must mention failures, so a cost ranking does not pass. The walk **cannot check the part**: both archetypes draw `scope_label` only when the card is empty. Read the card yourself on the first run.

## 3. The stale pill: only one direction can be checked live

- **Live, the walk checks a fresh load:** no pill, and `/version.json`'s `git_sha` equals the bundle's. That is the no-false-positive direction.
- **The flip** (a tab open across a roll shows the pill) **cannot be triggered live today.**
  - The freshness check runs once per registration attempt, and no user action short of a reload makes one.
  - A reload loads the new bundle, so it correctly shows no pill.
  - The mock test proves the pill appears when the sha differs.
- **If the pill should reach long-open tabs,** that is a product decision (a poll, or checking on focus) for Chris or the architect. Cortex has not added one.
