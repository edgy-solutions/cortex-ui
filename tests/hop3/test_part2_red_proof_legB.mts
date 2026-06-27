#!/usr/bin/env tsx
/**
 * Hop 3 Part 2 — Leg B RED-PROOF script
 *
 * Demonstrates that Leg B's absence-of-SSE provenance assertion in
 * test_electric_propagation_and_sse_absence.mts CAN FAIL when SSE
 * handlers DO drive Electric-covered fields. This is the
 * red-first proof per [[pre-written-fixtures-must-fail-first]] —
 * the assertion is not decorative.
 *
 * What this script does: simulate the pre-Hop-3 useInterviewAgent
 * behavior by calling updateArtifact(id, {routing: ...},
 * "sse:route_decision") AFTER a clean create-pending, then run the
 * SAME assertion the main probe runs. Expect RED.
 *
 * This is the architect's "verify subtle acceptance by inspection"
 * applied to the test itself: if the for-loop CAN'T fire, the
 * GREEN in the main probe is decorative.
 */
import "./_setup.mts";
import { useCanvasStore, ELECTRIC_COVERED_FIELDS } from "../../src/store/useCanvasStore.ts";

const id = `urn:li:answerArtifact:hop3-legB-redproof-${Date.now()}`;

// Clean create-pending — same shape as the main probe.
useCanvasStore.getState().createPendingArtifact({
  id,
  message_id: "msg-redproof",
  question_text: "leg B red-proof",
  produced_for: {
    user_id: "redproof",
    is_authenticated: false,
    user_persona: null,
    entitled_domains: null,
  },
});

// Simulate the PRE-Hop-3 SSE handler firing on route_decision —
// this is the call that the Hop 3 refactor removed.
useCanvasStore.getState().updateArtifact(
  id,
  {
    routing: {
      about: { uri: "test:simulated", label: "sim" },
      action: { iri: "test:verb", label: "verb" },
      handled_by: { engine_name: "test", endpoint_url: "test" },
    } as any,
    produced_by: {
      actor_type: "agent",
      actor_id: "engine-simulated",
    },
  },
  "sse:route_decision"
);

// Same for-loop as the main probe's Leg B.
const provenance = useCanvasStore.getState()._lastUpdateSource[id] ?? {};
const sseTagged: string[] = [];
for (const field of ELECTRIC_COVERED_FIELDS) {
  const tag = provenance[field];
  if (tag && tag.startsWith("sse:")) {
    sseTagged.push(`${field}=${tag}`);
  }
}

if (sseTagged.length > 0) {
  console.log(
    "[RED-AS-EXPECTED] Leg B assertion correctly catches sse:* on " +
      `Electric-covered fields: ${sseTagged.join(", ")}`
  );
  console.log(
    "This proves the main probe's Leg B GREEN is a real GREEN, not a " +
      "decorative one — the for-loop fires when SSE drives the artifact."
  );
  process.exit(0);
}

console.error(
  "[BAD-TEST] Leg B's for-loop did NOT fire when SSE drove route_decision. " +
    "The main probe's Leg B GREEN is decorative — fix before trusting."
);
process.exit(1);
