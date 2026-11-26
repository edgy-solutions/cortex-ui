/**
 * The ordering trap: the door refuses an archetype the backend has no word for, so cortex must not
 * advertise WATERFALL before the backend admits it (invincible-agent #553).
 */
import { describe, expect, it } from "vitest";
import { assembleCapabilities } from "@/registry/assembleCapabilities";
import { CORTEX_UI_CAPABILITIES } from "@/registry/frontendCapabilities";

describe("WATERFALL is not yet advertised", () => {
  it("is NOT on the assembled capability menu", () => {
    const rows = assembleCapabilities(CORTEX_UI_CAPABILITIES).filter((c) => c.archetype === "WATERFALL");
    expect(
      rows,
      "advertise only once invincible-agent #553 is in the deployed release; then add the row and flip this arm",
    ).toHaveLength(0);
  });
});
