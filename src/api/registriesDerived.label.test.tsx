/**
 * A server-added enum value this client has no label for renders its RAW TOKEN, never blank
 * (refactor item 3). The generated constants are mocked to carry an extra value, "document".
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../api/generated/bff", async (orig) => {
  const real = await orig<typeof import("../api/generated/bff")>();
  return { ...real, HumanTaskActRequest_reason_code: [...real.HumanTaskActRequest_reason_code, "document"] as const };
});

import { REJECT_REASONS } from "../components/GroupedReview/GroupedReviewTable";
import { DEFAULT_REJECT_CODES } from "../lib/promotionReview";
import { leafLabel } from "../components/ingest/IngestLeafChip";

describe("an unlabelled enum value shows its raw token", () => {
  it("REJECT_REASONS", () => {
    expect(REJECT_REASONS.find((r) => r.code === ("document" as never))?.label).toBe("document");
  });
  it("DEFAULT_REJECT_CODES", () => {
    expect(DEFAULT_REJECT_CODES.find((r) => r.code === ("document" as never))?.label).toBe("document");
  });
  it("leafLabel carries the leaf's own token (upper-cased), not blank", () => {
    expect(leafLabel("document" as never, "declared", null, "review")).toBe("DOCUMENT · declared");
  });
});
