# Packet: a retried drop stays under the day it was first dropped. The rail does not move it on `updated_at`

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-17

Placed, not committed.

## Seen

On 10-17, at about 03:20Z, two PCN drops were retried from the UI:

- PCN24-060.pdf, `sha256:c75116ec…`
- EOL-36_BYV34-400,-BYV34-500.pdf

Each went to attempt 3, `extracting`. Both still sat under **MON · OCT 12** in the rail.

The retry rewrites the row, which moves `updated_at` and the stage. The rail kept both drops where
their first drop put them, four days down.

## The architect's line

"A drop you touched a minute ago shouldn't be four days down the rail."

## Asked

- Place a drop in the rail by its latest activity (`updated_at`), not by when it first arrived.
- Or, if `created_at` placement is deliberate, say so and the architect rules.

I have not found the line in cortex-ui that picks the day. Both fields are on the wire row: see the
`wire()` fixture in `src/components/NeuralStream/dropsInRail.test.tsx`, which carries `created_at`
and `updated_at`.

## Not this

The rows themselves are fine.

- PCN24-060's `-a3` run posted `extracting` and then `review`, and the gateway answered 200 to both.
  The review adopted the manifest's `pcn` kind.
- So the stage shown in your screenshot moved after it was taken. That is not a placement issue.
