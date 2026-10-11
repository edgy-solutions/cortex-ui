import { describe, it, expect } from "vitest";
import { readRefusalEnvelope } from "./refusalEnvelope";

const canonical = {
  refused: true,
  outcome: "source_unavailable",
  reason: "the connector could not read the source",
  connector: "saf-sql",
  fn: "incident_rate",
};

describe("readRefusalEnvelope", () => {
  it("absent, undefined and null refusal -> null", () => {
    expect(readRefusalEnvelope({ archetype: "X", rows: [] })).toBeNull();
    expect(readRefusalEnvelope({ refusal: undefined })).toBeNull();
    expect(readRefusalEnvelope({ refusal: null })).toBeNull();
    expect(readRefusalEnvelope(null)).toBeNull();
    expect(readRefusalEnvelope("x")).toBeNull();
  });
  it("the canonical sample carries connector and fn", () => {
    expect(readRefusalEnvelope({ refusal: canonical })).toEqual(canonical);
  });
  it("a bare envelope has no connector/fn KEYS", () => {
    const env = readRefusalEnvelope({ refusal: { refused: true, outcome: "engine_fault", reason: "x" } })!;
    expect("connector" in env).toBe(false);
    expect("fn" in env).toBe(false);
  });
  it("null reason is preserved; non-string connector/fn are dropped", () => {
    const env = readRefusalEnvelope({ refusal: { refused: true, outcome: "refused", reason: null, connector: 3, fn: {} } })!;
    expect(env.reason).toBeNull();
    expect("connector" in env).toBe(false);
    expect("fn" in env).toBe(false);
  });
  it.each([[{}], [true], [{ refused: false }], [[]], [{ outcome: "" }]])(
    "malformed refusal %j still yields an envelope with outcome 'refused'",
    (bad) => {
      const env = readRefusalEnvelope({ refusal: bad });
      expect(env).not.toBeNull();
      expect(env!.outcome).toBe("refused");
      expect(env!.refused).toBe(true);
      expect(env!.reason).toBeNull();
    },
  );

  it("hazard_id and gap are read when non-empty strings", () => {
    const env = readRefusalEnvelope({
      refusal: { refused: true, outcome: "not_assessed", reason: "r", hazard_id: "HAZ-1006", gap: "g" },
    })!;
    expect(env.hazard_id).toBe("HAZ-1006");
    expect(env.gap).toBe("g");
  });

  it("empty or non-string hazard_id/gap are ABSENT keys, not undefined-valued ones", () => {
    for (const bad of ["", 3, null, {}]) {
      const env = readRefusalEnvelope({
        refusal: { refused: true, outcome: "hazard_closed", reason: "r", hazard_id: bad, gap: bad },
      })!;
      expect(Object.keys(env)).not.toContain("hazard_id");
      expect(Object.keys(env)).not.toContain("gap");
    }
  });

  it("hazard_id is never parsed out of reason", () => {
    const env = readRefusalEnvelope({
      refusal: { refused: true, outcome: "hazard_closed", reason: "hazard 'HAZ-1005' is closed" },
    })!;
    expect(Object.keys(env)).not.toContain("hazard_id");
  });
});