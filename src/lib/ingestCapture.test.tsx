/**
 * Seal against Lane 1's live capture of the deployed ingest wire —
 * `sessions/2026-10-01-payload-ingest-drop-roll-11.json`, four exchanges against the gateway at
 * producer 0f48fe2f / helm rev 162. Loaded with `readFileSync` + `JSON.parse`, never inlined —
 * same discipline as `ingestWire.test.ts`'s rev-162 refusal fixture.
 *
 * This capture is what broke two coincidence defects every earlier fixture (hand-built to the
 * sha256 shape) could not reach: a DUPLICATE's `ingest_id` is a uuid, not `sha256:<64 hex>`
 * (exchanges [2]/[3]); and `created_at`/`updated_at` are epoch-ms NUMBERS, not ISO strings
 * (exchanges [1]/[3]). See `ingestWire.ts`'s `readIngestStatusRow`/`readIngestUploadId` for the
 * fix and `ingestWire.test.ts` for the general near-side reader cases.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import {
  readIngestStatusRow,
  readIngestUploadId,
  ingestPollingDone,
  ingestStatusPath,
} from "./ingestWire";
import { IngestStatusCard } from "@/components/ingest/IngestStatusCard";

interface IngestExchange {
  request: { method: string; path: string };
  response: { status: number; body: unknown };
}

interface IngestCapture {
  captured_by: string;
  file: string;
  exchanges: IngestExchange[];
}

function loadCapture(): IngestCapture {
  const file = path.join(__dirname, "../../sessions/2026-10-01-payload-ingest-drop-roll-11.json");
  return JSON.parse(readFileSync(file, "utf8")) as IngestCapture;
}

const SHA_INGEST_ID =
  "sha256:736499f2eebb7dece392ad285e1a5b03e49e50a88a069cb0cc820b91dc4149d9";
const DUP_INGEST_ID = "7288a292-7642-4cca-bb77-fb77fa7f2689";

describe("ingest roll-11 capture — the deployed gateway's actual wire", () => {
  const capture = loadCapture();

  it("has the four exchanges this seal reads", () => {
    expect(capture.exchanges).toHaveLength(4);
  });

  it("[0] POST /ingest (new arrival) — readIngestUploadId reads the sha id", () => {
    const body = capture.exchanges[0].response.body;
    expect(readIngestUploadId(body)).toBe(SHA_INGEST_ID);
  });

  it("[1] GET /ingest/{sha}/status — readIngestStatusRow reads it, received, still polling, numeric created_at", () => {
    const body = capture.exchanges[1].response.body;
    const row = readIngestStatusRow(body);
    expect(row).not.toBeNull();
    expect(row?.stage).toBe("received");
    expect(ingestPollingDone(row!)).toBe(false);
    expect(typeof row?.created_at).toBe("number");
  });

  it("[2] POST /ingest (duplicate arrival) — readIngestUploadId reads the UUID, not the sha form", () => {
    const body = capture.exchanges[2].response.body;
    expect(readIngestUploadId(body)).toBe(DUP_INGEST_ID);
  });

  it("[3] GET /ingest/{uuid}/status — readIngestStatusRow reads it, duplicate points at exchange [0]'s id, polling done", () => {
    const body = capture.exchanges[3].response.body;
    const row = readIngestStatusRow(body);
    expect(row).not.toBeNull();
    expect(row?.duplicate?.of_ingest_id).toBe(SHA_INGEST_ID);
    expect(ingestPollingDone(row!)).toBe(true);
  });

  describe("ingestStatusPath — the path fetchIngestStatus actually sends", () => {
    it("for [3]'s uuid, equals the captured request path exactly", () => {
      expect(ingestStatusPath(DUP_INGEST_ID)).toBe(capture.exchanges[3].request.path);
    });

    it("for [1]'s sha id, decodes back to the captured path — the gateway answers 200 for %3A", () => {
      const built = ingestStatusPath(SHA_INGEST_ID);
      expect(decodeURIComponent(built)).toBe(capture.exchanges[1].request.path);
    });
  });

  describe("IngestStatusCard — rendering the [3] duplicate row", () => {
    it("draws the duplicate message and of_ingest_id, with NO ladder", () => {
      const row = readIngestStatusRow(capture.exchanges[3].response.body)!;
      const { container } = render(
        <IngestStatusCard ingestId={row.ingest_id} initialRow={row} pollIntervalMs={100000} />,
      );
      expect(container.querySelector("[data-ingest-duplicate]")?.textContent).toContain(
        "already processed",
      );
      expect(container.querySelector("[data-ingest-duplicate]")?.textContent).toContain(
        SHA_INGEST_ID,
      );
      expect(container.querySelector("[data-ingest-ladder]")).toBeNull();
    });
  });
});

/**
 * Lane 1's END-TO-END capture at helm rev 164 / fleet d602d490:
 * `sessions/2026-10-01-payload-ingest-e2e-pcn23-002-rev-164.json`. One fresh drop, polled for
 * 603 s. It never left `received`, and no document_promotion task named it on either queue — the
 * capture's own `stopped_at` says so. So the hops that exist are sealed here, and the promote
 * response and the label are `todo`, NOT green: there is nothing on the wire yet for them to read.
 * When Lane 1 replaces this with a capture that progresses, the stall arm below goes red and says so.
 */
interface E2eHop {
  request?: { method?: string; path?: string };
  response?: { status?: number; body?: unknown };
}
interface E2eCapture {
  release: string;
  hops: E2eHop[];
  ingest_id: string;
  stages_seen: string[];
  stopped_at: string;
}

describe("ingest rev-164 end-to-end capture — what the live pipeline did with one drop", () => {
  const e2e = JSON.parse(
    readFileSync(
      path.join(__dirname, "../../sessions/2026-10-01-payload-ingest-e2e-pcn23-002-rev-164.json"),
      "utf8",
    ),
  ) as E2eCapture;
  const statusHops = e2e.hops.filter(
    (h) => h.request?.method === "GET" && /^\/ingest\/.+\/status$/.test(h.request?.path ?? ""),
  );

  it("the upload hop reads through readIngestUploadId as the capture's ingest_id", () => {
    const upload = e2e.hops.find((h) => h.request?.method === "POST" && h.request?.path === "/ingest");
    expect(upload, "no POST /ingest hop in the capture").toBeTruthy();
    expect(readIngestUploadId(upload!.response?.body)).toBe(e2e.ingest_id);
  });

  it("EVERY status hop reads through readIngestStatusRow, and ingestStatusPath reproduces its path", () => {
    expect(statusHops.length).toBeGreaterThanOrEqual(2);
    for (const h of statusHops) {
      const row = readIngestStatusRow(h.response?.body);
      expect(row, `status row refused: ${JSON.stringify(h.response?.body).slice(0, 200)}`).not.toBeNull();
      expect(row!.ingest_id).toBe(e2e.ingest_id);
      expect(decodeURIComponent(ingestStatusPath(row!.ingest_id))).toBe(h.request!.path);
    }
  });

  it("the stall, as captured: every stage seen is `received`, and the card keeps polling rather than calling it done", () => {
    expect(e2e.stages_seen).toEqual(["received"]);
    for (const h of statusHops) {
      const row = readIngestStatusRow(h.response?.body)!;
      expect(row.stage).toBe("received");
      expect(ingestPollingDone(row)).toBe(false);
    }
    expect(e2e.stopped_at).toContain("no document_promotion task");
  });

  it.todo("promote response — awaits a capture where a document_promotion task names the drop");
  it.todo("label — awaits a capture past promotion");
});
