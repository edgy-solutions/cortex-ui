import { AlertTriangle } from "lucide-react";
import type { Artifact } from "@/api/types";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { MethodBlockView } from "./MethodBlockView";
import { answerSummary, hasCapturedSummary } from "@/lib/answerDisplay";
import { readArtifactMethod } from "@/lib/cardExport";
import { readFallbackDisclosure, splitFallbackComponents } from "@/lib/fallbackDisclosure";
import type { RouteSeverity } from "@/lib/routing";

/**
 * THE BODY OF AN ANSWER, AND THE ONE PLACE THAT ASKS HOW IT WAS ROUTED.
 *
 * A generalist answer — `routing.fallback === true`, no grounded subject, no registered
 * capability behind it — used to render the identical confident card a specialist produces. The
 * chrome went amber and the row collapsed in the answers panel, and the BODY drew the metric, the
 * chart or the document exactly as if it had been measured. The honest explanation already
 * existed in `presentFallbackReason` and its only consumer was a HUD panel a reader has to open.
 *
 * ⛔ THIS EXISTS BECAUSE THERE ARE FIVE MOUNTS, NOT ONE. `SemanticInterpreter` is fed from an
 * artifact in `CanvasPane` (twice), `StageCard` (twice — PANEL and PREVIEW) and
 * `PinnedAnswerCard`. Gating "the" call site would have gated a fifth of the surface, and the two
 * StageCard branches are the exact shape that has caught this repo before: the branch whose name
 * sounds like the real one is the one almost nothing uses. So the gate is a component every mount
 * goes through, and a census seal keeps a SIXTH mount from appearing beside it.
 *
 * What is withheld and what is shown is `splitFallbackComponents`' decision, not this file's —
 * an ELICITATION still renders under a fallback, because a menu the reader is meant to answer is
 * a request and not a claim. See that module's header for the payload this was measured on.
 */

/** Keyed by the union so a new severity cannot render unstyled. */
const SEVERITY: Record<RouteSeverity, { border: string; bg: string; text: string }> = {
  alarm: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300" },
  warn: { border: "border-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-300" },
  info: { border: "border-slate-600/40", bg: "bg-slate-700/20", text: "text-slate-300" },
};

interface AnswerBodyProps {
  artifact: Artifact;
  /** The composed components, exactly as the mount had them (already filtered, where it filters). */
  components: unknown[];
  hidePersona?: boolean;
  previewRows?: number;
}

export function AnswerBody({ artifact, components, hidePersona, previewRows }: AnswerBodyProps) {
  const disclosure = readFallbackDisclosure(artifact.routing);
  const { shown, withheld } = splitFallbackComponents(artifact.routing, components);

  const interpreter = (
    <SemanticInterpreter
      payload={{ components: shown as unknown[] as never[] }}
      artifactId={artifact.id}
      hidePersona={hidePersona}
      previewRows={previewRows}
    />
  );

  /**
   * THE METHOD IS PROVENANCE OF A FIGURE THAT MAY NOT BE ON SCREEN.
   *
   * `readArtifactMethod` is read from the FULL `components` (not `shown`) because its own
   * component-level lookup already gates on `components.length === 1` — see `cardExport.ts` —
   * so whichever single component it attributes a method to is exactly the one `withheld` counts
   * when it is not drawn. One check covers both of section 3's rules:
   *
   *   - a component-level method is attributable to only ONE component (by the gate above), so
   *     `withheld > 0` there means that component — the one the method is about — is the one
   *     that did not render;
   *   - an envelope-level method is about the answer as a whole, and section 3 says it must not
   *     draw when ANY component was withheld, which `withheld > 0` already states directly.
   *
   * So `withheld > 0` suppresses the method at EITHER level, with no separate branch needed.
   */
  const method = readArtifactMethod(components, artifact.rendered_output);
  const methodView = withheld === 0 ? <MethodBlockView method={method} /> : null;

  // Routing reached a specialist. Byte-for-byte the previous behaviour — a non-fallback answer
  // must not acquire so much as a wrapper, or every card in the app pays for this. A Fragment
  // adds no DOM node, so a card with no method (the common case — see `MethodBlockView`) still
  // renders byte-for-byte what `interpreter` alone rendered.
  if (!disclosure) {
    return (
      <>
        {interpreter}
        {methodView}
      </>
    );
  }

  return (
    <div data-answer-body="disclosed" className="flex flex-col gap-2">
      <div
        data-fallback-disclosure
        data-fallback-reason={disclosure.reason}
        className={`rounded-md border ${SEVERITY[disclosure.severity].border} ${
          SEVERITY[disclosure.severity].bg
        } p-2.5`}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${SEVERITY[disclosure.severity].text}`}
          />
          <div className="min-w-0">
            <div
              data-fallback-title
              className={`text-[11px] font-mono uppercase tracking-wider ${
                SEVERITY[disclosure.severity].text
              }`}
            >
              {disclosure.title}
            </div>
            <div className="text-[11px] font-mono leading-snug text-slate-400 mt-0.5">
              {disclosure.detail}
            </div>
            {/*
              THE GENERALIST'S OWN WORDS, AND ONLY WHEN THEY ARE ITS OWN.

              `answerSummary` falls back to `question_text` when nothing was captured, which is
              correct for a LABEL and would be a lie here: it would print the reader's own question
              back at them in the position where the answer goes. `hasCapturedSummary` is the
              discriminator that already exists for exactly this distinction, so an uncaptured
              summary renders NOTHING rather than an echo.
            */}
            {hasCapturedSummary(artifact) && (
              <div
                data-fallback-words
                className="text-[12px] font-mono leading-snug text-amber-100/80 italic mt-1.5"
              >
                {answerSummary(artifact)}
              </div>
            )}
            {withheld > 0 && (
              <div
                data-fallback-withheld={withheld}
                className="text-[10px] font-mono text-slate-500 mt-1.5"
              >
                {withheld} composed {withheld === 1 ? "component" : "components"} not drawn as an
                answer — still in the record, on the HUD's payload panel and in the card export.
              </div>
            )}
          </div>
        </div>
      </div>
      {/* What the split kept: requests, which ask rather than assert. Nothing is rendered when
          there are none, because an empty interpreter draws its own chrome around nothing. */}
      {shown.length > 0 && interpreter}
      {methodView}
    </div>
  );
}
