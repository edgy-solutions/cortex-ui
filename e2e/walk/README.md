# The live walks (PCN, HAZ, FRACAS, stale)

`npm run walk` checks a roll against the live sandbox by command instead of a human clicking. One
Playwright invocation runs the selected walks in order; each walk gets its own browser context.

| Walk | Who | What it checks |
|---|---|---|
| `pcn` | alice drops and asks; bob promotes | the PCN26-184 chain below |
| `haz` | bob | `draft a risk assessment for HAZ-1004` gets a card or a named refusal |
| `fracas` | bob | `what failures are recorded for part 5530-184` gets a FRACAS card or a named refusal |
| `stale` | bob | on a fresh load there is no stale-bundle pill, and `/version.json` names the bundle's own sha |

`npm run walk:pcn` is an alias that runs the PCN test only. `WALK_ONLY=haz,fracas npm run walk` selects walks
(comma separated; default all; an unknown name is an error, not a no-op).

## PCN walk (drop -> promote -> ask)

| # | Step | Passes when |
|---|------|-------------|
| 1 | alice drops the PDF (kind `pdf`) | an ingest card appears (`received`) **or** a duplicate notice appears |
| 2 | wait for `review` (~100 s) | alice's card reaches `review` |
| 3-4 | bob opens Tasks, acts `promoted` with a reason | the act POST returns 200 |
| 5 | alice's card reaches `promoted` | within 60 s |
| 6 | alice asks "which parts does PCN26-184 affect" | the question is sent |
| 7 | the answer | a table titled "Parts affected by PCN26-184" with rows 5530-184 and 5530-185 |
| 8 | provenance floor | `obtained_via: user-drop` |

Step 7 is the roll-23 guard: the same question once came back drawn as a plain document.

## HAZ and FRACAS: the two open defects

The architect has not ruled what these answers should be, so each step asserts only what is certain.
**PASS** is either (a) a card, or (b) a NAMED refusal: `[data-refusal]` with a non-empty
`data-refusal-outcome`. **FAIL** is an abstain (`[data-ask-abstained]`, or the text "I could not find
anything called"), a not-grounded answer (`[data-fallback-disclosure]`), a failed attempt
(`[data-attempt-failed]`), a refusal with no outcome name, or no answer at all. The step detail
records which of (a)/(b) was seen and the heading or outcome name, so the fix is visible in the table.

| Walk | Prompt (verbatim) | Today's live behaviour (FAILS) | Pass condition |
|---|---|---|---|
| HAZ | `draft a risk assessment for HAZ-1004` | routes to `draftRiskAssessment` with `instance_resolved:false`, abstains: "I could not find anything called 'HAZ-1004'" (invincible-agent `sessions/2026-10-10-packet-to-saf-fracas-verbs-dispatch-as-svc-supervisor-and-refuse-no-person.md:62-68`) | a domain card, or a named refusal |
| FRACAS | `what failures are recorded for part 5530-184` | rev 185 answered NOT GROUNDED / no capability for this subject (`no_verb_classified`) (invincible-agent `docs/measurements/hand-repro-walk-sheet.md:14,22-31`) | a FRACAS card, or a named refusal; if the refusal names `unknown part '5530-184'` the detail says so |

Detection limits, stated plainly. No `data-*` attribute names the mounted archetype (the per-component
wrapper carries none and the parity baselines freeze that DOM), so (a) is "the new answer tile drew a
heading, table or canvas and none of the failure markers fired", and a FRACAS card is recognised by the
heading its archetype draws (TEXT FALLBACK: `Ranking` for CONTRIBUTION_RANKING, `Trends` for
MULTI_SERIES) AND by its own text mentioning failures. The heading alone would pass a cost ranking; the
mock's `ranking-not-fracas` arm proves it does not. The tile's echo of the question is excluded before
that text check, because the prompt itself says "failures". The abstain text match is the other text
fallback. A card of another archetype fails the FRACAS step as "not a FRACAS card".

**The walk cannot check the PART.** Both archetypes draw `scope_label` only on their empty path, so a
populated FRACAS card never says which part it covers. A FRACAS card for the wrong part passes this
step. Read the card yourself on the live run. The mock refusal outcome token is a stand-in; the walk asserts only
that the outcome is non-empty.

## Stale-tab pill

`StaleBundleBanner` (`[data-stale-bundle]`, `data-stale-mine`, `data-stale-served`) appears when the
tab's bundle sha differs from `/version.json`'s `git_sha`. The check runs once per registration attempt
(`src/App.tsx`), not on a timer.

- **Live `stale` step (no false positive):** on a fresh load as bob the pill is absent and `/version.json`'s
  `git_sha` starts with the sha in the header build stamp (`[data-build-stamp-ui]`). An unstamped bundle
  fails the step (freshness is undecidable, so the check would prove nothing).
- **Flip (the pill appears), by hand on the next roll:** open the UI as bob and leave that tab alone; roll
  the new image; then make the old tab attempt a registration. There is NO cheap trigger short of a
  reload, and a reload loads the new bundle, which shows no pill. The opening registration runs once per
  page load; the re-assert (`post("re-assert")`) runs only when an opened artifact shows the capability
  menu was wiped. So the pill is observable only if the roll wiped the menu while the old tab was open
  and the old tab then re-asserts (it logs `[ADR-0017] registration REFUSED` and shows the pill). If the
  roll does not wipe the menu, nothing in the old tab ever checks. Undetermined: a user action that forces
  a registration without a reload. There is no poll or timer, by design.
- **Offline proof:** `e2e/staleBundle.spec.ts` routes `/version.json` to a differing sha (pill visible,
  `data-stale-served` equals it), the same sha (no pill) and a body with no sha (undecidable, no pill).
  The dev bundle's sha is pinned by `GIT_SHA` in `playwright.config.ts`'s `webServer.env` only (value in
  `e2e/bundleSha.ts`); `vite.config.ts` reads `GIT_SHA` before `git rev-parse`.

## Prerequisites

- node, then in the repo root: `npm ci`
- `npx playwright install chromium` (once per machine)
- no dev server is needed; the walks target a deployed URL

## Environment (nothing is read from a file; no secrets belong in this repo)

Credentials are read in ONE place, `creds(name)` in `walkEnv.ts`: `WALK_<NAME>_USER` /
`WALK_<NAME>_PASSWORD`. A missing variable FAILS the walk, naming the variable (never a value); it is
never a skip.

| Variable | Required | Meaning |
|---|---|---|
| `WALK_BASE_URL` | yes | the deployed UI, e.g. the sandbox URL |
| `WALK_BOB_USER`, `WALK_BOB_PASSWORD` | yes (pcn, haz, fracas, stale) | Keycloak login for bob (the username the realm expects; not assumed) |
| `WALK_ALICE_USER`, `WALK_ALICE_PASSWORD` | pcn only | Keycloak login for alice |
| `WALK_PCN_PDF` | pcn only | path to the PCN26-184 PDF on disk |
| `WALK_ONLY` | no | `pcn,haz,fracas,stale` subset; default all |
| `WALK_NOTICE` | no | default `PCN26-184` |
| `WALK_EXPECT_PARTS` | no | default `5530-184,5530-185` (comma separated) |
| `WALK_KC_USER_SELECTOR`, `WALK_KC_PASSWORD_SELECTOR`, `WALK_KC_SUBMIT_SELECTOR` | no | default `#username`, `#password`, `#kc-login` |

## Run

```
npm run walk
WALK_ONLY=haz,fracas npm run walk
npm run walk:pcn
```

## What a `duplicate` means

PCN26-184 is already promoted on the sandbox. Dropping the same bytes again returns `duplicate`
("already processed on ..."), and no review opens. That is a **PASS** for step 1 (the drop path
works); steps 2-5 are recorded as `skipped: duplicate`, and the ask (6-8) always runs. A skipped step
is not a failure. If the drop returns `received` (new bytes), steps 2-5 run for real.

## Which drop UI

The walk detects it and records it in the PCN result as `dropUi`: `hud-pill` (the `[data-ingest-trigger]`
slide-in) or `composer` (paperclip + chip + inline kind picker + Send).

## Results and exit code

- A final summary table (walk, step, status, detail) prints at the end of the run.
- `walk-out/pcn-walk-<iso>.json`, `haz-walk-<iso>.json`, `fracas-walk-<iso>.json`, `stale-walk-<iso>.json`:
  `ok`, per-step `{step, status, detail, ms}`, `baseURL`, `error`. PCN also has `dropUi`, `dropOutcome`,
  `ingestId`, `servedGitSha`, `servedVersion`. `walk-summary-<iso>.json` holds every outcome.
  Credentials are never written to any of them.
- `walk-out/shots-<iso>/<walk>/` - one screenshot per step; `walk-out/` also holds the trace of a failed run.
- Exit code **0** only if every selected walk ran and none of its steps failed; **non-zero** otherwise
  (missing env vars included, naming the variables).

`walk-out/` is gitignored.

## Offline proof

Run after editing any selector or detector (dev server and mocked routes; no real host):

```
npx playwright test e2e/walk e2e/staleBundle.spec.ts
```

- `pcnWalk.mock.spec.ts`: a fresh drop, a duplicate drop, and a negative control (a plain-document answer must FAIL step 7).
- `answerWalk.mock.spec.ts`: per answer walk, a card (pass), a named refusal (pass), an abstain (the step FAILS)
  and a not-grounded answer (the step FAILS); for the failing arms the test passes by asserting the walk's
  computed result is `fail`. Also a missing-credential arm (FAILS naming `WALK_BOB_USER`).
  Mutants proven red: `detectAbstain` always false; `creds()` returning instead of throwing.
- `e2e/staleBundle.spec.ts`: see above. Mutant proven red: `compareBundle` always "current".
