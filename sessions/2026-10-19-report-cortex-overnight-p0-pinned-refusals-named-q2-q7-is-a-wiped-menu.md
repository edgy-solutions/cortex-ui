# cortex-ui overnight 10-19: the P0 is pinned, grouped refusals are named, and Q2/Q7 is a wiped menu

Written for: the architect and Chris, in the morning.

## 1. P0: the source pane (done, pinned, rolling in 197)

**Cause.** nginx 1.25.5's stock `mime.types` has no `mjs` entry. pdf.js's worker (`pdf.worker.min-*.mjs`) went out as `application/octet-stream` with `nosniff`, so Chromium refused it as a module worker. The fake-worker fallback failed too, and the pane printed one generic sentence.

It was neither Node 22 nor the cookie session. Lane 1 independently confirmed `/source` answered 200 with a real `%PDF-1.7`.

**Fix: `3bd3e80`, `sha256:2b61d76fed5d2927de93f798e127ccad8f08ef2eddd60e28de21650ccc7b2218`**, CI run `39192542695`, all green.
- `nginx.conf` has an http-level `types { text/javascript mjs; }`.
- The pane names the stage and what came back: the HTTP status, content-type, byte count, first bytes, and pdf.js's own error. A failed page draw names its render error.
- The seal is `nginxModuleMime.test.ts`. 10/10 mutants were killed for the right reason.

**Measured on the published images.** Both were pulled anonymously and run, then probed with Chromium:

| image | `.mjs` served as | verdict |
| --- | --- | --- |
| `1f3ae4ed` (live before) | octet-stream | NOT DRAWN, with the fake-worker error verbatim |
| `2b61d76f` | `text/javascript` | DRAWN |

**Lane 1 pinned it** (`8516762e`), and 197 is rolling (window 03:14Z–03:45Z). Lane 1 re-reads the worker type and bob's two rows afterwards.

**Gap:** no CI step runs the built image in a browser. The seal reads the conf.

## 2. row_edits behind the flag: `3d2f7a3`, `sha256:7b51701c04935bab87798b3b53f50bd77bb40aa24917b7616cdfcbc8a022e512`

- The wire already matched 197's `RowEdits` key for key, behind `VITE_REVIEW_ROW_EDITS`, default ON.
- New: a refused grouped `/act` names the platform's reasons. It covers:
  - `row_edits_invalid`, with every `problems[]` entry;
  - `reason_code_required`, with its codes;
  - `row_edits_not_for_kind`;
  - FastAPI's validation list.

  Any other failure names its HTTP status or "before any answer". Before, they all showed "Resolve failed". The draft survives the refusal.
- 6/6 mutants were killed. This image is not in 197; pin it at the next roll.

## 3. Q2/Q7 render menus: no cortex code is missing. The roll's wipe deletes the menu.

- Both rows have shipped since 10-08:
  - `safety#OrphanedHazardSet` → ContributionRanking;
  - `safety#FailureTrend` → MultiSeries.
- 74's walk got `live_view_requires_registration`. That is the no-menu branch: the graph held no menu for `cortex-ui-desktop`.
- The prime's `--wipe` clears every Weaviate collection. Engines re-register through the hook; cortex re-registers only from a browser session.
- **Ask to Lane 1:** after the 197 window, open cortex once in a browser, then walk Q2 and Q7.
- **For the architect to rule:** who re-posts cortex's menu after a wipe? (a) A cortex static file plus a hook job with a service identity, or (b) the BFF replays its last accepted menu from Postgres. Cortex prefers (b).

## 4. Grouped review to the four codes: blocked on Lane 1

`_GROUPED_REJECT_CODES` and the `reason_code` Literal still carry the three old names on `57052286` and `8516762e`. Cortex's `rowEditsWireParity` seal pins both sets, so the server has to widen first. Asked twice, in both packets.

## Packets (placed in invincible-agent/sessions, uncommitted there)

- `2026-10-19-packet-to-lane-01-p0-the-worker-mjs-is-javascript-in-3bd3e80-pin-it-for-197.md`
- `2026-10-19-packet-to-lane-01-q2-q7-are-a-menu-the-roll-wipes-open-cortex-before-the-walk.md`

**Left uncommitted here on purpose:** the two Lane 1 packets that carry an SPKI pin value (`…sandbox-spki-pin…` and `…1f5482f-is-pinned…`).

## Suite

The baseline is unchanged: 13 failures in the same 5 cross-repo files locally, all green in CI.
