/**
 * Route table for the PCN walk's OFFLINE proof. Reuses fridayRoutes.ts (hosts, the fake OIDC seed,
 * KNOWN_UNSERVED, the PCN26-117 wire capture and the hop fixtures) and adds what the Friday walk
 * does not need: two users sharing one backend state, a duplicate-drop variant, the ask over SSE
 * and the answer over the Electric shape.
 *
 * The ingest/status/task bodies are the SAME captured/built bodies friday uses, re-keyed to PCN26-184
 * (the ingest id is swapped; nothing else is written free-hand). The answer body is hand-written -
 * no capture of an INSTANCES_BY_PROPERTY answer artifact exists in this repo.
 */
import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import {
  API_HOST,
  AUTH_HOST,
  KNOWN_UNSERVED,
  loadSeed,
  seedFakeOidcSession,
} from "../fridayRoutes";
import { buildPcn26117Fixture } from "@/lib/ingestPcn26117Fixture";
import { FAILURE_RECORD_SET_DERIVED } from "@/archetypes/contribution-ranking/fixtures/fracasFailureRecordSet.derived";
import { CONTRIBUTION_RANKING_FIXTURES } from "@/archetypes/contribution-ranking/fixtures";
import { FAILURE_TREND_DERIVED } from "@/archetypes/multi-series/fixtures/fracasFailureTrend.derived";

export const WALK_SHA = "d4f1b7a0c93e5a6b8c21e07f4a35d96b1c8e2f40a7b3d5961e8c0f2a4b6d8e10";
export const WALK_INGEST_ID = `sha256:${WALK_SHA}`;
export const DUP_UUID = "6f1c2a9e-3b7d-4e58-9a10-2c4d6e8f0a12";
export const ALICE = "alice@example.com";
export const BOB = "bob@example.com";

export type DropMode = "new" | "duplicate";
export type AnswerMode =
  | "parts-table"
  | "knowledge-document"
  // HAZ / FRACAS walks (e2e/walk/answerWalk.ts). One mode per arm of the walk's outcome space.
  | "haz-card"
  | "haz-refusal"
  | "fracas-card"
  | "fracas-trend-card"
  | "fracas-refusal"
  | "ranking-not-fracas"
  | "abstain-haz"
  | "abstain-fracas"
  | "not-grounded";

export type Cell = [persona: string, domain: string];

/** What /me/entitlements serves per user. bob mirrors the sandbox: DATA_STEWARD by default, SAFETY_ENGINEER offered. */
export const BOB_CELLS: Cell[] = [
  ["SAFETY_ENGINEER", "SUSTAINMENT"],
  ["SAFETY_ENGINEER", "MESH"],
  ["SAFETY_ENGINEER", "DOCS"],
  ["DATA_STEWARD", "AVIATION"],
  ["DATA_STEWARD", "MESH"],
  ["DATA_STEWARD", "DOCS"],
];
/** alice only drops: one persona is enough for the picker to render; she picks nothing. */
export const ALICE_CELLS: Cell[] = [
  ["DATA_STEWARD", "AVIATION"],
  ["DATA_STEWARD", "MESH"],
  ["DATA_STEWARD", "DOCS"],
];

export interface WalkMock {
  /** The cells /me/entitlements serves, per user (the first cell is the default). */
  cells: { alice: Cell[]; bob: Cell[] };
  drop: DropMode;
  answer: AnswerMode;
  notice: string;
  parts: string[];
  /** Whose shape stream receives the answer row (the asker). Default alice, as the PCN walk. */
  answerTo: "alice" | "bob";
  /** The question text the answer row carries, when it is not the PCN question. */
  question?: string;
  /** GET status calls so far (drives received -> extracting -> review). */
  statusCalls: number;
  promoted: boolean;
  asked: boolean;
  actBodies: unknown[];
  askBodies: unknown[];
  unrouted: string[];
}

export function newWalkMock(o: {
  drop: DropMode;
  answer: AnswerMode;
  notice?: string;
  parts?: string[];
  answerTo?: "alice" | "bob";
  question?: string;
  bobCells?: Cell[];
}): WalkMock {
  return {
    cells: { alice: ALICE_CELLS, bob: o.bobCells ?? BOB_CELLS },
    drop: o.drop,
    answer: o.answer,
    notice: o.notice ?? "PCN26-184",
    parts: o.parts ?? ["5530-184", "5530-185"],
    answerTo: o.answerTo ?? "alice",
    question: o.question,
    statusCalls: 0,
    promoted: false,
    asked: false,
    actBodies: [],
    askBodies: [],
    unrouted: [],
  };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-expose-headers": "*",
};

function json(route: Route, status: number, body: unknown, extra: Record<string, string> = {}) {
  return route.fulfill({ status, headers: { ...CORS, ...extra }, contentType: "application/json", body: JSON.stringify(body) });
}

/** The refusal envelope exactly as the presenter emits it (src/lib/refusalEnvelope.ts): the payload key EMPTY, plus `refusal`. */
const refusedRanking = (reason: string) => ({
  archetype: "CONTRIBUTION_RANKING",
  rows: [],
  scope_label: "5530-184",
  // The outcome token is a stand-in: the walk asserts only that it is non-empty.
  refusal: { refused: true, outcome: "source_unavailable", reason, connector: "fracas", fn: "failure_record_set" },
});

/**
 * A `routing` block exactly as the platform wrote it: read from a committed capture
 * (routed: burn-rate, fallback=false; not grounded: performance-indices, fallback=true with
 * fallback_reason no_verb_classified - the reason rev 185 gave the FRACAS question).
 */
function capturedRouting(file: string): Record<string, unknown> {
  const cap = JSON.parse(readFileSync(new URL(`../../sessions/${file}`, import.meta.url), "utf8")) as { routing: Record<string, unknown> };
  // The captures omit `about` (a subset of RouteDecision); RoutingDecision (HUD) reads `about.label`
  // unconditionally and the page crashes without it, so the type's required block is added.
  return { about: { label: "Subject", uri: "mesh:Subject", confidence: 0.9 }, ...cap.routing };
}

/** The components + routing an answer mode carries. Shapes: fixtures the app already ships, never invented fields. */
function answerBody(m: WalkMock): { component: Record<string, unknown>; routing: Record<string, unknown> | null } {
  const routed = capturedRouting("2026-09-19-payload-finance-burn-rate.json");
  switch (m.answer) {
    case "haz-card":
      return { component: { archetype: "KNOWLEDGE_DOCUMENT", markdown_content: "## Risk assessment HAZ-1003\n\nSeverity and likelihood recorded." }, routing: routed };
    case "haz-refusal":
      return {
        component: {
          archetype: "KNOWLEDGE_DOCUMENT",
          markdown_content: "",
          refusal: { refused: true, outcome: "unknown_hazard", reason: "HAZ-1003 is not held", hazard_id: "HAZ-1003" },
        },
        routing: routed,
      };
    case "fracas-card":
      return { component: { archetype: "CONTRIBUTION_RANKING", ...FAILURE_RECORD_SET_DERIVED }, routing: routed };
    case "ranking-not-fracas": {
      // A cost ranking (the card's own "complete" fixture): same archetype, same "Ranking" heading,
      // not failures. Must fail the FRACAS step.
      const { rows, value_unit } = CONTRIBUTION_RANKING_FIXTURES[0]!;
      return { component: { archetype: "CONTRIBUTION_RANKING", rows, value_unit }, routing: routed };
    }
    case "fracas-trend-card":
      return { component: { archetype: "MULTI_SERIES", ...FAILURE_TREND_DERIVED }, routing: routed };
    case "fracas-refusal":
      return { component: refusedRanking("unknown part '5530-184'"), routing: routed };
    case "abstain-haz":
      // ELICITATION fixture shape (elicitation.ts "abstained"), with the platform's live words.
      return { component: { archetype: "ELICITATION", disposition: "abstain", status: "slot_abstain", message: "I could not find anything called 'HAZ-1003'." }, routing: routed };
    case "abstain-fracas":
      return { component: { archetype: "ELICITATION", disposition: "abstain", status: "slot_abstain", message: "I could not find anything called '5530-184'." }, routing: routed };
    case "not-grounded":
      // rev 185: routing.fallback with no_verb_classified; the body is the generalist's document.
      return {
        component: { archetype: "KNOWLEDGE_DOCUMENT", markdown_content: "A generalist reply." },
        routing: capturedRouting("2026-09-19-payload-finance-performance-indices.json"),
      };
    default:
      return { component: answerComponent(m), routing: null };
  }
}

function answerComponent(m: WalkMock): Record<string, unknown> {
  return m.answer === "parts-table"
    ? {
        archetype: "INSTANCES_BY_PROPERTY",
        title: `Parts affected by ${m.notice}`,
        target: { class: "Part", filter_property: "affectedBy", filter_value: m.notice },
        columns: [{ key: "part", label: "Part" }],
        row_identity: { key: "part" },
        rows: m.parts.map((p) => ({ part: p })),
        provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: 0 },
      }
    : {
        // The roll-23 symptom: the same question drawn as a plain knowledge document.
        archetype: "KNOWLEDGE_DOCUMENT",
        markdown_content: `${m.notice} is a product change notice. It affects several parts.`,
        provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: 0 },
      };
}

function answerRow(m: WalkMock) {
  const now = Date.now();
  const { component, routing } = answerBody(m);
  return {
    // The ask names the artifact id (InterviewRequest.artifact_id) and the server persists under it, so
    // Electric merges into the pending row and it stays the CURRENT answer. Master (1264081) mounts a
    // body only for the current/focused answer, so a row under any other id draws as a summary tile.
    id: (m.askBodies[0] as { artifact_id?: string } | undefined)?.artifact_id ?? "walk-answer-1",
    created_at: now,
    updated_at: now,
    valid_as_of: now,
    question_text: m.question ?? `which parts does ${m.notice} affect`,
    summary: "",
    message_id: "walk-msg-1",
    status: "complete",
    durability_status: "durable",
    watermark: 1,
    rendered_output: { components: [component] },
    produced_by: { actor_type: "agent", actor_id: "walk" },
    produced_for: { user_id: m.answerTo === "bob" ? BOB : ALICE, is_authenticated: true, entitlement_source: "none" },
    sources: [],
    graph_trace: [],
    routing,
  };
}

/** Install the table on one user's page. `who` decides only /me/human_tasks (bob has the task). */
export async function installWalkRoutes(page: Page, m: WalkMock, who: "alice" | "bob"): Promise<void> {
  const seed = { ...loadSeed(), ingestId: WALK_INGEST_ID, sha256: WALK_SHA, droppedBy: { authz_id: ALICE } };
  const fixture = buildPcn26117Fixture(seed);
  const hop = (id: string) => fixture.hops.find((h) => h.id === id)!.response.body as Record<string, unknown>;
  const row = (stage: string, extra: Record<string, unknown> = {}) => ({
    ingest_id: WALK_INGEST_ID,
    sha256: WALK_SHA,
    kind: "pdf",
    stage,
    detail: null,
    duplicate: null,
    created_at: seed.createdAt,
    updated_at: seed.createdAt + 1,
    dropped_by: { authz_id: ALICE },
    origin_suggestion: null,
    ...extra,
  });
  const promotedRow = hop("5-status-promoted");
  const humanTaskRow = hop("3-human-task-row");
  const taskKinds = readFileSync(
    new URL("../../sessions/2026-10-02-payload-task-kinds-rev-165-bob.json", import.meta.url),
    "utf8",
  );
  const dupMessage = "already processed on 2026-10-08";
  const dupRow = row("promoted", {
    ingest_id: DUP_UUID,
    detail: "record dr-38115dc9f449155b",
    duplicate: { of_ingest_id: WALK_INGEST_ID, message: dupMessage },
  });
  // Delivery of the answer row is per page: only alice asked, so only her shape stream gets it.
  let delivered = false;
  const actPath = `/human_tasks/${fixture.taskId}/act`;

  await seedFakeOidcSession(page, who === "alice" ? ALICE : BOB);

  await page.route(
    (u) => !["localhost", API_HOST, AUTH_HOST].includes(u.hostname),
    (route) => route.abort(),
  );
  await page.route(
    (u) => u.hostname === API_HOST || u.hostname === AUTH_HOST,
    (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const u = new URL(req.url());
      m.unrouted.push(`${req.method()} ${u.host}${u.pathname}${u.search}`);
      return json(route, 599, { error: "unrouted" });
    },
  );
  await page.route(
    (u) => u.hostname === API_HOST,
    async (route) => {
      const req = route.request();
      const method = req.method();
      if (method === "OPTIONS") return route.fallback();
      const u = new URL(req.url());
      const p = decodeURIComponent(u.pathname);

      // A fresh walk's person has no drops on record: the "no drops" body, verbatim from
      // sessions/2026-10-16-packet-to-cortex-ingest-mine-is-live-in-191-and-the-status-body-carries-content-kind.md.
      if (method === "GET" && p === "/ingest/mine") return json(route, 200, { items: [], next: null });
      if (method === "POST" && p === "/ingest") {
        if (m.drop === "duplicate") {
          return json(route, 200, {
            ingest_id: DUP_UUID,
            stage: "promoted",
            detail: null,
            duplicate: { of_ingest_id: WALK_INGEST_ID, message: dupMessage },
            workflow: null,
            origin_suggestion: null,
          });
        }
        return json(route, 200, { ...hop("5-status-promoted"), ...row("received"), object_prefix: "ingress-user/pdf/x/" });
      }
      if (method === "GET" && p === `/ingest/${DUP_UUID}/status`) return json(route, 200, dupRow);
      if (method === "GET" && p === `/ingest/${WALK_INGEST_ID}/status`) {
        m.statusCalls += 1;
        if (m.promoted) return json(route, 200, { ...promotedRow, ingest_id: WALK_INGEST_ID, sha256: WALK_SHA });
        const stage = m.statusCalls === 1 ? "received" : m.statusCalls === 2 ? "extracting" : "review";
        return json(route, 200, row(stage));
      }
      if (method === "GET" && p === "/me/entitlements") {
        const cells = m.cells[who];
        // bob's default is DATA_STEWARD/AVIATION, not his first cell: the walk must PICK, not inherit.
        const def = who === "bob" ? cells.find(([pr, d]) => pr === "DATA_STEWARD" && d === "AVIATION") ?? cells[0] : cells[0];
        return json(route, 200, {
          user_id: who === "bob" ? "sub-bob" : "sub-alice",
          email: who === "bob" ? BOB : ALICE,
          cells: cells.map(([persona, domain]) => ({ persona, domain })),
          default: def ? { persona: def[0], domain: def[1] } : null,
          source: "topaz",
        });
      }
      if (method === "GET" && p === "/me/human_tasks") {
        return json(route, 200, who === "bob" ? { ...humanTaskRow, email: BOB } : { email: ALICE, tasks: [] });
      }
      if (method === "PUT" && p === "/me/canvases") return json(route, 200, {});
      if (method === "GET" && p === "/task_kinds") {
        return route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify((JSON.parse(taskKinds) as { body: unknown }).body) });
      }
      if (method === "POST" && p === actPath) {
        m.actBodies.push(req.postDataJSON());
        m.promoted = true;
        return json(route, 200, (fixture.hops.find((h) => h.id === "4b-act-200-promoted-hypothetical")!).response.body);
      }
      if (method === "POST" && p === "/interview/stream") {
        m.askBodies.push(req.postDataJSON());
        m.asked = true;
        return route.fulfill({
          status: 200,
          headers: { ...CORS, "content-type": "text/event-stream" },
          body: "event: stream_end\ndata: {}\n\n",
        });
      }
      if (method === "GET" && p === "/electric/shape" && u.searchParams.get("table") === "answer_artifact_projection") {
        // Electric long-poll protocol: every response carries handle/offset/schema headers; the live
        // request is held briefly so the client does not spin. The answer row rides the first
        // response after the ask.
        const live = u.searchParams.get("live") === "true";
        if (live) await new Promise((r) => setTimeout(r, 400));
        const deliver = who === m.answerTo && m.asked && !delivered;
        if (deliver) delivered = true;
        const offset = `${delivered ? 2 : 1}_0`;
        const messages: unknown[] = deliver
          ? [{ key: "walk-answer-1", value: answerRow(m), headers: { operation: "insert" } }]
          : [];
        messages.push({ headers: { control: "up-to-date" } });
        return json(route, 200, messages, {
          "electric-handle": "walk-handle",
          "electric-offset": offset,
          "electric-schema": "{}",
          "electric-up-to-date": "",
          "electric-cursor": "1",
        });
      }

      const unserved = KNOWN_UNSERVED.find((k) => k.method === method && k.match(u));
      if (unserved) return json(route, 503, { error: "not_captured" });
      return route.fallback();
    },
  );
}
