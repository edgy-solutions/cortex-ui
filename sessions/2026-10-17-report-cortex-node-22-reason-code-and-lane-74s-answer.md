# Report: Node 22 and fin's reason_code are landed. Lane/74 answered, and one false claim is queued in the MODEL card

for: Chris, invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17
re: the architect's 10-17 reply to the overnight report

## The rulings, as applied

| ruling | done | sha |
|---|---|---|
| `68f56bb` is 194's pin; `9b23135` waits for 195 | recorded here; nothing to change in cortex | — |
| Bump CI and the builder to Node 22 LTS; drop the test-only fill | done, pushed | `aa1be53` |
| Fin's `reason_code`: the one-liner | done, pushed | `e1f3269` |
| SPKI pin comes from Lane 1 by packet | waiting; the brokered-login walk row stays skipped until it arrives | — |

**Node 22 (`aa1be53`):**
- `setup-node` moves from `"20"` to `"22"` in `build.yml` and `helm-release.yml`.
- The Dockerfile builder moves from `node:20-alpine` to `node:22-alpine`. The runtime stage is nginx
  and does not change.
- `engines.node` moves from `>=20` to `>=22.13`, in `package.json` and the lockfile root. That is
  what pdfjs-dist 6 declares.
- The `Promise.withResolvers` fill from `f15b88e` is deleted. A Node 20 run now fails, as it should.

**`reason_code` (`e1f3269`):**
- `readExportDocument` keeps a string `reason_code` on a `documents[]` entry. Anything else reads as
  absent, the same as `reason` and `outcome`.
- One new arm. It kills both mutants: dropping the copy, and dropping the string guard.

**Checks:**
- `tsc`, transport and `build:bundle` exit 0.
- Full suite: 14 failed | 3332 passed. That is the baseline 13 plus one 5-second timeout in
  `sessionIsolation`, a source walk that ran under full-suite load.
  - Run alone, the file passed 28 of 28 twice, in about 5 seconds.
  - It is not caused by this change, but it is close to its limit and may flake again.

**Image:** `e1f3269` built on Node 22: `sha256:a9a5cde894597e1f76862014078d5fc8fc152662bbf17b60922c3bdf39f26ccd`. Every step passed, including the suite without the fill. Measured from GHCR with controls: short and fake return 404, the known-good returns 200. `aa1be53` has no image, because only the head of a push builds. `e1f3269` is not a pin anyone has asked for. 194 takes `68f56bb`, and 195 takes `9b23135` unless the cardinality question below moves it.

## Peer packets read with this beat (committed here, as placed)

**Fin's correction (edited in place).**
- An id-less export request is not refused as `not_in_model`. engine-cost exports the whole
  program instead.
- cortex never sends one: the button is disabled on an empty board
  (`CanvasExportButton.tsx:164,177`).
- Nothing on our side depends on it.

**Lane/74's answer to `7fcf89a`: explainModel is not built.** It is not in lane/74's orders, and
`contract.ts` stays PROPOSED.
- **Confirmed:** `not_recorded` is sent, never inferred. No class carries a system-of-record or
  owning-domain annotation.
- **Stream, not route,** is lane/74's reading of ADR §1. That is for the architect to confirm.
- **Queued, and a question for you:** the card draws `max: null` as `*`. That was cortex's own
  convention from the 10-15 `diffModel` packet. On `5d8800e0` the model states **no cardinality
  at all**: there is no SHACL and no `owl:*Cardinality`. So every property would read as
  "unbounded", which the model never claims.
  - Lane/74 proposes that `null` means not stated, and an explicit `"unbounded"` means `*`.
  - The fix is small and the card is flag-off. But `9b23135` is 195's pin, and fixing it first
    would move that pin. Fix it before 195, or ship `9b23135` with the flag off and fix it after?
- **Also proposed by lane/74, not acted on:**
  - `definition`: prefer `skos:definition`, fall back to `rdfs:comment`, and name which one
    answered;
  - a `{kind, ref}` object for `source`;
  - `ratified_at` stays null until the roll stamps a sha. The card already says "not stated".
