/**
 * THE `noAbsence` CLAIM, CHECKED — ADR-0055 §2 as amended by the cortex dispatch of 2026-10-08.
 *
 * `index.ts` declares that no `data-*` attribute of this card flips with the payload. This
 * renders the WHOLE parity population (the fixtures plus the renderable captures), takes each
 * card's own subtree, and asks `flippingDataAttributes` which names are present under some cards
 * and absent under others. `[]` is the claim; anything else means the card has an absence to
 * declare.
 *
 * Each card is rendered the way the dispatch renders it (payload key, then `pick(reads)`, then
 * the explicit freshness pair), BARE — not through `SemanticInterpreter` — so the interpreter's
 * own `data-raw-field(s)` section is outside the subtree, exactly as `fixtures.test.tsx` scoped
 * `cardRoot` for the packages that declare absences.
 *
 * INTERACTION_ONLY is `data-cell-inspector` for this card: the detail panel opens on a click, so no static render
 * can carry it and it is not a payload-dependent fact (ADR-0055 amendment 2026-09-18 §1).
 */
import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import pkg from "./index";
import { pick } from "../defineArchetype";
import { flippingDataAttributes } from "../noAbsence.testkit";
import { parityComponents } from "./parityPopulation.testkit";

afterEach(cleanup);

const INTERACTION_ONLY: readonly string[] = ["data-cell-inspector"];

const readCapture = (f: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "../../../sessions", f), "utf8"));

function cardSubtrees(): Element[] {
  const roots: Element[] = [];
  for (const component of Object.values(parityComponents(readCapture))) {
    const Card = pkg.Card as React.ComponentType<Record<string, unknown>>;
    const props = {
      [pkg.row.payload_key]: component[pkg.row.payload_key],
      ...pick(component, pkg.reads),
      valid_as_of: component.valid_as_of,
      state_version: component.state_version,
    };
    const { container } = render(<Card {...props} />);
    // Detach a copy: cleanup() empties the container, and the subtree must outlive it.
    roots.push(container.cloneNode(true) as Element);
    cleanup();
  }
  return roots;
}

describe("SHORTFALL_GRID declares noAbsence — and the population bears it out", () => {
  it("the declaration is present (this seal is for packages that make it)", () => {
    expect(pkg.noAbsence, "no noAbsence declared").toBeDefined();
    expect(pkg.absences).toEqual([]);
  });

  it("floor: one subtree per population member, and at least one", () => {
    const roots = cardSubtrees();
    expect(roots.length).toBeGreaterThanOrEqual(1);
    expect(roots.length).toBe(Object.keys(parityComponents(readCapture)).length);
    // every card draws at least its wrapper — even the refusals
    expect(roots.every((r) => r.querySelector("*") !== null), "a card rendered nothing").toBe(true);
  });

  it("no data-* attribute flips across the population (interaction-only excepted)", () => {
    const flipping = flippingDataAttributes(cardSubtrees(), INTERACTION_ONLY);
    expect(
      flipping,
      `a payload-flippable attribute appeared: ${flipping.join(", ")} — declare it in absences and drop noAbsence`,
    ).toEqual([]);
  });
});
