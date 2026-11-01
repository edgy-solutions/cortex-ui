import { useRef, useState } from "react";
import { requestTemplateCanvasSeed, type TemplateSeedResult } from "@/api/client";
import type { AskBearingRefusal } from "@/lib/askBearingRefusal";
import type { PolicyRefusal } from "@/lib/policyRefusal";
import { inScope } from "@/lib/platformDomains";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useStageStore } from "@/store/useStageStore";
import { foldSeedPanel, readSeedPanelEvent, type SeedPanelEvent, type SeedProgress } from "@/lib/seedProgress";

/**
 * The seed runner. The default is a wrapper over the live route and NEVER calls `onPanel`: the
 * live wire has no per-panel progress, so the dialog shows none until one is served.
 */
export type SeedRunner = (
  templateId: string,
  bindings: Record<string, string>,
  cell: { active_persona?: string; active_domains?: string[] } | undefined,
  onPanel: (e: SeedPanelEvent) => void,
) => Promise<TemplateSeedResult>;
export type TemplateSeedDeps = { seed?: SeedRunner };

const liveSeed: SeedRunner = (templateId, bindings, cell) =>
  requestTemplateCanvasSeed(templateId, bindings, cell);

/**
 * The create path for a template whose shared slots must be bound: through `POST /canvas/seed`
 * with the template id, never through `createCanvas`.
 *
 * The route decides whether it can seed. A 409 that carries an ask is a QUESTION, kept as
 * `refusal` for the form to draw; the pick re-sends the same request with the accumulated
 * bindings under the ask's `binding_slot`, so a second unbound slot asks again without losing
 * the first answer. A success composes the board with the composer every seed path shares,
 * `seedPortfolioCanvas`, which places artifact ids by template through `addItemAuto`.
 */
export function useTemplateSeed(onDone: () => void, deps?: TemplateSeedDeps) {
  const runner = deps?.seed ?? liveSeed;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<AskBearingRefusal | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** The declared policy envelope, when the seed was refused with one; drawn in place of the fixed text. */
  const [policy, setPolicy] = useState<PolicyRefusal | null>(null);
  /** Per-panel progress, only ever from events the runner emitted; null on the live path. */
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  /** Set when a seed finished with fewer panels than the template declares: the dialog stays and says so. */
  const [outcome, setOutcome] = useState<{ seeded: number; total: number } | null>(null);
  /** A ref, not state: React state is stale within one tick, and a double click would fire two POSTs. */
  const inFlight = useRef(false);
  const bindings = useRef<Record<string, string>>({});
  const current = useRef<{ templateId: string; name: string } | null>(null);

  const run = async () => {
    const cur = current.current;
    if (!cur || inFlight.current) return;
    inFlight.current = true;
    try {
      await runOnce(cur);
    } finally {
      inFlight.current = false;
    }
  };

  const runOnce = async (cur: { templateId: string; name: string }) => {
    setBusy(true);
    setProgress(null);
    setOutcome(null);
    setFailed(null);
    setPolicy(null);
    // The cell the chat path sends: the persona's pick, plus its entitled platform domains.
    const p = usePersonaStore.getState();
    const cell =
      p.hasEntitlements() && p.selectedPersona
        ? {
            active_persona: p.selectedPersona,
            active_domains: inScope(p.selectedDomains, p.domainsFor(p.selectedPersona)),
          }
        : undefined;
    let r: TemplateSeedResult;
    try {
      r = await runner(cur.templateId, bindings.current, cell, (raw) => {
        const e = readSeedPanelEvent(raw);
        if (e) setProgress((p) => foldSeedPanel(p, e));
      });
    } finally {
      setBusy(false);
    }
    if (r.ok) {
      // No canvas for an empty seed: a named empty board asserts a seeding ran and produced
      // nothing, which is a different claim from "it failed".
      if (r.artifactIds.length === 0) {
        setFailed("The seed answered with no artifacts, so no board was created.");
        return;
      }
      useStageStore
        .getState()
        .seedPortfolioCanvas(r.artifactIds, cur.name, true, undefined, false, cur.templateId);
      setRefusal(null);
      current.current = null;
      bindings.current = {};
      if (r.seeded === r.total) {
        onDone();
      } else {
        // A partial seed: the board exists and is entered, and the dialog says what refused.
        setOutcome({ seeded: r.seeded, total: r.total });
      }
      return;
    }
    if ("conflict" in r) {
      setRefusal(r.conflict);
      return;
    }
    setRefusal(null);
    if (r.policy) setPolicy(r.policy);
    setFailed("The seed did not complete, so no board was created.");
  };

  return {
    busy,
    refusal,
    failed,
    policy,
    progress,
    outcome,
    start: (templateId: string, name: string) => {
      if (inFlight.current) return;
      bindings.current = {};
      current.current = { templateId, name };
      setRefusal(null);
      return run();
    },
    pick: (value: string) => {
      const slot = refusal?.ask?.binding_slot;
      if (!slot || busy || inFlight.current) return;
      bindings.current = { ...bindings.current, [slot]: value };
      return run();
    },
    reset: () => {
      bindings.current = {};
      current.current = null;
      setRefusal(null);
      setFailed(null);
      setPolicy(null);
      setProgress(null);
      setOutcome(null);
    },
  };
}
