import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Route, ChevronDown, Crown, AlertTriangle } from "lucide-react";
import {
  useCurrentArtifact,
  useCurrentRouting,
  useCurrentGraphTrace,
  useCurrentGraphAlternates,
} from "@/store/useCanvasStore";
import { presentAbstention, readExclusions, type RouteSeverity } from "@/lib/routing";
import { readPresentation } from "@/lib/presentationProvenance";
import { isAsk } from "@/lib/askFold";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { Artifact } from "@/api/types";
import type { GraphTraceNode } from "@/api/types";

/**
 * DecisionPathDiagram — the DRAWN decision path (the visualizer's headline
 * visual, the thing "visualizer" most naturally means).
 *
 * The HUD's "Subject Graph" panel is the un-drawn, text-trail version of
 * this. This renders the same substrate walk as an actual top-down graph —
 * boxes and connectors — AND, crucially, the branches NOT taken:
 *   - subject-leg losers: the resolver candidates the winner beat, with
 *     scores (from routing.candidates), drawn as dashed offshoots that
 *     don't continue.
 *   - verb-leg alternates: the other compatible verbs the walk surfaced
 *     but the classifier didn't pick (from graph_trace_alternates).
 * "Alternates shown" is the whole point — the losing branch is where the
 * debugging lives (the 0.66 PROV cluster was a losers-visible insight).
 *
 * Render-only-what-was-captured: every node/branch is a projection of real
 * captured data (routing.candidates, graph_trace, graph_trace_alternates).
 * Nothing is synthesized. A leg with no losers simply draws no offshoot.
 *
 * FENCE (per the dispatch): this is a RENDERED STATIC decision-path graph,
 * NOT the interactive Neo4j explorer. Nodes show label / score / URI; they
 * are not clickable-to-browse-the-graph. That explorer stays deferred.
 */
export function DecisionPathDiagram() {
  const routing = useCurrentRouting();
  const artifact = useCurrentArtifact();
  const nodes = useCurrentGraphTrace();
  const alternates = useCurrentGraphAlternates();
  const [open, setOpen] = useState(true);

  // Nothing routed yet → don't show an empty box.
  if (!routing) return null;

  // Taken-path spine, pulled from the graph trace (falls back to the
  // routing card's about/action when the trace didn't materialize).
  const subject =
    nodes.find((n) => n.role === "resolved_subject") ?? {
      uri: routing.about.uri,
      label: routing.about.label,
      role: "resolved_subject" as const,
    };
  const ancestor = nodes.find((n) => n.role === "ancestor_class") ?? null;
  const output = nodes.find((n) => n.role === "output_class") ?? null;
  const pickedVerbLabel =
    output?.via_verb ? _short(output.via_verb) : routing.action.label;

  // Subject-leg losers: the resolver pool minus the winner.
  const winnerUri = routing.about.uri;
  const subjectLosers = (routing.candidates ?? [])
    .filter((c) => c.uri !== winnerUri)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // TWO AXES, kept distinct (the "Dataset 0.00" finding). The candidate
  // pool scores are Weaviate RECALL (vector/BM25 similarity). The winner
  // is the LLM's PRECISION pick — its selecting signal is the classifier
  // confidence (routing.about.confidence), NOT its recall score. Showing
  // the winner's recall (which can be the LOWEST in the pool) as if it
  // were "the winning score" reads as a broken selection; it isn't. So
  // the winner carries its confidence, the losers carry recall, and when
  // the winner's recall rank is low we surface the override explicitly.
  const winnerConfidence = routing.about.confidence;
  const winnerRecall = (routing.candidates ?? []).find(
    (c) => c.uri === winnerUri,
  )?.score;
  const topLoserRecall = subjectLosers[0]?.score;
  const precisionOverrode =
    typeof winnerRecall === "number" &&
    typeof topLoserRecall === "number" &&
    topLoserRecall > winnerRecall;

  const isFallback = !!routing.fallback;
  // THE ABSTENTION, TOLD APART. "Nothing fit" and "something fit and a gate removed it" are
  // different events with different remedies, and they used to render identically. When the
  // record carries no exclusions this is exactly `presentFallbackReason` — an ordinary
  // abstention never gets louder than it was.
  const fb = isFallback && routing.fallback_reason
    ? presentAbstention(routing.fallback_reason, routing.excluded)
    : null;
  // Drawn on EVERY decision, not only on an abstention: a gate that removed the better verb
  // while a worse one survived is the same defect with an answer on top of it, and that case
  // shows no fallback at all.
  const removed = readExclusions(routing.excluded);
  // HOW THE CARD WAS CHOSEN, which is a different question from how the VERB was. The path
  // above ends at an output class; this says which renderer was picked for it and whether the
  // caller had actually declared one.
  const presentation = readPresentation(artifact?.rendered_output?.presentation_provenance);
  // WHAT THIS ANSWER WAS ASKED, when it is one. The ask's own row is folded out of the rail
  // once answered — the reader already answered it — so this is where "what did it ask me"
  // stays answerable. Read from the FOLDED parent, not from any state a card kept alive.
  const askedBy = useAskedBy(artifact);

  return (
    <div className="glass-panel-sm p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <Route className="w-3.5 h-3.5 text-neon-cyan/80" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 flex-1">
            Decision Path
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-neon-cyan" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              {/* SUBJECT — winner box (shows the LLM CONFIDENCE that
                  selected it, not its recall score) + the resolver losers
                  as offshoots (recall scores). */}
              <SpineNode
                label={subject.label}
                uri={subject.uri}
                score={winnerConfidence}
                scoreLabel="conf"
                kind="subject"
                winner
              />
              {precisionOverrode && (
                <div className="ml-3 my-1 text-[9px] font-mono italic text-amber-400/80 leading-snug">
                  classifier picked the lowest-recall candidate — precision
                  overrode vector recall (winner recall{" "}
                  {winnerRecall!.toFixed(2)} &lt; {topLoserRecall!.toFixed(2)})
                </div>
              )}
              {subjectLosers.length > 0 && (
                <Offshoots
                  caption="candidates not chosen (recall)"
                  items={subjectLosers.map((c) => ({
                    label: c.label || _short(c.uri),
                    score: c.score,
                  }))}
                />
              )}

              {/* subClassOf hop to the ancestor the verb was typed against */}
              {ancestor && (
                <>
                  <Connector label="subClassOf" />
                  <SpineNode label={ancestor.label} uri={ancestor.uri} kind="ancestor" />
                </>
              )}

              {/* VERB edge — picked (taken) + the alternates as offshoots */}
              <Connector label={pickedVerbLabel} verb />
              {alternates.length > 0 && (
                <Offshoots
                  caption="verbs not taken"
                  verb
                  items={alternates.map((a: GraphTraceNode) => ({
                    label: a.via_verb ? _short(a.via_verb) : a.label,
                    score: undefined,
                  }))}
                />
              )}

              {/* REMOVED, NOT PASSED OVER — and the distinction is the whole point. "Verbs not
                  taken" above were eligible and lost. These never reached the classifier at
                  all: a gate deleted them, and the record afterwards showed only the survivors,
                  so an abstention on a pool of one wore a classifier-uncertainty costume. */}
              {removed.length > 0 && <Removed items={removed} />}

              {/* TERMINAL — the output class, OR the loud fallback node */}
              {isFallback && fb ? (
                <FallbackNode
                  title={fb.title}
                  detail={fb.detail}
                  severity={fb.severity}
                  reason={routing.fallback_reason!}
                />
              ) : output ? (
                <SpineNode label={output.label} uri={output.uri} kind="output" />
              ) : (
                <SpineNode
                  label={routing.action.label}
                  uri={routing.action.iri}
                  kind="output"
                />
              )}
            </div>

            {askedBy && (
              <div
                className="ml-3 mb-1 border-l border-dashed border-neon-cyan/30 pl-3 py-1"
                data-asked-by
              >
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-600 mb-1">
                  asked first
                </div>
                <div className="text-[10px] font-mono leading-snug text-slate-400">
                  {askedBy.question}
                  {askedBy.answer && (
                    <>
                      <span className="text-slate-600"> → </span>
                      <span className="text-slate-200">{askedBy.answer}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {presentation && <Chosen p={presentation} />}

            <p className="mt-3 pt-3 border-t border-slate-800/40 text-[10px] text-slate-600 italic leading-snug">
              The path the router actually took (solid), and the branches it
              didn&apos;t (dashed) — resolver candidates and compatible verbs
              it passed over. Rendered from captured routing data, not a
              synthesized chain of thought.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------
type NodeKind = "subject" | "ancestor" | "output";

function SpineNode({
  label,
  uri,
  score,
  scoreLabel,
  kind,
  winner,
}: {
  label: string;
  uri: string;
  score?: number;
  /** What the score MEANS ("conf" for the winner's LLM confidence,
   *  "recall" for pool scores) — kept explicit so the two axes never
   *  read as the same number. */
  scoreLabel?: string;
  kind: NodeKind;
  winner?: boolean;
}) {
  const tone =
    kind === "subject"
      ? "border-neon-green/50 text-neon-green"
      : kind === "output"
      ? "border-neon-purple/50 text-neon-purple/90"
      : "border-slate-600/50 text-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex-1 min-w-0 rounded-md border ${tone} bg-slate-900/40 px-2.5 py-1.5`}
        title={uri}
      >
        <div className="flex items-center gap-1.5">
          {winner && <Crown className="w-3 h-3 flex-shrink-0" />}
          <span className="text-xs font-mono truncate">{label}</span>
          {typeof score === "number" && (
            <span className="ml-auto text-[10px] font-mono tabular-nums opacity-80">
              {scoreLabel && (
                <span className="mr-1 text-[8px] uppercase tracking-wider opacity-70">
                  {scoreLabel}
                </span>
              )}
              {score.toFixed(2)}
            </span>
          )}
        </div>
        <div className="text-[9px] font-mono text-slate-600 truncate">{uri}</div>
      </div>
    </div>
  );
}

function Connector({ label, verb }: { label: string; verb?: boolean }) {
  return (
    <div className="flex items-center gap-2 pl-3 py-0.5">
      <div className={`w-px h-4 ${verb ? "bg-neon-cyan/50" : "bg-slate-700/70"}`} />
      <span
        className={`text-[9px] font-mono italic ${
          verb ? "text-neon-cyan/70" : "text-slate-600"
        }`}
      >
        {verb ? `via ${label}` : label}
      </span>
    </div>
  );
}

/** The branches-not-taken: dashed offshoots off the spine, dim, with
 *  scores where captured. Subject-leg losers or verb-leg alternates. */
/**
 * The candidates a gate deleted. A separate component from `Offshoots` because the shape
 * differs in kind rather than in degree: an offshoot carries a SCORE, which is a comparison
 * these never got to be part of. What they carry instead is a gate and a sentence.
 */
function Removed({ items }: { items: { verb: string; gate: string; reason: string }[] }) {
  return (
    <div
      className="ml-3 mb-1 border-l border-dashed border-amber-700/50 pl-3 py-1"
      data-removed-candidates
    >
      <div className="text-[9px] font-mono uppercase tracking-wider text-amber-500/70 mb-1">
        candidates removed (eligibility)
      </div>
      <div className="flex flex-col gap-1">
        {items.map((it, i) => (
          <div
            key={`${it.verb}-${i}`}
            className="text-[10px] font-mono leading-snug text-slate-400"
            data-removed-gate={it.gate || undefined}
          >
            <span className="text-slate-300">{_short(it.verb)}</span>
            {it.gate && <span className="text-amber-500/80"> — excluded by {it.gate}</span>}
            {/* THE GATE'S OWN WORDS, verbatim. This surface has no vocabulary of gates and must
                not acquire one, or the next gate anyone adds renders as an unknown token. */}
            {it.reason && <span className="text-slate-500">: {it.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * WHICH CARD WAS CHOSEN FOR THIS ANSWER, AND WHETHER ANYONE DECLARED IT.
 *
 * The decision path above ends at an output class. This is the step after: of the capabilities
 * registered for that class, which one drew — and, crucially, whether the class matched any of
 * them at all. A widening produces a card that looks entirely reasonable, so the basis is the
 * only thing that says a card was chosen because the DATA happened to fit rather than because
 * the caller named it.
 */
/**
 * The ask this answer came from, read off the artifact it was DERIVED FROM.
 *
 * The lineage is the server's (`derived_from_artifact_id`, honoured only for a turn that
 * really carried an answer), so this cannot show a question that was never answered. The ask's
 * own card is gone from the rail by then, which is the point: one item, and the question it
 * replaced still reachable.
 */
function useAskedBy(artifact: Artifact | null): { question: string; answer: string } | null {
  const parentId = artifact?.derived_from_artifact_id ?? null;
  const parent = useCanvasStore((s) =>
    parentId ? (s.artifacts.find((a) => a.id === parentId) ?? null) : null,
  );
  if (!parent || !isAsk(parent)) return null;
  const question = (parent.question_text || "").trim();
  // What the reader answered with, in the terms they saw. Absent when this client did not send
  // the turn — a reload, or another surface — and absence is silence rather than a guess.
  const w = artifact?.answered_with;
  const answer = w && w.label ? (w.value && w.value !== w.label ? `${w.label} → ${w.value}` : w.label) : "";
  if (!question && !answer) return null;
  return { question, answer };
}

function Chosen({ p }: { p: import("@/lib/presentationProvenance").PresentationProvenance }) {
  return (
    <div
      className={`ml-3 mb-1 border-l border-dashed pl-3 py-1 ${
        p.declared ? "border-slate-700/60" : "border-amber-700/50"
      }`}
      data-presentation-basis={p.basis}
      data-presentation-declared={p.declared ? "" : undefined}
    >
      <div
        className={`text-[9px] font-mono uppercase tracking-wider mb-1 ${
          p.declared ? "text-slate-600" : "text-amber-500/70"
        }`}
      >
        {p.declared ? "card chosen (declared)" : "card chosen (NOT declared for this type)"}
      </div>
      {/* THE PRODUCER'S OWN STRING, verbatim. A lookup table of bases would render the next one
          anyone writes as an unknown token — the silent-fall-through defect wearing a switch. */}
      <div className="text-[10px] font-mono leading-snug text-slate-400">
        {p.basis}
        {p.source && <span className="text-slate-600"> · {p.source}</span>}
        {p.satisfied !== null && p.considered !== null && (
          <span className="text-slate-600">
            {" "}
            · {p.satisfied} of {p.considered} could draw it
          </span>
        )}
      </div>
      {/* WHICH CARDS COULD NOT, and what each one missed. Same shape as the eligibility trace,
          one layer over: a refusal nobody records is a choice that looks unanimous. */}
      {p.refusals.map((r, i) => (
        <div
          key={`${r.archetype}-${i}`}
          className="text-[10px] font-mono leading-snug text-slate-500"
          data-presentation-refusal={r.archetype}
        >
          <span className="text-slate-400">{r.archetype}</span> — {r.reason}
        </div>
      ))}
    </div>
  );
}

function Offshoots({
  caption,
  items,
  verb,
}: {
  caption: string;
  items: { label: string; score?: number }[];
  verb?: boolean;
}) {
  return (
    <div className="ml-3 mb-1 border-l border-dashed border-slate-700/60 pl-3 py-1">
      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-600 mb-1">
        {caption}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${it.label}-${i}`}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono border ${
              verb
                ? "border-neon-cyan/20 text-slate-400"
                : "border-slate-700/60 text-slate-400"
            } bg-slate-900/30`}
          >
            <span className="truncate max-w-[110px]">{it.label}</span>
            {typeof it.score === "number" && (
              <span className="tabular-nums text-slate-500">{it.score.toFixed(2)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_TONE: Record<RouteSeverity, string> = {
  alarm: "border-red-500/50 bg-red-500/10 text-red-300",
  warn: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  info: "border-slate-600/50 bg-slate-700/20 text-slate-300",
};

/** The terminal node when routing fell back — the reason IS the outcome,
 *  drawn loud (severity-colored) as the path's endpoint. */
function FallbackNode({
  title,
  detail,
  severity,
  reason,
}: {
  title: string;
  detail: string;
  severity: RouteSeverity;
  reason: string;
}) {
  return (
    <div className={`rounded-md border px-2.5 py-2 ${SEVERITY_TONE[severity]}`}>
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">
          {title}
        </span>
      </div>
      <p className="mt-1 text-[10px] font-mono leading-snug text-slate-400" data-fallback-detail>
        {detail}
      </p>
      <div className="mt-1 text-[9px] font-mono uppercase tracking-widest text-slate-600">
        {reason}
      </div>
    </div>
  );
}

/** Last URI/IRI segment as a compact label. */
function _short(uri: string): string {
  if (!uri) return "";
  const frag = uri.split(/[#/:]/).filter(Boolean).pop();
  return frag || uri;
}
