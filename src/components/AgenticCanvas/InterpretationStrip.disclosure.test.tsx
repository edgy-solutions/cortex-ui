/**
 * A RESOLVED SLOT MUST DISCLOSE WHAT IT WAS RESOLVED FROM.
 *
 * The reader asked in their own words and the system narrowed them to something specific:
 * "Brandon" became site S2. Showing only the resolved value hides that a narrowing happened;
 * showing only the spoken form hides that it succeeded. Both, with the resolved value
 * authoritative — the mitigation for the silent-narrowing class.
 *
 * Object slots previously rendered as a single "…", so a referent disclosed nothing at all.
 *
 * ── WHAT THIS FILE CANNOT CLAIM ──────────────────────────────────────────────────────────
 *
 * That the disclosure appears on a real card today. It does not, and not because of anything
 * here: NOTHING WRITES FILLED SLOTS INTO `resolved_intent`. The gateway sets it once from
 * /plan's `intent_extraction`, which runs BEFORE slot filling, and no code path updates it
 * afterwards — `resolved_intent[` has no write site anywhere in the engine repo. The
 * ontology service's resolution map (`{outcome, spoken, instance_id, instance_label}`) lives
 * on fill_slots' response and never reaches the artifact.
 *
 * So this is the consumer half of a cross-lane pair, and it is written to the producer's OWN
 * DECLARED SHAPE rather than an invented one. Filed, so that "the strip shows no slots" is not
 * re-diagnosed as a rendering bug.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InterpretationStrip } from "./InterpretationStrip";
import type { Artifact } from "@/api/types";

afterEach(cleanup);

const withParams = (parameters: Record<string, unknown>) =>
  ({
    id: "a1",
    resolved_intent: { parameters },
    routing: { action: { label: "plan Site Load" } },
  }) as unknown as Artifact;

describe("a resolved referent shows spoken AND resolved", () => {
  it("renders both, resolved side authoritative", () => {
    render(
      <InterpretationStrip
        artifact={withParams({
          site: { outcome: "exact", spoken: "Brandon", instance_id: "S2", instance_label: "Site B — Brandon" },
        })}
      />,
    );
    expect(screen.getByText(/Brandon → Site B — Brandon/)).toBeTruthy();
  });

  it("falls back to the id when no label was captured", () => {
    render(
      <InterpretationStrip
        artifact={withParams({ site: { spoken: "Brandon", instance_id: "S2" } })}
      />,
    );
    expect(screen.getByText(/Brandon → S2/)).toBeTruthy();
  });

  it("an UNRESOLVED referent is never shown as resolved", () => {
    // The service removes a slot it could not resolve rather than passing the raw string
    // through, precisely so a failure is not indistinguishable from a fill. If one arrives
    // anyway, the card must not manufacture the resolution.
    render(
      <InterpretationStrip
        artifact={withParams({ site: { outcome: "not_specific", spoken: "the north site", instance_id: null } })}
      />,
    );
    expect(screen.getByText(/the north site \(unresolved\)/)).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("a plain scalar slot is unchanged", () => {
    render(<InterpretationStrip artifact={withParams({ window: "FY26-Q3" })} />);
    expect(screen.getByText(/FY26-Q3/)).toBeTruthy();
  });

  it("an object with nothing readable still refuses to print [object Object]", () => {
    render(<InterpretationStrip artifact={withParams({ weird: { a: 1 } })} />);
    expect(screen.queryByText(/object Object/)).toBeNull();
    expect(screen.getByText("…")).toBeTruthy();
  });

  it("no captured interpretation renders NOTHING, not an empty frame", () => {
    // An empty strip is honest; a placeholder one occupies the space where a real claim
    // belongs. This is the state every live card is in today.
    const { container } = render(
      <InterpretationStrip artifact={{ id: "a1", resolved_intent: {} } as unknown as Artifact} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
