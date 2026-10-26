import { useRef, useState } from "react";
import { requestTemplateCanvasSeed } from "@/api/client";
import type { AskBearingRefusal } from "@/lib/askBearingRefusal";
import { inScope } from "@/lib/platformDomains";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useStageStore } from "@/store/useStageStore";

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
export function useTemplateSeed(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<AskBearingRefusal | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const bindings = useRef<Record<string, string>>({});
  const current = useRef<{ templateId: string; name: string } | null>(null);

  const run = async () => {
    const cur = current.current;
    if (!cur) return;
    setBusy(true);
    setFailed(null);
    // The cell the chat path sends: the persona's pick, plus its entitled platform domains.
    const p = usePersonaStore.getState();
    const cell =
      p.hasEntitlements() && p.selectedPersona
        ? {
            active_persona: p.selectedPersona,
            active_domains: inScope(p.selectedDomains, p.domainsFor(p.selectedPersona)),
          }
        : undefined;
    const r = await requestTemplateCanvasSeed(cur.templateId, bindings.current, cell);
    setBusy(false);
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
      onDone();
      return;
    }
    if ("conflict" in r) {
      setRefusal(r.conflict);
      return;
    }
    setRefusal(null);
    setFailed("The seed did not complete, so no board was created.");
  };

  return {
    busy,
    refusal,
    failed,
    start: (templateId: string, name: string) => {
      bindings.current = {};
      current.current = { templateId, name };
      setRefusal(null);
      return run();
    },
    pick: (value: string) => {
      const slot = refusal?.ask?.binding_slot;
      if (!slot || busy) return;
      bindings.current = { ...bindings.current, [slot]: value };
      return run();
    },
    reset: () => {
      bindings.current = {};
      current.current = null;
      setRefusal(null);
      setFailed(null);
    },
  };
}
