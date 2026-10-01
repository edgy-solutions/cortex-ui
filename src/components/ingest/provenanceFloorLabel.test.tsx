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
            provenance_floor: { obtained_via: "user-drop", ingest_ids: ["ing-1"], unidentified: 0 },
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
            provenance_floor: { obtained_via: "manual-export", ingest_ids: ["ing-2", "ing-3"], unidentified: 0 },
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
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "direct", ingest_ids: [], unidentified: 0 } },
        ])}
      />,
    );
    expect(document.querySelector('[data-provenance-floor="direct"]')).toBeTruthy();
  });

  // Its own case, so a banner drawn on empty ids is not masked by the chip assertion above
  // failing first (a mutant that drops the chip branch reddened only that line).
  it("draws NO warning banner when ingest_ids is empty AND unidentified is 0 — the near side", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: 0 } },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeNull();
  });

  // lane/74 `ead2f80d`: "a reader deciding 'is anything here unverified' must read ingest_ids AND
  // unidentified". Before this arm the label read ids alone, so these drops drew a calm chip.
  it("draws the banner for UNIDENTIFIED drops with no ids — they cannot be named, so they are counted", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "user-drop", ingest_ids: [], unidentified: 2 } },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).not.toBeNull();
    expect(document.querySelector("[data-provenance-floor-unidentified]")?.getAttribute("data-provenance-floor-unidentified")).toBe("2");
    expect(document.querySelector("[data-provenance-floor-unidentified]")?.textContent).toMatch(/^2 unidentified sources/);
    expect(document.querySelectorAll("[data-provenance-floor-ingest-id]")).toHaveLength(0);
    expect(document.querySelector("[data-provenance-floor]")).toBeNull();
  });

  it("names the ids AND counts the unidentified when both are present", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "user-drop", ingest_ids: ["sha256:aa"], unidentified: 1 } },
        ])}
      />,
    );
    expect([...document.querySelectorAll("[data-provenance-floor-ingest-id]")].map((e) => e.textContent)).toEqual(["sha256:aa"]);
    expect(document.querySelector("[data-provenance-floor-unidentified]")?.textContent).toMatch(/^1 unidentified source —/);
  });

  it("a banner over ids alone draws no unidentified line — the count's own near side", () => {
    render(
      <SemanticInterpreter
        payload={payload([
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "user-drop", ingest_ids: ["sha256:aa"], unidentified: 0 } },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).not.toBeNull();
    expect(document.querySelector("[data-provenance-floor-unidentified]")).toBeNull();
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
          { archetype: "SOME_ARCHETYPE_A", provenance_floor: { obtained_via: "vibes", ingest_ids: [], unidentified: 0 } },
        ])}
      />,
    );
    expect(document.querySelector("[data-provenance-floor-unverified]")).toBeNull();
    expect(document.querySelector("[data-provenance-floor]")).toBeNull();
  });
});
