# The PCN walk (drop -> promote -> ask)

A Playwright walk of the PCN26-184 chain against the live sandbox, so a roll is checked by a command
instead of a human clicking. Cast: **alice** drops and asks; **bob** promotes.

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

## Prerequisites

- node, then in the repo root: `npm ci`
- `npx playwright install chromium` (once per machine)
- no dev server is needed; the walk targets a deployed URL

## Environment (nothing is read from a file; no secrets belong in this repo)

| Variable | Required | Meaning |
|---|---|---|
| `WALK_BASE_URL` | yes | the deployed UI, e.g. the sandbox URL |
| `WALK_ALICE_USER`, `WALK_ALICE_PASSWORD` | yes | Keycloak login for alice (the username the realm expects; not assumed) |
| `WALK_BOB_USER`, `WALK_BOB_PASSWORD` | yes | Keycloak login for bob |
| `WALK_PCN_PDF` | yes | path to the PCN26-184 PDF on disk |
| `WALK_NOTICE` | no | default `PCN26-184` |
| `WALK_EXPECT_PARTS` | no | default `5530-184,5530-185` (comma separated) |
| `WALK_KC_USER_SELECTOR`, `WALK_KC_PASSWORD_SELECTOR`, `WALK_KC_SUBMIT_SELECTOR` | no | default `#username`, `#password`, `#kc-login` |

## Run

```
npm run walk:pcn
```

## What a `duplicate` means

PCN26-184 is already promoted on the sandbox. Dropping the same bytes again returns `duplicate`
("already processed on ..."), and no review opens. That is a **PASS** for step 1 (the drop path
works); steps 2-5 are recorded as `skipped: duplicate`, and the ask (6-8) always runs. The walk is
therefore re-runnable after every roll. If the drop returns `received` (new bytes), steps 2-5 run for real.

## Which drop UI

The walk detects it and records it in the result as `dropUi`: `hud-pill` (the `[data-ingest-trigger]`
slide-in) or `composer` (paperclip + chip + inline kind picker + Send).

## Results and exit code

- `walk-out/pcn-walk-<iso>.json` - `ok`, per-step `{step, status, detail, ms}`, `dropUi`, `dropOutcome`,
  `baseURL`, and `servedGitSha` (from the served `/version.json`, so the result names the bundle it walked).
  Credentials are never written to it.
- `walk-out/shots-<iso>/` - one screenshot per step; `walk-out/` also holds the trace of a failed run.
- Exit code **0** when no step failed, **non-zero** on any failed step (the failing step's message is in the JSON and on stderr).
  Missing env vars also exit non-zero, naming the variables.

`walk-out/` is gitignored.

## Offline proof

`npx playwright test e2e/walk/pcnWalk.mock.spec.ts` drives the same walk functions against the dev
server with mocked routes: a fresh drop, a duplicate drop, and a negative control (a plain-document
answer must FAIL step 7 and name the roll-23 symptom). Run it after editing any selector.
