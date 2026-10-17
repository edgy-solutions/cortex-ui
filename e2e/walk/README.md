# The live walks (PCN, HAZ, FRACAS, stale)

`npm run walk` checks a roll against the live sandbox by command instead of a human clicking. One
Playwright invocation runs the selected walks in order; each walk gets its own browser context.

| Walk | Who | What it checks |
|---|---|---|
| `pcn` | alice drops; bob promotes and asks | the PCN26-184 chain below |
| `haz` | bob | `draft a risk assessment for HAZ-1003` gets a card or a named refusal |
| `fracas` | bob | `what failures are recorded for part 5530-184` gets a FRACAS card or a named refusal |
| `stale` | bob | on a fresh load there is no stale-bundle pill, and `/version.json` names the bundle's own sha |
| `broker` | operator.atlantia | brokered login via the `openddil` broker lands with a persona x domain cell (expected red until Lane 1 seeds a grant) |

`npm run walk:pcn` is an alias that runs the PCN test only. `WALK_ONLY=haz,fracas npm run walk` selects walks
(comma separated; default all; an unknown name is an error, not a no-op).

## PCN walk (drop -> promote -> ask)

| # | Step | Passes when |
|---|------|-------------|
| 1 | alice drops the PDF (kind `pdf`) | an ingest card appears (`received`) **or** a duplicate notice appears |
| 2 | wait for `review` (~100 s) | alice's card reaches `review` |
| 3 | steward review: bob opens the task (nothing is clicked) | the review card draws: title is the notice id (never the sha), the extracted rows, the source PDF `ready`, and row 1's evidence outlined. **Skipped** (with why) if the task names no `ingest_id` or `/extraction` answers a plain 404 (not served: 192, before 193). Any other miss fails with the card's own words, e.g. `404 source_absent` |
| 4 | bob acts `promoted` | the act POST returns 200 (review card: Promote carries no reason; generic card: the reason box is filled) |
| 5 | alice's card reaches `promoted` | within 60 s |
| 6 | bob picks SAFETY_ENGINEER/SUSTAINMENT (step `persona-bob`), then asks "which parts does PCN26-184 affect" | the question is sent |
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
| HAZ | `draft a risk assessment for HAZ-1003` | routes to `draftRiskAssessment` with `instance_resolved:false`, abstains: "I could not find anything called 'HAZ-1003'" (invincible-agent `sessions/2026-10-10-packet-to-saf-fracas-verbs-dispatch-as-svc-supervisor-and-refuse-no-person.md:62-68`) | a domain card, or a named refusal |
| FRACAS | `what failures are recorded for part 5530-184` | rev 185 answered NOT GROUNDED / no capability for this subject (`no_verb_classified`) (invincible-agent `docs/measurements/hand-repro-walk-sheet.md:14,22-31`) | a FRACAS card, or a named refusal; if the refusal names `unknown part '5530-184'` the detail says so |

Detection limits, stated plainly. No `data-*` attribute names the mounted archetype (the per-component
wrapper carries none and the parity baselines freeze that DOM), so (a) is "the new answer tile drew a
heading, table or canvas and none of the failure markers fired", and a FRACAS card is recognised by the
heading its archetype draws (TEXT FALLBACK: `Ranking` for CONTRIBUTION_RANKING, `Trends` for
MULTI_SERIES) AND by its own text mentioning failures. The heading alone would pass a cost ranking; the
mock's `ranking-not-fracas` arm proves it does not. The tile's echo of the question is excluded before
that text check, because the prompt itself says "failures". The abstain text match is the other text
fallback. A card of another archetype fails the FRACAS step as "not a FRACAS card".

**Whose outcome.** Only markers drawn for THIS ask's artifact count. The client mints the artifact id and
sends it as `artifact_id` on `POST …/interview/stream`; the walk reads it off that request
(`askIdOf`), and `snapshot()` attributes every marker to the `[data-answer-id]` tile or the
`[data-canvas-artifact-id]` pane it sits in. A marker in neither (a pinned card) is nobody's. The walk
used to compare marker COUNTS before and after the ask, and a historical answer's `[data-attempt-failed]`
entering the DOM after the ask failed a good run (Lane 1's walk defect §5.1). "Tiles absent from the
before-snapshot" would not have fixed it: a historical tile mounted later is absent from it too.

**The walk cannot check the PART.** Both archetypes draw `scope_label` only on their empty path, so a
populated FRACAS card never says which part it covers. A FRACAS card for the wrong part passes this
step. Read the card yourself on the live run. The mock refusal outcome token is a stand-in; the walk asserts only
that the outcome is non-empty.

## Stale-tab pill

`StaleBundleBanner` (`[data-stale-bundle]`, `data-stale-mine`, `data-stale-served`) appears when the
tab's bundle sha differs from `/version.json`'s `git_sha`. The check runs once per registration attempt
and ALSO on window focus and every 5 minutes (`watchBundleFreshness`, `src/lib/bundleFreshness.ts`, started
from `src/App.tsx`). Pill only: the Reload button is the user's; nothing reloads by itself.

- **Live `stale` step (no false positive):** on a fresh load as bob the pill is absent and `/version.json`'s
  `git_sha` starts with the sha in the header build stamp (`[data-build-stamp-ui]`). An unstamped bundle
  fails the step (freshness is undecidable, so the check would prove nothing).
- **Flip (the pill appears), by hand on the next roll:** open the UI as bob and leave that tab open; roll
  the new image; then focus the old tab (or wait up to 5 minutes). The pill appears with "reload to update"
  (`data-stale-refused="false"`: the watcher saw it, no registration was refused). If a registration
  attempt was also refused the text reads "this tab's menu is not registered" (`data-stale-refused="true"`,
  sticky). Once shown it stays until reload; a rollback to the tab's own sha is not handled.
- **Offline proof:** `e2e/staleBundle.spec.ts` routes `/version.json` to a differing sha (pill visible,
  `data-stale-served` equals it), the same sha (no pill) and a body with no sha (undecidable, no pill); a FLIP
  arm loads on the same sha, re-routes to a different one, dispatches `focus` and asserts the pill
  (`data-stale-refused="false"`) with the page NOT reloaded; a second arm does the same via `page.clock` and
  5 minutes. Mutants proven red: focus listener not added (unit: checks once on focus); interval 50x longer
  (unit: checks every BUNDLE_RECHECK_MS); single-flight guard removed (unit); disposer not removing the
  listener (unit); watcher passing `refused=true` (both FLIP arms: `data-stale-refused` "true"); watcher
  `onStale` never called (both FLIP arms: pill not found).
  The dev bundle's sha is pinned by `GIT_SHA` in `playwright.config.ts`'s `webServer.env` only (value in
  `e2e/bundleSha.ts`); `vite.config.ts` reads `GIT_SHA` before `git rev-parse`.

## Broker walk (operator.atlantia, brokered login)

Walk `broker` signs in as `operator.atlantia` through the Keycloak identity broker (alias `openddil`), not the
local form, in a fresh context. Steps: `creds-atlantia`, `broker-screen` (the broker link is on the Keycloak
login page; absent fails naming the selector and any provider links that ARE there), `broker-upstream` (click it,
fill the upstream form, submit), `broker-first-login` (the next page must be the app: a Keycloak first-broker-login
"Update account", "already exists", link or verify page FAILS naming its heading and URL path, never the query),
`broker-cell` (the PersonaPicker offers at least one cell; none fails `landed with no cell (offered: none)`).
Code: `walkBroker.ts`; offline proof: `walkBroker.mock.spec.ts`.

**Expected RED until Lane 1 seeds a grant:** operator.atlantia holds no persona x domain grant today, so
`broker-cell` fails with `landed with no cell`. That failure is the point of the check, not a harness bug.

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
| `WALK_SPKI_PIN` | yes (live run) | base64 sha256 of the server certificate's SPKI (44 characters ending `=`; comma-separate several). Passed to Chromium as `--ignore-certificate-errors-spki-list`. Absent or malformed: `playwright.walk.config.ts` fails to load, naming the variable (never its value) |
| `WALK_BOB_USER`, `WALK_BOB_PASSWORD` | yes (pcn, haz, fracas, stale) | Keycloak login for bob (the username the realm expects; not assumed) |
| `WALK_ALICE_USER`, `WALK_ALICE_PASSWORD` | pcn only | Keycloak login for alice |
| `WALK_ERIN_USER`, `WALK_ERIN_PASSWORD` | no row today | Keycloak login for erin (`erin@example.com`, the "clean walker" in policy). `creds("erin")` works like any name, but no row declares her, so nothing reads these yet |
| `WALK_PCN_PDF` | pcn only | path to the PCN26-184 PDF on disk |
| `WALK_REQUIRE_REVIEW` | no | `1`: step 3 FAILS where it would skip (no `ingest_id` on the task, or `/extraction` a plain 404). Set it once 193 has rolled |
| `WALK_ONLY` | no | `pcn,haz,fracas,stale,broker` subset; default all |
| `WALK_NOTICE` | no | default `PCN26-184` |
| `WALK_EXPECT_PARTS` | no | default `5530-184,5530-185` (comma separated) |
| `WALK_KC_USER_SELECTOR`, `WALK_KC_PASSWORD_SELECTOR`, `WALK_KC_SUBMIT_SELECTOR` | no | default `#username`, `#password`, `#kc-login` |
| `WALK_ATLANTIA_USER`, `WALK_ATLANTIA_PASSWORD` | broker only | login for operator.atlantia at the UPSTREAM (OpenDDIL) form; a missing one fails the row naming it |
| `WALK_ATLANTIA_CELL` | no | `ROLE/DOMAIN`: that exact cell must be offered and is selected; unset = any one offered cell passes |
| `WALK_KC_BROKER_SELECTOR` | no | default `#social-openddil` (Keycloak renders `id="social-<alias>"`) |
| `WALK_UPSTREAM_USERNAME_SELECTOR`, `WALK_UPSTREAM_PASSWORD_SELECTOR`, `WALK_UPSTREAM_SUBMIT_SELECTOR` | no | upstream form; default `#username`, `#password`, `#kc-login` |

## Persona per row

Each row names its persona in `walkPersona.ts`, and its creds come from `creds(<that user>)` only: a row
whose `WALK_<USER>_*` is missing fails naming the variable. After login and before asking, the walk opens
the persona picker, picks the role and the domain, and reads the trigger back (step `persona-<user>`). A
role or domain the user is not offered FAILS with `walk: <user> is not offered <ROLE>/<DOMAIN> (offered: ...)`;
it never skips. bob's default is DATA_STEWARD/AVIATION, so without the pick the walk would ask as the wrong
persona. The picker is single-select: only the first declared domain is clicked (MESH and DOCS are platform
domains, never offered, kept in scope at send).

| Row | User | Role | Domain | Census row (invincible-agent `docs/measurements/walk-census.yaml`) |
|---|---|---|---|---|
| `pcn` drop | alice | none | none | (no pick; the drop is unchanged) |
| `pcn` ask | bob | SAFETY_ENGINEER | SUSTAINMENT | `sustainment-which-parts-does-pcn26-182-affect` |
| `haz` | bob | SAFETY_ENGINEER | SUSTAINMENT | `safety-haz-1003-risk-assessment` |
| `fracas` | bob | SAFETY_ENGINEER | SUSTAINMENT | `repro-failures-recorded-for-part-5530-184` |
| `stale` | bob | none | none | (only checks the pill) |
| (none) | erin | | | no row is erin's |

## TLS: the SPKI pin

The sandbox serves a self-signed leaf. **Chromium ignores PEM bundles** - it reads only the OS trust store -
so `NODE_EXTRA_CA_CERTS` and `REQUESTS_CA_BUNDLE` do nothing for the page. The pin trusts exactly one key
and leaves verification on for everything else; it does not disable verification (the config never sets
`ignoreHTTPSErrors`). Get the value from whoever owns the certificate (the platform runbook records it);
it is not stored in this repo. Compute one from a PEM with:

```
openssl x509 -in leaf.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64
```

Live control (not automated: no self-signed-cert library is a dev dependency): run with a WRONG pin and
expect `ERR_CERT_AUTHORITY_INVALID` at the first `goto`; the right pin gets past TLS. The pure arg-builder
`spkiPinArg()` is proven offline in `walkLogin.mock.spec.ts`.

**The pin is a LAUNCH flag, so only the browser carries it.** A Playwright `APIRequestContext` is Node: it
never receives the flag and fails the handshake (Lane 1's walk defect §5.2). Every `/version.json` read
therefore goes through a page (`readVersionJson`, and `servedVersion` in the live spec), and a source
seal in `answerWalk.mock.spec.ts` refuses `APIRequestContext`, `.request.get(` and `ignoreHTTPSErrors`
in the walk's files.

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
  Step 3 on its own: served (pass, the detail names title, rows, `ready`, outlined page); pre-193 (skipped, then
  promote still passes); pre-193 with `requireReview` (FAILS); a coded `404 source_absent` on `/source` (FAILS naming
  the code - this arm caught the arraybuffer error body being read as "not served").
- `answerWalk.mock.spec.ts`: per answer walk, a card (pass), a named refusal (pass), an abstain (the step FAILS)
  and a not-grounded answer (the step FAILS); for the failing arms the test passes by asserting the walk's
  computed result is `fail`. Also a missing-credential arm (FAILS naming `WALK_BOB_USER`).
  Pure arms for ownership: a historical tile's failed attempt is not this ask's; each marker arm
  ignores another artifact's and an unowned marker, and decides on the ask's own; `askIdOf` names a
  missing id. `readVersionJson` reads through the page's routes.
  Mutants proven red: `detectAbstain` always false; `creds()` returning instead of throwing; the
  failed-attempt arm counting any owner; the card taken from any tile; the disclosure arm counting any
  owner; the ask id ignored (the haz-card arm fails); a Node request context in `readVersionJson`.
- `walkLogin.mock.spec.ts` (no app needed; fake Keycloak): `login()` SUBMITS the form when the app first answers
  with Keycloak (cross-origin and same-origin), says "already authenticated" / "logged in (SSO session)" only when
  true, and fails fast when Keycloak re-shows the form; `snapshot()` on a non-app page is the named
  `snapshot: not on the app` error; `spkiPinArg()` arms. Mutants proven red: the app-ready locator back to
  `form input[type="text"]`; `spkiPinArg()` returning on an absent pin; `snapshot()` without its guard.
- `walkBroker.mock.spec.ts` (fake Keycloak, upstream and app): the happy path; no broker link; a first-broker-login "Update Account Information" page (message carries the path, never the query); no cell offered; `WALK_ATLANTIA_CELL` not offered (names the offered cells); a missing `WALK_ATLANTIA_PASSWORD` (names the variable, never a value).
- `e2e/staleBundle.spec.ts`: see above. Mutant proven red: `compareBundle` always "current".
