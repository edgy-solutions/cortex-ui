/**
 * An EVENT ingest row at `case_opened` renders as its case: `GET /cases/{case_id}` through the
 * REAL `fetchCase` (only `globalThis.fetch` is stubbed), drawn through `SemanticInterpreter`.
 * Rows and bodies are the hand-built / producer-test-derived ones in `cases.fixtures.ts` —
 * NOT live captures.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { readIngestStatusRow } from "@/lib/ingestWire";
import {
  CASE_ID,
  CASE_PAYLOAD_INVALID_HAND_BUILT,
  CASE_PAYLOAD_PRODUCER_TEST_DERIVED,
  EVENT_INGEST_ID,
  EVENT_ROW_CASE_OPENED_HAND_BUILT,
  EVENT_ROW_CASE_OPENED_NO_CASE_ID_HAND_BUILT,
  EVENT_ROW_RECEIVED_HAND_BUILT,
  PDF_ROW_WITH_CASE_ID_HAND_BUILT,
} from "@/lib/cases.fixtures";

vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: vi.fn().mockResolvedValue(null),
  disputeIngestOrigin: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderRow(raw: unknown) {
  const row = readIngestStatusRow(raw);
  expect(row, "the fixture row must parse").not.toBeNull();
  return render(<IngestStatusCard ingestId={row!.ingest_id} initialRow={row!} pollIntervalMs={100000} />);
}

describe("seal 5 — the card, an event row at case_opened with a case_id", () => {
  it("200: the case is drawn through the dispatch — the WORKFLOW_CASE section is on screen", async () => {
    const fn = stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    await waitFor(() => expect(container.querySelector('[data-archetype="WORKFLOW_CASE"]')).not.toBeNull());
    expect(container.querySelector('[data-case-state="loaded"]')).not.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(String(fn.mock.calls[0][0])).toMatch(new RegExp(`/cases/${CASE_ID}$`));
    // The producer's own subject and definition name are what is drawn.
    expect(container.querySelector('[data-archetype="WORKFLOW_CASE"]')!.textContent).toContain(CASE_ID);
  });

  it("shows loading first", async () => {
    stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    expect(container.querySelector('[data-case-state="loading"]')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('[data-case-state="loaded"]')).not.toBeNull());
  });

  it("the event ladder draws received (done) and case_opened (current), and no review prompt", async () => {
    stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    const rungs = [...container.querySelectorAll("[data-ingest-event-ladder] [data-ingest-ladder-stage]")];
    expect(rungs.map((r) => [r.getAttribute("data-ingest-ladder-stage"), r.getAttribute("data-ingest-ladder-state")])).toEqual([
      ["received", "done"],
      ["case_opened", "current"],
    ]);
    expect(container.querySelector("[data-ingest-no-review-task]")).toBeNull();
    await waitFor(() => expect(container.querySelector('[data-case-state="loaded"]')).not.toBeNull());
  });

  it("404: one sentence, for absent AND not-entitled", async () => {
    stubFetch(404, { detail: "case not found" });
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    await waitFor(() => expect(container.querySelector('[data-case-state="not_found"]')).not.toBeNull());
    expect(screen.getByText("Case not found, or not visible to you")).toBeTruthy();
    expect(container.querySelector('[data-archetype="WORKFLOW_CASE"]')).toBeNull();
  });

  it("503: the runner sentence", async () => {
    stubFetch(503, { detail: { error: "runner_unavailable" } });
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    await waitFor(() => expect(container.querySelector('[data-case-state="runner_unavailable"]')).not.toBeNull());
    expect(screen.getByText("The case runner is unavailable")).toBeTruthy();
  });

  it("200 with an unreadable body: the reason plus the case_id in mono", async () => {
    stubFetch(200, CASE_PAYLOAD_INVALID_HAND_BUILT);
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    await waitFor(() => expect(container.querySelector('[data-case-state="invalid"]')).not.toBeNull());
    const el = container.querySelector('[data-case-state="invalid"]')!;
    expect(el.textContent).toContain("invalid_case_payload");
    const mono = el.querySelector("span.font-mono");
    expect(mono?.textContent).toBe(CASE_ID);
  });

  it("500: invalid state naming http_500", async () => {
    stubFetch(500, {});
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    await waitFor(() => expect(container.querySelector('[data-case-state="invalid"]')).not.toBeNull());
    expect(container.querySelector('[data-case-state="invalid"]')!.textContent).toContain("http_500");
  });

  it("an event row still at received draws its ladder and fetches nothing", () => {
    const fn = stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    const { container } = renderRow(EVENT_ROW_RECEIVED_HAND_BUILT);
    expect(container.querySelector("[data-ingest-event-ladder]")).not.toBeNull();
    expect(container.querySelector("[data-case-state]")).toBeNull();
    expect(fn).toHaveBeenCalledTimes(0);
  });
});

describe("seal 5 — what must NOT fetch", () => {
  it("event + case_opened + case_id null: no_case_id, and fetch is never called", () => {
    const fn = stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    const { container } = renderRow(EVENT_ROW_CASE_OPENED_NO_CASE_ID_HAND_BUILT);
    expect(container.querySelector('[data-case-state="no_case_id"]')).not.toBeNull();
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("a pdf row carrying a case_id never fetches a case, and draws no case state", async () => {
    const fn = stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    const { container } = renderRow(PDF_ROW_WITH_CASE_ID_HAND_BUILT);
    // Let any (wrongly) scheduled effect run before counting.
    await new Promise((r) => setTimeout(r, 30));
    expect(fn).toHaveBeenCalledTimes(0);
    expect(container.querySelector("[data-case-state]")).toBeNull();
    expect(container.querySelector("[data-ingest-ladder]")).not.toBeNull();
  });

  it("the ids used are the fixtures' own (control)", () => {
    expect(EVENT_INGEST_ID.startsWith("evt-")).toBe(true);
  });
});
