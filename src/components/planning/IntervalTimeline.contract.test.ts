import { describe, expect, it } from "vitest";
import {
  INTERVAL_TIMELINE_CONTRACT,
  INTERVAL_TIMELINE_GROUP_KINDS,
  INTERVAL_TIMELINE_REFUSAL_REASONS,
  intervalRowKey,
  validateIntervalTimeline,
} from "./IntervalTimeline.contract";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  group_kind: "initiative",
  group_id: "I-1",
  group_name: "Initiative One",
  group_weight: null,
  initiative_id: "I-1",
  initiative_name: "Initiative One",
  phase_id: "PH-1",
  phase_name: "Phase One",
  phase_sequence: 1,
  project_id: "P-1",
  project_name: "Project One",
  planned_start: "2026-01-01",
  planned_end: "2026-03-01",
  actual_start: null,
  actual_end: null,
  risk_flag: null,
  ...over,
});

describe("INTERVAL_TIMELINE refusal vocabulary", () => {
  it("every reason the validator can return is PUBLISHED", () => {
    // THE UNION CHECK. A refusal the backend has never seen is unroutable: the card renders
    // blank instead of honestly empty, and the selector cannot learn the shape is refusable.
    for (const bad of [
      [],
      [row({ planned_start: null })],
      [row({ group_kind: "sprint" })],
    ]) {
      const r = validateIntervalTimeline(bad);
      expect(r.kind).toBe("empty");
      if (r.kind === "empty") {
        expect(INTERVAL_TIMELINE_REFUSAL_REASONS).toContain(r.reason);
      }
    }
  });

  it("publishes no reason it cannot actually emit", () => {
    // The other direction. A published reason nothing produces is a vocabulary the selector
    // routes on and the component never uses — dead words in a live contract.
    const emitted = new Set<string>();
    for (const bad of [[], [row({ planned_end: null })], [row({ group_kind: "nope" })]]) {
      const r = validateIntervalTimeline(bad);
      if (r.kind === "empty") emitted.add(r.reason);
    }
    expect([...INTERVAL_TIMELINE_REFUSAL_REASONS].sort()).toEqual([...emitted].sort());
  });

  it("an EMPTY schedule refuses — unlike DELTA_SET, where empty is an answer", () => {
    // Deliberate asymmetry between siblings. "Nothing changed" is meaningful; "nothing is
    // planned" is a broken scope filter, not a finding.
    expect(validateIntervalTimeline([])).toEqual({
      kind: "empty",
      reason: "no scheduled work in scope",
    });
  });
});

describe("INTERVAL_TIMELINE row identity — the capability fan-out", () => {
  it("keys on (group_id, project_id), because project_id is NOT unique", () => {
    // Under group_by: capability, Engine P's _pivot emits ONE ROW PER CONTRIBUTION — the same
    // project appears once per capability it advances, each with its own weight. A renderer
    // keying on project_id alone would draw duplicates or dedupe away real contributions.
    const a = row({ group_kind: "capability", group_id: "C-1", group_weight: 0.6 });
    const b = row({ group_kind: "capability", group_id: "C-2", group_weight: 0.4 });
    expect(a.project_id).toBe(b.project_id);
    expect(intervalRowKey(a)).not.toBe(intervalRowKey(b));

    const parsed = validateIntervalTimeline([a, b]);
    expect(parsed.kind).toBe("ok");
    if (parsed.kind === "ok") {
      expect(new Set(parsed.rows.map(intervalRowKey)).size).toBe(2);
    }
  });

  it('accepts "(none)" as a real group, not missing data', () => {
    // A project contributing to no capability is an ANSWER — the coverage gap the demo is
    // partly about — and it arrives with a group_name that says so.
    const r = validateIntervalTimeline([
      row({ group_kind: "capability", group_id: "(none)", group_name: "no capability recorded" }),
    ]);
    expect(r.kind).toBe("ok");
  });
});

describe("INTERVAL_TIMELINE contract shape", () => {
  it("recomputes — a drop re-evaluates the verbs server-side", () => {
    expect(INTERVAL_TIMELINE_CONTRACT.recomputes).toBe(true);
  });

  it("declares every group kind Engine P can pivot by", () => {
    // Mirrors measures._GROUP_BY. A pivot the engine emits and the contract omits arrives as
    // "unknown group kind" and refuses a payload that is perfectly valid.
    expect([...INTERVAL_TIMELINE_GROUP_KINDS].sort()).toEqual(
      ["capability", "initiative", "target"],
    );
  });

  it("does not name any domain vocabulary — GENERIC AT BIRTH", () => {
    // risk_flag VALUES ride the payload; the renderer styles unknown strings. If the contract
    // ever names one, the component has learned a deployment's words.
    const text = JSON.stringify(INTERVAL_TIMELINE_CONTRACT).toLowerCase();
    for (const forbidden of ["funding_risk", "at-risk", "unfunded", "capex", "expense"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
