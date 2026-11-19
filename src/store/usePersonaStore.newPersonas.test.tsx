/**
 * The "New" marker (ruled 2026-11-19): a persona granted on a refresh is marked in the picker until the
 * picker has been opened, and a grant NEVER changes who the person acts as.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { usePersonaStore } from "./usePersonaStore";
import { PersonaPicker } from "@/components/PersonaPicker";
import type { Entitlements } from "@/api/types";

const ent = (cells: Array<[string, string]>, user_id = "sub-1") =>
  ({
    user_id,
    source: "topaz",
    default: null,
    cells: cells.map(([persona, domain]) => ({ persona, domain })),
  }) as unknown as Entitlements;
const load = (e: Entitlements) => usePersonaStore.getState().loadEntitlements(async () => e, () => Promise.resolve());
const refresh = (e: Entitlements) => usePersonaStore.getState().refreshEntitlements(async () => e);
const st = () => usePersonaStore.getState();

const BASE: Array<[string, string]> = [["PORTFOLIO_LEAD", "PORTFOLIO_PLANNING"]];
const PLUS: Array<[string, string]> = [...BASE, ["ANALYST", "FINANCE"]];

beforeEach(() => {
  usePersonaStore.setState({
    entitlements: null,
    entitlementsLoading: false,
    entitlementsError: null,
    selectedPersona: null,
    selectedDomains: [],
    ownerSub: null,
    newPersonas: [],
  } as never);
});
afterEach(cleanup);

describe("newPersonas in the store", () => {
  it("a refresh that adds a persona marks it and changes nothing about who acts", async () => {
    await load(ent(BASE));
    const pick = { p: st().selectedPersona, d: st().selectedDomains };
    expect(pick.p).toBe("PORTFOLIO_LEAD");
    await refresh(ent(PLUS));
    expect(st().newPersonas).toEqual(["ANALYST"]);
    expect(st().selectedPersona).toBe(pick.p);
    expect(st().selectedDomains).toEqual(pick.d);
  });

  it("a first load marks nothing", async () => {
    await load(ent(PLUS));
    expect(st().newPersonas).toEqual([]);
  });

  it("a LOAD over a held matrix for the same subject marks nothing either — only a refresh marks", async () => {
    // A load is session bootstrap (sign-in, remount), not a grant arriving while someone works. The
    // "first load" arm above has no prior matrix, so it cannot tell the mode check from the
    // no-prior-matrix check; this one holds a matrix first.
    await load(ent(BASE));
    await load(ent(PLUS));
    expect(st().entitlements?.cells.length).toBe(2); // the load did land
    expect(st().newPersonas).toEqual([]);
  });

  it("a refresh for a different subject marks nothing and clears prior markers", async () => {
    await load(ent(BASE));
    await refresh(ent(PLUS));
    expect(st().newPersonas).toEqual(["ANALYST"]);
    await refresh(ent([...PLUS, ["AUDITOR", "FINANCE"]], "sub-2"));
    expect(st().newPersonas).toEqual([]);
  });

  it("a revoked new persona drops out", async () => {
    await load(ent(BASE));
    await refresh(ent(PLUS));
    await refresh(ent(BASE));
    expect(st().newPersonas).toEqual([]);
  });

  it("a refresh with nothing new keeps prior markers", async () => {
    await load(ent(BASE));
    await refresh(ent(PLUS));
    await refresh(ent(PLUS));
    expect(st().newPersonas).toEqual(["ANALYST"]);
  });

  it("clearNewPersonas empties it and leaves the selection alone", async () => {
    await load(ent(BASE));
    await refresh(ent(PLUS));
    st().clearNewPersonas();
    expect(st().newPersonas).toEqual([]);
    expect(st().selectedPersona).toBe("PORTFOLIO_LEAD");
  });
});

describe("the picker shows the marker until it has been opened", () => {
  it("trigger badge and row tag show; after open then close both are gone", async () => {
    await load(ent(BASE));
    await refresh(ent(PLUS));
    const c = render(<PersonaPicker />).container;
    const trigger = c.querySelector(".pp-trigger")!;
    expect(trigger.getAttribute("data-pp-new-count")).toBe("1");
    // The attribute is for tests; what a person SEES is the badge's word on the trigger.
    expect(trigger.querySelector("[data-pp-new-badge]")?.textContent).toBe("New");
    expect(c.querySelectorAll("[data-pp-new]").length).toBe(0);

    fireEvent.click(trigger);
    const tags = c.querySelectorAll("[data-pp-new]");
    expect(tags.length).toBe(1);
    expect(tags[0].closest("[data-pp-persona]")!.getAttribute("data-pp-persona")).toBe("ANALYST");
    expect(st().newPersonas).toEqual(["ANALYST"]); // still marked while open

    fireEvent.click(trigger); // close
    expect(st().newPersonas).toEqual([]);
    expect(trigger.getAttribute("data-pp-new-count")).toBeNull();
    expect(trigger.querySelector("[data-pp-new-badge]")).toBeNull();
    expect(c.querySelectorAll("[data-pp-new]").length).toBe(0);
    expect(st().selectedPersona).toBe("PORTFOLIO_LEAD");
  });
});
