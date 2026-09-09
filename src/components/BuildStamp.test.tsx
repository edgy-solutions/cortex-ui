/**
 * WHAT IS SERVING — and the two absences that must not collapse into one blank.
 *
 * "Is the thing in front of me the thing that was pushed" cost real minutes twice and produced
 * one wrong answer, because the only place to ask was Rancher — which reports what the
 * orchestrator ASKED for, not what is being served.
 *
 * Two properties carry the whole design and both are easy to lose:
 *
 *  1. A MISSING SHA IS NEVER A PLACEHOLDER. "unknown" is truthy, renders in a monospace slot
 *     looking exactly like a short hash, and would be compared, logged and pasted into a ticket
 *     as though it identified a commit. Same rule as the duration that renders absent rather
 *     than zero.
 *
 *  2. "THE BFF HAS NO SHA" AND "THE BFF DID NOT ANSWER" ARE DIFFERENT FACTS with different
 *     repairs — an unstamped build against a service that is down. Rendering one blank for both
 *     is the collapse this codebase keeps finding, and the row would look like it had answered.
 *
 * Nothing here compares the two shas. cortex-ui is a separate repository with its own head and
 * its own roll; "each thing is the thing that was pushed" is the property, and a warning on a
 * legitimate difference would train everyone to ignore the row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { shortSha, buildVersion } from "@/lib/buildVersion";

vi.mock("@/api/client", () => ({
  fetchBffVersion: vi.fn(),
}));

import { fetchBffVersion } from "@/api/client";
import { BuildStamp, bffLabel } from "./BuildStamp";

const mocked = fetchBffVersion as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mocked.mockReset());
afterEach(cleanup);

const stamp = () => document.querySelector("[data-build-stamp]")!;
const bffSlot = () => document.querySelector("[data-build-stamp-bff]")!.textContent ?? "";

describe("a missing sha is never a placeholder", () => {
  it("shortens a real sha and nothing else", () => {
    expect(shortSha("d7b087491fe0b57f441fd9cdf353f35cb2950eff")).toBe("d7b0874");
  });

  it("null in, null out — the caller is never handed something hash-shaped", () => {
    // The failure this prevents: a helper that returned "unknown".slice(0,7) → "unknown", or a
    // dash, either of which renders in the monospace slot as though it identified a build.
    expect(shortSha(null)).toBeNull();
    expect(shortSha(undefined)).toBeNull();
    expect(shortSha("")).toBeNull();
    expect(shortSha("   ")).toBeNull();
  });

  it("the build payload names its own repo, because the shas are NOT comparable", () => {
    // cortex-ui rolls separately from the mesh. `repo` is what lets a census resolve each
    // component against the head of ITS repository instead of diffing them against each other.
    const v = buildVersion();
    expect(v.component).toBe("cortex-ui");
    expect(v.repo).toBe("cortex-ui");
    // Whatever the build injected, it is either a real string or null — never a placeholder.
    expect(v.git_sha === null || typeof v.git_sha === "string").toBe(true);
    expect(v.git_sha).not.toBe("unknown");
    expect(v.git_sha).not.toBe("dev");
  });
});

describe("the BFF's failures are four states, not one word", () => {
  /**
   * SHIPPED WITH TWO, AND THE FIRST PERSON TO LOOK AT IT CAUGHT THE COLLAPSE.
   *
   * The client caught every error and returned null, so the row said UNREACHABLE for a BFF that
   * was up, serving picks, and had simply 404'd an endpoint it does not have yet. "The service
   * is down" and "the service has not been rolled" have opposite repairs and nothing to do with
   * each other — and the one that was wrong is the one that sends somebody hunting a service
   * that is working perfectly.
   *
   * The word "unreachable" is worth exactly as much as its rarity. These tests are what keep it
   * rare.
   */
  const label = (r: unknown) => bffLabel(r as never);

  it("A 404 is NOT unreachable — the endpoint is missing, the service is not", () => {
    expect(label({ kind: "no_endpoint" })).toBe("no /version");
    expect(label({ kind: "no_endpoint" })).not.toContain("unreachable");
  });

  it("UNREACHABLE is reserved for nothing coming back at all", () => {
    expect(label({ kind: "unreachable" })).toBe("unreachable");
  });

  it("another HTTP status is neither down nor missing, and carries the status", () => {
    // 401 and 500 are different problems and neither is "no endpoint". The status is the only
    // actionable thing available, so it is what gets shown rather than a fourth adjective.
    expect(label({ kind: "error", status: 500 })).toBe("/version 500");
    expect(label({ kind: "error", status: 401 })).toBe("/version 401");
  });

  it("an answer with no sha is an unstamped BUILD — a third fact again", () => {
    expect(label({ kind: "ok", version: { git_sha: null } })).toBe("no sha");
    expect(label({ kind: "ok", version: {} })).toBe("no sha");
  });

  it("and a real sha is shortened", () => {
    expect(label({ kind: "ok", version: { git_sha: "50649d9abcdef0123456789" } })).toBe("50649d9");
  });

  it("the four labels are all DIFFERENT — the property, not the spellings", () => {
    // The assertion that would have caught the original defect on its own. Any two states
    // sharing a label is the collapse, whatever words are chosen.
    const labels = [
      label({ kind: "ok", version: { git_sha: "abc1234def" } }),
      label({ kind: "ok", version: { git_sha: null } }),
      label({ kind: "no_endpoint" }),
      label({ kind: "unreachable" }),
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never renders an empty slot — the row always answers", () => {
    for (const r of [
      null,
      { kind: "ok", version: {} },
      { kind: "ok", version: { git_sha: "abc1234def" } },
      { kind: "no_endpoint" },
      { kind: "error", status: 503 },
      { kind: "unreachable" },
    ]) {
      expect(label(r).trim().length, JSON.stringify(r)).toBeGreaterThan(0);
    }
  });

  it("renders through the component, from what the client actually returns", () => {
    // The label function is pure and the component must actually use it — the seam between the
    // two is where a correct helper gets rendered by a component that decided for itself.
    mocked.mockResolvedValue({ kind: "no_endpoint" });
    render(<BuildStamp />);
    return waitFor(() => expect(bffSlot()).toContain("no /version"));
  });
});

describe("the values a build can actually inject", () => {
  // `readDefine` is the guard that turns a build-time nothing into a null. Reached only through
  // the inject, it could not be fed anything, and a mutation deleting its whole rejection list
  // survived the suite — the one guard in the file doing real work was the one untested.
  it("rejects every shape of nothing a build substitutes", async () => {
    const { readDefine } = await import("@/lib/buildVersion");
    for (const v of ["unknown", "null", "undefined", "", "   ", null, undefined, 42, {}]) {
      expect(readDefine(v), JSON.stringify(v)).toBeNull();
    }
  });

  it("keeps a real sha, trimmed", async () => {
    // The positive control: a rejection list that rejected everything would pass the test above.
    const { readDefine } = await import("@/lib/buildVersion");
    expect(readDefine("  d7b0874  ")).toBe("d7b0874");
  });
});

describe("it reports, and does not judge", () => {
  it("draws no warning when the two shas differ — they are separate repos", async () => {
    // A difference here is the NORMAL state: two repositories, two heads, two rolls. Colouring
    // it as a problem would make the row cry wolf on every ordinary day, and a status line
    // nobody believes is worse than no status line.
    mocked.mockResolvedValue({ kind: "ok", version: { git_sha: "ffffffffffffffffff" } });
    render(<BuildStamp />);
    await waitFor(() => expect(bffSlot()).toContain("fffffff"));
    const text = stamp().textContent ?? "";
    expect(text).not.toMatch(/mismatch|stale|out of date|behind/i);
    expect(stamp().querySelector(".text-rose-400, .text-red-500")).toBeNull();
  });
});
