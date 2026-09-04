/**
 * H06 AND E05, WALKED THROUGH THE REAL UI — the first human-shaped test of this path.
 *
 * The cards here are not invented. They are what `ask_card` emits for the two cases the
 * elicitation corpus carries as K04 and K13 (`docs/measurements/elicitation_corpus_v1.json`,
 * whose notes name them as H06 and E05 arriving from the slot corpus), field for field, with
 * the enumeration bound at BOTH the value deployed and the value ruled — because those are two
 * real states of the same system and they take DIFFERENT PATHS through this component.
 *
 * That is the point of walking them rather than asserting on a fixture: at bound 8 H06 is a
 * text field, at bound 10 it is a nine-option menu, and the corpus's own scripted answer is
 * ACCEPTED by the first and REFUSED by the second. Nothing about that is visible from either
 * end alone.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AskCard } from "./AskCard";
import { dispatchReroute } from "./rerouteDispatch";
import { BIND, RESPEAK, validateAsk, type Reroute } from "./Elicitation.contract";

afterEach(cleanup);

/** Render the card wired the way `AskCardConnected` wires it, and watch both seams. */
function walk(component: Record<string, unknown>) {
  const sent: string[] = [];
  const routed: Reroute[] = [];
  const state: { blocked?: string } = {};
  render(
    <AskCard
      component={component}
      onReroute={(reroute, ask) => {
        routed.push(reroute);
        state.blocked = dispatchReroute(reroute, ask, (q) => sent.push(q)).blocked;
      }}
    />,
  );
  return { sent, routed, state };
}

const base = {
  status: "slot_elicitation",
  disposition: "ask",
  // THE TYPED SUBJECT, minted 2026-09-03. Without it an ask had no output class and the
  // presentation agent could not select for it, so the card landed on KNOWLEDGE_DOCUMENT —
  // which is the fallback this whole archetype exists to stop borrowing.
  output_uri: "http://invincible-agent/mesh#SlotElicitation",
  reason: "slot-unfilled",
  spoken: "",
  found: "",
  truncated_from: 0,
  accepted_slots: {},
  data: "",
  sources: [],
};

/** H06 / K04 at the DEPLOYED bound of 8: Capability holds 9, so the provider says `too_many`. */
const H06_DEPLOYED = {
  ...base,
  verb_iri: "mesh:planCapabilityPath",
  sub_query: "what is the capability path",
  slot: "capability_id",
  options: [] as { value: string; label: string }[],
  option_source: "none",
  free_text_reason: "too_many",
  // NOT `truncated_from`. `too_many` cuts nothing — the provider returns no members at all —
  // so what was cut is 0 and what EXISTS is 9. Two numbers, and this is the one a reader wants.
  total_count: 9,
  message:
    "I need a capability and there are too many to list (9 to choose from). Nothing was run.",
};

/** The same case at the RULED bound of 10, where the nine become a real menu. */
const H06_RULED = {
  ...base,
  verb_iri: "mesh:planCapabilityPath",
  sub_query: "what is the capability path",
  slot: "capability_id",
  options: [
    { value: "C1", label: "Data Governance" },
    { value: "C2", label: "Master Data Management" },
    { value: "C3", label: "Analytics Delivery" },
    { value: "C4", label: "Supply Planning" },
    { value: "C5", label: "Order Management" },
    { value: "C6", label: "Customer Service" },
    { value: "C7", label: "Integration Platform" },
    { value: "C8", label: "Identity and Access" },
    { value: "C9", label: "Observability" },
  ],
  option_source: "enumeration",
  free_text_reason: null,
  message: "Which capability? Data Governance, ...",
};

/** E05 / K13: a real name of the WRONG KIND, arriving through the answer path. */
const E05 = {
  ...base,
  verb_iri: "mesh:planDependencyNeighborhood",
  sub_query: "what does it depend on",
  slot: "project_id",
  options: [] as { value: string; label: string }[],
  option_source: "none",
  free_text_reason: "too_many",
  total_count: 14,
  message: "I need a project and there are too many to list (14 to choose from). Nothing was run.",
};

describe("H06 — the bound case, at both bounds", () => {
  it("at the DEPLOYED bound it is a text field, and the corpus answer re-speaks", () => {
    const w = walk(H06_DEPLOYED);
    // "capability_id" is never read back at a person — the `_id` suffix is a fact about a
    // signature, and asking someone for an opaque key is what the menu exists to avoid.
    expect(screen.getByText(/Which/).textContent).toMatch(/capability\?/);
    expect(screen.getByText(/too many to list/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("answer: capability"), {
      target: { value: "Integration Platform" },
    });
    fireEvent.click(screen.getByRole("button", { name: "answer" }));

    expect(w.routed[0].action).toBe(RESPEAK);
    // The phrase the producer's `resolve_ask` composes, character for character — the two
    // sides cannot disagree about what was asked.
    expect(w.sent).toEqual(["what is the capability path (capability_id: Integration Platform)"]);
    expect(w.state.blocked).toBeUndefined();
  });

  it("at the RULED bound the same words would be REFUSED, because they are a label", () => {
    // The nine become a menu, so there is no text field, and the corpus's scripted answer is
    // now a display string rather than an id. This is why the two paths are separate: the same
    // characters are a legitimate answer on one and an invention on the other.
    const w = walk(H06_RULED);
    expect(document.querySelector("[data-ask-card] input")).toBeNull();
    expect(document.querySelectorAll("[data-ask-option]").length).toBe(9);

    fireEvent.click(screen.getByRole("button", { name: "Integration Platform" }));
    // Clicking the LABEL sends the VALUE — menu integrity is what makes that safe.
    expect(w.routed[0]).toMatchObject({ action: BIND, slots: { capability_id: "C7" } });
  });

  it("and at the ruled bound the answer CANNOT BE DELIVERED — the live cost of the missing route", () => {
    // Not a hypothetical gap. `resolve_ask` has no caller but a battery script, and cortex's
    // send path takes a bare string, so nothing on either side carries a pre-bound slot. The
    // board records the bound as ruled 8 -> 10, which makes H06 the FIRST live BIND case: the
    // day the enumerate fan-out lands, this menu appears and every pick on it stops here.
    const w = walk(H06_RULED);
    fireEvent.click(screen.getByRole("button", { name: "Observability" }));
    expect(w.routed[0].action).toBe(BIND);
    expect(w.sent).toEqual([]);
    expect(w.state.blocked).toMatch(/no route yet/);
  });
});

describe("E05 — a real name of the wrong kind", () => {
  it("re-speaks the words and binds NOTHING, which is what makes the removal possible", () => {
    // "ERP Modernization" is initiative I1 and the slot declares #Project. Binding it here
    // would put the user's own click behind a 422; re-speaking it lets the resolver report
    // `wrong_class` and REMOVE the value, which it can only do if it sees words.
    const w = walk(E05);
    fireEvent.change(screen.getByLabelText("answer: project"), {
      target: { value: "ERP Modernization" },
    });
    fireEvent.click(screen.getByRole("button", { name: "answer" }));

    expect(w.routed[0].action).toBe(RESPEAK);
    expect(w.routed[0].slots).not.toHaveProperty("project_id");
    expect(w.sent).toEqual(["what does it depend on (project_id: ERP Modernization)"]);
  });

  it("the count reaches the reader as a FIELD, and not by parsing the prose", () => {
    // THIS ASSERTION USED TO SAY THE OPPOSITE, and the inversion is the point. The walk filed
    // that the count lived only inside `message`, so a surface wanting to say "14 projects"
    // had to parse an English sentence. The producer carried it as `total_count` on
    // 2026-09-03; the test flips rather than being deleted, so the closure is recorded where
    // the gap was.
    const w = walk(E05);
    // Still 0, and still correct: `too_many` cuts nothing, so nothing was truncated.
    expect(E05.truncated_from).toBe(0);
    expect(document.querySelector("[data-total-count]")?.getAttribute("data-total-count")).toBe("14");
    expect(screen.getByText(/14 exist/)).toBeTruthy();
    expect(w.sent).toEqual([]);
  });

  it("does NOT report what was cut, because nothing was", () => {
    // The two numbers say different things and the card must not blend them. Showing
    // "14 matched" on a path that truncated nothing would invent a menu that was never bound.
    walk(E05);
    expect(document.body.textContent).not.toMatch(/matched/);
  });
});

describe("the two corpus cases do not blend", () => {
  it("BIND and RESPEAK are counted apart here, as the battery counts them apart", () => {
    const menu = walk(H06_RULED);
    fireEvent.click(screen.getByRole("button", { name: "Data Governance" }));
    cleanup();
    const words = walk(E05);
    fireEvent.change(screen.getByLabelText("answer: project"), { target: { value: "Atlas" } });
    fireEvent.click(screen.getByRole("button", { name: "answer" }));

    expect(menu.routed.map((r) => r.action)).toEqual([BIND]);
    expect(words.routed.map((r) => r.action)).toEqual([RESPEAK]);
    // One mechanism reaches the send path today and the other does not, which is the fact a
    // blended pass rate would hide.
    expect(menu.sent).toEqual([]);
    expect(words.sent.length).toBe(1);
  });
});

/** Guards the walk itself: a fixture that stopped being an ask would pass everything above. */
describe("the walk is walking", () => {
  it("every corpus card above is a VALID ask, not a refusal walked past", () => {
    for (const card of [H06_DEPLOYED, H06_RULED, E05]) {
      expect(validateAsk(card).kind, card.slot).toBe("ok");
    }
    expect(vi.isMockFunction(dispatchReroute)).toBe(false);
  });
});
