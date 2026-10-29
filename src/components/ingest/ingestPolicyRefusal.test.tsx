/** A refused drop whose 4xx carries the policy envelope draws the notice under the reason (INGEST rail entry). */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { IngestEntryBody } from "./IngestEntryBody";
import { ingestComponentOf, type IngestEntry } from "@/lib/ingestArtifact";
import { readIngestRefusal } from "@/lib/ingestWire";
import { POLICY_REFUSAL_DETAIL, httpError } from "@/lib/policyRefusalFixture";

afterEach(cleanup);

const entryFor = (err: unknown): IngestEntry => {
  const refusal = readIngestRefusal(err)!;
  return {
    key: "k1", filename: "plan.pdf", kind: null, droppedAt: 1, phase: "refused", ingestId: null,
    error: refusal.message, refusal, acceptedThisSession: false, duplicate: null, note: null, row: null, notFound: false,
  };
};

describe("IngestEntryBody -- a refused drop", () => {
  it("a 403 WITH an envelope draws data-policy-refusal under the reason", () => {
    render(<IngestEntryBody ingest={ingestComponentOf(entryFor(httpError(403, POLICY_REFUSAL_DETAIL)))} />);
    expect(document.querySelector("[data-ingest-refusal]")?.textContent).toBe(POLICY_REFUSAL_DETAIL.message);
    expect(document.querySelector('[data-policy-refusal="program_members"]')).not.toBeNull();
  });
  it("a 403 WITHOUT one keeps today's reason and draws no notice", () => {
    render(<IngestEntryBody ingest={ingestComponentOf(entryFor(httpError(403, "not allowed to drop here")))} />);
    expect(document.querySelector("[data-ingest-refusal]")?.textContent).toBe("not allowed to drop here");
    expect(document.querySelector("[data-policy-refusal]")).toBeNull();
  });
});
