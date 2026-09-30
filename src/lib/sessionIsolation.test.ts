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
    // ONE DIRECTION ON PURPOSE, and measured before saying so. A temporary probe put both sides
    // side by side on 2026-09-26: |local persisted keys| = 2, |USER_SCOPED_STORAGE_KEYS| = 2,
    // intersection 2 — so the reverse term would be empty today too, and adding it would read as
    // cover it does not carry. The reverse case is a DECLARED key no store owns, which is a purge
    // removing a key nobody writes: harmless. The case that is not harmless — a store renaming its
    // persist key — arrives through THIS direction as a new undeclared key, so it reds here. Stated
    // so the asymmetry is a decision on record and not the next reader's open question.
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
    "lib/ingestFlag.ts":
      "writes cortex.ingest and cortex.ingestMock, the ADR-0041 ingest UI and mock-transport toggles. DEVICE-scoped by the same derivation as mockGroundingEmitter above: both select which UI/transport this machine runs, not anything about who is signed in, so a user switch must not reset them",
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
      // The discriminator is the IMPORT KIND, not the callee's shape: a bare-package specifier is
      // outside the register's reach, while the relative-import case three lines above is refused. Said
      // here because "a callee was handed storage" is the wrong summary of this arm, and the wrong
      // summary is the one that gets lifted back onto our own modules.
      "a DEPENDENCY cannot carry a register entry; the call site names storage and is registered",
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

/**
 * ⛔ THE REGISTERS STAY SPELLED OUT — the one mutation every arm above, including the ones added
 * today, agrees with by construction.
 *
 * From the invincible-agent lane, 2026-09-26, as the piece they sent back: **no mutant of a
 * register's CONTENT can object to a derived register, because a derived register agrees with the
 * producer by construction.** The guard against the tidy-up has to live in the source TEXT, not in
 * the values. Fired here the same hour, on the register I had installed an hour earlier:
 *
 *   T1     `const KNOWN_STORES = [...storeModules];`                         → 23/23 GREEN
 *   T1+B2  the same, plus drop a store and lower the floor                   → 23/23 GREEN
 *   T2     `DURABLE_WRITERS = Object.fromEntries(writers.map(...))`           → 23/23 GREEN
 *
 * T1+B2 is the whole of this morning's B2 fix undone by one edit that reads as simplification. T2 is
 * worse: that register is what catches a durable writer nobody declared — `auth/AuthProvider.tsx`
 * was found by it — and derived, it auto-registers every future writer with a boilerplate reason
 * long enough to clear the reviewability threshold without a human having read anything. Both
 * mutants are a single line, and both look like tidying up after a pedant.
 *
 * ⚠ The population here is DERIVED ON PURPOSE, and this is the one place where that is the safe
 * direction: it is every UPPER_SNAKE const in this file, minus a named allow-list of the ones that
 * legitimately hold a file read or a path. A list of guarded register NAMES would go stale the
 * moment someone adds a twelfth register — the non-arrival failure this file already carries a whole
 * describe about. Derived, a new register is guarded by default, and a new source-reading const has
 * to be named in PLUMBING, which is an explicit one-line statement rather than a silence.
 *
 * ⚠ Enumerate the SAFE set, not the dangerous one — and this arm is the second time that rule paid
 * today. The first version asked "array and object literals must contain only literals", which reads
 * as the same thing and is not: `Object.fromEntries(...)` is a CALL, not a collection literal, so T2
 * dropped out of its own population and the arm passed vacuously on the mutant it was written for.
 * Keyed the other way — everything not named as plumbing must be wholly literal — T2 is in by
 * default. Measured both ways before this landed.
 *
 * ⚠ AND THE HONEST BOUND, in the peer's words because they put it better than I did: the register
 * makes a widening visible in a DIFF, it does not make it impossible. Someone widening the producer
 * can re-type the register's literals in the same commit and this arm is satisfied. A name refuses
 * its own re-statement only in the sense that re-stating it is an explicit edit a failing message
 * demands a reason for. That is the whole of the defence, and it is worth having because the quiet
 * version of the same change is one character of spread syntax.
 */
describe("the seal's own registers are source text, not derivations", () => {
  const SELF = readFileSync(path.join(__dirname, "sessionIsolation.test.ts"), "utf8");

  /**
   * Consts that hold a file read or a path rather than a register.
   *
   * ⚠ This was a bare `Set` of names for about ten minutes, and mutant S2 — append
   * `"DURABLE_WRITERS"` to it — was GREEN. An allow-list keyed on a NAME excuses whatever is given
   * that name, which is the excuse-by-name defect the exemption rule three describes up exists to
   * refuse; I wrote the escape hatch without applying my own file's doctrine to it. So an entry now
   * costs two things: a stated reason, held to the same reviewability threshold as a purge
   * exemption, and — the half that actually does the work — the const's initializer must REALLY
   * read a file or build a path. The reason documents; the shape decides.
   *
   * ⚠ That claim used to be argued here by CONTAINMENT — "`Object.fromEntries(writers.map(...))`
   * contains no `readFileSync`" — which was both the wrong criterion (see `isDiskCall`: a derived
   * member list contains a disk read, which is the point of it) and an unfired prediction sitting in
   * a comment. Fired, now, in every direction the sentence implied:
   *
   * | Mutant | Result |
   * |---|---|
   * | this allowance derived: `Object.fromEntries(KEYS.map(...))` | RED, shape arm |
   * | ...and then excused by its own name to quiet that red | RED, complaint arm |
   * | the exact spelling above — `Object.fromEntries(producer.map(...))` — excused | RED, complaint arm |
   * | this allowance read OFF THE DISK via `readdirSync`, excused by its own name | RED, complaint arm |
   * | control: the same, NOT excused — reds on a DIFFERENT arm, so the excuse was really installed | RED, shape arm |
   *
   * The last row is the point of running it. My guard decides on CONTENT — is the initializer truly a
   * disk call — so a case that buys the excuse and one that does not must fail on different arms; had
   * they matched, the excuse was never installed and the red meant nothing.
   */
  const PLUMBING: Record<string, string> = {
    ISOLATION_SRC:
      "The purge module's own source, read once so the AST derivations below can be driven " +
      "against the real file rather than against a fixture that agrees with them.",
    STORE_DIR:
      "The store directory's path, from which the population of stores is read — a path, not a " +
      "list of members, so there is nothing here for anyone to state by hand.",
    SRC:
      "The src/ root, walked to census durable writers. Same reason: the members are the files " +
      "found on disk and the point of the walk is that nobody enumerates them.",
    SELF:
      "This test file's own source, read so the arms below can assert the SHAPE of the registers " +
      "above — the one thing no assertion about their contents can reach.",
  };

  /**
   * The identifiers this file actually BOUND to `node:fs` and `node:path` — derived from its own
   * import declarations, never spelled out here. A rename of the import moves the rule with it.
   */
  const diskBindings = (sf: ts.SourceFile): { fns: Set<string>; objs: Set<string> } => {
    const fns = new Set<string>();
    const objs = new Set<string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      if (!/^node:(fs|path)$/.test(st.moduleSpecifier.text)) continue;
      const clause = st.importClause;
      if (!clause) continue;
      if (clause.name) objs.add(clause.name.text);
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) objs.add(nb.name.text);
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) fns.add(el.name.text);
    }
    return { fns, objs };
  };

  /**
   * The initializer IS a disk read or a path build — not merely one somewhere inside it.
   *
   * ⚠ THREE TIGHTENINGS, EACH ONE A MUTANT THAT CAME BACK QUIET, and the order matters because each
   * fix exposed the next:
   *
   * 1. Keyed on the VERB first: the name `readFileSync|readdirSync|join|resolve|relative` anywhere in
   *    the subtree. `storeModules.join(",")` read as a path build, so a derived register excused as
   *    plumbing passed with every arm green (J1, QUIET). `Array.join` and `Promise.resolve` are
   *    ordinary spellings — two of those five verbs were free for the taking.
   * 2. Keyed on the SUBJECT next: a function bound from `node:fs`, or a method on the object bound
   *    from `node:path`, both derived from this file's own import declarations so a rename moves the
   *    rule with it. That closed J1 and J2. But the search was still over the SUBTREE, and
   *    `readdirSync(STORE_DIR).map((f) => f.replace(".ts", ""))` contains a disk read — so a derived
   *    MEMBER LIST bought the excuse (J5, QUIET), because reading the disk is exactly what a derived
   *    register does. The excuse could not tell a path from a population.
   * 3. So: CONTAINMENT IS NOT SHAPE. The initializer must itself be the call. All four real entries
   *    already are — `readFileSync(path.join(...))`, `path.join(...)` — so this cost nothing on the
   *    real tree, which is the measurement that made it safe to install rather than a hope.
   *
   * Every one of those was a hole in a FIX for the previous hole. The excuse hatch is the piece of
   * this describe that nobody would think to mutate, and it took three rounds to stop being wrong.
   */
  const isDiskCall = (node: ts.Node, bound: { fns: Set<string>; objs: Set<string> }): boolean => {
    if (!ts.isCallExpression(node)) return false;
    const e = node.expression;
    if (ts.isIdentifier(e)) return bound.fns.has(e.text);
    if (!ts.isPropertyAccessExpression(e)) return false;
    let cur: ts.Expression = e;
    while (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
    return ts.isIdentifier(cur) && bound.objs.has(cur.text);
  };

  /**
   * Wholly literal: strings, arrays, objects, `new Set([...])`, and `+` chains of those. Anything
   * that could consult the producer — an identifier, a call, a spread, a computed key, a template
   * with a substitution — is refused. The identifier rejection is the load-bearing one: every
   * derivation has to name its source, so a subtree containing no identifier cannot be reading one.
   */
  const isWhollyLiteral = (node: ts.Node): boolean => {
    let ok = true;
    const visit = (n: ts.Node): void => {
      if (!ok) return;
      if (ts.isNewExpression(n) || ts.isCallExpression(n)) {
        // `new Set([...])` with one literal argument is the single construction allowed, because
        // three of this file's registers are Sets and a Set of literals states its members.
        const isSet =
          ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Set";
        if (!isSet) {
          ok = false;
          return;
        }
        // EVERY argument, not the first: `new Set(["a"], producer)` passed an arity check and left
        // the producer unvisited. A zero-argument `new Set()` is accepted for the same reason
        // `const R: string[] = []` is — it states that there are no members.
        for (const a of n.arguments ?? []) visit(a);
        return;
      }
      if (ts.isPropertyAssignment(n)) {
        // A property NAME is not a producer reference. `{ KEY: "why" }` states a member; the thing
        // that could consult a producer is the VALUE, so only the initializer is visited. Measured:
        // the rule that rejected every identifier reded on this file's own PLUMBING record, whose
        // keys are unquoted — a false red carrying the message "consults something" about a const
        // that consults nothing, which would have taught the next reader the wrong rule.
        if (ts.isComputedPropertyName(n.name)) { ok = false; return; }
        visit(n.initializer);
        return;
      }
      if (
        // (A shorthand `{ PRODUCER }` needs no line of its own: mutant S6 removed one and
        // stayed green, because forEachChild reaches the shorthand`s identifier child and that is
        // already refused. A branch that cannot change an outcome is not cover, it is furniture —
        // the control case below still pins the behaviour.)
        ts.isIdentifier(n) ||
        ts.isSpreadElement(n) ||
        ts.isSpreadAssignment(n) ||
        ts.isComputedPropertyName(n) ||
        ts.isTemplateExpression(n) ||
        // (No arm for a property ACCESS. Dropping one was QUIET across all 28 cases below, and
        // structurally so: the `.name` of a PropertyAccessExpression is itself an Identifier node,
        // so `"why".length` is refused by the identifier arm whether or not this arm exists. An
        // element access is different — `"why"[0]` is a string and a number with no identifier
        // anywhere in it, so that arm is the only thing refusing it and has its own case.)
        ts.isElementAccessExpression(n)
      ) {
        ok = false;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return ok;
  };

  /**
   * Every UPPER_SNAKE const in this file, at any depth, with its initializer.
   *
   * ⚠ WHAT THIS POPULATION ACTUALLY HOLDS, counted 2026-09-26 rather than assumed: 12 names, of
   * which only FOUR are registers the arms below are for — KNOWN_STORES, NON_STORE_MODULES,
   * DURABLE_WRITERS, READ_VERBS. The rest are PLUMBING itself, a `WHY` reason string, and `D`
   * twice, a doctored-filename local in two different arms. The convention regex cannot tell a
   * register from a test local that happens to be shouted, and single letters match it.
   *
   * That is fine for the shape rule, which is a per-member predicate: the extras are string
   * literals and pass trivially. It is NOT fine for a count — a floor of twelve over this
   * population would be eleven parts decoration, and the same naming collision already reded
   * these arms once, when three doctored locals were called COMPUTED/READ/BUILT. Mount on the
   * four, not on the twelve.
   */
  const registers = (src: string): { name: string; init: ts.Node }[] => {
    const sf = ts.createSourceFile("self.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out: { name: string; init: ts.Node }[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        if (/^[A-Z][A-Z0-9_]*$/.test(n.name.text)) {
          out.push({ name: n.name.text, init: n.initializer });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
  };

  /**
   * One parse, both halves: the registers a source declares and the disk bindings it imports. They
   * come from the same `SourceFile` on purpose — two parses of one string are two places for the
   * halves to disagree about what file they are describing.
   */
  const parse = (src: string): { named: { name: string; init: ts.Node }[]; bound: { fns: Set<string>; objs: Set<string> } } => {
    const sf = ts.createSourceFile("self.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const named: { name: string; init: ts.Node }[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        if (/^[A-Z][A-Z0-9_]*$/.test(n.name.text)) named.push({ name: n.name.text, init: n.initializer });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return { named, bound: diskBindings(sf) };
  };

  it("the register enumeration actually finds the registers — positive control", () => {
    const names = registers(SELF).map((r) => r.name);
    // Pinned: the two registers the mutants above defeated, and the one deliberately empty.
    expect(names).toContain("KNOWN_STORES");
    expect(names).toContain("DURABLE_WRITERS");
    expect(names).toContain("NON_STORE_MODULES");
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  it("⛔ no register in this file is computed — a derived register agrees with the producer", () => {
    const judged = registers(SELF).filter((r) => !(r.name in PLUMBING));
    // ⚠ FLOOR ON THE JUDGED POPULATION, not on a count of it. Measured: adding a second filter that
    // narrowed this population to nothing left all 28 arms GREEN, because "nothing here is computed"
    // is perfectly true of an empty population — the allowance filters the population this arm
    // judges, so the allowance can also empty it. The arm now states which registers it is FOR.
    // What this floor does NOT catch is a register deleted from the file along with its name here;
    // that hazard is the positive control's, which spells the same four out independently.
    //
    // ⚠ AND IT COVERS EXACTLY THESE FOUR — measured, not reasoned. A fifth register added to this
    // file passes every arm (correctly: the shape rule is a per-member predicate), and then DELETING
    // it again also passes every arm. So a new register arrives unguarded against removal, because
    // both places that name registers by name name these four. The floor is not a completeness
    // claim and cannot be made into one here: this population also holds `PLUMBING`, `WHY` and two
    // `D`s, so an exact equality would be a list of test locals, and the convention regex cannot
    // tell them apart (see the `registers` docstring).
    //
    // So the check travels with the next register instead of being guessed now: ADD ITS NAME HERE,
    // THEN DELETE THE REGISTER AND CONFIRM SOMETHING REDS BY NAME. If nothing does, it is a register
    // nobody would miss. Borrowed from the peer's round 13, where three ratchet arms all turned out
    // to be about one specific member of an allowance rather than about membership.
    expect(
      judged.map((r) => r.name),
      "the shape arm is no longer looking at the registers it exists for — its population is " +
        "filtered by PLUMBING, so check what the filter left before trusting an empty complaint",
    ).toEqual(
      expect.arrayContaining(["KNOWN_STORES", "NON_STORE_MODULES", "DURABLE_WRITERS", "READ_VERBS"]),
    );
    const computed = judged.filter((r) => !isWhollyLiteral(r.init)).map((r) => r.name);
    expect(
      computed,
      "this register consults something instead of stating it, so every arm that compares the " +
        "population to it now agrees with that population by construction and can no longer object " +
        "to a widening — spell the members out, or name the const in PLUMBING and say why",
    ).toEqual([]);
  });

  it("⛔ the literal-shape rule is driven directly — both directions", () => {
    const one = (src: string): boolean => isWhollyLiteral(registers(src)[0].init);
    // Refused: every shape a tidy-up reaches for, one case per rejection so none is decoration.
    //
    // ⚠ "One case per rejection" was FALSE when first written, and reading the list could not show
    // it. A per-case cover census — delete one arm of the rule, report every case that flips —
    // found SIX arms with no case that covered them: both spread arms, the template arm, the
    // computed-name arm, the Set-name check and the arity check. Every case that claimed them
    // (`[...storeModules]`, `new Set(xs)`, `{ ...BASE }`) carries a BARE IDENTIFIER, so the
    // identifier arm refused the input as well and no mutant of either arm could be indicted by it.
    // A refusal fixture reads as coverage of the category its LABEL names; what it covers is
    // whatever its BODY actually trips over first. The nine literal-only cases below were added to
    // partition those categories, and each of the rule's arms now flips exactly one case.
    expect(one("const R = [...storeModules];"), "spread").toBe(false);
    expect(one("const R = storeModules;"), "bare identifier").toBe(false);
    expect(one('const R = Object.fromEntries(xs.map((f) => [f, "why"]));'), "call").toBe(false);
    expect(one('const R = { ...BASE, "a.ts": "why" };'), "object spread").toBe(false);
    expect(one('const R = { [k]: "why" };'), "computed key").toBe(false);
    expect(one("const R = [`use${n}Store`];"), "template substitution").toBe(false);
    expect(one("const R = new Set(xs);"), "Set over a producer").toBe(false);
    expect(one("const R = xs.filter((f) => true);"), "method call").toBe(false);
    expect(one("const R = ONE.concat(TWO);"), "two registers joined").toBe(false);
    expect(one('const R = { KEY: PRODUCER };'), "identifier as a VALUE").toBe(false);
    expect(one("const R = { PRODUCER };"), "shorthand property").toBe(false);
    // ⚠ The nine below exist because the per-case cover census found their branches UNCOVERED. The
    // obvious case for each — `[...storeModules]` for the spread arm, `new Set(xs)` for the Set
    // arm — carries a bare identifier, so the identifier arm refuses it too and NEITHER arm can be
    // indicted by it. These carry no identifier, so exactly one arm stands between them and green.
    expect(one('const R = [...["a.ts"]];'), "spread of a LITERAL array").toBe(false);
    expect(one('const R = { ...{ "a.ts": "why" } };'), "spread of a LITERAL object").toBe(false);
    expect(one('const R = [`use${"Canvas"}Store`];'), "template with a LITERAL substitution").toBe(false);
    expect(one('const R = { "a.ts": "why".length };'), "property read off a literal — pinned by the IDENTIFIER arm, which is why there is no property-access arm").toBe(false);
    expect(one('const R = { "a.ts": "why"[0] };'), "element read off a literal").toBe(false);
    expect(one('const R = new Map([["a.ts", "why"]]);'), "a constructor that is not Set").toBe(false);
    expect(one('const R = new Set(["a.ts"], xs);'), "a SECOND argument to Set").toBe(false);
    expect(one('const R = { ["a.ts"]() { return "why"; } };'), "computed METHOD name").toBe(false);
    expect(one('const R = [(() => "a.ts")()];'), "an IIFE returning a literal").toBe(false);
    // Accepted, each a shape a real register in this file uses today.
    expect(one('const R = ["useCanvasStore", "useEvidenceStore"];'), "array of strings").toBe(true);
    expect(one('const R = { "a.ts": "why" };'), "object of strings").toBe(true);
    expect(one('const R = { "a.ts": "why, " + "at length" };'), "concatenated reason").toBe(true);
    expect(one('const R = new Set(["getItem", "key"]);'), "Set of literals").toBe(true);
    expect(one("const R: string[] = [];"), "deliberately empty").toBe(true);
    expect(one("const R = new Set();"), "an empty Set states no members").toBe(true);
    expect(one('const R = "doctored.ts";'), "a plain string const").toBe(true);
    expect(one('const R = { KEY: "why, at length" };'), "unquoted KEY, literal value").toBe(true);
  });

  /**
   * Every complaint the plumbing allowance can make, as data — so the arm below asserts on the real
   * allowance and the arm after it drives the same function with doctored ones.
   *
   * ⚠ Written as three inline `expect`s first, and two of the three were QUIET under mutation:
   * deleting the reviewable-reason check and neutering the stale-name check both left 27/27 green,
   * because the real allowance satisfies every category and nothing else ever called them. A check
   * whose only input is data that passes it is the same dead branch this file keeps finding — the
   * case that runs THROUGH a check is not the case that distinguishes it. Returning complaints
   * instead of asserting them is what makes each category drivable without editing the seal.
   */
  const plumbingComplaints = (
    allowance: Record<string, string>,
    parsed: { named: { name: string; init: ts.Node }[]; bound: { fns: Set<string>; objs: Set<string> } },
  ): string[] => {
    const { named, bound } = parsed;
    const out: string[] = [];
    for (const k of Object.keys(allowance)) {
      if (!named.some((r) => r.name === k)) out.push(`${k}: named as plumbing, but no such const`);
    }
    for (const r of named) {
      if (r.name in allowance && !isDiskCall(r.init, bound)) {
        out.push(`${r.name}: excused as plumbing, but its initializer is not itself a file read or a path build`);
      }
    }
    for (const [k, why] of Object.entries(allowance)) {
      if (!reasonIsReviewable(why)) out.push(`${k}: no reviewable reason`);
    }
    return out;
  };

  it("⛔ and the plumbing allowance cannot be claimed by a register — both directions", () => {
    expect(
      plumbingComplaints(PLUMBING, parse(SELF)),
      "an entry is excused from the literal rule without earning it — see the complaint; the " +
        "allowance is the escape hatch from every other arm in this describe, so it pays rent",
    ).toEqual([]);
  });

  it("⛔ the plumbing complaints are driven with doctored allowances — one case per category", () => {
    const self = parse(SELF);
    const WHY = "a reason long enough to clear the reviewability threshold, stated so a reviewer has something to disagree with";
    // Each case asserts ITS OWN complaint, not "some complaint": the peer's correction from their
    // round 17 — dropping one category makes a combined assertion fire on the first one instead, so
    // the measurement credits the wrong check and the fragment you predicted never appears.
    expect(plumbingComplaints({ NO_SUCH_CONST: WHY }, self).join(" | ")).toContain(
      "NO_SUCH_CONST: named as plumbing, but no such const",
    );
    expect(plumbingComplaints({ DURABLE_WRITERS: WHY }, self).join(" | ")).toContain(
      "DURABLE_WRITERS: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    expect(plumbingComplaints({ SELF: "plumbing" }, self).join(" | ")).toContain(
      "SELF: no reviewable reason",
    );
    // ⚠ And the same rule driven against a doctored SOURCE, not only a doctored allowance. Mutant S9
    // — `readsTheDisk` widened to accept ANY call — was QUIET, because the refused case above is a
    // real register whose initializer holds no call at all, so nothing distinguished "reads a file"
    // from "calls something". Doctoring the source is what puts a computed const in the population.
    // One source per case rather than a joined multi-line string: three separate declarations are
    // three separate claims, and nothing here needs an escape to say what it means.
    // Locals, deliberately not UPPER_SNAKE: the arm above reads every shouty const in this file as
    // a register, so it caught these three the first time round when they were named COMPUTED, READ
    // and BUILT. That is the population doing its job — the convention IS the signal — and the fix
    // is the name, not an entry in the allowance.
    // ⚠ EACH DOCTORED SOURCE NOW CARRIES ITS OWN IMPORTS, because the rule is keyed on the binding
    // rather than on the verb (see `readsTheDisk`) — and that is not incidental to these cases, it is
    // the half of them that does the work. The two rename cases below would pass under any
    // spelling-keyed rule and fail under a rule that hardcodes the identifier `path`.
    const FS = 'import { readFileSync } from "node:fs";\n';
    const FS2 = 'import { readdirSync } from "node:fs";\n';
    const PATH = 'import path from "node:path";\n';
    const doctoredComputed = parse(`${FS}const COMPUTED = Object.fromEntries(xs.map((f) => [f, "w"]));`);
    const doctoredRead = parse(`${FS}const READ = readFileSync(p, "utf8");`);
    const doctoredBuilt = parse(`${PATH}const BUILT = path.join(d, "x.ts");`);
    // The mutant this pair exists for. J1: `storeModules.join(",")` bought the plumbing excuse under
    // the verb rule and a derived register passed with every arm green. Its control J0 — the same
    // register unexcused — reds on the shape arm, which is what makes J1 a hole rather than a
    // register the seal was happy with. `Array.join` is not a path build at any spelling.
    const doctoredArrayJoin = parse(`${PATH}const JOINED = xs.join(",").split(",");`);
    const doctoredPromise = parse(`${FS}const SETTLED = [...xs, String(Promise.resolve("x"))];`);
    // And the binding is FOLLOWED, not assumed: renamed at the import, the same calls still read as
    // disk. A rule that hardcoded `readFileSync` or `path` would go quiet here while looking correct,
    // which is the lazy way to pay for an equality — the peer's finding, borrowed.
    const doctoredRenamedFn = parse('import { readFileSync as rf } from "node:fs";\nconst READ = rf(p, "utf8");');
    const doctoredRenamedObj = parse('import p2 from "node:path";\nconst BUILT = p2.join(d, "x.ts");');
    expect(plumbingComplaints({ COMPUTED: WHY }, doctoredComputed).join(" | ")).toContain(
      "COMPUTED: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    expect(plumbingComplaints({ JOINED: WHY }, doctoredArrayJoin).join(" | ")).toContain(
      "JOINED: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    expect(plumbingComplaints({ SETTLED: WHY }, doctoredPromise).join(" | ")).toContain(
      "SETTLED: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    // ⚠ WHERE THE BINDING CAME FROM, not just that there is one. Mutant K2 — drop the
    // `node:(fs|path)` filter so any module's named imports count as disk — was QUIET, because every
    // doctored source above imports from node: and nothing distinguished the provenance check from
    // no check at all. Two cases, because the filter has two ways to be loosened and they are not the
    // same edit: a foreign module entirely, and a sibling inside the `node:` namespace. The names are
    // deliberately the real disk verbs — the point is that the SPELLING is not what earns the excuse.
    const doctoredForeignFs = parse('import { readFileSync } from "fake-fs";\nconst READ = readFileSync(p, "utf8");');
    const doctoredNodeSibling = parse('import os from "node:os";\nconst BUILT = os.join(d, "x.ts");');
    expect(plumbingComplaints({ READ: WHY }, doctoredForeignFs).join(" | ")).toContain(
      "READ: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    expect(plumbingComplaints({ BUILT: WHY }, doctoredNodeSibling).join(" | ")).toContain(
      "BUILT: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    // ⚠ AND THE LAUNDERING CASES, which are the reason `isDiskCall` tests the initializer itself
    // rather than searching it. Both of these DO read the disk — that is the point. A derived member
    // list reads the disk in exactly the way a path does, so a subtree search cannot tell them apart,
    // and under one (J5) a derived register passed with every arm green. Its control, the same
    // register unexcused, reds on the shape arm — different arm, which is what proves the excuse was
    // installed. Two spellings because the two disk verbs reach members by different routes.
    const doctoredLaunderedDir = parse(`${FS2}const LAUNDERED = readdirSync(d).map((f) => f.replace(".ts", ""));`);
    const doctoredLaunderedFile = parse(`${FS}const LAUNDERED = readFileSync(p, "utf8").split("|");`);
    expect(plumbingComplaints({ LAUNDERED: WHY }, doctoredLaunderedDir).join(" | ")).toContain(
      "LAUNDERED: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    expect(plumbingComplaints({ LAUNDERED: WHY }, doctoredLaunderedFile).join(" | ")).toContain(
      "LAUNDERED: excused as plumbing, but its initializer is not itself a file read or a path build",
    );
    // And the accepting half in both plumbing shapes, or a rule that complains about everything
    // would look identical here. (The real allowance is asserted by the arm above; mutant S10 showed
    // that repeating it here distinguishes nothing, so these doctored consts stand in its place.)
    expect(plumbingComplaints({ READ: WHY }, doctoredRead), "a real file read").toEqual([]);
    expect(plumbingComplaints({ BUILT: WHY }, doctoredBuilt), "a real path build").toEqual([]);
    expect(plumbingComplaints({ READ: WHY }, doctoredRenamedFn), "a renamed fs import").toEqual([]);
    expect(plumbingComplaints({ BUILT: WHY }, doctoredRenamedObj), "a renamed path import").toEqual([]);
    expect(plumbingComplaints({ ISOLATION_SRC: WHY }, self)).toEqual([]);
  });
});
