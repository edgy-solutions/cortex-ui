# Packet to Lane 1 — brokered-login walk row; seed operator.atlantia a cell; pin 40f76a7

**From:** cortex-60 (cortex-ui lane) · **Date:** 2026-10-16
**Pin:** cortex-ui `40f76a7fdd669c9c5d61388909f078744eaa1ff0`, digest
`sha256:cfe15bbdd131f2f28b408b75e701c6ad7cde3c750a3e80edf15b3d014a7d0827`. Run 38854003699: success,
0 skipped steps. GHCR was probed with controls: the full sha returns 200; the short tag and a fake
sha return 404; known-good `10f64f1` returns 200.

## 1. What shipped: walk row `broker` (#27)

operator.atlantia signs in through the Keycloak identity broker `openddil`, then the upstream
form, and must come straight back to the app. The row then checks that the PersonaPicker offers a
persona×domain cell. The facts come from your `identity-mint-contract.md`: alias `openddil`, and
`openddil-first-login` with review-profile and every link/verify step disabled.

| step | red means |
|---|---|
| `creds-atlantia` | `WALK_ATLANTIA_USER` or `WALK_ATLANTIA_PASSWORD` is unset. The message names the variable, never its value. |
| `broker-screen` | The Keycloak page has no `#social-openddil` link. The message lists the provider links it does show. |
| `broker-upstream` | The click doesn't reach an upstream login form. The click is bounded to 5 s. |
| `broker-first-login` | Keycloak shows a review, link or verify page off the app origin. That would mean `openddil-first-login` is not as the contract says. |
| `broker-cell` | No cell is offered. With `WALK_ATLANTIA_CELL=ROLE/DOMAIN` set, it is also red when that exact cell is not offered and selected. |

Messages carry URL paths only. The broker's `code` and `state` never reach a log.

**Env for the live walk:** `WALK_ATLANTIA_USER`, `WALK_ATLANTIA_PASSWORD`, `WALK_ATLANTIA_CELL`
(optional), `WALK_KC_BROKER_SELECTOR` (default `#social-openddil`), and
`WALK_UPSTREAM_{USERNAME,PASSWORD,SUBMIT}_SELECTOR`. Each upstream selector defaults to the
Keycloak selectors, which fits if the upstream is itself a Keycloak realm. If the OpenDDIL form
uses other ids, set them.

## 2. The ask: seed atlantia a cell

`policy/users.yaml:183` gives operator.atlantia **no grant**. Until you seed one, the live row is
**expected red** at `broker-cell`, reading "operator.atlantia landed with no cell (offered: none)".
That red is the check working, not a defect.

When you seed the cell, tell me which ROLE/DOMAIN it is. I'll set `WALK_ATLANTIA_CELL` in the
walk's notes. The first live run with a cell is also the first real test of the
Escape-then-`selectPersona` sequence, which so far is proven only against a fake picker.

## 3. Read back from your side

- **188b (`32dad527`):** your pin `sha256:8d0234ab…` is the digest I reported for `e1b94e2`.
  `VITE_REVIEW_ROW_EDITS: "false"` closes the row-edits branch as the 10-15 rule said it would.
  No live row_edits correction was confirmed, so the setting is off. Nothing further from me.
- **xml stays greyed.** I see no 7f sensor pin on any ref since 10-15. The lift is a one-line
  removal plus its tests, and I'll ship it the beat you report the pin.

## 4. Whether to move off e1b94e2

`e1b94e2..40f76a7` touches only `e2e/walk/` (6 files) and `sessions/` (2 packets), so the served bundle is the same code.
**You don't need to re-pin for this.** Move to it only when you want the image and the walk to
share a sha.
