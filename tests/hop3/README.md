# Hop 3 probes — projector build plan

This directory holds the three probes the architect's STOP point names
for the projector build plan
(`invincible-agent/docs/plans/projector-build-plan.md` §4 Hop 3) plus
the Monday-handoff substrate-proof script.

## Files

- `docker-compose.yml` — local Postgres (wal_level=logical) + Electric
  on ports 5433 + 3000. Used by Part 2 and the Monday-handoff proof.
- `_setup.mts` — TS test setup polyfills `window.__RUNTIME_CONFIG__`
  before cortex-ui sources import-resolve.
- `test_artifact_type_byte_identical.mjs` — Part 1: asserts
  `src/api/types.ts:interface Artifact` is byte-identical to the
  post-Hop-1 baseline (commit `496fd8c`). Halts the hop on drift.
- `test_electric_propagation_and_sse_absence.mts` — Part 2: Shape A
  (provenance instrumentation) + Shape C (presence-via-Electric) combined.
  Leg A asserts an inserted row arrives at the store over Electric;
  Leg B asserts no Electric-covered field carries an `sse:*`
  provenance tag.
- `test_part2_red_proof_legB.mts` — Standalone RED-proof for Part 2
  Leg B's for-loop: deliberately injects an `sse:route_decision` tag
  and confirms the assertion catches it. Establishes the GREEN in
  the main probe is not decorative.
- `monday_handoff_substrate_proof.mts` — End-to-end substrate proof.
  Inserts a real ontology URN row, asserts it reaches the store with
  all 9 Electric-covered fields tagged `electric:*`. Leaves the row
  in the projection so a running cortex-ui dev server can render it
  for the visual half.

## Running

1. Start the local stack:

   ```bash
   cd cortex-ui/tests/hop3
   docker compose up -d
   ```

2. Apply the projection schema (from invincible-agent):

   ```bash
   docker exec -i hop3-postgres psql -U iagent -d iagent \
     < ../../../invincible-agent/sql/create_answer_artifact_projection.sql
   ```

3. Run the probes from the repo root:

   ```bash
   # Part 1 — byte-identical-diff (no docker dependency)
   node tests/hop3/test_artifact_type_byte_identical.mjs

   # Part 2 main probe
   npx tsx tests/hop3/test_electric_propagation_and_sse_absence.mts

   # Part 2 Leg B RED-proof (the for-loop fires)
   npx tsx tests/hop3/test_part2_red_proof_legB.mts

   # Monday-handoff substrate proof
   npx tsx tests/hop3/monday_handoff_substrate_proof.mts
   ```

4. Visual half: in another terminal,

   ```bash
   cd cortex-ui
   npx vite
   ```

   Open http://localhost:5173 (or whatever Vite reports). After
   running `monday_handoff_substrate_proof.mts`, the artifact with
   id `urn:li:answerArtifact:monday-handoff-001` carries the real
   ontology URN; the canvas should render the RoutingDecision card
   showing the URN and the SourcesTrail card showing the DataHub
   source URI.

## RED-first sequence (per `[[pre-written-fixtures-must-fail-first]]`)

- **Part 1 RED**: add a junk field to the `Artifact` interface, run
  the probe, observe RED with "First divergence at line N", revert,
  observe GREEN.
- **Part 2 Leg A RED**: set `VITE_ELECTRIC_URL=http://localhost:9999`,
  run the probe, observe RED with "artifact did not arrive in the
  store within 5s".
- **Part 2 Leg B RED**: run `test_part2_red_proof_legB.mts`, observe
  `[RED-AS-EXPECTED]` confirming the for-loop catches sse:* tags on
  Electric-covered fields.

## Cleanup

```bash
docker compose -f tests/hop3/docker-compose.yml down -v
```
