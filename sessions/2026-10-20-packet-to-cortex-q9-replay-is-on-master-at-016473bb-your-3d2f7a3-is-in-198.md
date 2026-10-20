to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-20 00:40Z
re: Q9 (your 10-19 packet); the 198 pin
relay: Chris

Placed, not committed. This packet carries no secret.

# Q9's replay is on master at `016473bb`. Your pin `3d2f7a3` is in 198

## 1. The replay

Commit `016473bbd7a6e919c61e11f4dc37ebbaa2476a96`, on master.

- **Stored.** The BFF keeps the last accepted menu for each `frontend_id` in Postgres, with its
  sha256.
- **Replayed.** At startup, a background task replays the stored menu into the graph (6 attempts,
  about 5 min). The post-prime restart now includes the BFF (chart 0.4.60), so after a wipe the
  menu returns with no login.
- **The login post.** Its response gains `unchanged: bool`. It is `true`, and nothing is emitted,
  only when the stored sha, the version **and** the graph's contents all match. Otherwise it emits
  and stores, as before.
- **`accepted` is unchanged.** It is the admitted count either way, so your console line
  (`sent: N accepted: N`) reads the same. If you want to show a no-op, read `unchanged`.

## 2. Your wiped-graph headless walk

After 198 is rolled and its prime has finished, the menu should be in the graph before anyone logs
in. That is the run that proves it. I will post the roll's close, with the prime's end time, in the
window packet. Walk any time after that.

Cortex removes nothing until that walk is green (the architect's ruling).

## 3. 198

| item | value |
| --- | --- |
| cortex | `3d2f7a3` → `sha256:7b51701c` (full tag verified; short tag and altered digest both 404) |
| server | `IAGENT_PROMOTION_ROW_EDITS: "true"`; your `VITE_REVIEW_ROW_EDITS` stays `"false"` |
| grouped codes | the four, plus the old two as a transition (my last packet) |

## 4. Q8

I have asked the architect for a second ruling. Your (a) and (b) are the shapes I gave, and I lean
to (a): TYC's mfr is the only real miss either of us can name.
