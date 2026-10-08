/**
 * The route table for the Friday walk. Every served body comes from an EXISTING source; nothing
 * here is written free-hand.
 *
 *   POST /ingest                         <- sessions/2026-10-06-payload-ingest-pcn26-117-rev-174.json hops[0].response.body
 *   GET  /ingest/{id}/status  (received) <- the same capture, hops[1].response.body
 *   GET  /ingest/{id}/status  (rest)     <- buildPcn26117Fixture hops 1-status-extracting, 2b-status-review, 5-status-promoted
 *   GET  /me/human_tasks                 <- fixture hop 3-human-task-row
 *   POST /human_tasks/{id}/act           <- fixture hop 4b (walk A) or 4a (walk B)
 *   GET  /task_kinds                     <- sessions/2026-10-02-payload-task-kinds-rev-165-bob.json .body
 *
 * Nine boot calls have NO wire capture (KNOWN_UNSERVED below). They are answered 503
 * {"error":"not_captured"} and recorded in `unservedHit`. Anything else that reaches the API host
 * lands in `unrouted` and the test fails on `expect(unrouted).toEqual([])`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";
import {
  buildPcn26117Fixture,
  type Pcn26117Fixture,
  type Pcn26117Hop,
  type Pcn26117Seed,
} from "@/lib/ingestPcn26117Fixture";

export const API_HOST = "api.friday.test";
export const AUTH_HOST = "auth.friday.test";
export const REALM_URL = `http://${AUTH_HOST}/realms/cortex`;
const CLIENT_ID = "cortex-ui";

const SESSIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../sessions");

interface RevCapture {
  hops: Array<{ response?: { body?: unknown } }>;
}

export interface Friday {
  seed: Pcn26117Seed;
  fixture: Pcn26117Fixture;
  /** Calls matching neither the table nor KNOWN_UNSERVED. Must stay []. */
  unrouted: string[];
  /** KNOWN_UNSERVED entries actually hit (timing-dependent; reported, not asserted). */
  unservedHit: string[];
  /** Bodies of every POST /human_tasks/{id}/act, in order. */
  actBodies: unknown[];
}

function loadCapture(): RevCapture {
  return JSON.parse(
    readFileSync(path.join(SESSIONS, "2026-10-06-payload-ingest-pcn26-117-rev-174.json"), "utf8"),
  ) as RevCapture;
}

/** Same derivation as src/components/ingest/ingestPromotionFixture.test.tsx loadSeed(). */
export function loadSeed(): Pcn26117Seed {
  const statusBody = loadCapture().hops[1]?.response?.body as Record<string, unknown>;
  const dropped = statusBody.dropped_by as { authz_id: string };
  return {
    ingestId: statusBody.ingest_id as string,
    sha256: statusBody.sha256 as string,
    kind: statusBody.kind as "pdf",
    droppedBy: dropped,
    createdAt: statusBody.created_at as number,
  };
}

function hopOf(fixture: Pcn26117Fixture, id: string): Pcn26117Hop {
  const h = fixture.hops.find((x) => x.id === id);
  if (!h) throw new Error(`fixture has no hop ${id}`);
  return h;
}

/**
 * TEST-ONLY SESSION. App.tsx withholds the whole data surface until `useAuth()` has a user with a
 * `sub`, and VITE_NO_AUTH=true alone leaves a blank page. So seed the OIDC user where
 * oidc-client-ts (and client.ts getOidcToken) look for it, with a far-future expiry so no renewal
 * fires. sub and email are the capture's dropped_by.authz_id (IngestPanel sends the profile email
 * as on_behalf_of).
 */
export async function seedFakeOidcSession(page: Page, authzId: string): Promise<void> {
  await page.addInitScript(
    ({ key, id }) => {
      const user = {
        access_token: "e2e-not-a-real-token",
        token_type: "Bearer",
        scope: "openid",
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        profile: { sub: id, email: id, iss: "http://auth.friday.test/realms/cortex", aud: "cortex-ui", exp: 4102444800, iat: 1 },
      };
      sessionStorage.setItem(key, JSON.stringify(user));
    },
    { key: `oidc.user:${REALM_URL}:${CLIENT_ID}`, id: authzId },
  );
}

interface Unserved {
  method: string;
  match: (u: URL) => boolean;
  label: string;
  reason: string;
}
const NO_CAPTURE = "no wire capture exists; the walk does not depend on it";
export const KNOWN_UNSERVED: Unserved[] = [
  { method: "GET", match: (u) => u.pathname === "/plan/state_version", label: "GET /plan/state_version", reason: NO_CAPTURE },
  { method: "GET", match: (u) => u.pathname === "/me/entitlements", label: "GET /me/entitlements", reason: NO_CAPTURE },
  { method: "POST", match: (u) => u.pathname === "/register_frontend_capabilities", label: "POST /register_frontend_capabilities", reason: NO_CAPTURE },
  { method: "GET", match: (u) => u.pathname === "/me/canvases", label: "GET /me/canvases", reason: NO_CAPTURE },
  { method: "GET", match: (u) => u.pathname === "/fleet/version", label: "GET /fleet/version", reason: NO_CAPTURE },
  // The ninth: not in the coordinator's eight; found by the unrouted census on the first full run
  // (fired once the review card mounts). Same class: no capture, no walk step depends on it.
  { method: "GET", match: (u) => u.pathname === "/mesh/config", label: "GET /mesh/config", reason: NO_CAPTURE },
  { method: "GET", match: (u) => u.pathname === "/health", label: "GET /health", reason: NO_CAPTURE },
  {
    method: "GET",
    match: (u) => u.pathname === "/electric/shape" && u.searchParams.get("table") === "answer_artifact_projection",
    label: "GET /electric/shape table=answer_artifact_projection",
    reason: NO_CAPTURE,
  },
  {
    method: "GET",
    match: (u) => u.pathname === "/electric/shape" && u.searchParams.get("table") === "human_task_projection",
    label: "GET /electric/shape table=human_task_projection",
    reason: NO_CAPTURE,
  },
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
}

export async function installFridayRoutes(page: Page, opts: { act: "4a" | "4b" }): Promise<Friday> {
  const seed = loadSeed();
  const fixture = buildPcn26117Fixture(seed);
  const capture = loadCapture();
  const friday: Friday = { seed, fixture, unrouted: [], unservedHit: [], actBodies: [] };

  const received = capture.hops[1]!.response!.body;
  const extracting = hopOf(fixture, "1-status-extracting").response.body;
  const review = hopOf(fixture, "2b-status-review").response.body;
  const promoted = hopOf(fixture, "5-status-promoted").response.body;
  const humanTaskRow = hopOf(fixture, "3-human-task-row").response.body;
  const actHop = hopOf(fixture, opts.act === "4a" ? "4a-act-refused-422" : "4b-act-200-promoted-hypothetical");
  const taskKinds = (
    JSON.parse(readFileSync(path.join(SESSIONS, "2026-10-02-payload-task-kinds-rev-165-bob.json"), "utf8")) as {
      body: unknown;
    }
  ).body;

  let statusCalls = 0;
  let actSucceeded = false;
  const statusPath = `/ingest/${seed.ingestId}/status`;
  const actPath = `/human_tasks/${fixture.taskId}/act`;

  // Non-API hosts (fonts and the like): aborted, counted in neither list.
  await page.route(
    (u) => !["localhost", API_HOST, AUTH_HOST].includes(u.hostname),
    (route) => route.abort(),
  );

  // Catch-all FIRST: the later-registered route wins in Playwright.
  await page.route(
    (u) => u.hostname === API_HOST || u.hostname === AUTH_HOST,
    (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const u = new URL(req.url());
      friday.unrouted.push(`${req.method()} ${u.host}${u.pathname}${u.search}`);
      return json(route, 599, { error: "unrouted" });
    },
  );

  await page.route(
    (u) => u.hostname === API_HOST,
    (route) => {
      const req = route.request();
      const method = req.method();
      if (method === "OPTIONS") return route.fallback();
      const u = new URL(req.url());
      const p = decodeURIComponent(u.pathname);

      if (method === "POST" && p === "/ingest") return json(route, 200, capture.hops[0]!.response!.body);
      if (method === "GET" && p === statusPath) {
        statusCalls += 1;
        const body = actSucceeded ? promoted : statusCalls === 1 ? received : statusCalls === 2 ? extracting : review;
        return json(route, 200, body);
      }
      if (method === "GET" && p === "/me/human_tasks") return json(route, 200, humanTaskRow);
      if (method === "GET" && p === "/task_kinds") return json(route, 200, taskKinds);
      if (method === "POST" && p === actPath) {
        friday.actBodies.push(req.postDataJSON());
        if (opts.act === "4a") return json(route, actHop.response.status, { detail: actHop.response.body });
        actSucceeded = true;
        return json(route, actHop.response.status, actHop.response.body);
      }

      const unserved = KNOWN_UNSERVED.find((k) => k.method === method && k.match(u));
      if (unserved) {
        if (!friday.unservedHit.includes(unserved.label)) friday.unservedHit.push(unserved.label);
        return json(route, 503, { error: "not_captured" });
      }
      return route.fallback();
    },
  );

  return friday;
}
