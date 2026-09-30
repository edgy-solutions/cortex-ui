/**
 * PLATFORM DOMAINS: hidden from the picker, kept in scope.
 *
 * Both halves are sealed, because either alone is the defect in a different costume: hiding
 * without re-adding drops MESH/DOCS out of `active_domains` (the manual goes silent), and
 * re-adding without hiding leaves the reader choosing between their job and the manual.
 * A third arm pins that scope is never WIDENED past what the server granted.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { PersonaPicker } from "@/components/PersonaPicker";
import { usePersonaStore } from "@/store/usePersonaStore";
import type { Entitlements } from "@/api/types";
import { inScope, pickableDomains, PLATFORM_DOMAINS } from "./platformDomains";

const matrix = (cells: [string, string][], def: [string, string] | null = null) =>
  ({
    user_id: "sub-1",
    source: "topaz",
    default: def ? { persona: def[0], domain: def[1] } : null,
    cells: cells.map(([persona, domain]) => ({ persona, domain })),
  }) as unknown as Entitlements;

const PM: [string, string][] = [
  ["PORTFOLIO_LEAD", "PORTFOLIO_PLANNING"],
  ["PORTFOLIO_LEAD", "MESH"],
  ["PORTFOLIO_LEAD", "DOCS"],
  ["PORTFOLIO_LEAD", "PROGRAM_FINANCE"],
];

beforeEach(() => {
  usePersonaStore.setState({
    entitlements: null, entitlementsLoading: false, entitlementsError: null,
    selectedPersona: null, selectedDomains: [], ownerSub: null,
  } as never);
});
afterEach(cleanup);

const load = (e: Entitlements) =>
  usePersonaStore.getState().loadEntitlements(() => Promise.resolve(e), () => Promise.resolve());

describe("the picker does not offer platform domains", () => {
  it("SPECIALIZED IN lists the persona's real domains and neither MESH nor DOCS", async () => {
    await load(matrix(PM, ["PORTFOLIO_LEAD", "PORTFOLIO_PLANNING"]));
    const c = render(<PersonaPicker />).container;
    fireEvent.click(c.querySelector(".pp-trigger")!);
    const offered = [...c.querySelectorAll(".pp-col-domain .pp-item")].map((n) => n.textContent ?? "");
    // POSITIVE CONTROL in the same breath: the column is populated, so "MESH is absent" is not
    // passing over an empty or unopened menu.
    expect(offered.length).toBe(2);
    expect(offered.join("|")).not.toMatch(/mesh|docs/i);
  });

  it("a `default` that IS a platform domain is not the pick — the first real domain is", async () => {
    await load(matrix(PM, ["PORTFOLIO_LEAD", "DOCS"]));
    expect(usePersonaStore.getState().selectedDomains).toEqual(["PORTFOLIO_PLANNING"]);
  });

  it("a persona entitled ONLY to platform domains keeps them — nothing to narrow to", async () => {
    await load(matrix([["MESH_OPERATOR", "MESH"]], ["MESH_OPERATOR", "MESH"]));
    expect(usePersonaStore.getState().selectedDomains).toEqual(["MESH"]);
  });
});

describe("platform domains stay in scope", () => {
  it("the pick is sent first, then every ENTITLED platform domain", () => {
    expect(inScope(["PORTFOLIO_PLANNING"], PM.map(([, d]) => d))).toEqual(["PORTFOLIO_PLANNING", "MESH", "DOCS"]);
  });

  it("a platform domain the persona does NOT hold is never added — scope is the server's grant", () => {
    expect(inScope(["PORTFOLIO_PLANNING"], ["PORTFOLIO_PLANNING", "MESH"])).toEqual(["PORTFOLIO_PLANNING", "MESH"]);
    expect(inScope(["PORTFOLIO_PLANNING"], ["PORTFOLIO_PLANNING"])).toEqual(["PORTFOLIO_PLANNING"]);
  });

  it("nothing is duplicated when the pick already carries one", () => {
    expect(inScope(["MESH"], ["MESH", "DOCS"])).toEqual(["MESH", "DOCS"]);
  });

  it("the send site uses inScope, not the bare selection", async () => {
    // The hook is too wide to mount here; the call is what it is forced to spell.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/hooks/useInterviewAgent.ts", "utf8");
    expect(src).toMatch(/active_domains:\s*inScope\(/);
    expect(src).not.toMatch(/active_domains:\s*personaSelection\.selectedDomains/);
  });
});

describe("the list", () => {
  it("names exactly MESH and DOCS, and filters them out of a menu", () => {
    expect([...PLATFORM_DOMAINS].sort()).toEqual(["DOCS", "MESH"]);
    expect(pickableDomains(["A", "MESH", "B", "DOCS"])).toEqual(["A", "B"]);
  });
});
