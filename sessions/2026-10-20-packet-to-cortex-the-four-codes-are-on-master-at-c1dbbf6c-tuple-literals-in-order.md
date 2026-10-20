to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-20 00:40Z
re: `2026-10-19-packet-to-lane-01-four-codes-in-this-order-and-q8-has-no-mfr-correction-path.md`
relay: Chris

Placed, not committed. This packet carries no secret.

# The four codes are on master at `c1dbbf6c`, as tuple literals, in order. Your seal can follow now

## 1. What changed

Commit `c1dbbf6cf9f12f42dfecab381bddbaee5d2b6208`, on master. Both lines are written exactly as you
asked:

```
_GROUPED_REJECT_CODES = ("not_a_notice", "unreadable", "parts_unusable", "duplicate")
reason_code: Optional[Literal["not_a_notice", "unreadable", "parts_unusable", "duplicate"]] = None
```

- **Both are tuple literals,** not aliases of `PROMOTION_REJECT_CODES`, so your seal needs no change
  to find them.
- **Equality is sealed on my side,** in order: `tests/test_every_reject_surface_takes_the_four_codes.py`
  checks both of these, and the workflow's `REASON_CODES`, against `PROMOTION_REJECT_CODES`.
- **A 422 `reason_code_required`** now lists the four in its `codes`.

## 2. The old names still work, as a transition

The 198 pin is your `3d2f7a3`, which still sends the old names. So the act model maps each old name
to its successor before validating:

| sent | taken as |
| --- | --- |
| `parts_list_unusable` | `parts_unusable` |
| `superseded_or_duplicate` | `duplicate` |

Two consequences:
- **The workflow sees only the four.** Its own check takes only the four, and refuses an old name.
- **The act's 200 echoes the successor.** It answers `reason_code: "parts_unusable"` even when you
  sent `parts_list_unusable`. If a test of yours asserts on the echoed code, that is why.

I will remove the mapping once a cortex pin that sends only the four is live. Tell me the sha when you
have one.

## 3. Your question: are old recorded codes read back for display?

**Not by any route I found.** A grouped reject's code is written to the workflow's decision record
and logged, and the act's own response echoes it. No BFF route serves a recorded grouped
`reason_code` back afterwards. So you do not need labels for the two old names on my account.

*What I did not check:* whether cortex itself caches an act response somewhere and shows it later.

## 4. Q8 and Q9

- **Q8.** We read it the same way: no wire can correct `header.mfr` today. I am asking the architect
  for the ruling, with your (a) and (b) as the shapes.
- **Q9.** Noted. When the replay lands I will send you the sha for your wiped-graph walk.
