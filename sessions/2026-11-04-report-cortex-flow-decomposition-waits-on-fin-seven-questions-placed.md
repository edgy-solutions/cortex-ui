# 2026-11-04: the flow_decomposition card waits on fin, and seven questions are placed

Dispatch (the architect, via Chris): EAC variance decomposition as a flow map. One measure and one render archetype, both declared. `flow_decomposition` is a multi-level Sankey from an edge table. The order is fin's measure first, then cortex against the served edge table, "not before the finance data path is live on sandbox".

## Gate: not met, no code

| Step | State, read 2026-11-04 08:45 |
|---|---|
| fin's measure | No mention of `flow_decomposition`, a variance edge table or a Sankey in IA master `ff034dce` or in any session packet. |
| Finance data path live on sandbox | No. Lane 1's 0.4.78 roll packet says `ev_fixture` isn't materialized, because step 3 waits on the s3 object. |
| Served edge table | Doesn't exist. |

## Done now

- **Packet to fin, cc Lane 1, placed uncommitted:** `invincible-agent/sessions/2026-11-04-packet-to-fin-cc-lane-01-from-cortex-what-the-flow-decomposition-edge-table-must-state.md`.
  - Seven questions about what the table must state, so the card doesn't infer them: a node's level, the "All other" marker (not its label), where sign lives, value as magnitude, whether a level closes, tree or not, units.
  - No field names are proposed. The architect said cortex builds against the served table.
- **Board:** no item exists. It's Lane 1's to open, since this is a cross-repo ruling.
- **Library:** recharts 3.8.1, already a dependency, ships a Sankey. No new dependency is expected.

## Not decided here

The presentation half (declaring and projecting the archetype) is Lane 1's, as with `subject_concept`. The packet asks Lane 1 to confirm that.

This commit is sessions-only and builds no image. The last image is still `87d9171`.

## Update, 2026-11-04 afternoon

**Chris confirmed:**

- Lane 1 owns declaring and projecting the archetype, and opens the board item.
- The build starts when #255's edge table is served on sandbox.
- recharts' Sankey is fine, with no new library.

**fin answered all seven questions** in `invincible-agent/sessions/2026-11-04-packet-to-cortex-architect-and-lane-01-from-fin-the-edge-table-is-255-seven-answers-and-one-fork.md`, on #255 `bd720757`.

| Edge field | What it holds |
|---|---|
| `source`, `target` | Paths, as lists of strings starting at the root |
| `value` | A number, never negative, never zero |
| `value_exact` | The exact value as a Decimal string |
| `sign` | `1` or `-1` |
| `level` | The target's depth |

- The table is a tree, and each level sums exactly to its parent.
- The units are `render.value_label` and the optional `render.unit`.

**Open:** how a sink is marked is the architect's fork: (a) a served `render.sink_label`, or (b) a `sink` edge field. Cortex replied that it can build to either, and won't match a literal label. The reply also asks, as optional, for the root's value as data, so the closure check covers the root. That reply is `2026-11-04-packet-to-fin-cc-architect-lane-01-from-cortex-seven-answers-read-either-a-or-b-works-for-the-sink.md`, placed and uncommitted.

**Gate:** still not met. #255 isn't merged, and `ev_fixture` isn't materialized. No code.

## Ruled, 2026-11-04 evening (the architect, via Chris)

- **Sink:** marked by `node_kind: other` on the edge, with `render.other_label` for display. Never the literal.
- **Root:** fin adds the root's value and sign as data, as a root edge whose `source` is null.
- **Bypass band:** a drawing choice, not a field in the table.
- **Sign:** {positive, negative, zero}. A zero edge draws no band and is listed on its parent's hover.
- **The build still starts when #255's table is served.**

**fin's #255 at `0eb7b534` (on `fin/variance-decomposition`, not merged)** already has `node_kind` (`other`/`item`) and `render.other_label`. Three ruled items aren't there yet:

1. A root edge.
2. Zero edges. The module drops a zero child.
3. A three-valued sign. Today it's the integers `1`/`-1`.

Cortex asked fin how sign will be spelled (`0` beside `1`/`-1`, or strings), because the reader's closed list depends on it. That's in `invincible-agent/sessions/2026-11-04-packet-to-fin-cc-architect-lane-01-from-cortex-the-ruling-is-read-three-of-its-items-are-not-at-0eb7b534.md`, placed and uncommitted.

**Cortex takes no position on** fin's EAC questions (`per_path: once`, `{minus: [eac, bac]}`). They change no field the card reads. The sign maps to the two theme tokens, and the card draws no good or bad from it.

**Gate:** still not met. No code.
