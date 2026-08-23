import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
/**
 * The property under test is NOT "purge empties the stores it empties" — that would pass
 * forever while the module rots. It is that the hand-written purge list stays COMPLETE as
 * stores are added.
 *
 * The failure mode this exists to make impossible: a lane adds a user-scoped store, does
 * not think about isolation (why would they — the store is about answers, or tasks, or
 * boards), and `purgeUserScopedState` silently no longer covers the state it claims to
 * cover. User A's data then survives an in-place account switch into user B's session.
 * Nothing throws. Nothing renders red. The leak is discovered by a user, or never.
 *
 * So the test DERIVES the population — every `use*Store.ts` on disk, every persisted key
 * declared by one — and asserts the purge accounts for each. A new store must join the
 * purge or be named in PURGE_EXEMPT_STORES with a reason. There is no third option, and
 * that is the entire point: this converts a silent-drift site into a refusing one.
 *
 * Every enumeration carries a POSITIVE CONTROL. A derived guard whose derivation quietly
 * returns nothing passes vacuously and is worse than no test, because it reads as coverage.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { purgeUserScopedState, reconcileSessionOwner, PURGE_EXEMPT_STORES } from "./sessionIsolation";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useStageStore } from "@/store/useStageStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { useInterviewStore } from "@/store/useInterviewStore";

const ISOLATION_SRC = readFileSync(path.join(__dirname, "sessionIsolation.ts"), "utf8");
const STORE_DIR = path.join(__dirname, "../store");

/** Every store module on disk — the population the purge must account for. */
const storeModules = readdirSync(STORE_DIR)
  .filter((f) => /^use[A-Za-z]+Store\.ts$/.test(f))
  .map((f) => f.replace(/\.ts$/, ""));

/** The keys sessionIsolation declares it will remove. Read from source: the list is a
 *  private const, and exporting it purely to be asserted on would be the test reshaping
 *  the module to suit itself. */
const declaredStorageKeys = (() => {
  const block = ISOLATION_SRC.match(/USER_SCOPED_STORAGE_KEYS\s*=\s*\[([^\]]*)\]/)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
})();

/** What each store persists, and WHERE. sessionStorage-backed stores are outside the
 *  localStorage list's remit by construction — they need their own argument, not this one. */
interface PersistedStore {
  module: string;
  key: string;
  storage: "local" | "session";
}
const persistedStores: PersistedStore[] = storeModules.flatMap((module) => {
  const src = readFileSync(path.join(STORE_DIR, `${module}.ts`), "utf8");
  if (!/\bpersist\s*\(/.test(src)) return [];
  const key = src.match(/name:\s*"([^"]+)"/)?.[1];
  if (!key) return [];
  const session = /createJSONStorage\(\s*\(\)\s*=>\s*sessionStorage\s*\)/.test(src);
  return [{ module, key, storage: session ? "session" : "local" }];
});

describe("sessionIsolation — the purge list stays complete", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // ── Positive controls ────────────────────────────────────────────────────────
  // Asserted FIRST and separately, so a derivation that breaks fails here loudly rather
  // than turning every assertion below into a pass over an empty set.

  it("the store enumeration actually finds the stores — positive control", () => {
    expect(storeModules).toContain("useCanvasStore");
    expect(storeModules).toContain("useInterviewStore");
    expect(storeModules).toContain("usePersonaStore");
    expect(storeModules.length).toBeGreaterThanOrEqual(7);
  });

  it("the persisted-key derivation actually finds persisted stores — positive control", () => {
    expect(persistedStores.length).toBeGreaterThanOrEqual(3);
    expect(persistedStores.map((p) => p.key)).toContain("cortex-answers-panel-v1");
    // And it must distinguish the two storages, or the localStorage assertion below is
    // silently asserting over everything.
    expect(persistedStores.some((p) => p.storage === "session")).toBe(true);
    expect(persistedStores.some((p) => p.storage === "local")).toBe(true);
  });

  it("the declared-key derivation actually reads the list — positive control", () => {
    expect(declaredStorageKeys).toContain("cortex-answers-panel-v1");
  });

  // ── The completeness invariant ───────────────────────────────────────────────

  it("EVERY store is either purged or exempted with a stated reason — no silent third state", () => {
    // The one that matters. A store that is neither purged nor knowingly exempt is a store
    // whose isolation nobody decided, which is exactly how A's data reaches B.
    const undecided = storeModules.filter(
      (m) => !ISOLATION_SRC.includes(m) && !(m in PURGE_EXEMPT_STORES),
    );
    expect(undecided).toEqual([]);
  });

  it("every exemption states WHY — an exemption without a reason is an oversight in costume", () => {
    for (const [store, reason] of Object.entries(PURGE_EXEMPT_STORES)) {
      expect(storeModules, `${store} is exempted but no longer exists`).toContain(store);
      expect(reason.length, `${store}'s exemption reason is too thin to review`).toBeGreaterThan(30);
    }
  });

  it("every localStorage-persisted store's key is in USER_SCOPED_STORAGE_KEYS", () => {
    // In-memory reset is not enough for a persisted store: the cache would rehydrate the
    // previous user's state on the very next mount, re-creating the leak the purge just closed.
    const missing = persistedStores
      .filter((p) => p.storage === "local")
      .map((p) => p.key)
      .filter((k) => !declaredStorageKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("the owner stamp itself is never purged — purging it would re-purge forever", () => {
    // reconcileSessionOwner compares against this key. Clearing it makes every reconcile
    // look like a first observation, so the purge fires on every load and no session ever
    // settles. The stamp is infrastructure, not user-scoped state.
    expect(declaredStorageKeys).not.toContain("cortex-session-owner");
  });

  it("the composer draft key stays DELIBERATELY out of the list", () => {
    // Mirror of the assertion in useComposerDraft.test.ts, stated here too because this is
    // the module that would do the deleting. The purge fires on owner CHANGE; a same-user
    // re-login does not change the owner, which is precisely why a draft survives one.
    // Listing the draft here would destroy it in the single scenario it exists for.
    expect(declaredStorageKeys.some((k) => k.includes("composer-draft"))).toBe(false);
  });

  // ── Behavioural: the purge does what the list promises ───────────────────────

  it("purges in-memory user state so nothing from A can paint for B", () => {
    useCanvasStore.setState({
      artifacts: [{ id: "a1" }] as never,
      currentArtifactId: "a1",
    } as never);
    useHumanTaskStore.setState({ tasks: [{ id: "t1" }] } as never);
    useStageStore.setState({ canvases: [{ id: "c1" }] } as never);
    useAnswerPanelStore.setState({ pins: [{ answerId: "a1", x: 0, y: 0 }] } as never);

    purgeUserScopedState();

    expect(useCanvasStore.getState().artifacts).toEqual([]);
    expect(useCanvasStore.getState().currentArtifactId).toBeNull();
    expect(useHumanTaskStore.getState().tasks).toEqual([]);
    expect(useStageStore.getState().canvases).toEqual([]);
    expect(useAnswerPanelStore.getState().pins).toEqual([]);
  });

  it("purges the CONVERSATION — A's questions must not survive into B's session", () => {
    // The completeness assertion above is a source-mention check: it proves the module
    // NAMES this store, not that it empties it. Importing a store and forgetting to call
    // it would satisfy the guard and leak anyway, so the registration is asserted here as
    // behaviour too. Transcript content is the most obviously-disclosing state in the app.
    useInterviewStore.setState({
      messages: [{ id: "m1", role: "user", content: "alice's question", isStreaming: false, timestamp: 1 }],
      ontologyTerms: [{ id: "o1", category: "Concept", label: "alice's concept" }],
      accessDenial: { denied_assets: [], subject: "alice", domain: "d", message: "no" },
    } as never);

    purgeUserScopedState();

    expect(useInterviewStore.getState().messages).toEqual([]);
    expect(useInterviewStore.getState().ontologyTerms).toEqual([]);
    expect(useInterviewStore.getState().accessDenial).toBeNull();
  });

  it("removes every declared persisted cache, so nothing rehydrates on the next mount", () => {
    for (const k of declaredStorageKeys) window.localStorage.setItem(k, "prior-user-state");

    purgeUserScopedState();

    for (const k of declaredStorageKeys) expect(window.localStorage.getItem(k)).toBeNull();
  });

  it("reconcile purges on an owner CHANGE and stamps the new owner", () => {
    window.localStorage.setItem("cortex-session-owner", "alice");
    useCanvasStore.setState({ artifacts: [{ id: "a1" }] } as never);

    expect(reconcileSessionOwner("bob")).toBe(true);
    expect(useCanvasStore.getState().artifacts).toEqual([]);
    expect(window.localStorage.getItem("cortex-session-owner")).toBe("bob");
  });

  it("reconcile is a NO-OP for the same owner — the re-login path must not wipe a session", () => {
    // The SSO bounce lands here on every renew. If it purged, every silent renew would
    // erase the user's own answers and boards — the isolation guard becoming the outage.
    window.localStorage.setItem("cortex-session-owner", "alice");
    useCanvasStore.setState({ artifacts: [{ id: "a1" }] } as never);

    expect(reconcileSessionOwner("alice")).toBe(false);
    expect(useCanvasStore.getState().artifacts).toHaveLength(1);
  });
});
