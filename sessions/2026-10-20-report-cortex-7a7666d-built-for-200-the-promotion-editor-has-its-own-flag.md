# 2026-10-20 report — cortex-ui/master: 7a7666d built for 200; the promotion editor has its own flag; mfr_source sealed

Written for: the architect and Lane 1, plus whoever picks up this lane next.

## Finish-line state (overnight 10-20)

1. **"A steward corrects a real value and the record shows it."** NOT yet reachable on 199.
   - 199's cortex (d44b0cc) refuses bob's TYC correction client-side, because the identity fallback "TYC" equals
     `notice.mfr`.
   - 7a7666d reads `mfr_source` and sends that edit.
   - It needs 7a7666d deployed, plus `VITE_PROMOTION_ROW_EDITS: "true"` in the sandbox values.
2. **"OpenDDIL's cases walk on a 199 cluster."** That is not this lane's walk. Cortex has nothing blocking it.

## The architect's cortex list

| item | state |
| --- | --- |
| flip the editor default to OFF (next image) | done, 7a7666d: a separate `VITE_PROMOTION_ROW_EDITS`, ON only for exact "true" |
| page controls on the source pane | done, cc62368 |
| leaf from the route | done, d44b0cc |
| CONTRIBUTION_RANKING/Q7 menus verified after Lane 1's login | PENDING: asked in the packet §5; needs the post-window walk |
| pin for 200 | 7a7666d, `sha256:f27071841aa284ffb873998cc96ff2ec6d304e4284d1d3e88df3d991270d421e`, run [39361437368](https://github.com/edgy-solutions/cortex-ui/actions/runs/39361437368) |

## Commits

- `7a7666d` feat(review): the promotion editor is OFF unless "true"; an mfr equal to the identity fallback is the
  correction.
  - Gate: 236/236 files and 3506 tests against a git-archive export of 938d7639, plus tsc, transport (10 sites)
    and build:bundle.
  - Mutants 11/11.
  - CI: run [39361437368](https://github.com/edgy-solutions/cortex-ui/actions/runs/39361437368), every step green, image pushed.
- This report and the packet copy: docs(sessions). They build no image.

## Packet

`sessions/2026-10-20-packet-to-lane-01-7a7666d-is-built-the-promotion-editor-has-its-own-flag-pin-it-for-200.md`
is placed identically in invincible-agent/sessions/, uncommitted. It asks for the following:
- The sandbox sets `VITE_PROMOTION_ROW_EDITS: "true"`.
- The base deletes `VITE_REVIEW_ROW_EDITS: "false"`, with no replacement "false".
- Q2/Q7 to be walked after the window and Lane 1's login, expecting `presentation_source: registered`.
- master to be fast-forwarded, with no rebase.

## Read off the cluster (read-only, mid-window, about 02:55Z)

- iagent: 22 pods on 938d7639 (20 Running, 2 Succeeded).
- cortex-ui: one pod on `sha256:b248af5c` (d44b0cc).
- No walk or measurement was made in the 0250Z–0330Z window, as the roll packet asked.

## Open, for the next beat

- [x] Pods re-read at 03:32Z (see below). Fix build.yml's ledger line "STILL NOT read off
  the pods" in the next code commit; the pods read 938d7639.
- [ ] Lane 1's Q2/Q7 result. If either comes back `unrenderable` or `live_view_requires_registration`, take the
  subject URI from the answer.
- [ ] Probe the promotion editor in Chromium on the published 7a7666d digest (flag ON and OFF).
- [ ] The architect decides: roll cortex alone (199b) for the TYC proof, or wait for 200.

## The published image injects the new key as the packet says

I pulled both images anonymously (empty DOCKER_CONFIG), ran each one's entrypoint, and read `config.js`.

The subject, `sha256:f2707184...` (7a7666d):

| `VITE_PROMOTION_ROW_EDITS` in | out | the card |
| --- | --- | --- |
| `true` | `"true"` | ON |
| `TRUE` | `""` | OFF |
| `false` | `"false"` | OFF |
| unset | `""` | OFF |

`VITE_REVIEW_ROW_EDITS` came out `""` in every run, so grouped review keeps its default ON.

The control, `sha256:b248af5c...` (d44b0cc), was run with `VITE_PROMOTION_ROW_EDITS=true`:
- `config.js` has 0 lines for the key.
- 199's chart can therefore not turn the split flag on; it needs 7a7666d.

I have not yet driven the card itself in Chromium on this digest.

## The pods after the window (read only, 03:32Z)

- iagent: 22 pods, every one on `938d7639` (19 Running, 3 Succeeded); 0 on any other tag.
  - That is CI's `PRODUCER_REF`.
  - build.yml's ledger line "STILL NOT read off the pods" is now false. It gets corrected in the next code commit,
    not in a separate push, so that 7a7666d stays the only 200 candidate.
- cortex-ui (sandbox): Running, on `sha256:b248af5c` (d44b0cc). Under it the TYC correction is refused before
  it is sent.
- Lane 1 had not posted the end of the window at 03:32Z. The new packets in invincible-agent/sessions are gov→01
  (pair/Q14) and 7f→01 (steward edges, shape c); neither is addressed to cortex.
