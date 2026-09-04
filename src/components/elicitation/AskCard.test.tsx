/**
 * A PICK IS VALIDATED AGAINST WHAT WAS OFFERED, NOT AGAINST A VOCABULARY.
 *
 * K11 is the canonical case and it is deliberately counter-intuitive: a REAL, existing,
 * perfectly valid id that was not on this menu is REFUSED. An id the card never showed cannot
 * have come from the reader reading it, and the one place it can have come from is something
 * inventing it — which is the hole select-from-authorized-set exists to close.
 *
 * The check is ported from the producer's `validate_pick` rather than approximated, and it is
 * the third copy of that function for the reason the second one gives: engine images do not
 * ship the package that would carry an import, and a browser can import neither. The agreement
 * is pinned by behaviour, exactly as they pin theirs.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AskCard } from "./AskCard";
import {
  BIND,
  PickRefused,
  RESPEAK,
  resolveAsk,
  validateAsk,
  validatePick,
  ELICITATION_OPTION_SOURCES,
  ELICITATION_FREE_TEXT_REASONS,
} from "./Elicitation.contract";

afterEach(cleanup);

/** The producer's wire card, field for field. */
const card = (over: Record<string, unknown> = {}) => ({
  archetype: "ELICITATION",
  status: "slot_elicitation",
  disposition: "ask",
  verb_iri: "fin:varianceDrivers",
  sub_query: "what is driving the cost variance",
  slot: "program_id",
  reason: "slot-unfilled",
  spoken: "",
  found: "",
  options: [
    { value: "P1", label: "Notional Program Meridian" },
    { value: "P2", label: "Programme Atlas" },
  ],
  option_source: "enumeration",
  free_text_reason: null,
  truncated_from: 0,
  accepted_slots: { variance_kind: "cost" },
  message: "which program?",
  ...over,
});

const ask = (over: Record<string, unknown> = {}) => {
  const r = validateAsk(card(over));
  if (r.kind !== "ok") throw new Error("fixture is not a valid ask: " + r.kind);
  return r.ask;
};

describe("select-from-authorized-set, enforced rather than prompted", () => {
  it("K11 — a REAL id that was not offered is refused", () => {
    // The whole seal. "P9" may be a perfectly good program; it was not on this menu, so a
    // reader cannot have chosen it, so accepting it would accept something's invention.
    expect(() => validatePick("P9", ask().options)).toThrow(PickRefused);
  });

  it("names the closest match and refuses anyway", () => {
    // Naming a near miss helps a caller correct itself. Accepting one would be the gate
    // apologising its way open, which is why the producer's version is explicit about doing
    // both, and this is deliberately identical.
    try {
      validatePick("P", ask().options);
      throw new Error("should have refused");
    } catch (e) {
      expect(e).toBeInstanceOf(PickRefused);
      expect((e as Error).message).toMatch(/Closest: P1, P2/);
    }
  });

  it("matches on VALUE, never on the label a person reads", () => {
    // A label is what the reader sees; an id is what the verb takes. Accepting the label would
    // be this card deciding which of the two the caller meant.
    expect(validatePick("P1", ask().options)).toBe("P1");
    expect(() => validatePick("Notional Program Meridian", ask().options)).toThrow(PickRefused);
  });

  it("an empty answer is not a pick", () => {
    expect(() => resolveAsk(ask(), "   ")).toThrow(PickRefused);
  });

  it("the surface OFFERS exactly the authorized set and nothing else", () => {
    // The structural half of the seal: there is no affordance in the DOM carrying a value that
    // was not offered, so a fabricated pick has no way in through the UI. A free-text box
    // alongside a menu would be exactly that way in, which is why there is not one.
    render(<AskCard component={card()} onReroute={vi.fn()} />);
    const offered = [...document.querySelectorAll("[data-ask-option]")].map((e) =>
      e.getAttribute("data-ask-option"),
    );
    expect(offered).toEqual(["P1", "P2"]);
    expect(document.querySelector("[data-ask-card] input")).toBeNull();
  });

  it("a refused answer is SHOWN and dispatches nothing", () => {
    // The behavioural half: when the validator refuses, the component reports it and the
    // re-route is never called. Nothing is quietly corrected into something acceptable.
    const onReroute = vi.fn();
    render(
      <AskCard
        component={card({ options: [], option_source: "none", free_text_reason: "too_many" })}
        onReroute={onReroute}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "answer" }));
    expect(document.querySelector("[data-pick-refused]")).not.toBeNull();
    expect(onReroute).not.toHaveBeenCalled();
  });

  it("an offered pick DOES dispatch, so the refusals above are not a dead path", () => {
    // Red-proofs the two tests above: if the button never dispatched at all they would pass
    // for the wrong reason.
    const onReroute = vi.fn();
    render(<AskCard component={card()} onReroute={onReroute} />);
    fireEvent.click(screen.getByRole("button", { name: "Programme Atlas" }));
    expect(onReroute).toHaveBeenCalledTimes(1);
    expect(onReroute.mock.calls[0][0]).toMatchObject({ action: BIND, slots: { program_id: "P2" } });
  });
});

describe("the two answer paths are dispatched differently", () => {
  it("a menu pick BINDS, merged onto the slots the first turn already filled", () => {
    // `accepted_slots` is load-bearing: binding only the answered slot would suppress filling
    // of every other slot the first turn got right.
    const r = resolveAsk(ask(), "P1");
    expect(r.action).toBe(BIND);
    expect(r.slots).toEqual({ variance_kind: "cost", program_id: "P1" });
    expect(r.query).toBe("");
  });

  it("free text is RE-SPOKEN as a phrase, never bound", () => {
    // Binding `program_id = "Wave 1 Cutover"` would put a human's typing where an id belongs
    // and reach the engine as a 422 — the failure the tri-state exists to prevent.
    const r = resolveAsk(ask({ options: [], option_source: "none", free_text_reason: "too_many" }), "Meridian");
    expect(r.action).toBe(RESPEAK);
    expect(r.query).toBe("what is driving the cost variance (program_id: Meridian)");
    // And it carries no invented binding for the slot it was asked about.
    expect(r.slots).not.toHaveProperty("program_id");
  });

  it("no menu never means anything is acceptable — the reason is always recorded", () => {
    // Every free_text_reason says why a list could not be offered, not that one was
    // unnecessary. A card with no options and no reason is a gap wearing a shrug.
    for (const reason of ELICITATION_FREE_TEXT_REASONS) {
      cleanup();
      render(<AskCard component={card({ options: [], option_source: "none", free_text_reason: reason })} />);
      expect(document.querySelector(`[data-free-text-reason="${reason}"]`)).not.toBeNull();
    }
  });
});

describe("the card is a question and does not look like an answer", () => {
  it("draws no card chrome — no panel, no title, no freshness", () => {
    // It fell through to KNOWLEDGE_DOCUMENT before this archetype existed, which put a request
    // for input in the answer rail wearing a document's frame.
    const { container } = render(<AskCard component={card()} />);
    const root = container.querySelector("[data-ask-card]")!;
    expect(root).toBeTruthy();
    expect(root.className).not.toMatch(/glass-panel/);
    expect(container.textContent).not.toMatch(/valid as of|state v/);
  });

  it("REFUSES to draw an ask that names no slot", () => {
    // A card that cannot say what it wants is not a question, and an empty prompt invites an
    // answer to nothing. The re-route refuses the same shape on the other side of the wire.
    render(<AskCard component={card({ slot: "" })} />);
    expect(screen.getByText(/names no slot/)).toBeTruthy();
  });

  it("never renders on a payload that is not an ask", () => {
    render(<AskCard component={{ archetype: "PERIOD_SERIES", rows: [] }} />);
    expect(document.querySelector("[data-ask-card]")).toBeNull();
  });

  it("REFUSES to draw an answer field on an ABSTAIN, which wears the same status", () => {
    // The seal as dispatched, and it is not hypothetical: the producer emits one card shape for
    // route/ask/abstain, all three carrying status "slot_elicitation". An abstain says nothing
    // was run and there is NOTHING to choose from — a reply to it cannot route, so a surface
    // switching on the status alone asks a person to do something that can only fail.
    const onReroute = vi.fn();
    render(
      <AskCard
        component={card({
          disposition: "abstain",
          options: [],
          option_source: "none",
          spoken: "Meridien",
          message: "I could not find anything called 'Meridien'. Nothing was run.",
        })}
        onReroute={onReroute}
      />,
    );
    expect(document.querySelector("[data-ask-card]")).toBeNull();
    expect(document.querySelector("[data-ask-card] input")).toBeNull();
    expect(document.querySelectorAll("button").length).toBe(0);
    // And the producer's honest prose is what shows, because that is what it was written for.
    expect(screen.getByText(/Nothing was run/)).toBeTruthy();
  });

  it("refuses an ABSTAIN that arrives with only its STATUS, and no disposition", () => {
    // THE SECOND LEVER, and it is not redundant. The producer split the status on 2026-09-03 so
    // a consumer switching on EITHER field is correct — which is only true if this card checks
    // both. A card that lost its `disposition` in transit would otherwise fall through and be
    // drawn as a question, the same defect arriving through a different hole.
    const onReroute = vi.fn();
    const { disposition: _dropped, ...noDisposition } = card();
    render(
      <AskCard
        component={{ ...noDisposition, status: "slot_abstain", options: [], option_source: "none" }}
        onReroute={onReroute}
      />,
    );
    expect(document.querySelector("[data-ask-card]")).toBeNull();
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(document.querySelector("[data-ask-abstained]")).not.toBeNull();
  });

  it("refuses a STATUS it does not know, even when the disposition says ask", () => {
    // Disagreement between the two fields is not something to resolve by picking the
    // convenient one. An unrecognised status is a shape this component was not built for.
    render(<AskCard component={card({ status: "something_new" })} />);
    expect(document.querySelector("[data-ask-card]")).toBeNull();
    expect(screen.getByText(/not an ask/)).toBeTruthy();
  });

  it("draws normally when BOTH fields agree it is an ask", () => {
    // Red-proofs the two above: if the guard refused everything they would pass for the wrong
    // reason and the card would never render at all.
    render(<AskCard component={card()} />);
    expect(document.querySelector("[data-ask-card]")).not.toBeNull();
    expect(document.querySelectorAll("[data-ask-option]").length).toBe(2);
  });

  it("refuses a disposition it does not know rather than guessing", () => {
    render(<AskCard component={card({ disposition: "route" })} />);
    expect(document.querySelector("[data-ask-card]")).toBeNull();
    expect(screen.getByText(/not an ask/)).toBeTruthy();
  });

  it("keeps a wrong-class candidate as CONTEXT rather than offering it", () => {
    // A candidate of the wrong class is evidence the reader was understood, not an option they
    // can pick — offering it would break menu integrity, since it would not route.
    render(<AskCard component={card({ found: "ERP Modernization" })} />);
    expect(screen.getByText(/ERP Modernization/)).toBeTruthy();
    expect(document.querySelector('[data-ask-option="ERP Modernization"]')).toBeNull();
  });

  it("says how many matched when the menu was bounded", () => {
    // A menu of eight drawn from fourteen is a different object from a menu of eight that is
    // all of them, and a reader choosing from the first should know the rest exist.
    render(<AskCard component={card({ truncated_from: 14 })} />);
    expect(screen.getByText(/14 matched/)).toBeTruthy();
  });
});

describe("each option_source renders distinguishably", () => {
  it("all four are distinct on screen, and none of them is the raw token", () => {
    // The seal as dispatched. "Where did this list come from" is a different question for each
    // of the four, and a reader deciding whether the menu is exhaustive needs the answer.
    const seen = new Set<string>();
    for (const source of ELICITATION_OPTION_SOURCES) {
      if (source === "none") continue; // no menu, so no source line — covered above
      cleanup();
      render(<AskCard component={card({ option_source: source })} />);
      const el = document.querySelector(`[data-option-source="${source}"]`)!;
      expect(el, `${source} does not render`).toBeTruthy();
      const text = (el.textContent ?? "").trim();
      expect(text.length, `${source} renders empty`).toBeGreaterThan(0);
      expect(text, `${source} renders as its raw token`).not.toBe(source);
      seen.add(text);
    }
    expect(seen.size, "two sources read identically").toBe(3);
  });
});
