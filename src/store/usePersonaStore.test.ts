import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * The entitlements fetch had a self-sealing failure: one transient disabled the picker for the
 * whole session, because the caller's effect had no dependency that would change afterwards.
 * A retry fixes that — and can recreate it in a new costume if it ends in silence.
 *
 * So both directions are pinned:
 *   - fail-then-succeed RECOVERS the picker (the trap is gone),
 *   - always-fail lands on a VISIBLE error (the trap has not been replaced by a quieter one).
 *
 * Plus the ordering the retry is defence for: the picker must not own this fetch. It mounts
 * deep in the answer surface, so owning it queued a bootstrap request behind the card tree —
 * under HTTP/1.1's ~6-connection cap, with two held by Electric's live shapes, that request
 * could sit unsent until it timed out.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePersonaStore } from "./usePersonaStore";
import type { Entitlements } from "@/api/types";

const noSleep = () => Promise.resolve();

const MATRIX = {
  user_id: "sub-1",
  source: "topaz",
  default: null,
  cells: [{ persona: "PORTFOLIO_LEAD", domain: "PORTFOLIO_PLANNING" }],
} as unknown as Entitlements;

beforeEach(() => {
  usePersonaStore.setState({
    entitlements: null,
    entitlementsLoading: false,
    entitlementsError: null,
    selectedPersona: null,
    selectedDomains: [],
    ownerSub: null,
  } as never);
});

describe("loadEntitlements — a transient must not disable the picker for the session", () => {
  it("RECOVERS after a failure — the self-sealing trap is gone", async () => {
    // The defect this replaces: one 5s timeout under connection starvation and the bolt stayed
    // inert until reload, with no dependency change that could ever retry.
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout of 5000ms exceeded"))
      .mockResolvedValue(MATRIX);

    await usePersonaStore.getState().loadEntitlements(fetchFn, noSleep);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(usePersonaStore.getState().hasEntitlements()).toBe(true);
    expect(usePersonaStore.getState().entitlementsError).toBeNull();
  });

  it("a TERMINAL failure is VISIBLE, not silent — the trap is not replaced by a quieter one", async () => {
    // Retries that end in silence would cost the next night what silence cost this one. The
    // picker renders `entitlementsError` as its reason.
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));

    await usePersonaStore.getState().loadEntitlements(fetchFn, noSleep);

    expect(usePersonaStore.getState().entitlementsError).toBe("network down");
    expect(usePersonaStore.getState().entitlementsLoading).toBe(false);
    expect(usePersonaStore.getState().hasEntitlements()).toBe(false);
  });

  it("is BOUNDED — an unbounded retry against a starved pool is the storm it reacts to", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("x"));
    await usePersonaStore.getState().loadEntitlements(fetchFn, noSleep);
    // First attempt plus the bounded retries, and no more.
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(4);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
  });

  it("BACKS OFF between attempts rather than retrying into the same congestion", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi.fn().mockRejectedValue(new Error("x"));

    await usePersonaStore
      .getState()
      .loadEntitlements(fetchFn, (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      });

    expect(sleeps.length).toBeGreaterThan(0);
    // Strictly increasing: a flat delay is a slower storm, not a backoff.
    for (let i = 1; i < sleeps.length; i++) expect(sleeps[i]).toBeGreaterThan(sleeps[i - 1]);
  });

  it("seeds a selection from cells when `default` is null — nine cells is not 'no entitlements'", async () => {
    // The real payload carries `default: null` WITH cells. If the seeding ladder stopped at
    // `default`, a fully-entitled user would render identically to an unentitled one.
    await usePersonaStore.getState().loadEntitlements(vi.fn().mockResolvedValue(MATRIX), noSleep);
    expect(usePersonaStore.getState().selectedPersona).toBe("PORTFOLIO_LEAD");
  });
});

describe("the fetch is bootstrap, not card data", () => {
  const picker = readFileSync(
    path.join(__dirname, "../components/PersonaPicker.tsx"),
    "utf8",
  );
  const app = readFileSync(path.join(__dirname, "../App.tsx"), "utf8");

  it("the sources are read — positive control", () => {
    expect(picker).toContain("export function PersonaPicker");
    expect(app).toContain("export default function App");
  });

  it("the PICKER does not fetch — it mounts behind the card tree", () => {
    // Owning the fetch here is what put a bootstrap request behind however many artifacts the
    // session held. The picker reads the store and nothing else.
    expect(picker).not.toContain("loadEntitlements(");
    expect(picker).not.toContain("fetchEntitlements");
  });

  it("APP fetches on auth-ready, keyed on the subject", () => {
    // Keyed on the sub rather than a boolean: a user switch must re-fetch, and a failed attempt
    // must not be recorded as a completed one.
    expect(app).toContain("useEntitlementsSync");
    expect(app).toMatch(/loadEntitlements\(fetchEntitlements\)/);
  });
});
