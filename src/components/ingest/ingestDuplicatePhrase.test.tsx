/**
 * Ruling 3 (PR #4): a duplicate says "already processed" ONCE — the producer's message verbatim,
 * else the fixed label. Counted on the rendered text, message included.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { IngestTurns } from "./IngestTurns";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import type { IngestStatusRow } from "@/lib/ingestWire";

const fetchIngestStatus = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  disputeIngestOrigin: vi.fn(),
}));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ user: null }) }));

afterEach(() => {
  cleanup();
  fetchIngestStatus.mockReset();
  useIngestComposerStore.setState({ turns: [] });
});

const SHA = "3f9a2b".padEnd(64, "0");
const ID = `sha256:${SHA}`;
const OTHER = `sha256:${"a1b2c3".padEnd(64, "0")}`;
const count = (t: string) => (t.match(/already processed/gi) ?? []).length;

const row = (message: string): IngestStatusRow => ({
  ingest_id: ID,
  sha256: SHA,
  kind: "pdf",
  stage: null,
  detail: null,
  duplicate: { of_ingest_id: OTHER, message },
  created_at: 1790860800000,
  updated_at: 1790860800000,
  origin: null,
  case_id: null,
});

const MESSAGES: Array<[string, string]> = [
  ["a message carrying the phrase", "already processed on 2026-09-29 from work-instruction.pdf"],
  ["a message without the phrase", `same bytes as sha256:${"a1b2c3".padEnd(64, "0")}`],
  ["an absent message", ""],
];

describe("IngestStatusCard alone", () => {
  it.each(MESSAGES)("%s: the phrase appears exactly once", (_n, message) => {
    const r = render(
      <IngestStatusCard ingestId={ID} initialRow={row(message)} pollIntervalMs={100000} />,
    );
    const dup = r.container.querySelector("[data-ingest-duplicate]")!;
    expect(count(dup.textContent ?? "")).toBe(1);
    expect(dup.textContent).toContain(OTHER);
    if (message) expect(dup.textContent).toContain(message);
  });
});

describe("IngestTurns + the real IngestStatusCard together", () => {
  it.each(MESSAGES)("%s: the phrase appears exactly once in the turn", async (_n, message) => {
    fetchIngestStatus.mockResolvedValue(row(message || `same bytes as ${OTHER}`));
    useIngestComposerStore.setState({
      turns: [
        {
          id: "t1",
          fileName: "dup.pdf",
          kind: "pdf",
          text: "",
          createdAt: 0,
          phase: "status",
          ingestId: ID,
          error: null,
          duplicate: { message, ofIngestId: OTHER },
        },
      ],
    });
    const r = render(<IngestTurns />);
    await waitFor(() => expect(r.container.querySelector("[data-ingest-duplicate]")).toBeTruthy());
    const turn = r.container.querySelector("[data-ingest-turn]")!;
    expect(count(turn.textContent ?? "")).toBe(1);
    if (message) expect(turn.textContent).toContain(message);
    const res = r.container.querySelector("[data-ingest-turn-result='duplicate']")!;
    expect(res.className).not.toMatch(/rose|red|amber/);
    expect(turn.textContent).toContain(OTHER);
  });
});
