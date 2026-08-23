import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * The property under test is not "a draft round-trips through localStorage" — it is that
 * restoring one can never DESTROY one. A persistence layer that resurrects an hour-old
 * draft over the sentence the user is typing has not saved their work, it has eaten it,
 * and it does so in the same scenario the feature was written for.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, type RenderHookResult } from "@testing-library/react";
import { useComposerDraft, composerDraftKey } from "./useComposerDraft";

const OWNER_KEY = "cortex-session-owner";
const ALICE = "auth0|alice-sub";
const BOB = "auth0|bob-sub";

type Draft = ReturnType<typeof useComposerDraft>;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = () => renderHook(() => useComposerDraft());

function type(r: RenderHookResult<Draft, unknown>, text: string) {
  act(() => r.result.current.setValue(text));
}

/** Push past the debounce window so any pending mirror has run. */
function settle() {
  act(() => vi.advanceTimersByTime(1000));
}

const stored = (owner: string) => window.localStorage.getItem(composerDraftKey(owner));

describe("useComposerDraft", () => {
  it("restores the draft this owner left behind — the reload the SSO bounce forces", () => {
    window.localStorage.setItem(OWNER_KEY, ALICE);
    window.localStorage.setItem(composerDraftKey(ALICE), "summarise the Q3 incident review");

    const r = mount();

    expect(r.result.current.value).toBe("summarise the Q3 incident review");
  });

  it("a RESTORE NEVER OVERWRITES CONTENT THE COMPOSER ALREADY HOLDS — the trap", () => {
    // The tab-was-open-during-relogin case. Mid-renew the `sub` is briefly unavailable, so
    // the restore cannot fire at mount; it fires later, when identity resolves. By then the
    // user may have typed. Disk is the OLDER copy at that instant, and letting it win turns
    // this fix into the exact data loss it exists to prevent.
    window.localStorage.setItem(composerDraftKey(ALICE), "a stale draft from an hour ago");
    const r = mount(); // no owner stamp readable yet

    type(r, "the sentence being typed right now");
    window.localStorage.setItem(OWNER_KEY, ALICE);
    r.rerender(); // identity resolves — the restore path fires HERE

    expect(r.result.current.value).toBe("the sentence being typed right now");

    // …and the newer text is what gets persisted, so the stale copy cannot come back later.
    settle();
    expect(stored(ALICE)).toBe("the sentence being typed right now");
  });

  it("an owner CHANGE does replace the buffer — B must never inherit A's typed text", () => {
    // The mirror image of the trap, and why the rule is "unknown -> known never clobbers"
    // rather than a blanket "never clobber": across two DIFFERENT known users the in-memory
    // buffer belongs to the previous one, and keeping it would be a cross-user disclosure.
    window.localStorage.setItem(OWNER_KEY, ALICE);
    window.localStorage.setItem(composerDraftKey(ALICE), "alice's confidential prompt");
    const r = mount();
    expect(r.result.current.value).toBe("alice's confidential prompt");

    window.localStorage.setItem(OWNER_KEY, BOB);
    window.localStorage.setItem(composerDraftKey(BOB), "bob's own prompt");
    r.rerender();

    expect(r.result.current.value).toBe("bob's own prompt");
  });

  it("never reads another subject's key — a draft is scoped to the `sub` that typed it", () => {
    window.localStorage.setItem(composerDraftKey(ALICE), "alice's confidential prompt");
    window.localStorage.setItem(OWNER_KEY, BOB);

    const r = mount();

    expect(r.result.current.value).toBe("");
  });

  it("does not write on every keystroke — one mirror per pause, not per character", () => {
    window.localStorage.setItem(OWNER_KEY, ALICE);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const r = mount();

    for (const text of ["s", "su", "sum", "summ"]) {
      type(r, text);
      act(() => vi.advanceTimersByTime(50));
    }
    const writes = () => setItem.mock.calls.filter((c) => String(c[0]).includes("composer-draft"));
    expect(writes()).toHaveLength(0);

    settle();
    expect(writes()).toHaveLength(1);
    expect(stored(ALICE)).toBe("summ");
  });

  it("writes NOTHING while the owner is unknown — no placeholder-keyed drafts", () => {
    // Mid-relogin `sub` is null. A draft parked under "null"/"anonymous" is readable by the
    // next person to use the browser and is invisible to every purge that exists.
    const r = mount(); // no owner stamp
    type(r, "typed before auth finished");
    settle();

    expect(window.localStorage.length).toBe(0);
  });

  it("clears on send and CANCELS the in-flight mirror — a debounce must not resurrect it", () => {
    window.localStorage.setItem(OWNER_KEY, ALICE);
    const r = mount();
    type(r, "a message that actually dispatched");
    settle();
    expect(stored(ALICE)).toBe("a message that actually dispatched");

    act(() => r.result.current.clearDraft());
    expect(r.result.current.value).toBe("");
    expect(stored(ALICE)).toBeNull();

    settle();
    expect(stored(ALICE)).toBeNull();
  });

  it("flushes a half-typed draft on unmount — the failed renew tears the surface down", () => {
    // App withholds the whole session surface the moment `isolationReady` goes false, so the
    // composer unmounts BEFORE the redirect navigates — mid-debounce, with unsaved text.
    window.localStorage.setItem(OWNER_KEY, ALICE);
    const r = mount();
    type(r, "half a sentence");
    act(() => vi.advanceTimersByTime(50)); // still inside the debounce window

    r.unmount();

    expect(stored(ALICE)).toBe("half a sentence");
  });

  it("degrades to no persistence when storage throws — private mode must not kill the composer", () => {
    window.localStorage.setItem(OWNER_KEY, ALICE);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    const r = mount();
    expect(() => {
      type(r, "still typeable");
      settle();
    }).not.toThrow();
    expect(r.result.current.value).toBe("still typeable");
  });

  it("the draft key is DELIBERATELY ABSENT from USER_SCOPED_STORAGE_KEYS", () => {
    // That list is purged by reconcileSessionOwner on owner CHANGE. A same-user re-login does
    // NOT change the owner, which is precisely why the draft survives it. Listing the draft
    // there would delete it in the one scenario this hook exists for — so this pins the
    // omission as a decision, not an oversight someone will "fix".
    const src = readFileSync(path.join(__dirname, "../lib/sessionIsolation.ts"), "utf8");
    const list = src.match(/USER_SCOPED_STORAGE_KEYS\s*=\s*\[([^\]]*)\]/)?.[1];

    // Positive control: a regex that stopped matching would make the assertion below pass
    // over nothing.
    expect(list).toContain("cortex-answers-panel-v1");
    expect(list).not.toContain("composer-draft");
  });
});
