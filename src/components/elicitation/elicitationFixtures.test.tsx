/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, third card and the hardest classification.
 *
 * Fifteen attributes, THREE of which are absences a payload can flip. Naming the other twelve as
 * excluded is the work: an exclusion nobody recorded is indistinguishable from a branch nobody
 * looked at, and this card has more non-absence attributes than the other two combined.
 *
 * TWO EARLY RETURNS THAT ARE DIFFERENT FACTS. An abstain means NOTHING WAS RUN — no question
 * exists, so offering an input asks a person to do what can only fail. A refusal means the
 * PAYLOAD is malformed, in one of three ways with three repairs. Both stop the card; a card that
 * confused them would tell a reader their question was broken when the system simply had no
 * answer for it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AskCard } from "./AskCard";
import { ELICITATION_ABSENCES, ELICITATION_FIXTURES } from "./fixtures/elicitation";

afterEach(cleanup);

function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      out += " ";
    } else if (src.startsWith("//", i)) {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      out += " ";
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

const draw = (f: (typeof ELICITATION_FIXTURES)[number]) =>
  render(<AskCard component={f.component as unknown as Record<string, unknown>} />);

describe("ELICITATION fixtures discriminate", () => {
  it.each(ELICITATION_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      draw(f);
      for (const absence of ELICITATION_ABSENCES) {
        const present = document.querySelector(`[${absence}]`) !== null;
        expect(present, `${absence} expected ${f.declares.includes(absence) ? "present" : "ABSENT"}`).toBe(
          f.declares.includes(absence),
        );
      }
    },
  );

  it("every absence is FLIPPED by the set — both directions", () => {
    for (const absence of ELICITATION_ABSENCES) {
      expect(
        ELICITATION_FIXTURES.some((f) => f.declares.includes(absence)),
        `${absence} is never declared`,
      ).toBe(true);
      expect(
        ELICITATION_FIXTURES.some((f) => !f.declares.includes(absence)),
        `${absence} is declared by EVERY fixture — it cannot flip`,
      ).toBe(true);
    }
  });

  it("a REFUSAL carries its reason, and the three are told apart", () => {
    // Three producer mistakes with three repairs. Before this they were one attribute-less
    // element differing only in English.
    const reasons = new Set<string>();
    for (const f of ELICITATION_FIXTURES.filter((f) => f.refusedBecause)) {
      cleanup();
      draw(f);
      const el = document.querySelector("[data-ask-refused]")!;
      expect(el, `${f.name} did not refuse`).not.toBeNull();
      expect(el.getAttribute("data-ask-refused")).toBe(f.refusedBecause);
      reasons.add(f.refusedBecause!);
    }
    expect(reasons.size, "the set exercises fewer than all three refusal reasons").toBe(3);
  });

  it("an ABSTAIN is not a refusal — the distinction that matters most here", () => {
    // Nothing was run is not the payload is broken. Confusing them tells a reader their question
    // was malformed when the system simply had no answer for it.
    const abstains = ELICITATION_FIXTURES.filter((f) => f.declares.includes("data-ask-abstained"));
    expect(abstains.length).toBeGreaterThan(0);
    for (const f of abstains) {
      cleanup();
      draw(f);
      expect(document.querySelector("[data-ask-refused]"), "an abstain reported as a refusal").toBeNull();
    }
  });

  it("the card STOPS where the fixture says it stops, and draws where it does not", () => {
    // Both early returns produce a card with no other absence — because nothing was drawn, not
    // because the payload was complete. `data-ask-card` is the proof of which happened.
    for (const f of ELICITATION_FIXTURES) {
      cleanup();
      draw(f);
      const drew = document.querySelector("[data-ask-card]") !== null;
      expect(drew, `${f.name}: expected the card ${f.stops ? "to STOP" : "to draw"}`).toBe(!f.stops);
    }
  });

  it("some payload leaves the card quiet AND drawn — not stopped", () => {
    const quiet = ELICITATION_FIXTURES.filter((f) => f.declares.length === 0);
    expect(quiet.length, "no fixture exercises a complete question").toBeGreaterThan(0);
    for (const f of quiet) {
      cleanup();
      draw(f);
      expect(document.querySelector("[data-ask-card]"), `${f.name} declared nothing AND drew nothing`).not.toBeNull();
    }
  });

  /**
   * THE TWELVE THAT ARE NOT ABSENCES, each with its reason.
   *
   * This card has more non-absence attributes than the other two combined, so the exclusion list
   * is the substance rather than a footnote.
   */
  it("every attribute is either flipped or excluded BY NAME", () => {
    const EXCLUDED: Record<string, string> = {
      "data-ask-card": "the container — structural, present whenever a question is drawn",
      "data-ask-options": "the menu region — content, not a claim about what is missing",
      "data-ask-option": "one option — content",
      "data-option-source": "where the menu came from — provenance of what IS there",
      "data-total-count": "how many exist — a count the producer sent, not an absence",
      "data-ask-account": "the producer's account region — content",
      "data-ask-reason": "why the ask was raised — content; its absence is an ordinary ask",
      "data-ask-message": "the producer's prose — content",
      "data-ask-chosen": "which option the READER selected — reader state",
      "data-ask-answered": "the reader has answered — reader state",
      "data-ask-running": "a pick is in flight — reader state",
      "data-pick-refused": "the server refused a pick — a reader ACTION outcome, not a payload property. It cannot be flipped by a fixture because no payload produces it; only an interaction does.",
    };
    const src = stripComments(readFileSync(join(__dirname, "AskCard.tsx"), "utf8"));
    const rendered = [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
    const covered = new Set<string>([...ELICITATION_ABSENCES, ...Object.keys(EXCLUDED)]);
    expect(
      rendered.filter((a) => !covered.has(a)),
      "the card renders an attribute that is neither flipped nor excluded by name",
    ).toEqual([]);
  });
});
