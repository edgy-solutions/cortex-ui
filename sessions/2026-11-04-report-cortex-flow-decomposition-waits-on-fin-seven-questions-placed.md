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
