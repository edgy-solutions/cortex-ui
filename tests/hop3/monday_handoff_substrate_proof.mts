#!/usr/bin/env tsx
/**
 * Hop 3 Monday-handoff substrate proof
 *
 * Per the architect's framing: the visual confirmation at the end of
 * Hop 3 is the Monday-handoff contract proof. This script provides
 * the substrate half of that proof — it inserts a real-shape
 * AnswerArtifact projection row into local Postgres, subscribes via
 * Electric in Node (same path the browser takes), and asserts the
 * artifact arrived at the store with the real URN intact and
 * sources populated.
 *
 * The visual half — a human eyeballing the running cortex-ui canvas
 * to see the RoutingDecision card carry the URN and the SourcesTrail
 * card carry the citation — requires either a browser-driving agent
 * or a human in front of the dev server. The dev server is started
 * alongside this script (port 5189); the user can open
 * http://localhost:5189 to complete the visual confirmation while
 * this script holds the row in the projection (it does not delete
 * on exit).
 *
 * Why this counts as the substrate proof:
 *   - The data shape that reaches the store is byte-identical to
 *     what RoutingDecision.tsx and SourcesTrail.tsx read
 *     (decision.about.uri, source.uri).
 *   - Part 2's main probe already asserted the propagation path is
 *     Electric (provenance map shows electric:*, no sse:*).
 *   - The URN inserted here is a real ontology shape
 *     (`https://example.com/ontology/...`), not a synthetic
 *     `urn:li:answerArtifact:test-*` placeholder.
 *
 * What it does NOT prove (premise-shift, surfaced honestly):
 *   - The URN was produced by the supervisor's
 *     subtask_routing_decision Dagster asset on a real backend
 *     query. That requires the full engine pipeline (mesh-registrar,
 *     engines, LiteLLM proxy) running locally, which sandbox state
 *     supplies but doesn't allow Electric to run against
 *     (wal_level=replica). The plan §10 ad-hoc carry-forwards
 *     allow Hop 3 to close with the substrate green; the engine-
 *     side end-to-end is a follow-up coordinated with the sandbox
 *     Postgres wal_level flip OR a local engine fleet stand-up.
 */
import "./_setup.mts";

import { execSync } from "child_process";
import { useCanvasStore, ELECTRIC_COVERED_FIELDS } from "../../src/store/useCanvasStore.ts";
import { startArtifactsSubscription } from "../../src/lib/electric.ts";

function psql(sql: string): string {
  return execSync(
    `docker exec -i hop3-postgres psql -U iagent -d iagent -t -A -c ${JSON.stringify(sql)}`,
    { encoding: "utf8" }
  ).trim();
}

const REAL_URN = "https://example.com/ontology/CustomerSegment#NorthAmericanEnterprise";
const REAL_VERB = "mesh:retrieveKnowledge";
const ARTIFACT_ID = "urn:li:answerArtifact:monday-handoff-001";
const SOURCE_URN = "urn:li:dataset:(urn:li:dataPlatform:datahub,Customer360.NA_Enterprise,PROD)";

const ts = Date.now();
const watermark = Math.floor(ts / 1000);

const routing = JSON.stringify({
  about: {
    uri: REAL_URN,
    label: "North American Enterprise Segment",
  },
  action: {
    iri: REAL_VERB,
    label: "Retrieve Knowledge",
  },
  handled_by: {
    engine_name: "engine-d",
    endpoint_url: "http://iagent-engine-d:8000",
  },
});
const sources = JSON.stringify([
  {
    uri: SOURCE_URN,
    type: "dataset",
    label: "Customer 360 — NA Enterprise table",
  },
]);

// Clean any prior row with the same id (idempotent re-run).
psql(`DELETE FROM answer_artifact_projection WHERE id = '${ARTIFACT_ID}'`);

const esc = (s: string) => s.replace(/'/g, "''");
psql(
  `INSERT INTO answer_artifact_projection ` +
    `(id, kind, watermark, created_at, updated_at, valid_as_of, status, ` +
    `durability_status, message_id, question_text, resolved_intent, ` +
    `routing, sources, graph_trace, produced_by, produced_for) ` +
    `VALUES (` +
    `'${ARTIFACT_ID}', 'answer', ${watermark}, ${ts}, ${ts}, ${ts}, 'complete', ` +
    `'durable', 'msg-monday-handoff', 'What is the North American Enterprise segment owner_persona?', ` +
    `'{}'::jsonb, ` +
    `'${esc(routing)}'::jsonb, ` +
    `'${esc(sources)}'::jsonb, ` +
    `'[]'::jsonb, ` +
    `'${esc(JSON.stringify({ actor_type: "agent", actor_id: "engine-d" }))}'::jsonb, ` +
    `'${esc(JSON.stringify({ user_id: "monday-handoff", is_authenticated: false }))}'::jsonb)`
);

console.log(`[1/3] Inserted projection row: id=${ARTIFACT_ID}`);
console.log(`      routing.about.uri = ${REAL_URN}`);
console.log(`      sources[0].uri = ${SOURCE_URN}`);
console.log(`      watermark = ${watermark}`);

useCanvasStore.getState().clearCanvas();
const stop = startArtifactsSubscription();

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRow(id: string, deadlineMs: number): Promise<boolean> {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (useCanvasStore.getState().artifacts.find((a) => a.id === id)) return true;
    await sleep(50);
  }
  return false;
}

async function main() {
  const arrived = await waitForRow(ARTIFACT_ID, 8000);
  if (!arrived) {
    console.error("[RED] artifact did not arrive over Electric — substrate broken");
    stop();
    process.exit(1);
  }
  const artifact = useCanvasStore
    .getState()
    .artifacts.find((a) => a.id === ARTIFACT_ID)!;
  const provenance = useCanvasStore.getState()._lastUpdateSource[ARTIFACT_ID] ?? {};

  console.log(`[2/3] Artifact arrived over Electric`);
  console.log(`      store.routing.about.uri = ${artifact.routing?.about?.uri}`);
  console.log(`      store.sources[0].uri   = ${artifact.sources[0]?.uri}`);
  console.log(`      store.watermark        = ${artifact.watermark}`);
  console.log(`      store.status           = ${artifact.status}`);
  console.log(`      store.durability_status = ${artifact.durability_status}`);

  // Verify each Electric-covered field tagged electric:*
  const wrong: string[] = [];
  for (const field of ELECTRIC_COVERED_FIELDS) {
    if (provenance[field] !== "electric:answer_artifact_projection") {
      wrong.push(`${field}=${provenance[field] ?? "<missing>"}`);
    }
  }
  if (wrong.length > 0) {
    console.error(`[RED] provenance wrong: ${wrong.join(", ")}`);
    stop();
    process.exit(1);
  }
  if (artifact.routing?.about?.uri !== REAL_URN) {
    console.error(`[RED] URN mismatch: got ${artifact.routing?.about?.uri}`);
    stop();
    process.exit(1);
  }
  if (artifact.sources[0]?.uri !== SOURCE_URN) {
    console.error(`[RED] source URN mismatch: got ${artifact.sources[0]?.uri}`);
    stop();
    process.exit(1);
  }

  console.log(`[3/3] [GREEN] Monday-handoff SUBSTRATE proof:`);
  console.log(
    `      A real ontology URN (${REAL_URN}) and a real DataHub source URN`
  );
  console.log(
    `      (${SOURCE_URN}) reached the cortex-ui store via Electric, no`
  );
  console.log(`      mock in the path, no sse:* provenance on any of the ${ELECTRIC_COVERED_FIELDS.length}`);
  console.log(`      Electric-covered fields. The data shape is byte-identical`);
  console.log(`      to what RoutingDecision.tsx + SourcesTrail.tsx read.`);
  console.log(``);
  console.log(`      The visual eyeball half (running cortex-ui in a browser`);
  console.log(`      and seeing the RoutingDecision + SourcesTrail cards`);
  console.log(`      populated) requires either a browser-driving harness`);
  console.log(`      or a human at http://localhost:5189 — start \`npx vite\``);
  console.log(`      in cortex-ui/ to bring up the dev server.`);
  console.log(``);
  console.log(
    `      The row remains in the projection (id=${ARTIFACT_ID}) so the`
  );
  console.log(
    `      dev server can render it on subsequent inspection. Delete with:`
  );
  console.log(
    `        docker exec -i hop3-postgres psql -U iagent -d iagent -c \\`
  );
  console.log(
    `          "DELETE FROM answer_artifact_projection WHERE id = '${ARTIFACT_ID}'"`
  );
  stop();
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  stop();
  process.exit(1);
});

setTimeout(() => {
  console.error("[RED] proof timed out at 30s");
  process.exit(1);
}, 30000).unref?.();
