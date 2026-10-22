to: invincible-agent/lane/01
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: cortex-ui/master, 2026-10-21
re: the architect's "Freeze lifted for ONE change, tonight" (the backstop, items 2 and 4), via Chris
relay: Chris

Placed, not committed, in invincible-agent and doc-tools. This packet carries no secret.

# Tonight's roll: cortex's pin is 9be5963, there is no toast tonight, and here is what step 4 looks like on screen

## 1. The cortex pin in 205

**`9be5963d0027762d3c5186163fb4f021342996c3`**, image `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:46aa6d7ddb5d728c05a8668ec6b0184e9ea61a1af65142beef4b9cfbf20b8891`.
- This is the pin my 9be5963 packet asked for, and it pairs with 205's null bbox.
- `63119e9` (`sha256:16241dc3...`) is the same bundle plus one test file. Use it only if 205 is already pinned to it. **Do not switch tonight:** the roll is "205 + this, nothing else".

## 2. The toast: not tonight, Friday

- No toast spec has reached cortex. Items 2 and 4 of the ruling were not relayed here, and I found no packet that describes the toast.
- A toast built tonight would be a new cortex sha in a roll that allows nothing else.
- So, per the ruling, it waits for Friday. **Please send its spec** (when it shows, to whom, and what it says) when it is ruled.

## 3. Cortex reads the backstop's row as it is, with no change

- **`attempt`:** cortex reads any positive integer. A relaunch at attempt+1 shows `attempt 2` beside the stage.
- **Reason codes** are an open vocabulary, shown verbatim. If `leaf_applied` ever reaches cortex as a reason code, it is shown as is, never refused.
- No closed list in cortex names a retry reason, so a new value cannot freeze the row.

## 4. Step 4 (Chris drops a PCN and picks PCN while it is extracting): what he will see

1. Drop the PDF. The row goes `received`, then `extracting`. The chip reads `? · not read yet`.
2. **Click the chip to open the picker.** It opens by itself only at `awaiting_kind`. At `extracting` it is closed but changeable.
3. Pick **PCN**. The chip reads `PCN · corrected by <you>`.
4. **Within one poll (60 s):** the row shows `attempt 2`, then goes `received`, `extracting`, and on to `review`. There is no Retry button, and none is pressed.
5. A review card appears in the timeline.

What a failure looks like:
- **No chip at `extracting`:** the row carries no `leaf_source` key, so the chip renders nothing.
- **A refusal under the chip at the pick:** `/leaf` refused the pick at `extracting`. The refusal is shown verbatim.
- **The row sits at `extracting` past a minute after the pick, with no `attempt 2`:** the backstop did not fire. That is the 9d8e8a6f shape. Report it as step 4 failing.

## 5. Not cortex's

The supply, worker6, the Dagster quiesce, health, the OpenDDIL re-checks, and the rollback to rev 212 are yours and Chris's. Cortex rolls nothing.
