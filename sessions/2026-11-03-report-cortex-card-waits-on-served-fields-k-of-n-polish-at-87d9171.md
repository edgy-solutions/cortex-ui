# 2026-11-03: the sign-in card waits on served fields, and the k-of-n polish is at 87d9171

Dispatch: "cortex: paused-run sign-in card spec (one page, docs/specs/), build behind a flag only if Lane 1 confirms the state is served; k-of-n polish; document card waits on sections[]."

This supersedes `2026-11-03-report-cortex-the-sign-in-card-is-held-and-no-code-exists.md`. Its reopen condition (exchange configured) is replaced by the gate below.

## The sign-in card: spec done, no code, gate not met

| Part of the gate | State at IA master `4612845c` |
|---|---|
| Names agreed | Yes. Lane 1 accepted `paused_call`, `instruction` and `GET /me/paused-runs`. |
| Fields served | **No.** #229 merged at `7cbc2a53`, but `run_awaiting_reauth` still carries only `run_id` and `reason`. Neither new name appears in `src/` or `agent_fleet/`. |
| Lane 1 confirms | **No.** Its packet says "Nothing is served yet". |

`docs/specs/run-reauth-card.md` now says this, records Lane 1's three answers, and has `resumed_detached` say plainly that the answer won't be written.

### How the instructions went tonight

| Time (-0600) | Source | Said |
|---|---|---|
| 21:53 | Lane 1, quoting Chris | Don't build it; the exchange is the ruling |
| 21:57 | The architect, via Chris | Build it |
| after that | Chris's answer to my question, with the architect's note | Hold it. No code. It becomes a dispatch when the exchange is configured and a pause can still reach a person. |
| 22:22 | Lane 1 | Correction withdrawn, and the architect ruled the dispatch stands. "Nothing is served yet, so build against fixtures." |
| after that (arrival, time not recorded) | Chris, the dispatch above | Build behind a flag only if Lane 1 confirms the state is served |

I followed the last one, which I have first-hand. I have Lane 1's account of the 22:22 ruling, not the architect's own words.

**My reading of "served":** the fields exist at a sha Lane 1 names, not that they're deployed. Lane 1 says 0.4.78 can't roll before the card, so "deployed" would be a deadlock.

## Needs Chris

**#229 is merged and 0.4.78 carries it. Should the card start now against fixtures, or wait for Lane 1's fields?**

- **Why it matters:** by Lane 1's account of the architect's ruling, 0.4.78 doesn't roll until the card ships or the exchange is configured. Lane 1 puts the choice to Chris in its morning note (its options B and C). The exchange isn't configured: no values file sets it, per the chart's CHANGELOG.
- **If it waits:** the card's clock starts when Lane 1 names a sha.
- **If it starts now:** Lane 1 has already agreed the names, so a rename risk is small. The size is the same either way: it touches `AuthProvider`, and it needs a browser proof of the popup.

Waiting is what I'm doing unless told otherwise.

## k-of-n polish: `87d917163530a4fe171bbb6cf6987863eb2f2946`

**Digest:** `sha256:83df4f9dae88dc1fcf578fc9f5090a2339379b1bdaf736bd5c43704640c39d4f`, read from GHCR, with `26a2049` resolving to its known digest as the control. Run 41774638101 succeeded and Build Frontend ran.

**No release needs it.** 0.4.77 still pins `26a2049`. For 0.4.78 it's Lane 1's call.

The defect: a partial seed drew "4 of 6 panels seeded", then bare chips 3 and 5 with no word saying what they were. Refused and pending differed only by colour.

| Change | Reaches live today? |
|---|---|
| The outcome list starts "Refused:", and draws no word over no chips | No, needs per-panel events |
| Each chip has a name such as "Panel 3: refused" | No, same |
| A refused chip is struck through | No, same |
| The indeterminate and partial lines are `role="status"` | **Yes** |
| The count line is `role="status"`, without the chips | No, same |

**Still not live:** per-panel progress is Lane 1's open board item `01M6A9QDN1VP1N2GBNX3GA87NB`, and the live runner claims no k. The field names stay PROPOSED.

**Not done on purpose:**

- The refusal reason on a chip, because it needs the PROPOSED `refusal` envelope.
- Naming panels on the live path, because it was never told which ones refused.

**Not proved:**

- No screen reader was run, and no browser walk was done. These are jsdom arms. A `role="status"` mounted along with its content may not be announced on first insert.
- Mock mode has no template catalog, so this can't be walked by hand.

### Evidence

- **Gate** (export of `3df0e40` plus the two files, producer `aac9900b`): transport, redproof, tsc, seals and bundle all exit 0. Tests: 4666 passed, 1 skipped, 9 todo, 309 files. Cross-repo arms that ran: 472, did not run: 0.
- **Mutants:** 12 fired, all killed. Control 24 of 24 green; passed + failed equalled the total on every run. The first 11 were scored by the failing arm's name; the wrap mutant below by its message.
- **Two instruments of mine were wrong, and I fixed them:**
  - My tree-hash check printed blank because `git hash-object` lacked `--stdin`, so it measured nothing. The later wrap-mutant run used the fixed form: same hash before and after, and the file restored byte-identical.
  - "Status wraps the chips" only removed the role, so it wasn't the defect it was named for. The real form moves the chips inside the span. It died on `expected '3 of 6 panels · 1 refused123456' to be '3 of 6 panels · 1 refused'`.

## The document card: no work

It stays built and unreachable, as the dispatch says. `sections[]` is merged on the IA side (#225) but dormant until doc-tools #172 deploys, and no real outline has gone through it.

## Corrections to my own work

- The held report said Lane 1's quote was the state of play. Lane 1 has since withdrawn it, and neither report should be read alone.
- I committed the spec at `25526ab` and placed a "building now" packet without sweeping for placed packets. The sweep before this push is what found #229's merge. Memory now says to sweep when a dispatch arrives.

## Packets

- Placed, uncommitted, in `invincible-agent/sessions`: `2026-11-03-packet-to-lane-01-from-cortex-the-reauth-card-spec-three-names-and-two-questions.md`, rewritten to match this report.
- Committed here with this report: Lane 1's `2026-11-03-packet-to-cortex-from-lane-01-my-correction-is-withdrawn-build-the-card.md`.
- This commit is docs and sessions only and builds no image. **`87d9171` is the last sha with one.**
