import { describe, it, expect } from "vitest";
import { stageLabel, KNOWN_STAGES, ARRIVED_ONLY_STAGES, UNNAMED_STAGE_LABEL } from "./stageLabel";
import { PIPELINE_STAGES } from "@/api/types";

describe("stageLabel", () => {
  it("a known stage reads the table's label", () => {
    for (const s of PIPELINE_STAGES) expect(stageLabel(s.kind)).toBe(s.label);
    expect(stageLabel("waiting")).toBe("Waiting to start");
  });

  it("an unknown stage shows its own name, made readable", () => {
    expect(stageLabel("route_confirm")).toBe("Route confirm");
    expect(stageLabel("fast-path.lookup")).toBe("Fast path lookup");
  });

  it("a kind with no name to show reads the neutral 'Working'", () => {
    expect(UNNAMED_STAGE_LABEL).toBe("Working");
    for (const k of ["", "  ", "__", undefined, null]) expect(stageLabel(k)).toBe("Working");
  });

  it("an unknown stage NEVER borrows another stage's label", () => {
    // The population is every known label; the defect was an unknown kind reading as the last one.
    const known = new Set(KNOWN_STAGES.map((s) => s.label));
    for (const k of ["route_confirm", "fast_lookup", "x", "queued", "admission"]) {
      expect(known.has(stageLabel(k)), `${k} read as ${stageLabel(k)}`).toBe(false);
    }
  });
});

describe("the stage table", () => {
  it("draws the arrived-only stages first, then the canonical five in their order", () => {
    expect(KNOWN_STAGES.map((s) => s.kind)).toEqual([
      ...ARRIVED_ONLY_STAGES.map((s) => s.kind),
      ...PIPELINE_STAGES.map((s) => s.kind),
    ]);
    expect(KNOWN_STAGES.filter((s) => s.arrivedOnly).map((s) => s.kind)).toEqual(["waiting"]);
  });

  it("no arrived-only stage is one the client seeds", () => {
    const seeded = new Set(PIPELINE_STAGES.map((s) => s.kind));
    for (const s of ARRIVED_ONLY_STAGES) expect(seeded.has(s.kind as never)).toBe(false);
  });
});
