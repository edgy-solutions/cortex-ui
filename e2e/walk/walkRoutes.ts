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

export const WALK_SHA = "d4f1b7a0c93e5a6b8c21e07f4a35d96b1c8e2f40a7b3d5961e8c0f2a4b6d8e10";
export const WALK_INGEST_ID = `sha256:${WALK_SHA}`;
export const DUP_UUID = "6f1c2a9e-3b7d-4e58-9a10-2c4d6e8f0a12";
export const ALICE = "alice@example.com";
export const BOB = "bob@example.com";

export type DropMode = "new" | "duplicate";
export type AnswerMode = "parts-table" | "knowledge-document";

export interface WalkMock {
  drop: DropMode;
  answer: AnswerMode;
  notice: string;
  parts: string[];
  /** GET status calls so far (drives received -> extracting -> review). */
  statusCalls: number;
  promoted: boolean;
  asked: boolean;
  actBodies: unknown[];
  askBodies: unknown[];
  unrouted: string[];
}

export function newWalkMock(o: { drop: DropMode; answer: AnswerMode; notice?: string; parts?: string[] }): WalkMock {
  return {
    drop: o.drop,
    answer: o.answer,
    notice: o.notice ?? "PCN26-184",
    parts: o.parts ?? ["5530-184", "5530-185"],
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

function answerRow(m: WalkMock) {
  const now = Date.now();
  const component =
    m.answer === "parts-table"
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
  return {
    id: "walk-answer-1",
    created_at: now,
    updated_at: now,
    valid_as_of: now,
    question_text: `which parts does ${m.notice} affect`,
    summary: "",
    message_id: "walk-msg-1",
    status: "complete",
    durability_status: "durable",
    watermark: 1,
    rendered_output: { components: [component] },
    produced_by: { actor_type: "agent", actor_id: "walk" },
    produced_for: { user_id: ALICE, is_authenticated: true, entitlement_source: "none" },
    sources: [],
    graph_trace: [],
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
        const deliver = who === "alice" && m.asked && !delivered;
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
