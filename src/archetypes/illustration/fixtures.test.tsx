/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, for `ILLUSTRATION`.
 *
 * Same walk as `workflow-case/fixtures.test.tsx`, adapted for a card that fetches: every fixture
 * whose state is not one of the four static ones (`media-unknown`/`undrawable`/`unserved`/
 * `path-refused`) resolves asynchronously, through a mocked `@/api/client`, so each assertion
 * waits past `loading` before reading the declared absences.
 */
import type React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Illustration } from "./Card";
import { archetypePackage } from "../registry";
import { readDeclaredAbsences } from "../defineArchetype";
import { ILLUSTRATION_ABSENCES, ILLUSTRATION_FIXTURES, SVG_FIXTURE } from "./fixtures";

vi.mock("@/api/client", () => ({
  fetchIllustrationContent: vi.fn(() => Promise.resolve(SVG_FIXTURE)),
}));

afterEach(cleanup);

function renderedAttributes(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
}

type CardProps = React.ComponentProps<typeof Illustration>;

const draw = (f: (typeof ILLUSTRATION_FIXTURES)[number]) =>
  render(<Illustration {...({ illustration: f.payload } as unknown as CardProps)} />);

/** Waits past `loading` — a no-op for the four static states, which never pass through it. */
async function settle(container: ParentNode) {
  await waitFor(() => {
    const el = container.querySelector('[data-archetype="ILLUSTRATION"]');
    expect(el?.getAttribute("data-illustration-state")).not.toBe("loading");
  });
}

describe("ILLUSTRATION fixtures discriminate", () => {
  it.each(ILLUSTRATION_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    async (_name, f) => {
      const { container } = draw(f);
      await settle(container);
      const declared = readDeclaredAbsences(container, ILLUSTRATION_ABSENCES);
      expect(declared.slice().sort()).toEqual(f.declares.slice().sort());
    },
  );

  it("every declared absence is flipped by the set, both directions", () => {
    for (const absence of ILLUSTRATION_ABSENCES) {
      const declaredBySome = ILLUSTRATION_FIXTURES.some((f) => f.declares.includes(absence));
      const undeclaredBySome = ILLUSTRATION_FIXTURES.some((f) => !f.declares.includes(absence));
      expect(declaredBySome, `${absence} is never declared by any fixture`).toBe(true);
      expect(undeclaredBySome, `${absence} is declared by every fixture — no fixture shows it present`).toBe(true);
    }
  });

  it("the registry's Card IS this file's Card", () => {
    const pkg = archetypePackage("ILLUSTRATION");
    expect(pkg).toBeTruthy();
    expect(pkg!.Card).toBe(Illustration);
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const unique = renderedAttributes(join(__dirname, "Card.tsx"));
    const structural = new Set([
      "data-archetype",
      "data-illustration-absent",
      "data-illustration-state",
      "data-illustration-hotspot",
      "data-illustration-icn",
      "data-illustration-part",
      "data-illustration-canvas",
      "data-illustration-sanitized-removed",
      "data-hotspot-highlighted",
    ]);
    const covered = new Set<string>(structural);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an attribute no fixture flips").toEqual([]);
  });

  it("hot-0010 is found WITHOUT also matching hot-001 (the breaking input, M1's target)", async () => {
    const f = ILLUSTRATION_FIXTURES[0];
    const { container } = draw(f);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="found"]')).not.toBeNull();
    const highlighted = container.querySelectorAll("[data-hotspot-highlighted]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].getAttribute("id")).toBe("hot-0010");
  });

  it("hot-001 is found WITHOUT also matching hot-0010 (the reverse case)", async () => {
    const f = ILLUSTRATION_FIXTURES[1];
    const { container } = draw(f);
    await settle(container);
    const highlighted = container.querySelectorAll("[data-hotspot-highlighted]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].getAttribute("id")).toBe("hot-001");
  });
});
