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
import ts from "typescript";
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

/**
 * The stores the purge FUNCTION BODY names — by syntax, not by text search.
 *
 * ⚠ The version before this asked `ISOLATION_SRC.includes(m)`: whether the module's name appeared
 * ANYWHERE in the file. An audit on 2026-09-26 fired a store that was never purged and never
 * exempted, named only in a COMMENT above the purge, and the completeness arm below stayed GREEN.
 * The module's own docstring says a store must "purge or be named in PURGE_EXEMPT_STORES with a
 * reason. There is no third option" — and the check granted a third: mentioned in prose, reason
 * required of nobody. An excuse keyed on a substring excuses whatever else shares the string; here
 * that included prose, and would include a longer name containing a shorter one. Identifiers inside
 * `purgeUserScopedState` are neither: a comment is not a node, and `useStageStoreV2` is a different
 * identifier from `useStageStore` rather than a superstring of it.
 */
const purgedIn = (src: string): Set<string> => {
  const sf = ts.createSourceFile(
    "sessionIsolation.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "purgeUserScopedState" && n.body) {
      const grab = (x: ts.Node): void => {
        if (ts.isIdentifier(x)) names.add(x.text);
        ts.forEachChild(x, grab);
      };
      grab(n.body);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
};

/** The real subject. Kept separate from `purgedIn` so a control can drive it with a doctored source. */
const purgedInBody = purgedIn(ISOLATION_SRC);

/**
 * Whether a stated reason can actually be reviewed.
 *
 * ⚠ Extracted because the threshold it replaces was DEAD. Both registers carried an inline length
 * check — `> 40` here, `> 30` for the exemptions — and every real reason in this file is between 300
 * and 418 characters, so on 2026-09-26 relaxing `> 40` to `> 0` was QUIET. A threshold no case
 * approaches is not a check; it is a number that reads like one, and an entry with a one-character
 * reason would have passed a suite that claims reasons must be reviewable. One threshold now, with
 * both directions asserted below, and `.trim()` because sixty spaces is a length and not a reason.
 */
const reasonIsReviewable = (reason: string): boolean => reason.trim().length > 40;

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
    // ⛔ THE RATCHET, AND ITS COVER, MEASURED 2026-09-26. This said `>= 7` and was guarding ELEVEN
    // — written when there were seven and never touched since, so it had silently loosened into four
    // modules of slack. A shrinkage ratchet must equal the population at the moment it is written,
    // or it is a bound drifting away from its own subject.
    //
    // ITS COVER WAS THEN MEASURED RATHER THAN ASSUMED, and the answer is narrower than "it covers
    // nothing" — which is what I first wrote here and could not defend:
    //
    //   a store RENAMED out of the convention  → the convention arm reds on the unmatched file
    //   a persisting store REMOVED             → the register's both-directions arm reds
    //   an exempted store REMOVED              → the exemption arm reds ("no longer exists")
    //   a plain store DELETED outright         → ⛔ NOTHING ELSE REDS. This count is sole cover.
    //
    // ⛔ AND THE "PLAIN" ROW WAS THEN COUNTED, because a row of a table is a claim about a subset and
    // I had not said how big it is. All eleven stores were dropped from the population one at a time
    // (2026-09-26, `del-<store>.log`): **sole cover for exactly four** — useCanvasStore,
    // useEvidenceStore, useHumanTaskStore, useInterviewStore — and doubled for the other seven. The
    // property that makes the difference is worth stating, because it is the general rule and not a
    // fact about these files: a persisted KEY and an exemption ENTRY name the store somewhere the
    // same diff does not have to touch, so removing the store leaves a stale mention that reds. A
    // purged store's name lives ONLY in the purge body, which the removing diff deletes in the same
    // breath — nothing is left behind to go stale. **Deletion is self-evidencing exactly when the
    // subject is named twice.** No assertion can be built for the four; a count is genuinely all
    // there is, which is why this stays and why the peer's B2 strike lands on it.
    //
    // ⚠ THE INVITATION WAS REAL, AND MEASURING IT IS WHAT CLOSED IT. Fired as mutant B2 asks — drop
    // a store from the population AND lower the literal to match — the suite was GREEN for those
    // four, because part 2 is precisely the repair part 1 demands and a number cannot refuse its own
    // re-statement. So the improvement is not a stronger check; it is the EVIDENCE the failure leaves
    // in the diff. `11` → `10` says a store left; a removed NAME says which one, in the same shape
    // `DURABLE_WRITERS` already uses two describes below. With the population asserted by name, the
    // two-part repair no longer suffices: re-fired on useEvidenceStore and on useHumanTaskStore (the
    // two plain stores not pinned above), both parts applied, it reds on "a store named here is
    // gone" — a third edit is now required and that edit is the record. **Confirmed by the failing
    // assertion's own message, not by the exit code**: the first re-fire used useCanvasStore, went
    // red, and was red for the PIN three lines up, which would have credited the new arm with cover
    // it had not shown. The count is kept because it reds first with the shortest message. Neither
    // half is leak-catching; both are bookkeeping that cannot go quiet.
    expect(storeModules.length).toBeGreaterThanOrEqual(11);
    // Both directions on purpose: `toEqual` on a sorted array would say the same thing, but the two
    // failures answer different questions and a reader of the red should not have to diff by eye.
    const KNOWN_STORES = [
      "useAnswerPanelStore",
      "useCanvasStore",
      "useEvidenceStore",
      "useHumanTaskStore",
      "useInterviewStore",
      "usePersonaStore",
      "usePresentationStore",
      "useRegistrationStore",
      "useStageStore",
      "useTaskKindStore",
      "useTemplateStore",
    ];
    expect(
      KNOWN_STORES.filter((s) => !storeModules.includes(s)),
      "a store named here is gone from src/store — if that was deliberate, remove the name in the " +
        "SAME diff, so the record says which store left rather than that the number got smaller",
    ).toEqual([]);
    expect(
      storeModules.filter((s) => !KNOWN_STORES.includes(s)),
      "a NEW store joined the population — add it here, and check it is purged or exempted with a " +
        "reason; the convention arm below only proves it could be seen, not that anyone looked",
    ).toEqual([]);
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
      (m) => !purgedInBody.has(m) && !(m in PURGE_EXEMPT_STORES),
    );
    expect(undecided).toEqual([]);
  });

  it("the purge-body derivation is scoped to the BODY, not the file — control", () => {
    // Without this, `purgedInBody` could quietly widen back to a file-wide scan and every arm above
    // would stay green while meaning less. useTemplateStore is the instrument, and it is a real one
    // rather than a fixture: it IS named in this file, in the exemption register with a paragraph of
    // reasoning, and it is NOT purged. A derivation that counts it has stopped reading the body.
    expect(purgedInBody.has("useStageStore")).toBe(true);
    expect(purgedInBody.has("useTemplateStore")).toBe(false);
    expect(ISOLATION_SRC).toContain("useTemplateStore");
    // ⚠ The line above is NOT enough, and that was measured, not reasoned: dropping the function's
    // NAME from the derivation so it grabs every function body in the file left all 19 arms GREEN on
    // 2026-09-26, because useTemplateStore lives in an object literal outside any function and so is
    // missed by the wider scan too. A control that passes under the drift it is named for is not a
    // control. OWNER_KEY is the instrument that separates the two: it is named in
    // reconcileSessionOwner's body and nowhere in the purge's, so it appears the moment this
    // derivation stops being anchored to one named function.
    expect(purgedInBody.has("OWNER_KEY")).toBe(false);
    // And the two registers partition the population rather than merely covering it: a store that is
    // both purged and exempted is two decisions with one of them stale, which no arm above can see.
    const both = storeModules.filter((m) => purgedInBody.has(m) && m in PURGE_EXEMPT_STORES);
    expect(both, "purged AND exempted — one of the two decisions is stale").toEqual([]);
  });

  it("every exemption states WHY — an exemption without a reason is an oversight in costume", () => {
    for (const [store, reason] of Object.entries(PURGE_EXEMPT_STORES)) {
      expect(storeModules, `${store} is exempted but no longer exists`).toContain(store);
      expect(
        reasonIsReviewable(reason),
        `${store}'s exemption reason is too thin to review`,
      ).toBe(true);
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
    "auth/AuthProvider.tsx":
      "Hands `window.sessionStorage` to oidc-client-ts's WebStorageStateStore, so the OIDC user " +
      "record — the authenticated session itself — is written durably by the DEPENDENCY, with no " +
      "setItem anywhere in our source. Deliberately NOT purged: this store is the owner signal " +
      "reconcileSessionOwner reads, and wiping it during an owner change would erase the evidence " +
      "of the change being reacted to, logging the arriving user straight back out. Found by the " +
      "subject-keyed predicate on 2026-09-26; no verb-keyed rule could have seen it.",
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
    "api/client.ts":
      "writes cortex-session-id to sessionStorage, which dies with the tab — a new tab is a new session id by construction, so the localStorage list's remit does not reach it",
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
  /**
   * Which files can leave something behind across a reload.
   *
   * ⚠ THIS PREDICATE KEYS ON THE SUBJECT, NOT THE VERB — and the difference is a measurement, not
   * a preference. The version before it enumerated the dangerous verbs (`setItem`, `removeItem`) and
   * so was total over their SPELLING only: it saw `ls["setItem"](v)` and missed `ls[verb](v)`, which
   * an audit on 2026-09-26 fired and found GREEN. The comment above it had already written that case
   * down as "the irreducible tail" — and a limit stated in prose reads as diligence and stops the
   * re-examination as effectively as a wrong answer would. It was not irreducible. Enumerating what
   * is SAFE instead (the two read verbs) makes every other form, known or not, count by default:
   * a variable verb resolves to no known read, so it counts.
   *
   * It also catches the form that has no verb here at all. `auth/AuthProvider.tsx:10` hands
   * `window.sessionStorage` to `oidc-client-ts` as a VALUE; the writes happen inside the dependency.
   * No verb-keyed rule of any strictness could have seen it, and it was in no register until this
   * predicate found it.
   *
   * IT OVER-MATCHES ON PURPOSE. `sessionStorage` lands here too, and so does a module that only
   * removes, and so does one that merely passes the object along. Over-matching costs one register
   * entry with a stated reason; under-matching costs a leak. That asymmetry is the whole argument
   * for erring in this direction.
   *
   * ⚠ THE RESIDUAL, corrected once already, so stated with what closes it rather than as a boundary.
   * Re-export is NOT the residual and it is NOT harmless: the binding site reds here, but a module
   * that merely IMPORTS the handle writes durably while naming no storage, and that was GREEN on
   * 2026-09-26 with the binding site registered. It is closed structurally by the export arm below,
   * not by this predicate — no rule keyed on the object can see a module that never names it.
   * What is left: a module that obtains storage without any site naming it — `globalThis["local" +
   * "Storage"]`, or a dependency reaching `window` with nothing passed from here.
   */
  const READ_VERBS = new Set(["getItem", "key"]);

  /** The member being accessed, or null when it is not statically knowable — which counts as a write. */
  const verbOf = (acc: ts.Node): string | null => {
    if (ts.isPropertyAccessExpression(acc)) return acc.name.text;
    if (ts.isElementAccessExpression(acc)) {
      const a = acc.argumentExpression;
      return a && ts.isStringLiteral(a) ? a.text : null;
    }
    return null;
  };

  /** A reference to the storage object itself — bare, or as `window.localStorage`. */
  const isStorageRef = (n: ts.Node): boolean =>
    (ts.isIdentifier(n) &&
      /^(localStorage|sessionStorage)$/.test(n.text) &&
      !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) ||
    (ts.isPropertyAccessExpression(n) && /^(localStorage|sessionStorage)$/.test(n.name.text));

  const touchesStorage = (file: string, src = readFileSync(file, "utf8")): boolean => {
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const persistAliases = new Set<string>();
    let found = false;
    const visit = (n: ts.Node): void => {
      if (
        ts.isImportDeclaration(n) &&
        ts.isStringLiteral(n.moduleSpecifier) &&
        n.moduleSpecifier.text.startsWith("zustand")
      ) {
        const bindings = n.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            if ((el.propertyName ?? el.name).text === "persist") persistAliases.add(el.name.text);
          }
        }
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && persistAliases.has(n.expression.text)) {
        found = true;
      }
      if (isStorageRef(n)) {
        const p = n.parent;
        const pureRead =
          !!p &&
          (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) &&
          p.expression === n &&
          READ_VERBS.has(verbOf(p) ?? "");
        if (!pureRead) found = true;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
  };

  const writers = walk(SRC)
    .filter((f) => touchesStorage(f)) // NOT point-free: the second parameter is a source, and Array#filter would hand it the index
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
      expect(reasonIsReviewable(why), `${f}: reason too thin to review`).toBe(true);
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

  /**
   * Whether an expression IS the storage object, rather than merely containing a reference to one
   * somewhere inside. The first version asked the latter and flagged two store hooks whose bodies
   * write storage — exporting a store that persists is the normal case this whole register exists
   * to describe, not a leak. Conditionals and `??`/`||` are judged branch by branch, because a
   * rule that reads a two-branch expression as one whole excuses the branch it did not look at.
   */
  const isStorageValue = (e: ts.Node): boolean => {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
      return isStorageValue(e.expression);
    }
    if (ts.isConditionalExpression(e)) {
      return isStorageValue(e.whenTrue) || isStorageValue(e.whenFalse);
    }
    if (
      ts.isBinaryExpression(e) &&
      (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      return isStorageValue(e.left) || isStorageValue(e.right);
    }
    if (
      ts.isElementAccessExpression(e) &&
      e.argumentExpression &&
      ts.isStringLiteral(e.argumentExpression) &&
      /^(localStorage|sessionStorage)$/.test(e.argumentExpression.text)
    ) {
      return true;
    }
    return isStorageRef(e);
  };

  /**
   * A storage object may not LEAVE its module.
   *
   * ⚠ I deleted this arm one commit ago, in 62ad56e, for a reason that was true and irrelevant:
   * `export const S = window.localStorage` already reds the arrival arm, because the binding site
   * names storage. It does. But the peer asked the question I had not — the predicate keys on the
   * OBJECT, so what happens when the object is obtained rather than named? — and the two-file form
   * was GREEN:
   *
   *     lib/storageHandle.ts   export const handle = window.localStorage;   (registered)
   *     lib/quietConsumer.ts   import { handle } from "./storageHandle";
   *                            handle.setItem("cortex-quiet-2", v);          <- names no storage
   *
   * 19/19 green with a new durable key shipping from an unregistered module. The consumer is the
   * site that owns the key and it is invisible, because no rule keyed on the object can see a module
   * that never names it. **I measured this arm's cover with a one-file mutant and it needed a
   * two-file one** — an arm's cover has to be searched with the mutant that matters, not the nearest
   * mutant to hand.
   *
   * Forbidding the export closes it at one stroke and at any number of hops, where taint-tracking
   * the handle across modules would need a fixpoint in a unit test. It is also the fail-safe
   * direction: a module that wants durable state writes it here, under a register entry.
   *
   * ⚠ ~~Passing storage as an ARGUMENT is deliberately not forbidden, because it is not silent: the
   * call site names storage and so is itself in the register — `auth/AuthProvider.tsx` is exactly
   * that shape. What remains unreachable is a callee holding the key while the caller holds the
   * register entry; the entry's reason is where that has to be said, and AuthProvider's says it.~~
   *
   * **Struck 2026-09-26.** The last sentence named a live hole and then excused it. "The entry's
   * reason is where that has to be said" is a hope about what a human will write, not a check, and
   * the case it describes measured 21/21 GREEN when finally fired as the two-file pair it specifies.
   * A prediction written into a docstring is a mutant nobody has run yet — and this one had my own
   * name on it, one commit after I learned the same lesson from the peer. See
   * `storagePassedToOurCode` below, which forbids the handoff to OUR code and keeps the dependency
   * case allowed for a stated reason rather than by omission.
   */
  const exportsStorage = (file: string, src = readFileSync(file, "utf8")): string[] => {
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const boundToStorage = new Set<string>();
    const exported: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isVariableStatement(n)) {
        const isExported = !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        for (const d of n.declarationList.declarations) {
          if (d.initializer && isStorageValue(d.initializer) && ts.isIdentifier(d.name)) {
            boundToStorage.add(d.name.text);
            if (isExported) exported.push(d.name.text);
          }
        }
      }
      if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
        for (const el of n.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text;
          if (boundToStorage.has(local)) exported.push(local);
        }
      }
      if (ts.isExportAssignment(n) && isStorageValue(n.expression)) exported.push("default");
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return exported;
  };

  it("⛔ no module exports a storage object — the capability may not travel unnamed", () => {
    const leaks = walk(SRC)
      .map((f) => [path.relative(SRC, f).split(path.sep).join("/"), exportsStorage(f)] as const)
      .filter(([, names]) => names.length > 0)
      .map(([f, names]) => `${f} exports ${names.join(", ")}`);
    expect(
      leaks,
      "an exported storage handle lets an importing module write durably while naming no storage, " +
        "so it is invisible to every arm above — write through a registered module instead",
    ).toEqual([]);
  });

  /**
   * A storage object may not be handed to OUR OWN code either.
   *
   * ⚠ This arm exists because a docstring of mine predicted the case and no mutant of mine ever ran
   * it. The export arm's comment said passing storage as an argument "is deliberately not forbidden,
   * because it is not silent: the call site names storage and so is itself in the register", and that
   * what remained unreachable was "a callee holding the key while the caller holds the register
   * entry". Fired on 2026-09-26 as the two-file pair the sentence describes:
   *
   *     lib/writerCore.ts  export const put = (s: Storage, v: string) => s.setItem("cortex-crossmod", v);
   *     lib/callSite.ts    import { put } from "./writerCore";  put(window.localStorage, v);   (REGISTERED)
   *
   * 21/21 GREEN, key in an unregistered module. The sentence was right about the mechanism and wrong
   * that it was covered: "the entry's reason is where that has to be said" is a claim about human
   * discipline, not a check. A prediction written into a docstring is a mutant nobody has run yet.
   *
   * A DEPENDENCY is a different case and stays allowed, for a reason rather than by omission: it
   * cannot carry a register entry, the boundary is where our reach ends, and the call site that names
   * storage is registered and must explain itself — `auth/AuthProvider.tsx` handing sessionStorage to
   * oidc-client-ts is exactly that. Measured the same day: all five real pass-sites in src/ hand
   * storage to package imports, so this arm starts with zero false positives rather than a waiver.
   */
  const storagePassedToOurCode = (file: string, src = readFileSync(file, "utf8")): string[] => {
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    /** Imported from our own source: a relative path, or the `@/` alias. */
    const ours = new Map<string, string>();
    /**
     * Storage reached through LITERALS only — the value itself, or a property/element of an object or
     * array literal argument. Deliberately not "anywhere in the argument's subtree": that reading
     * flagged `create(() => { localStorage.setItem(...) })`, which is a store body and not a handoff.
     */
    const handedOver = (a: ts.Node): boolean => {
      if (isStorageValue(a)) return true;
      if (ts.isObjectLiteralExpression(a)) {
        return a.properties.some((p) => ts.isPropertyAssignment(p) && handedOver(p.initializer));
      }
      if (ts.isArrayLiteralExpression(a)) return a.elements.some(handedOver);
      return false;
    };
    const hits: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (spec.startsWith(".") || spec.startsWith("@/")) {
          const b = n.importClause?.namedBindings;
          if (b && ts.isNamedImports(b)) for (const el of b.elements) ours.set(el.name.text, spec);
          if (n.importClause?.name) ours.set(n.importClause.name.text, spec);
        }
      }
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        let root: ts.Node = n.expression;
        while (ts.isPropertyAccessExpression(root)) root = root.expression;
        const callee = ts.isIdentifier(root) ? root.text : null;
        if (callee && ours.has(callee) && (n.arguments ?? []).some(handedOver)) hits.push(callee);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return hits;
  };

  it("⛔ no storage object is handed to another module of ours — the callee would hold the key", () => {
    const sites = walk(SRC)
      .map((f) => [path.relative(SRC, f).split(path.sep).join("/"), storagePassedToOurCode(f)] as const)
      .filter(([, names]) => names.length > 0)
      .map(([f, names]) => `${f} hands storage to ${names.join(", ")}`);
    expect(
      sites,
      "the callee owns the key while the caller owns the register entry, so the module that decides " +
        "what outlives a reload is invisible to every arm here — write it in a registered module",
    ).toEqual([]);
  });

  it("⛔ the handoff and reason rules are driven directly — both directions", () => {
    const D = "doctored.ts";
    // Refused: our own code, named and default imports, bare and nested one literal deep.
    expect(
      storagePassedToOurCode(D, 'import { put } from "./writerCore";\nput(window.localStorage, v);'),
    ).toEqual(["put"]);
    expect(
      storagePassedToOurCode(D, 'import { put } from "@/lib/x";\nput({ store: window.localStorage });'),
    ).toEqual(["put"]);
    expect(
      storagePassedToOurCode(D, 'import mod from "./m";\nmod.wrap([window.sessionStorage]);'),
    ).toEqual(["mod"]);
    // Accepted, each for its own reason and not by omission.
    expect(
      storagePassedToOurCode(
        D,
        'import { WebStorageStateStore } from "oidc-client-ts";\nnew WebStorageStateStore({ store: window.sessionStorage });',
      ),
      "a dependency cannot carry a register entry; the call site names storage and is registered",
    ).toEqual([]);
    expect(
      storagePassedToOurCode(D, 'const put = (s) => s.setItem("k", "v");\nput(window.localStorage);'),
      "a local callee keeps the key in this module, which is the module already in the register",
    ).toEqual([]);
    expect(
      storagePassedToOurCode(
        D,
        'import { create } from "zustand";\ncreate(() => { localStorage.setItem("k", "v"); });',
      ),
      "a store body is not a handoff — reading storage anywhere in an argument subtree is the wrong rule",
    ).toEqual([]);

    // The reason threshold, which was dead until it was extracted.
    expect(reasonIsReviewable("x")).toBe(false);
    expect(reasonIsReviewable("")).toBe(false);
    expect(reasonIsReviewable(" ".repeat(80)), "padding is a length, not a reason").toBe(false);
    expect(reasonIsReviewable(DURABLE_WRITERS["api/client.ts"])).toBe(true);
  });

  /**
   * ⛔ The derivations examined, not merely consumed.
   *
   * Every arm above USES a derivation and none of them looks at what one returns, which is how a
   * widened derivation stays green: the peer session measured that on its own tree and found five of
   * seven widenings silent, including one that reverted the fix the suite was written for. Both
   * derivations here read a real file, so until this commit no test could drive them with a doctored
   * source either — untestable by construction, which is the same defect one level down.
   *
   * ⚠ BOTH DIRECTIONS ON PURPOSE. A rule that refuses everything is exactly as useless as one that
   * refuses nothing, and only the ACCEPTING half tells them apart. The accepting cases here are not
   * hypothetical: narrowing `exportsStorage` from "the subtree contains a storage reference" to "the
   * value IS the storage object" was forced by two real store hooks it wrongly flagged, and that is
   * the mutation this control exists to catch on the way back.
   */
  it("⛔ the storage derivations are driven against doctored sources — both directions", () => {
    const D = "doctored.ts";

    // ── refused: the capability leaving the module, in each shape the rule claims to cover ──
    expect(exportsStorage(D, "export const h = window.localStorage;")).toEqual(["h"]);
    expect(exportsStorage(D, "const h = localStorage;\nexport { h };")).toEqual(["h"]);
    expect(exportsStorage(D, "export default window.sessionStorage;")).toEqual(["default"]);
    expect(exportsStorage(D, 'export const h = window["localStorage"];')).toEqual(["h"]);
    // A two-branch expression is judged branch by branch: a rule that reads it whole excuses
    // whichever branch it did not look at.
    expect(exportsStorage(D, "export const h = fake ?? window.localStorage;")).toEqual(["h"]);
    expect(exportsStorage(D, "export const h = cond ? window.localStorage : fake;")).toEqual(["h"]);
    // ⚠ ONE CASE PER BRANCH, and the near side is the one that was missing. The peer session's B1
    // names the property that hid it: where a two-branch rule reads the same allowed value either
    // way, dropping one branch is a genuine no-op on the tree as it stands, so its quiet reads as
    // "no cover needed". Measured on 2026-09-26: dropping `whenFalse` and dropping `left` were both
    // QUIET, because every case I had written put the storage object on the side that survived. The
    // case that runs THROUGH a branch is not the case that distinguishes it.
    expect(exportsStorage(D, "export const h = cond ? fake : window.localStorage;")).toEqual(["h"]);
    expect(exportsStorage(D, "export const h = window.localStorage ?? fake;")).toEqual(["h"]);
    expect(exportsStorage(D, "export const h = fake || window.localStorage;")).toEqual(["h"]);
    // And the unwrapping branch, which until now no case exercised at all — a cast or a paren is how
    // this actually gets written in TypeScript.
    expect(exportsStorage(D, "export const h = window.localStorage as Storage;")).toEqual(["h"]);
    expect(exportsStorage(D, "export const h = (window.localStorage)!;")).toEqual(["h"]);

    // ── accepted: exporting something whose BODY writes storage is the normal, registered case ──
    expect(
      exportsStorage(D, 'export const useX = create(() => { localStorage.setItem("k", "v"); });'),
      "flagging a store hook that persists would make the arm refuse the entire population it exists to describe",
    ).toEqual([]);
    expect(exportsStorage(D, 'export const read = () => localStorage.getItem("k");')).toEqual([]);

    // ── the write predicate, both directions, including the bracket-form READ ──
    expect(touchesStorage(D, 'x.setItem("k", "v");')).toBe(false); // not storage at all
    expect(touchesStorage(D, 'localStorage.setItem("k", "v");')).toBe(true);
    expect(touchesStorage(D, "const s = window.localStorage;")).toBe(true); // binding alone
    expect(touchesStorage(D, 'const m = "setItem";\nls.localStorage[m]("k", "v");')).toBe(true);
    expect(touchesStorage(D, 'sink(window.sessionStorage);')).toBe(true); // handed to a dependency
    // ⚠ These two are the ACCEPTING half of the read allow-list, and the bracket one earns its place:
    // deleting the element-access branch of `verbOf` — which exists only to excuse a bracket-form
    // read — left all 19 arms green on 2026-09-26. A branch whose removal changes no result is dead
    // weight described as a check, so the dead weight is now load-bearing.
    expect(touchesStorage(D, 'const v = localStorage.getItem("k");')).toBe(false);
    expect(touchesStorage(D, 'const v = localStorage["getItem"]("k");')).toBe(false);
  });
});
