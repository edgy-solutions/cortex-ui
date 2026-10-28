/**
 * A null persona / domain in the entitlement matrix renders as an explicit, unpickable "unset"
 * item (architect ruling 2026-10-28: "render null as 'unset' explicitly, never coerce").
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { PersonaPicker } from "./PersonaPicker";
import { usePersonaStore } from "@/store/usePersonaStore";
import type { Entitlements } from "@/api/types";

type Cell = { persona: string | null; domain: string | null };
const ent = (cells: Cell[]) =>
  ({ user_id: "sub-1", source: "topaz", default: null, cells }) as unknown as Entitlements;
const load = (e: Entitlements) =>
  usePersonaStore.getState().loadEntitlements(async () => e, () => Promise.resolve());

beforeEach(() => {
  usePersonaStore.setState({
    entitlements: null, entitlementsLoading: false, entitlementsError: null,
    selectedPersona: null, selectedDomains: [], ownerSub: null,
  } as never);
});
afterEach(cleanup);

const open = () => {
  const c = render(<PersonaPicker />).container;
  fireEvent.click(c.querySelector(".pp-trigger")!);
  return c;
};

describe("the picker shows a null as unset", () => {
  it("A: one disabled persona `unset` item; clicking it selects nothing", async () => {
    await load(ent([{ persona: null, domain: "ENG" }, { persona: "engineer", domain: "ENG" }]));
    const c = open();
    const items = c.querySelectorAll('[data-pp-unset="persona"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe("unset");
    expect(items[0].getAttribute("aria-disabled")).toBe("true");
    expect(items[0].getAttribute("role")).not.toBe("menuitemradio");
    const before = usePersonaStore.getState().selectedPersona;
    expect(before).toBe("engineer");
    fireEvent.click(items[0]);
    expect(usePersonaStore.getState().selectedPersona).toBe(before);
    expect(usePersonaStore.getState().selectedPersona).not.toBeNull();
  });

  it("B: one domain `unset` item under the selected persona", async () => {
    await load(ent([{ persona: "engineer", domain: null }, { persona: "engineer", domain: "ENG" }]));
    const c = open();
    const items = c.querySelectorAll('.pp-col-domain [data-pp-unset="domain"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe("unset");
    expect(items[0].getAttribute("aria-disabled")).toBe("true");
    expect(c.querySelectorAll('[data-pp-unset="persona"]').length).toBe(0);
  });

  it("E: only unset cells -- the persona unset item shows and nothing is checked", async () => {
    await load(ent([{ persona: null, domain: null }]));
    expect(usePersonaStore.getState().selectedPersona).toBeNull();
    const c = open();
    expect(c.querySelectorAll('[data-pp-unset="persona"]').length).toBe(1);
    expect(c.querySelectorAll('[role="menuitemradio"][aria-checked="true"]').length).toBe(0);
  });
});
