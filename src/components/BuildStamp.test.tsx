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
import { BuildStamp } from "./BuildStamp";

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

describe("the BFF's two absences stay distinguishable", () => {
  it("says UNREACHABLE when the call failed", async () => {
    mocked.mockResolvedValue(null);
    render(<BuildStamp />);
    await waitFor(() => expect(bffSlot()).toContain("unreachable"));
  });

  it("says NO SHA when it answered without one", async () => {
    // Reached, and its build carried no stamp. A different problem from "not answering", and
    // the one the row would hide if both rendered blank.
    mocked.mockResolvedValue({ component: "cortex-bff", git_sha: null });
    render(<BuildStamp />);
    await waitFor(() => expect(bffSlot()).toContain("no sha"));
    expect(bffSlot()).not.toContain("unreachable");
  });

  it("shows the sha when it has one", async () => {
    mocked.mockResolvedValue({ component: "cortex-bff", git_sha: "50649d9abcdef0123456789" });
    render(<BuildStamp />);
    await waitFor(() => expect(bffSlot()).toContain("50649d9"));
    expect(bffSlot()).not.toContain("unreachable");
    expect(bffSlot()).not.toContain("no sha");
  });

  it("never renders an empty slot — the row always answers", async () => {
    // The control for the two tests above. A component that rendered nothing in either absence
    // would satisfy "not unreachable" and "not no sha" by saying nothing at all.
    for (const value of [null, { git_sha: null }, { git_sha: "abc1234def" }]) {
      mocked.mockResolvedValue(value);
      const { unmount } = render(<BuildStamp />);
      await waitFor(() => expect(bffSlot().replace(/bff\s*/, "").trim().length).toBeGreaterThan(0));
      unmount();
    }
  });
});

describe("it reports, and does not judge", () => {
  it("draws no warning when the two shas differ — they are separate repos", async () => {
    // A mismatch here is the NORMAL state: two repositories, two heads, two rolls. Colouring it
    // as a problem would make the row cry wolf on every ordinary day, and a status line nobody
    // believes is worse than no status line.
    mocked.mockResolvedValue({ git_sha: "ffffffffffffffffff" });
    render(<BuildStamp />);
    await waitFor(() => expect(bffSlot()).toContain("fffffff"));
    const text = stamp().textContent ?? "";
    expect(text).not.toMatch(/mismatch|stale|out of date|behind/i);
    expect(stamp().querySelector(".text-rose-400, .text-red-500")).toBeNull();
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
