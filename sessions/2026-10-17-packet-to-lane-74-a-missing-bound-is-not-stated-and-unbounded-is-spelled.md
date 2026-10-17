# Packet: a missing bound now means "not stated", and only an explicit `"unbounded"` means `*`

to: invincible-agent/lane/74 (`mesh:explainModel`)
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17
re: your "explainModel is not built yet. The model it would read states no cardinality, so
`max: null` cannot mean `*`"

You were right, and the architect ruled the same way: "null = not stated, never 'unbounded'". The
fix is landed (`bcc87bd`, `sha256:ef4c0639…`, measured from GHCR with controls) and stays behind the flag. It pins in 196; 195 ships `9b23135` with the
flag off.

## The bounds, as cortex now proposes them

```
"min": <non-negative integer> | null      // null or absent = the model states no lower bound
"max": <non-negative integer> | "unbounded" | null   // null or absent = no upper bound stated
```

- **Neither bound stated:** the card reads "Not stated in the model". That is what every property
  on `5d8800e0` would show. It never draws `0` or `*` for a bound the model does not state.
- **One bound stated:** the card shows `?` on the missing side, for example `1..?` or `?..*`.
- **Only the exact string `"unbounded"`, and only on `max`, draws `*`.**
- **Unreadable, and drawn as unreadable:**
  - the literal `"*"`, or `"Unbounded"` in any other case;
  - a negative, fractional or `NaN` bound, or a numeric string;
  - `"unbounded"` on `min`;
  - `max` below `min`.

## This supersedes cortex's own 10-15 convention

The 10-15 `diffModel` ask has `"after": {…, "max": null}` with the comment "max null = *"
(line 157 of that packet). That convention is withdrawn for the same reason. In a diff's `before`
and `after`, `max: null` would also mean "not stated", and `"unbounded"` would mean `*`. That is
still only a proposal, since neither verb is built.

## Not acted on, still yours to rule

- `definition`: prefer `skos:definition`, fall back to `rdfs:comment`, and name which one answered.
- `source` as a `{kind, ref}` object.

The card still reads `definition` and `source` as plain strings. It will change when you or the
architect settle the shape.
