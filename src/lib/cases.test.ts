/**
 * `fetchCase` — the REAL function, with `globalThis.fetch` stubbed at the HTTP level (so the
 * URL, method and headers it actually sends are what is asserted, not a mock of the function).
 * Fixtures: `cases.fixtures.ts` — producer-test-derived or hand-built, NOT a live capture.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { config } from "@/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fetchCase, readWorkflowCasePayload } from "./cases";
import { findCaseCaptures } from "./caseCaptures";
import {
  CASE_ID,
  CASE_PAYLOAD_INVALID_HAND_BUILT,
  CASE_PAYLOAD_PRODUCER_TEST_DERIVED,
} from "./cases.fixtures";

const TOKEN = "tok-abc";
const STORAGE_KEY = `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`;

function stubFetch(status: number, body: unknown, rawBody?: string) {
  const fn = vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(rawBody ?? JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: TOKEN }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("fetchCase — the request it sends", () => {
  it("GETs {API}/cases/{encoded id} with the caller's bearer", async () => {
    const fn = stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    await fetchCase("case/1 x");
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(`${config.VITE_API_URL}/cases/${encodeURIComponent("case/1 x")}`);
    expect(url).toContain("case%2F1%20x");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers["X-Trace-Id"]).toBeTruthy();
    expect(init.headers["X-Session-Id"]).toBeTruthy();
  });
});

describe("fetchCase — each outcome", () => {
  it("200 + a readable body → ok, payload carried verbatim", async () => {
    stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    expect(await fetchCase(CASE_ID)).toEqual({ ok: true, payload: CASE_PAYLOAD_PRODUCER_TEST_DERIVED });
  });

  it("200 + an invalid body → invalid_case_payload, with a detail naming what is wrong", async () => {
    stubFetch(200, CASE_PAYLOAD_INVALID_HAND_BUILT);
    const r = await fetchCase(CASE_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid_case_payload");
      expect("detail" in r && r.detail).toMatch(/instances\[0\]\.definition is not an object/);
    }
  });

  it("200 + a non-JSON body → invalid_case_payload", async () => {
    stubFetch(200, null, "<html>");
    const r = await fetchCase(CASE_ID);
    expect(r).toEqual({ ok: false, reason: "invalid_case_payload", detail: "body is not JSON" });
  });

  it("404 → not_found (absent and not-entitled are one answer)", async () => {
    stubFetch(404, { detail: "case not found" });
    expect(await fetchCase(CASE_ID)).toEqual({ ok: false, reason: "not_found" });
  });

  it("503 → runner_unavailable", async () => {
    stubFetch(503, { detail: { error: "runner_unavailable" } });
    expect(await fetchCase(CASE_ID)).toEqual({ ok: false, reason: "runner_unavailable" });
  });

  it("500 → http_500", async () => {
    stubFetch(500, { detail: "boom" });
    expect(await fetchCase(CASE_ID)).toEqual({ ok: false, reason: "http_500" });
  });
});

describe("readWorkflowCasePayload", () => {
  it("accepts the producer-test-derived payload", () => {
    expect(readWorkflowCasePayload(CASE_PAYLOAD_PRODUCER_TEST_DERIVED).ok).toBe(true);
  });
  it("refuses null, an array, and a payload without instances", () => {
    expect(readWorkflowCasePayload(null).ok).toBe(false);
    expect(readWorkflowCasePayload([]).ok).toBe(false);
    expect(readWorkflowCasePayload({ subject_ref: "c" }).ok).toBe(false);
  });
});

const NL = String.fromCharCode(10);
const SESSIONS =path.join(__dirname, "../../sessions");

function walkSessions(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkSessions(full));
    else if (/\.(json|md)$/i.test(name)) out.push({ path: path.relative(SESSIONS, full).split(path.sep).join("/"), text: readFileSync(full, "utf8") });
  }
  return out;
}

describe("findCaseCaptures — positive and negative controls", () => {
  const P = CASE_PAYLOAD_PRODUCER_TEST_DERIVED;
  const md = (body: string) => ["# note", "", "```json", body, "```", ""].join(NL);
  it("finds a bare .json payload", () => {
    expect(findCaseCaptures([{ path: "a.json", text: JSON.stringify(P) }]), "bare .json payload not found").toEqual(["a.json"]);
  });
  it("finds a .json with the payload under .body", () => {
    expect(findCaseCaptures([{ path: "b.json", text: JSON.stringify({ status: 200, body: P }) }]), ".body payload not found").toEqual(["b.json"]);
  });
  it("finds a .md with a fenced json payload", () => {
    expect(findCaseCaptures([{ path: "c.md", text: md(JSON.stringify(P, null, 2)) }]), "fenced .md payload not found").toEqual(["c.md"]);
  });
  it("does not find a .md that only mentions cases in prose", () => {
    expect(findCaseCaptures([{ path: "d.md", text: "GET /cases returned the cases payload with instances." }])).toEqual([]);
  });
  it("does not find a .json with a non-case object", () => {
    expect(findCaseCaptures([{ path: "e.json", text: JSON.stringify({ subject_ref: "c" }) }])).toEqual([]);
  });
  it("does not find, nor throw on, malformed JSON", () => {
    const files = [{ path: "f.json", text: "{not json" }, { path: "g.md", text: md("{not json") }];
    expect(() => findCaseCaptures(files)).not.toThrow();
    expect(findCaseCaptures(files)).toEqual([]);
  });
});

describe("a live capture — the /cases arrival seal", () => {
  /** Captures already sealed against readWorkflowCasePayload. Empty until Lane 1 sends one. */
  const CAPTURE_FILES: string[] = [];
  const walked = walkSessions(SESSIONS);

  it("sessions/ was actually scanned — the walker cannot read green on nothing", () => {
    expect(walked.length, "sessions/ walk scanned 50 files or fewer").toBeGreaterThan(50);
    expect(walked.some((f) => f.path.endsWith(".md")), "no .md scanned").toBe(true);
    expect(walked.some((f) => f.path.endsWith(".json")), "no .json scanned").toBe(true);
  });

  it("every live GET /cases capture in sessions/ is named in CAPTURE_FILES", () => {
    const found = findCaseCaptures(walked).sort();
    const unsealed = found.filter((f) => !CAPTURE_FILES.includes(f));
    expect(
      found,
      unsealed.map((f) => `a live GET /cases capture has arrived at ${f}; seal readWorkflowCasePayload against it and add it to CAPTURE_FILES`).join(NL) ||
        "CAPTURE_FILES names a capture that is no longer found",
    ).toEqual([...CAPTURE_FILES].sort());
  });
});
