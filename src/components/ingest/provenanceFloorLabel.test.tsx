/**
 * ADR-0041 §7, through SemanticInterpreter — the banner must be archetype-agnostic: it is
 * wired once, in the render loop over ALL components, not per archetype case. Two different
 * (unregistered, fallback-rendered) archetypes are used here on purpose, to prove the wiring
 * does not depend on which `case` in `renderComponent`'s switch happens to fire.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "../registry/SemanticInterpreter";

afterEach(cleanup);

const payload = (components: unknown[]) => ({ components });

describe("ProvenanceFloorLabel, wired through SemanticInterpreter", () => {
  it("draws the warning banner when ingest_ids is non-empty", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          {
            archetype: "SOME_ARCHETYPE_A",
            provenance_floor: { obtained_via: "user-drop", ingest_ids: ["ing-1"] },
          },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeTruthy();
    expect(document.querySelector('[data-provenance-floor-ingest-id="ing-1"]')).toBeTruthy();
    expect(document.querySelector("[data-provenance-floor]")).toBeNull();
  });

  it("draws the banner on a SECOND, different archetype too — archetype-agnostic wiring", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          {
            archetype: "SOME_OTHER_ARCHETYPE_B",
            provenance_floor: { obtained_via: "manual-export", ingest_ids: ["ing-2", "ing-3"] },
          },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeTruthy();
    expect(document.querySelector('[data-provenance-floor-ingest-id="ing-2"]')).toBeTruthy();
    expect(document.querySelector('[data-provenance-floor-ingest-id="ing-3"]')).toBeTruthy();
  });

  it("draws a quiet rung chip when ingest_ids is empty", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "direct", ingest_ids: [] } },
        ])}
      />,
    );
    expect(document.querySelector('[data-provenance-floor="direct"]')).toBeTruthy();
  });

  // Its own case, so a banner drawn on empty ids is not masked by the chip assertion above
  // failing first (a mutant that drops the chip branch reddened only that line).
  it("draws NO warning banner when ingest_ids is empty", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "user-drop", ingest_ids: [] } },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeNull();
  });

  it("does NOT draw when the field is absent", () => {
    render(<SemanticInterpreter payload={payload([{ archetype: "SOME_ARCHETYPE_A" }])} />);
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeNull();
    expect(document.querySelector("[data-provenance-floor]")).toBeNull();
  });

  it("does NOT draw for an unknown rung — malformed, refused rather than guessed", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "vibes", ingest_ids: [] } },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeNull();
    expect(document.querySelector("[data-provenance-floor]")).toBeNull();
  });
});
