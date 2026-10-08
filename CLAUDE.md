# CLAUDE.md — cortex-ui lean-session card

Companion to `AGENTS.md` (the full agent guide, 13.8k — read by grep, not whole).
This file is the cheap orientation card. Global working rules load from the
user-level CLAUDE.md; they are not repeated here.

## What this is

The Cortex: a React 19 + TypeScript + Vite server-driven UI for an AI agent-mesh
interrogator ("Dark Glass & Neon"). It renders whatever the backend declares —
archetypes, capabilities, SSE interview streams — and falls back to mock mode
when the FastAPI backend is absent.

## Repos

- `C:\Users\cnogr\git\cortex-ui` — this repo (frontend). Branch: **master**;
  commits land on master directly (ruling R-009 — this lane is exempt from the
  worktree rule, because master is what the human rolls).
- `C:\Users\cnogr\git\invincible-agent` — platform/backend (FastAPI, Dagster,
  Postgres `iagent`, BAML). Origin of record for ADRs (`docs/adr/`) and rulings
  (`docs/rulings/`). Shares the `bpmn_catalog` table — never change that schema
  one-sided.

## Map

- `src/components/` (183 files) — UI; `AgenticCanvas/`, `registry/` are the hot spots.
- `src/lib/` (73) — emitters, canvas templates, projectors, most pure logic + tests.
- `src/registry/` — `assembleCapabilities.ts`, the capability/archetype assembly.
- `src/api/types.ts` — 48k of wire types; the producer contract. grep it, never read it.
- `src/store/` — zustand (`useCanvasStore`).
- `scripts/` — `check-transport-declarations.mjs` (guard), `redproof-*.mjs` (prove the guard can fail).
- `tests/hop3/`, `tests/evidence/` — out-of-vitest `.mts` proofs, run by hand.
- `docs/rulings/README.md` — MIRROR of the platform register, never an origin.
- `sessions/` — dated dispatches/handoffs/reports/payload fixtures; the lane's ledger.
- `helm/`, `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh` — runtime env is injected at
  container start, not baked at build.

## Commands (do not run unasked)

```
npm install
npm run dev                       # vite, http://localhost:5173
npm run test                      # vitest run
npm run build                     # check:transport && test && tsc && vite build
npx tsc --noEmit                  # type-check only
npm run check:transport           # transport-declaration guard alone
npm run check:transport:redproof  # prove that guard can still fail
node tests/hop3/<file>.mts        # hop3 proofs, by hand
```
CI: `.github/workflows/build.yml`, `helm-release.yml`.

## ⛔ Pinning the image — NOT every sha on master has one

Since `1e31d92` (2026-09-23) a **sessions-only or docs-only push builds no image.** A `changes`
job diffs the push three-dot against its base and, if every changed path matches `^sessions/` or
`^docs/`, the six image-build steps skip. **The checks still run** — `check:transport`, the full
suite and `tsc` are deliberately outside the gate, because this repo has already paid once for a
seal that silently stopped running in CI.

So the rule doc-tools wrote applies here too, and it is the consequence, not the feature:

> **Pin to the last sha whose build actually PUSHED — not to whatever landed most recently.**
> Confirm it from GHCR or the run, never from the commit log.

**The chart refuses an ABSENT pin, and nothing else.** Since `b7e365e` (2026-09-27),
`helm/cortex-ui/templates/frontend-deployment.yaml:35` uses `required` on
`frontend.image.digest` or `.tag`. The `tag: latest` default is gone.

That guard checks that a pin is PRESENT, not that it was ever BUILT. A pin naming a sessions-only
sha renders perfectly and fails minutes later at the kubelet with `ImagePullBackOff`, on a release
Helm already called a success. (Until 2026-09-27 this paragraph said there was no guard at all;
that was true then.)

**`helm/` must never be added to the allowlist.** A values file is not code, it is what *deploys*,
and it carries the image pin. Same reason doc-tools keeps `charts/` off its list.

Checking whether a sha has an image (the repo is public, so no `gh` is needed):

```
# did the run even build?  6 skipped image steps == gated, not broken
curl -s "https://api.github.com/repos/edgy-solutions/cortex-ui/actions/runs?head_sha=<FULL_SHA>"
curl -s ".../actions/runs/<RUN_ID>/jobs"
```

⚠ **A 404 from GHCR now has a FOURTH meaning: deliberately skipped.** It reads identically to
"not built yet", "no anonymous access", and "tag spelled short". Only a control that resolves —
plus the run's step list — separates them.

## NEVER READ whole — context hazards

| File / dir | Why | Cheap inspection |
|---|---|---|
| `node_modules/`, `dist/`, `coverage/` | generated, huge | `ls`, `du -sh` (skip node_modules — du times out) |
| `package-lock.json` (295k) | lockfile | `grep -n '"<pkg>"' -A3`, or `npm ls <pkg>` |
| `tsconfig.tsbuildinfo` (172k) | tracked build artifact | never; delete-safe |
| `caps_dump.json` (51k) | generated headless capability dump, ignored on purpose | `jq 'keys'` / `head -c 400` |
| `helm_template_output.yaml` | `helm template` output, tracked | regenerate, don't read |
| `docs/demo-week-work-cluster.md` (56k) | planning cluster | `grep -n '^#'` then `sed -n 'a,bp'` |
| `src/api/types.ts` (48k) | wire types | `grep -n 'interface X\|type X'` |
| `sessions/*payload*.json` (up to 38k) | producer fixtures | `jq 'keys'`, `jq -r '.rows[0]'` |
| `src/**/*.test.ts` (42k+ files) | big fixtures | grep the test name |
| `*.log`, `errors.txt` | noise | `tail` |

## Handoff

The project's handoff equivalent is `sessions/` — dated files, one per beat,
committed as `docs(sessions):` / `chore(sessions):`. There is no single
HANDOFF.md, and none was created. Newest as of 2026-09-20:

`C:\Users\cnogr\git\cortex-ui\sessions\2026-09-19-report-cortex-60-overnight-pin-bumped-push-blocked-ledger-walked.md`

Latest handoff proper:
`C:\Users\cnogr\git\cortex-ui\sessions\2026-09-19-handoff-cortex-60-the-roll-gate-cleared-and-the-vocabulary-three-homes.md`

Index for the current payload set:
`C:\Users\cnogr\git\cortex-ui\sessions\2026-09-19-INDEX-finance-payloads-from-91.md`

## Gotchas visible from the survey

- Transport declarations are **enforced by a script, not by review** — a new fetch/SSE
  site fails `check:transport` before tests run. `build` runs the guard first.
- The redproof scripts exist because a guard that cannot fail is not a guard; if you
  edit a guard, re-run its redproof.
- `errors.txt`, `helm_template_output.yaml`, `tsconfig.tsbuildinfo` are generated but
  **tracked** — they dirty the tree for every lane. See the proposals in the session log.
- `.env` is gitignored; `.env.example` is the contract. Env is injected at container
  start by `docker-entrypoint.sh` (the Dockerfile ENTRYPOINT) — the only injector;
  the stale `bin/inject-env.sh` (4 keys, never in the image) was deleted 2026-10-07.
- `caps_dump.json` was once swept in by `git add -A` and had to be removed — never
  `git add -A` here.
- Rulings/ADRs originate in `invincible-agent`, are mirrored here. Don't number one here.

## Conventions (fleet directive 2026-10-06; text from invincible-agent `2b6fe0f6`)

- **Only the owning lane commits in this repo; packets are placed, never committed, by anyone
  else.** Another repo's lane drops its packet into `sessions/` and leaves it untracked (or
  staged); the owning lane reads it and commits it with its own work.
- **Print a length and a hash prefix, never a secret value.** To show that a token, password
  or key is present or matches, print `len` and the first 8 hex of its sha256 — never the
  value, and never decode a Secret's data into the transcript.

Three more from the same directive, landed from ia-gov's packet
`sessions/2026-10-07-packet-to-cortex-60-three-more-claude-md-rules.md`:

- **A stacked PR runs no CI gate.** `build.yml` triggers on `pull_request: branches: [master]`
  only. A PR based on master is built; a PR stacked on another branch gets nothing. Say so when
  reporting a stacked PR as ready, and re-read its checks once it is rebased onto master.
- **Show the values diff before a roll.** Before any `helm upgrade` of cortex-ui:
  - render the chart (`helm template helm/cortex-ui` with the deployed values);
  - diff it against the live release (`helm get values` / `helm get manifest`);
  - show the diff to whoever approves.

  The chart's `required` refuses only an ABSENT pin (see "Pinning the image" above). A wrong or
  never-built pin renders clean, so the diff is where a human sees it.
- **Python through this repo's venv only.** This does not apply today: there is no
  `pyproject.toml`, no tracked `.py`, and no `python3` on the dev box (probes run in `node`). If a
  Python helper is ever added, it runs via `uv run`, never a bare `python` from PATH.
