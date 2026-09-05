/**
 * THE FALLBACK CARD'S HEADING — an IRI is not a title.
 *
 * KNOWLEDGE_DOCUMENT is where every unregistered archetype lands, so its heading is whatever
 * the producer happened to put in `subject_concept`. For a slot elicitation that is the VERB,
 * and it was printed raw: `mesh:finFundingStatus`, in 20px bold, as the name of the card.
 *
 * Rendering the local name is a PROJECTION of the value the producer sent, not a name invented
 * for it — which is why prose is left exactly as written. Humanising a subject someone actually
 * authored is how a title becomes a fabrication, and the gate between those two cases is the
 * thing worth testing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "./SemanticInterpreter";

afterEach(cleanup);

const doc = (subject?: string) => ({
  archetype: "KNOWLEDGE_DOCUMENT",
  subject_concept: subject,
  markdown_content: "Which program? Name it and I will run this.",
});

const heading = () => document.querySelector("h3")?.textContent ?? "";

describe("an identifier is rendered as a name", () => {
  it("a compact IRI loses its prefix and reads as words", () => {
    render(<SemanticInterpreter payload={{ components: [doc("mesh:finFundingStatus")] }} />);
    expect(heading()).toBe("Fin Funding Status");
    expect(heading()).not.toMatch(/mesh:/);
  });

  it("a full IRI resolves to its local name", () => {
    render(<SemanticInterpreter payload={{ components: [doc("http://invincible-agent/mesh#SlotElicitation")] }} />);
    expect(heading()).toBe("Slot Elicitation");
    expect(heading()).not.toMatch(/http|#/);
  });

  it("the document still renders — the heading is not the whole card", () => {
    // Positive control. A change that broke the render entirely would satisfy every assertion
    // above about what the heading does NOT contain.
    render(<SemanticInterpreter payload={{ components: [doc("mesh:finFundingStatus")] }} />);
    expect(screen.getByText(/Name it and I will run this/)).toBeTruthy();
  });
});

describe("prose is left exactly as it was written", () => {
  it("a real subject is not re-cased, re-spaced or trimmed", () => {
    // THE GATE. `fallbackSubjectLabel` lower-cases and splits on capitals, so running it over
    // an authored title would quietly rewrite it — "Operations and Maintenance" is a name
    // someone chose, not an identifier to be decoded.
    render(<SemanticInterpreter payload={{ components: [doc("Operations and Maintenance")] }} />);
    expect(heading()).toBe("Operations and Maintenance");
  });

  it("a multi-word subject with a colon inside it is still prose", () => {
    // A colon does not make a string an IRI. `looksLikeIri` requires no whitespace after it,
    // which is what keeps a title like this out of the identifier branch.
    render(<SemanticInterpreter payload={{ components: [doc("Funding: the FY26 picture")] }} />);
    expect(heading()).toBe("Funding: the FY26 picture");
  });

  it("no subject at all falls back to the card's own name", () => {
    render(<SemanticInterpreter payload={{ components: [doc(undefined)] }} />);
    expect(heading()).toBe("Knowledge Document");
  });
});
