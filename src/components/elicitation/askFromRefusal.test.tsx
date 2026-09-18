/**
 * AN ASK MADE OF A REFUSAL, AND AN ASK MADE OF AN ABSTAIN.
 *
 * Both arrive as ELICITATION — ruled 2026-09-17, against my own argument that `slot` means which
 * DECLARATION is missing and a verb IRI there is a borrowed name. The ruling: an abstain does
 * have a missing declaration and it is the verb itself, so `slot: "verb"` names what is absent
 * rather than borrowing a name for something else. Recorded because the argument will be raised
 * again by a later reader, and the answer is better than my objection.
 *
 * ── THE SHAPES, READ AT THE PRODUCER'S COMMIT `ac3a221` AND NOT FROM A MESSAGE ────────────
 *
 *   refusal   slot="rate_vintage"  option_source="refusal"     reason=<outcome>  message=<prose>
 *   abstain   slot="verb"          option_source="candidates"  reason="no_verb_classified"
 *
 * ── AND `message` WAS ARRIVING HERE ALL ALONG, UNREAD ─────────────────────────────────────
 *
 * It has been declared in the contract and validated into the payload since before this card
 * existed, and nothing rendered it. A correct field with no reader — the `available` defect, in
 * this repo rather than someone else's, found by tracing the shape of the work rather than by
 * anything failing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AskCard } from "./AskCard";
import { validateAsk } from "./Elicitation.contract";
import { unconsumedFields } from "@/lib/unconsumedFields";

afterEach(cleanup);

/** The refusal ask, as the producer projects it. */
const REFUSAL = {
  archetype: "ELICITATION",
  slot: "rate_vintage",
  option_source: "refusal",
  options: [{ value: "2022-02-01", label: "2022-02-01" }],
  reason: "not_in_model",
  message: "no rate set for fiscal year 2022 at vintage 2021-02-01",
};

/** The abstain ask. Options are VERBS. */
const ABSTAIN = {
  archetype: "ELICITATION",
  slot: "verb",
  option_source: "candidates",
  options: [
    { value: "mesh:costSupplierConcentration", label: "Supplier concentration" },
    { value: "mesh:costLotBreakdown", label: "Lot breakdown" },
  ],
  reason: "no_verb_classified",
  message: "No registered capability confidently fit that question.",
};

describe("a refusal that names your options draws them", () => {
  it("renders the menu, the outcome token and the producer's prose", () => {
    render(<AskCard component={REFUSAL} />);
    const account = document.querySelector("[data-ask-account]")!;
    expect(account).not.toBeNull();
    // The token, VERBATIM — no vocabulary of outcomes on this surface.
    expect(account.querySelector("[data-ask-reason]")!.getAttribute("data-ask-reason")).toBe(
      "not_in_model",
    );
    // The sentence a reader acts on, which was being dropped.
    expect(account.textContent).toContain("no rate set for fiscal year 2022");
    // And the menu is what to do instead.
    expect(document.body.textContent).toContain("2022-02-01");
  });

  it("says the menu is what THIS ONE accepts, not everything of its kind", () => {
    // `refusal` is kept distinct from `enumeration` on purpose: no enumerate provider was asked,
    // the engine recomputed the legal values while refusing. A reader who can tell those apart
    // knows whether the list is scoped to their question.
    render(<AskCard component={REFUSAL} />);
    const src = document.querySelector("[data-option-source]")!;
    expect(src.getAttribute("data-option-source")).toBe("refusal");
    expect(src.textContent).toMatch(/what this one accepts/i);
    expect(src.textContent).not.toMatch(/everything of this kind/i);
  });

  it("renders the abstain's VERB menu and says what the options are", () => {
    render(<AskCard component={ABSTAIN} />);
    expect(document.body.textContent).toContain("Supplier concentration");
    const src = document.querySelector("[data-option-source]")!;
    expect(src.textContent).toMatch(/capabilities that were considered/i);
    expect(document.querySelector("[data-ask-reason]")!.textContent).toBe("no_verb_classified");
  });

  it("renders NOTHING extra when neither reason nor message came — the control", () => {
    // Without this, a card that always drew the account block would pass everything above while
    // putting an empty amber line on every ordinary ask in the system.
    render(
      <AskCard
        component={{
          archetype: "ELICITATION",
          slot: "capability_id",
          option_source: "enumeration",
          options: [{ value: "C1", label: "Data Governance" }],
        }}
      />,
    );
    expect(document.querySelector("[data-ask-account]")).toBeNull();
  });

  it("keeps `reason` and `free_text_reason` apart — they mean opposite things", () => {
    // `free_text_reason` says why there is NO menu and is required when options are empty.
    // `reason` says why the ask was RAISED and arrives when there IS one. A card reading one for
    // the other would report "too many to list" on a card showing two options.
    const ask = validateAsk(REFUSAL);
    if (ask.kind !== "ok") throw new Error("expected a valid ask");
    expect(ask.ask.reason).toBe("not_in_model");
    expect(ask.ask.free_text_reason).toBeNull();
    expect(ask.ask.options).toHaveLength(1);
  });

  it("the contract DECLARES reason, so the unread-fields control stays quiet on it", () => {
    // Otherwise the panel built this morning would flag `reason` on every refusal ask — a real
    // finding the first time and noise forever after, which is how a control gets switched off.
    const r = unconsumedFields(REFUSAL);
    expect(r.status, JSON.stringify(r)).toBe("all_read");
  });
});

/**
 * A THIRD KIND OF UNNAMED CLAIM — ADR-0055 step 1, the third card.
 *
 * `AskCard` went in at 13 branches / 14 attributes, the best ratio of the three, and the ratio
 * predicted it would be clean. It was not, and the finding is not the em-dash family: it is a
 * CONDITIONAL REQUIREMENT stated in prose, declared optional, and enforced nowhere.
 *
 *   the field's own doc   "Required WHENEVER options are empty"
 *   the field             `required: false`
 *   `validateAsk`         reads it; checks no conditional
 *   the card              renders the explanation ONLY when one arrived
 *
 * So an empty menu with no reason produced a free-text box and silence — the shrug the card's own
 * comment says must never happen. The reader could not tell "too many to list" from "no provider
 * registered" from "the producer forgot", and those have three different repairs.
 *
 * ⛔ THE GAP IS NAMED, NOT FILLED. This card does not invent a reason it was not given.
 */
describe("an empty menu with no reason is itself declared", () => {
  const bare = (over: Record<string, unknown> = {}) => ({
    archetype: "ELICITATION",
    slot: "rate_vintage",
    options: [],
    ...over,
  });

  it("says the reason is MISSING when the producer sent none", () => {
    render(<AskCard component={bare()} />);
    const el = document.querySelector("[data-no-menu-unexplained]");
    expect(el, "an unexplained empty menu rendered as a shrug").not.toBeNull();
    expect(el!.textContent).toMatch(/no reason was given/i);
  });

  it("does NOT say it when the producer explained — the control", () => {
    // Without this, a card that always claimed the reason was missing would pass the test above
    // while contradicting every honest `free_text_reason` the producer does send.
    render(<AskCard component={bare({ free_text_reason: "too_many" })} />);
    expect(document.querySelector("[data-no-menu-unexplained]")).toBeNull();
    expect(document.querySelector("[data-free-text-reason]")).not.toBeNull();
  });

  it("does NOT say it when there IS a menu — the second control", () => {
    // An ask with options needs no explanation for their absence, and claiming one would put an
    // amber line on every working menu in the system.
    render(
      <AskCard component={bare({ options: [{ value: "2022-02-01", label: "2022-02-01" }] })} />,
    );
    expect(document.querySelector("[data-no-menu-unexplained]")).toBeNull();
  });

  it("names the gap without INVENTING a reason for it", () => {
    // The card has four reason words in its vocabulary and must not reach for one. Naming the
    // omission is honest; guessing `too_many` would be manufacturing the producer's claim.
    render(<AskCard component={bare()} />);
    const text = document.querySelector("[data-no-menu-unexplained]")!.textContent!;
    for (const invented of ["too many", "unsupported", "no provider", "not a name"]) {
      expect(text.toLowerCase()).not.toContain(invented);
    }
  });
});
