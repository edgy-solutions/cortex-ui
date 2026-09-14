import { create } from "zustand";
import { fetchTaskKinds } from "@/api/client";
import { readTaskDeclaration, type TaskDeclaration } from "@/lib/taskDeclaration";

/**
 * THE SERVED TASK-KIND MENU — fetched once, consulted by kind.
 *
 * ── WHY A STORE AND NOT A FIELD ON EACH TASK ──────────────────────────────────────────────
 *
 * The declaration is a property of the SPECIES, not of the task. Carrying it per row would mean
 * plumbing it through BOTH task producers — the REST seed and the Electric projection — and then
 * defending it against the projection replacing a seeded row with one that has no such column.
 * This repo already carries two comments describing exactly that failure: `answered_with` in the
 * canvas store, and `payload` in the Electric task mapper, whose note is the clearest statement
 * of it — *a card whose warnings render on the seeded path and vanish on the live one would look
 * like an intermittent bug rather than a shape mismatch.*
 *
 * One fetch, keyed by kind, sidesteps the whole class. It also answers for an EMPTY queue, which
 * a per-row field cannot.
 *
 * ── THIS EXISTS BECAUSE THE CARD'S DECLARATION PATH WAS DEAD CODE ─────────────────────────
 *
 * `ApprovalTaskCard` was built to read a declaration, tested against declarations passed
 * straight into it, and NOTHING EVER SUPPLIED ONE — `taskArtifact.ts` builds the payload and has
 * no such field. Every node verified, the connection unasserted, for the fourth time in this
 * engagement. The parity seal in the other lane caught the consequence rather than the cause: a
 * newly declared species reported as unknown to cortex, because the card was still asking the
 * interim table it was written to replace.
 *
 * ── NOT PURGED ON AN OWNER CHANGE, and declared so in `sessionIsolation.ts` ────────────────
 *
 * It holds mesh declarations — what species exist and what verbs they take. Identical for every
 * caller, derived from policy rather than from anyone's data, so there is nothing for the next
 * caller to see.
 */
export type TaskKindLoad = "idle" | "loading" | "loaded" | "unreachable";

interface TaskKindState {
  status: TaskKindLoad;
  /** Keyed by kind. Only declarations that survived the reader. */
  byKind: Record<string, TaskDeclaration>;
  load: () => Promise<void>;
  declarationFor: (kind: string) => TaskDeclaration | null;
}

export const useTaskKindStore = create<TaskKindState>()((set, get) => ({
  status: "idle",
  byKind: {},

  load: async () => {
    // ONE FETCH PER SESSION. A second caller while the first is in flight must not start
    // another — this is mounted from a component, and React will call it more than once.
    if (get().status === "loading" || get().status === "loaded") return;
    set({ status: "loading" });
    const rows = await fetchTaskKinds();
    if (rows === null) {
      // UNREACHABLE IS NOT EMPTY. An empty menu would mean the mesh declares no species, which
      // would make every card render "unknown species here" — a claim about the deployment made
      // from a failed request. The card keeps its interim fallback instead.
      set({ status: "unreachable" });
      return;
    }
    const byKind: Record<string, TaskDeclaration> = {};
    for (const raw of rows) {
      const d = readTaskDeclaration(raw);
      // A row the reader refuses is DROPPED rather than half-kept: see `readTaskDeclaration`
      // for why a declaration that cannot name its species, or cannot say whether it is
      // declared, is not one.
      if (d) byKind[d.kind] = d;
    }
    set({ status: "loaded", byKind });
  },

  /**
   * The declaration for a kind, or null.
   *
   * NULL WHILE UNLOADED OR UNREACHABLE, so the card falls back rather than reporting every
   * species as undeclared during a fetch. `Object.hasOwn` for the reason the kind registry
   * already documents: `kind` is a projection field, so a row carrying "constructor" reaches
   * this lookup and index access would walk `Object.prototype`.
   */
  declarationFor: (kind) => {
    const { byKind } = get();
    return Object.hasOwn(byKind, kind) ? byKind[kind] : null;
  },
}));
