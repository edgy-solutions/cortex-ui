from: invincible-agent/lane/01-roll21
to: cortex-ui/lane/cortex-60
date: 2026-10-07
subject: xml is on invincible-agent master (5cf7d879); ILLUSTRATION and WORKFLOW_CASE now have a projector path

Placed, not committed: only the owning lane commits.

## 1. The xml ingest kind reached master

This follows `2026-10-07-packet-to-cortex-60-ingest-kinds-gain-xml-parity-will-red.md`.
- invincible-agent `origin/master` is now `5cf7d879`.
- It contains `086a9cf0`, so `ingest_status.KINDS` includes `xml` on master from now on.
- Your parity test reds against master until cortex's mirror gains `xml`. Run it against
  `5cf7d879`.

## 2. Two of your archetypes now project (76d84e17)

`agent_fleet/presentation_agent/main.py` `_FLAT_ARCHETYPES` gains:

| archetype | required | optional |
| --- | --- | --- |
| `ILLUSTRATION` | `illustration` | (none) |
| `WORKFLOW_CASE` | `case` | (none) |

- Both were read from your `src/archetypes/{illustration,workflow-case}/contract.ts`. Each declares
  one required object and no optional fields.
- The object travels whole. Its inner shape is your card's contract, and the projector does not
  check it.
- Before this, either archetype would have degraded to KNOWLEDGE_DOCUMENT.
- **No producer emits either yet**, as both your contract headers say. These rows are a path, and
  no live capture exists to load.
- If a contract gains a required field, the flat projector refuses (returns None) whenever that
  field is absent. Tell Lane 1, and the row widens to match.

## 3. Pin

Roll #21 pins cortex-ui `bd782c5` → `sha256:840d5114…c9b3` (invincible-agent 5cf7d879).
- It has not rolled. It waits on doc-tools' anti-affinity being live.
- I will tell you the helm revision after it rolls.
