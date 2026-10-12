# Packet: a refused export shows its reason (#13), and the stale pill reaches long-open tabs (#14). Pin `b566192`

**From:** cortex-ui/master, 2026-10-11
**To:** invincible-agent/lane/01 (pin, walk), cc invincible-agent/lane/fin (#13), invincible-agent/lane/saf (§3)
**Re:** Chris's dispatch, items 2-5. Item 1 (perf, 187b `3fa6fcb`) went in packet `1d6b57c`.

## 0. The pin

This stacks on `a00f44c` and `b56b685`, the two earlier packets from today. Lane 1 decides which rev carries it.

| | |
|---|---|
| commit | `b566192ae522b83e20cfbacae0b2a70683a542a1` (merge of #14, on top of #13) |
| digest | `sha256:2556cf5b4259e268a296b461d2456dbfd51a6d9588acb824a7f1e0646fd3683d` |
| run | 38202789792, success, 0 of 34 steps skipped |

The intermediate pin, if you want #13 without #14: `cda63d18985e2bd1db914eb92e4526a356d6d1e4` → `sha256:80e15edae64f97dce8adace2adc609e50b6acad25ce4fb415c6905c6d825636e` (run 38202781121, success, 0 of 34 steps skipped).

The digests were read from the registry API. Controls: the short sha 404s, a fake sha 404s, and `3ea967f` returns 200.

## 1. fin: a finance-only export no longer says "failed" (#13)

The ruling: "finance-only shows the reason, never 'failed'." This is the shape `export_package` returns at IA master `gateway.py:2185-2210`.

| | before | after |
|---|---|---|
| summary | `failed — 1 of 1 engines refused` | `1 of 1 engines refused` |
| fin row | `fin failed`, with the reason on a line below | `fin`, then `not a ratified template` |
| outcome | `not_in_model` | unchanged |
| `data-export-top-status`, `data-export-status` | `failed` | **`failed`, unchanged.** The attribute stays honest; the person reads the reason. |

The rule covers every failed status:
- every failed row of a partial board;
- the no-documents single-engine failure.

A failed status with no reason reads `not exported — no reason given`. Your sections always carry a reason, so you should never see it.

## 2. Lane 1: the stale pill now reaches a tab left open across a roll (#14)

The ruling: "re-check /version.json on window focus and every 5 min; pill only, no auto-reload."

**The live flip is now possible.** This supersedes §3 of packet `2dcde81`, which said it was not.
- On your next roll, open the UI as bob before rolling and leave the tab open.
- After the roll, focus that tab, or wait up to 5 minutes.
- The pill should read "Newer Cortex deployed (served X, this tab Y) — reload to update", with `data-stale-refused="false"`.
- Nothing reloads by itself. The Reload button is the user's.
- If that tab's registration was also refused, the pill instead says "this tab's menu is not registered", with `data-stale-refused="true"`.

**What the walk checks.** The walk's `stale` step is unchanged: on a fresh load, no pill. The flip is still checked by hand, as described above. The mock proof is `e2e/staleBundle.spec.ts`, 5/5, which has a focus arm and a `page.clock` 5-minute arm. Both arms assert that the page did not reload.

**One limit.** Once shown, the pill stays until reload. A rollback to the tab's own sha is not detected.

## 3. Not a cortex change: the HAZ "menu reads `identifier`" item

The dispatch said: "Menu reads `identifier` as a fallback for `instance_id` (Lane 1's HAZ finding) unless saf says it renames."

**The finding is Lane 1's HAZ-1004 packet.** It is `5785e926` on `lane/01-rev187`, `sessions/2026-10-11-packet-to-saf-haz-1004-fails-live-two-causes-neither-is-the-graph.md`, Cause 2.

**The reader that drops the key is the backend:**
- `src/iagent_pure/slot_disposition.py:480` (IA master) builds options from `m.get("instance_id")` only.
- Engine S's `_members()` answers `{"identifier", "label"}`.

**Why this can't be fixed in cortex:**
- Cortex never sees the member list.
- Cortex has no reader of `instance_id` on that path.
- The empty menu arrives from the server already empty.

**Where the fix goes.** Lane 1's packet already assigns it to saf ("answer `instance_id`"). If the architect prefers the consumer to accept `identifier` as a fallback, that is a small change at `slot_disposition.py:480-482`. Either way it is IA's change. Saf has not replied yet; `lane/saf` has no commits after `6063497e`.

**Cortex made no PR for this.** If the empty menu should also *say* why it is empty, ask for a field and cortex will draw it.

## 4. Still blocked: the "my drops" banner

The 10-10 packet (`…answers-at-scale-summary-route-body-route.md`, §4b) asked which field marks an extraction as incomplete. No IA branch has a 10-10 or 10-11 session that names it; the nearest is your `/retry` ruling question to the architect. Cortex will build the banner when you name the field.
