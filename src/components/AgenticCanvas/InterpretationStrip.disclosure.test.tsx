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
 * ── THE NOTE THAT USED TO BE HERE, AND WHY IT SURVIVED BEING WRONG ───────────────────────
 *
 * This header said the disclosure could not appear on a real card because NOTHING WROTE
 * FILLED SLOTS INTO `resolved_intent` — the gateway set it once from /plan's
 * `intent_extraction`, before slot filling, and never updated it. That was true when it was
 * written. The producer then added the `subtask_slots_decision` hop, which writes exactly
 * those slots at the disposition point.
 *
 * The note stayed convincing anyway, because THE SYMPTOM OUTLIVED THE DIAGNOSIS: the strip
 * was still blank, so the recorded cause kept passing its own smell test. The real cause by
 * then was on this side — the strip read `resolved_intent.parameters`, a key no writer in the
 * engine has ever produced under either write.
 *
 * Worth keeping as a shape: a filed explanation whose cause has been fixed does not announce
 * itself, because the effect it explains is unchanged. What re-opened it was checking the
 * producer rather than re-reading the note.
 *
 * The three keys now read are the producer's own, and the fixtures below are built to them.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InterpretationStrip } from "./InterpretationStrip";
import type { Artifact } from "@/api/types";

afterEach(cleanup);

/**
 * A card whose slots all RESOLVED and were all USED — the ordinary case.
 *
 * Every slot goes into both `slot_resolution` (what it was narrowed from) and
 * `accepted_slots` (that it reached the verb), because those are two different facts and the
 * strip draws a row differently depending on which it has.
 */
const withParams = (parameters: Record<string, unknown>) =>
  ({
    id: "a1",
    resolved_intent: {
      slot_resolution: parameters,
      accepted_slots: Object.fromEntries(Object.keys(parameters).map((k) => [k, true])),
      refused_slots: [],
    },
    routing: { action: { label: "plan Site Load" } },
  }) as unknown as Artifact;

/** A card carrying refusals, as the producer's records: `{name, reason, spoken}`. */
const withRefusals = (
  slot_resolution: Record<string, unknown>,
  refused_slots: { name?: string; reason?: string; spoken?: string }[],
  accepted_slots: Record<string, unknown> = {},
) =>
  ({
    id: "a1",
    resolved_intent: { slot_resolution, accepted_slots, refused_slots },
    routing: { action: { label: "plan Site Load" } },
  }) as unknown as Artifact;

describe("a resolved referent shows spoken AND resolved", () => {
  it("draws a REAL captured payload from a walk, field for field", () => {
    // NOT AN INVENTED FIXTURE. This is `artifact-2-1788654936317` at 00:40:02Z — the
    // Regulatory Reporting pick — copied from the artifact the producer wrote after the roll.
    // The before/after across that roll is the evidence the WRITE works: the 23:47 artifact
    // had `slot_resolution: {}` and the 00:40 one carries the row, so a blank strip after this
    // point is a READ defect and not a missing capture.
    render(
      <InterpretationStrip
        artifact={
          {
            id: "artifact-2-1788654936317",
            resolved_intent: {
              verb_iri: "mesh:planCapabilityPath",
              disposition: "route",
              accepted_slots: { capability_id: "C9" },
              refused_slots: [],
              slot_resolution: {
                capability_id: {
                  outcome: "bound",
                  spoken: "Regulatory Reporting",
                  instance_id: "C9",
                },
              },
            },
            routing: { action: { label: "plan Capability Path" } },
          } as unknown as Artifact
        }
      />,
    );
    const row = document.querySelector("[data-slot='capability_id']");
    expect(row).not.toBeNull();
    expect(row!.getAttribute("data-slot-refused")).toBeNull();
    // No `instance_label` on this record, so the id is the resolved side — read, never required.
    expect(row!.textContent).toMatch(/Regulatory Reporting → C9/);
  });

  it("an ASK turn renders no slots, and that is CORRECT rather than the defect", () => {
    // `artifact-1` (00:35) and `artifact-3` (00:59) both carry empty `slot_resolution` AND
    // empty `accepted_slots`. Those are the turns where the menu is OFFERED and nothing is
    // bound yet; the BIND is a separate artifact. Pinned so an empty strip on an ask is not
    // re-diagnosed as the blank-strip bug it looks exactly like.
    const { container } = render(
      <InterpretationStrip
        artifact={
          {
            id: "artifact-1",
            resolved_intent: { slot_resolution: {}, accepted_slots: {}, refused_slots: [] },
          } as unknown as Artifact
        }
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("a PICK is marked apart from a RESOLUTION, without losing its arrow", () => {
    // The architect's ruling: `bound` is not `exact` and must not fold into "narrowed", or the
    // strip cannot tell a reader whether the resolver was involved at all. A pick still earns
    // the arrow — the label genuinely became the value — so the separation is the QUOTATION.
    render(
      <InterpretationStrip
        artifact={withRefusals(
          {
            capability_id: { outcome: "bound", spoken: "Regulatory Reporting", instance_id: "C9" },
            site: { outcome: "exact", spoken: "Brandon", instance_id: "S2", instance_label: "Site B" },
          },
          [],
          { capability_id: "C9", site: "S2" },
        )}
      />,
    );
    const pick = document.querySelector("[data-slot='capability_id']");
    const resolved = document.querySelector("[data-slot='site']");
    // Both keep the arrow.
    expect(pick!.textContent).toMatch(/→/);
    expect(resolved!.textContent).toMatch(/→/);
    // They clicked a label — bare, because they did not say it.
    expect(pick!.textContent).toMatch(/Regulatory Reporting → C9/);
    expect(pick!.textContent).not.toMatch(/"Regulatory Reporting"/);
    // They typed words — quoted, because those are theirs.
    expect(resolved!.textContent).toMatch(/"Brandon" → Site B/);
    // And the producer's own token rides on the row, uninterpreted.
    expect(pick!.getAttribute("data-slot-outcome")).toBe("bound");
    expect(resolved!.getAttribute("data-slot-outcome")).toBe("exact");
  });

  it("renders both, resolved side authoritative", () => {
    render(
      <InterpretationStrip
        artifact={withParams({
          site: { outcome: "exact", spoken: "Brandon", instance_id: "S2", instance_label: "Site B — Brandon" },
        })}
      />,
    );
    // QUOTED, because "Brandon" is what the reader TYPED. The quotation is what separates a
    // resolution from a menu pick, whose label is shown bare — see the `bound` case above.
    expect(screen.getByText(/"Brandon" → Site B — Brandon/)).toBeTruthy();
  });

  it("falls back to the id when no label was captured", () => {
    render(
      <InterpretationStrip
        artifact={withParams({ site: { spoken: "Brandon", instance_id: "S2" } })}
      />,
    );
    expect(screen.getByText(/"Brandon" → S2/)).toBeTruthy();
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
    expect(screen.getByText(/"the north site" \(unresolved\)/)).toBeTruthy();
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

  it("a REFUSED slot is shown, because it is the reason the answer looks wrong", () => {
    // The most useful row on the strip: the person said something, the system did not act on
    // it, and this is the only place that says so. Dropping it would leave the omission no
    // trace — a record that reads as complete because what it left out is invisible.
    render(
      <InterpretationStrip
        artifact={withRefusals(
          { program: { spoken: "meridian", instance_id: "NP-MERIDIAN", instance_label: "NP-MERIDIAN" } },
          [{ name: "program", reason: "undeclared", spoken: "meridian" }],
        )}
      />,
    );
    const row = document.querySelector("[data-slot='program']");
    expect(row).not.toBeNull();
    expect(row!.textContent).toMatch(/meridian/);
    expect(row!.textContent).toMatch(/not used/i);
    expect(row!.getAttribute("data-slot-refused")).not.toBeNull();
  });

  it("and it carries NO ARROW, because those words did not become the value used", () => {
    // THE RULING THIS FILE EXISTS TO HOLD. `spoken → resolved` asserts that what the reader
    // said BECAME what the system used. This slot resolved perfectly — `instance_label` is
    // right there — and was then discarded, so the arrow would be a true statement about the
    // resolver and a false one about the answer. Rendering it identically to an accepted slot
    // is WORSE than hiding it: a presence that misrepresents beats an absence for damage.
    render(
      <InterpretationStrip
        artifact={withRefusals(
          { program: { spoken: "meridian", instance_id: "NP-MERIDIAN", instance_label: "NP-MERIDIAN" } },
          [{ name: "program", reason: "undeclared", spoken: "meridian" }],
        )}
      />,
    );
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("the refusal REASON is the producer's own token, shown verbatim", () => {
    render(
      <InterpretationStrip
        artifact={withRefusals({}, [{ name: "wave", reason: "wrong_class", spoken: "Q3" }])}
      />,
    );
    expect(document.querySelector("[data-refused-reason='wrong_class']")).not.toBeNull();
  });

  it("a slot refused with NO resolution record still gets a row", () => {
    // `refused_slots` carries slots the resolver never touched, so a refusal cannot be
    // inferred from the resolution map. Sourcing rows from that map alone would drop this one
    // entirely — the same silent omission, one key over.
    render(
      <InterpretationStrip artifact={withRefusals({}, [{ name: "horizon", reason: "undeclared" }])} />,
    );
    expect(document.querySelector("[data-slot='horizon']")).not.toBeNull();
  });

  it("a slot ACCEPTED with no resolution record still gets a row", () => {
    // A menu PICK goes through `validate_bound_slots`, not the resolution ladder, so it can
    // reach the verb with no `slot_resolution` entry at all. It was used; it must be shown.
    render(
      <InterpretationStrip
        artifact={withRefusals({}, [], { capability_id: "C7" })}
      />,
    );
    const row = document.querySelector("[data-slot='capability_id']");
    expect(row).not.toBeNull();
    expect(row!.getAttribute("data-slot-refused")).toBeNull();
    expect(row!.textContent).toMatch(/C7/);
  });

  it("a refusal with no name is not attached to some other row", () => {
    // Guessing which slot an unnamed refusal belongs to would mark a slot as unused on no
    // evidence — inventing the one claim this strip must never make.
    render(
      <InterpretationStrip
        artifact={withRefusals(
          { site: { spoken: "Brandon", instance_id: "S2", instance_label: "Site B" } },
          [{ reason: "undeclared" }],
          { site: "S2" },
        )}
      />,
    );
    const row = document.querySelector("[data-slot='site']");
    expect(row!.getAttribute("data-slot-refused")).toBeNull();
    expect(row!.textContent).toMatch(/"Brandon" → Site B/);
  });

  it("a slot in BOTH accepted and refused is drawn as REFUSED", () => {
    // The two disagreeing is a producer bug, and a disagreement has a safe reading and an
    // unsafe one. The unsafe reading claims a discarded value was acted on.
    render(
      <InterpretationStrip
        artifact={withRefusals({}, [{ name: "program", reason: "undeclared" }], { program: "P1" })}
      />,
    );
    expect(
      document.querySelector("[data-slot='program']")!.getAttribute("data-slot-refused"),
    ).not.toBeNull();
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
