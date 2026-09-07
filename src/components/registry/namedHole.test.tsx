/**
 * A CARD THAT RENDERS BECAUSE SOMETHING IS ABSENT — so every assertion here carries its control.
 *
 * The LangGraph lane nearly shipped a false green this week: `helm template` returned zero
 * occurrences of a retired engine, and the zero was because the render had FAILED with no
 * output. AN ABSENCE ASSERTION IS ONLY WORTH ITS POSITIVE CONTROL — and their own control caught
 * them twice more inside an hour, once asserting against the wrong render and once matching a
 * string the render never emits, so the matches they "found" were coincidences elsewhere.
 *
 * That shape is directly this component's. "The hole appears when the panel is empty" is
 * satisfied by a component that ALWAYS renders, so every appearance test below is paired with
 * the case that must NOT draw. The pairs are the assertion; neither half alone is one.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NamedHole } from "./NamedHole";
import { SemanticInterpreter } from "./SemanticInterpreter";
import { validateNamedHole, NAMED_HOLE_DISPOSITION } from "./NamedHole.contract";

afterEach(cleanup);

const hole = (over: Record<string, unknown> = {}) => ({
  archetype: "NAMED_HOLE",
  disposition: NAMED_HOLE_DISPOSITION,
  ...over,
});

const drew = () => document.querySelector("[data-named-hole]");

describe("it draws for the ONE state it is for, and not the others", () => {
  it("draws on `unentitled`", () => {
    render(<NamedHole component={hole()} />);
    expect(drew()).toBeTruthy();
  });

  it("does NOT draw on `unavailable` — the board refuses whole", () => {
    // ADR-0049 Ruling 4: the verb failed, timed out, or the queue refused. A hole there would
    // put a gap where the board should have refused entirely, and a shifted board is the
    // confidently-wrong answer in layout form.
    render(<NamedHole component={hole({ disposition: "unavailable" })} />);
    expect(drew()).toBeNull();
  });

  it("does NOT draw on `empty` — the panel's own rowless card belongs there", () => {
    // The verb answered and legitimately has nothing. That is a measurement; this is not.
    render(<NamedHole component={hole({ disposition: "empty" })} />);
    expect(drew()).toBeNull();
  });

  it("does NOT draw on a payload with no disposition at all", () => {
    render(<NamedHole component={{ archetype: "NAMED_HOLE" }} />);
    expect(drew()).toBeNull();
  });

  it("does NOT draw on something that is not a hole", () => {
    render(<NamedHole component={{ archetype: "PERIOD_SERIES", rows: [] }} />);
    expect(drew()).toBeNull();
  });

  it("does NOT draw on a payload that is not a record at all", () => {
    // Every case above passes an OBJECT, so the guard that refuses a non-record was never
    // reached and a mutation deleting it survived. A test that never reaches its own subject
    // is not a test of it.
    for (const junk of [null, undefined, "unentitled", 7, [] as unknown]) {
      cleanup();
      render(<NamedHole component={junk} />);
      expect(drew(), String(junk)).toBeNull();
    }
  });
});

describe("it is visibly a CARD, because blank already means something else here", () => {
  it("renders a stated reason, not an empty frame", () => {
    // The interpretation strip draws NOTHING on absence, by design, so a faded box would read
    // as "nothing was captured" — the opposite of "something is here and you may not have it".
    const { container } = render(<NamedHole component={hole()} />);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(30);
    expect(drew()!.className).toMatch(/glass-panel/);
  });

  it("says the always-true thing when the producer sent no specifics", () => {
    render(<NamedHole component={hole()} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/not available to you/);
    // And it says the board is intact — the failure mode being avoided is a reader concluding
    // the page broke.
    expect(text).toMatch(/board is complete/);
  });
});

describe("the existence oracle: it says only what it was told", () => {
  it("names the panel ONLY when the producer named it", () => {
    // ADR-0050 §5 FLAGS AND DOES NOT RULE whether the hole may name what it is. Disclosing that
    // the panel exists and that this caller lacks it may itself be the protected fact, and the
    // decision belongs to the enforcement overlay per classification.
    render(<NamedHole component={hole({ panel_label: "Program cost" })} />);
    expect(document.querySelector("[data-hole-panel]")?.textContent).toBe("Program cost");
    cleanup();
    render(<NamedHole component={hole()} />);
    expect(document.querySelector("[data-hole-panel]")).toBeNull();
  });

  it("does not put the VERB where the panel's name would have gone", () => {
    // The subtle version of inventing a name: with no `panel_label`, a component that fell back
    // to the verb would disclose exactly what the enforcement overlay may be withholding —
    // while every assertion about `data-hole-panel` still passed, because the fallback is a
    // different element. A mutation doing precisely that survived the first pass.
    render(<NamedHole component={hole({ verb_iri: "fin:programCost" })} />);
    const heading = document.querySelector("h3")!;
    expect(heading.textContent).toBe("A panel here is not available to you");
    expect(heading.textContent).not.toMatch(/programCost/);
  });

  it("names the VERB only when the producer sent it, and never derives one", () => {
    // The one direction that cannot be taken back. A component that fell back to naming a verb
    // from an IRI it happens to hold would be deciding an emission policy two ADRs left open.
    render(<NamedHole component={hole({ verb_iri: "fin:programCost" })} />);
    expect(document.querySelector("[data-hole-verb]")?.textContent).toBe("fin:programCost");
    cleanup();
    render(<NamedHole component={hole({ panel_label: "Program cost" })} />);
    expect(document.querySelector("[data-hole-verb]")).toBeNull();
  });

  it("renders the producer's reason verbatim rather than paraphrasing it", () => {
    render(<NamedHole component={hole({ reason: "PROGRAM_FINANCE is not in your grants." })} />);
    expect(document.querySelector("[data-hole-reason]")?.textContent).toBe(
      "PROGRAM_FINANCE is not in your grants.",
    );
  });
});

describe("the interpreter dispatches it, or the component is one nothing renders", () => {
  it("a NAMED_HOLE payload reaches this card through the interpreter", () => {
    render(<SemanticInterpreter payload={{ components: [hole({ panel_label: "Program cost" })] }} />);
    expect(drew()).toBeTruthy();
    expect(document.body.textContent).toMatch(/Program cost/);
  });

  it("and an ordinary answer does NOT — the control on the line above", () => {
    // Without this, an interpreter that drew a hole for everything would pass.
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "KNOWLEDGE_DOCUMENT", markdown_content: "hello" }] }}
      />,
    );
    expect(drew()).toBeNull();
    expect(document.body.textContent).toMatch(/hello/);
  });
});

describe("the reader refuses what the card must not draw", () => {
  it("accepts only the one disposition", () => {
    expect(validateNamedHole(hole()).kind).toBe("ok");
    for (const d of ["unavailable", "empty", "refused", ""]) {
      expect(validateNamedHole(hole({ disposition: d })).kind, d).toBe("empty");
    }
  });

  it("distinguishes 'no disposition' from 'a disposition I do not draw'", () => {
    // Two different producer mistakes with two different fixes, and one refusal message for
    // both would hide which one happened.
    const none = validateNamedHole({ archetype: "NAMED_HOLE" });
    const other = validateNamedHole(hole({ disposition: "unavailable" }));
    expect(none.kind === "empty" && none.reason).toBe("the hole names no disposition");
    expect(other.kind === "empty" && other.reason).toBe("this is not a named hole");
  });
});
