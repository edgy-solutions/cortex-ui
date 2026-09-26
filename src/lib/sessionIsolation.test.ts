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

/**
 * ⛔ THE DERIVATION'S REACH — the one mutation every seal above survives.
 *
 * This file's docblock says it "DERIVES the population — every `use*Store.ts` on disk". That is
 * true and it is the gap: **a population derived from a filter cannot see a subject the filter
 * misses.** Every assertion above is about the 11 modules that matched. None is about whether 11
 * is all of them.
 *
 * MEASURED 2026-09-26, two mutations, both on `useStageStore` (localStorage-persisted under
 * `cortex-stage`, and NOT one of the three stores pinned by name at the positive control):
 *
 *   M1  its persisted key corrupted to `cortex-stage-v2`  → EXIT 1, the key seal names it. Live.
 *   M2  a NEW store added at `src/store/stageDraftStore.ts`, persisting to localStorage under
 *       `cortex-stage-draft`, purged nowhere                → **EXIT 0. All 13 green.**
 *
 * M2 is the leak this file exists to prevent, shipping, with the guard green. It is invisible
 * because it never enters the population: no `use` prefix, so the regex skips it, so it is absent
 * from `storeModules`, absent from `persistedStores`, and absent from `undecided` — the gap
 * detector cannot report a gap it is not looking at.
 *
 * ⚠ AND THE FLOOR CANNOT COVER FOR IT. `storeModules.length >= 7` was written when there were 7;
 * there are now 11, so **four modules can leave the population before that control notices**, and
 * a module that never joined costs nothing at all. Three stores are pinned by name out of eleven.
 * A floor is a ratchet against SHRINKAGE; this is a subject that never arrived.
 *
 * So the invariant below is about the filter, not the stores: every non-test module in the store
 * directory must either match the convention — and thereby face every seal above — or be named
 * here as a known non-store. A lane adding `stageDraftStore.ts` now gets a red that says so.
 *
 * Found by the invincible-agent lane, on their own tree, in the same shape: a population derived
 * from the envelope builder went green when a table was UNWIRED from it, while a corrupted value
 * in a wired table reded. Both sides had ratchets against shrinkage and neither had one against
 * non-arrival. Related: this repo's own lesson that a NULL from a filtered grep is a claim about
 * the filter, not the population.
 */
describe("the store enumeration's REACH, not just its contents", () => {
  /** Non-store modules legitimately living in src/store. Empty today — and that is the point:
   *  a new name here is a deliberate statement that the file holds no user-scoped state. */
  const NON_STORE_MODULES: string[] = [];

  it("⛔ every non-test module in src/store matches the store convention — or is named a non-store", () => {
    const all = readdirSync(STORE_DIR).filter(
      (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
    );
    // POSITIVE CONTROL, in the idiom of every other enumeration in this file: a filter that
    // stopped matching would make the assertion below pass over an empty list.
    expect(all, "the store directory enumeration found nothing").toContain("useStageStore.ts");
    expect(all.length).toBeGreaterThanOrEqual(storeModules.length);

    // `.tsx` DELIBERATELY IN SCOPE. A store is not required to be `.ts`, and the population regex
    // above demands it — so a `useFooStore.tsx` would escape the purge seals exactly as M2 did.
    const unmatched = all.filter((f) => !/^use[A-Za-z]+Store\.ts$/.test(f));
    expect(
      unmatched,
      "a module in src/store that no purge seal above can see — rename it to use*Store.ts so it " +
        "faces them, or add it to NON_STORE_MODULES to state it holds no user-scoped state",
    ).toEqual(NON_STORE_MODULES);
  });

  it("⛔ and src/store is FLAT — a nested store would leave the population the same way", () => {
    // The flat readdirSync is the whole reach. A store at src/store/stage/useDraftStore.ts matches
    // the convention and is still invisible, so the directory shape is part of the invariant.
    const nested = readdirSync(STORE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(
      nested,
      "src/store has subdirectories — the enumeration above is no longer complete, so it must " +
        "walk recursively before this seal is removed",
    ).toEqual([]);
  });
});

/**
 * ⛔ THE FORCED SPELLING — because the arms above can still be walked around, and were.
 *
 * The reach arms added earlier assert a CONVENTION over `src/store`. The engine lane's objection to
 * that was correct and I fired it rather than argued it: **a convention arm makes the next store
 * conform; it does not make an unconventional one visible.**
 *
 *   M3  a persisted localStorage store at `src/components/planning/useDraftStore.ts`, purged nowhere
 *       → **EXIT 0. All 15 green.** One directory over and the whole file is blind again.
 *
 * So this arm takes their better question — *what is the shipping code FORCED to spell?* — and it is
 * none of the things asserted above. Not the filename (Vite imports any), not the directory, not even
 * the `persist()` config: **you cannot keep state across a reload without a `localStorage.setItem`
 * call.** That is the partition, and it is total over naming, location and store-vs-hook.
 *
 * ⚠ PARTITIONING IT SURFACED TWO KEYS THAT WERE IN NO REGISTER, and they are not hypothetical:
 *
 *   `cortex-grounding-display-mode` — `useInterviewStore.ts:387`. The store IS in `storeModules` and
 *     IS named in sessionIsolation.ts, so `undecided` calls it decided — but it has no `persist()`,
 *     so it never enters `persistedStores`, so the key seal never sees its key. **Decided at store
 *     granularity, undecided at key granularity**, which is the file's own forbidden third state one
 *     level down. The register's comment says "Persisted-store localStorage keys" — that scope is
 *     exactly the gap.
 *   `cortex-mock-grounding` — `mockGroundingEmitter.ts:80`, a lib module outside the store population
 *     altogether. No arm in this file could ever have reached it.
 *
 * Both are classified below as device-scoped rather than user-scoped, and I am NOT deferring that as
 * a judgment: it is derivable from the modules' own naming and purpose — a display mode and a mock
 * toggle, neither holding interview content. Stated as a derivation so it can be contradicted in one
 * line if a human reads them differently. (The lane opposite deferred a classification as "not mine
 * to make unilaterally" and it turned out to be one grep away; a stated reason for not deciding reads
 * as diligence and stops re-examination just as effectively as a wrong answer.)
 *
 * The two arms are complements with OPPOSITE blind spots, which is the engine lane's structural point
 * and the reason both stay: the convention arms red when a store in `src/store` breaks the naming and
 * are blind to a writer outside it; this arm reds on any new writer anywhere and is blind to naming
 * drift inside the convention. Residual limits, stated rather than implied: an indirect write through
 * a wrapper, and a dependency writing localStorage on our behalf, are both invisible to a source
 * grep. Cookies and IndexedDB are out of scope here and always were.
 */
describe("every module that can outlive a reload is in a register", () => {
  /** Every non-test module under src/ that writes durable localStorage, with the argument for its
   *  treatment. A new writer MUST appear here — that is the point — and the reason is reviewed. */
  const DURABLE_WRITERS: Record<string, string> = {
    "store/useAnswerPanelStore.ts":
      "user-scoped answers; persisted under cortex-answers-panel-v1, which IS in USER_SCOPED_STORAGE_KEYS and is purged",
    "store/useStageStore.ts":
      "user-scoped stage position; persisted under cortex-stage, which IS in USER_SCOPED_STORAGE_KEYS and is purged",
    "store/usePersonaStore.ts":
      "sessionStorage-backed, not localStorage — dies with the tab, so the localStorage list's remit does not reach it",
    "store/useInterviewStore.ts":
      "writes cortex-grounding-display-mode directly, with no persist() wrapper. DEVICE-scoped by derivation: a display mode for how grounding is rendered, holding no interview content, so a switch of user need not reset it",
    "lib/mockGroundingEmitter.ts":
      "writes cortex-mock-grounding, the mock-mode toggle. DEVICE-scoped by derivation: it selects whether the backend is faked at all, which is a property of the machine and not of who is signed in",
    "hooks/useComposerDraft.ts":
      "keys are COMPUTED per owner (cortex-composer-draft:<owner>), so A's draft is unreachable from B's session by construction; deliberately unpurged, per the seal above about same-user re-login",
    "lib/sessionIsolation.ts":
      "writes the owner stamp itself; purging it would make every reconcile look like a first observation and the purge would fire forever",
  };

  /** Recursive, because the point of this arm is that location does not matter. */
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
      return [full];
    });

  const SRC = path.join(__dirname, "..");
  const writers = walk(SRC)
    .filter((f) => /localStorage\.setItem|persist\(/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
    .sort();

  it("the write-site enumeration finds the known writers — positive control", () => {
    // Without this, a walk that returned nothing would make the arm below assert over an empty
    // set, which is the failure this whole file is a monument to.
    expect(writers).toContain("store/useStageStore.ts");
    expect(writers).toContain("hooks/useComposerDraft.ts");
    expect(writers.length).toBeGreaterThanOrEqual(5);
  });

  it("⛔ every durable-localStorage writer in src/ is registered with a reason", () => {
    const unregistered = writers.filter((f) => !(f in DURABLE_WRITERS));
    expect(
      unregistered,
      "this module can outlive a reload and no isolation decision covers it — add it to " +
        "DURABLE_WRITERS with the argument for purging or not purging its key",
    ).toEqual([]);
    for (const [f, why] of Object.entries(DURABLE_WRITERS)) {
      expect(why.length, `${f}: reason too thin to review`).toBeGreaterThan(40);
    }
  });

  it("⛔ and the register has not lost its subject — both directions", () => {
    // The complement, and the one that caught the lane opposite: an entry whose module no longer
    // writes anything is a stale argument that reads as live coverage. A register checked in one
    // direction only decays silently.
    const stale = Object.keys(DURABLE_WRITERS).filter((f) => !writers.includes(f));
    expect(
      stale,
      "registered as a durable writer but writes nothing now — delete the entry, do not leave the " +
        "argument standing for code that no longer makes it",
    ).toEqual([]);
  });
});
