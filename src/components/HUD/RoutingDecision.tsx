import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Compass,
  Cog,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Layers,
  Crown,
} from "lucide-react";
import { useCurrentRouting } from "@/store/useCanvasStore";
import { ConfidenceBar } from "./ConfidenceBar";
import { fallbackVerbLabel, fallbackSubjectLabel } from "@/lib/confidence";
import {
  presentFallbackReason,
  type RouteSeverity,
  type FallbackReason,
} from "@/lib/routing";
import type { SubjectCandidate } from "@/api/types";

/**
 * RoutingDecision — replaces the stale DataBindings card.
 *
 * Surfaces, exactly as the pipeline reported them, three slots:
 *
 *   ABOUT       ← /resolve subject_uri + confidence
 *   ACTION      ← /classify_predicate verb_iri + confidence + classify_called
 *   HANDLED BY  ← the verb edge's provider/engine
 *
 * Architect's governing principle: surface what the pipeline did;
 * never synthesize or soften. The card's labels are real fields
 * projected once-and-honestly. Click any row to expand; expansion
 * shows the underlying URI/IRI/endpoint (the auditability path for
 * power users). Confidence is shown via ConfidenceBar — buckets +
 * bar width tracking the real float + actionable nudge for low.
 *
 * Persists after the answer arrives — this is the durable standing
 * grounding signal, not the ephemeral "I'm working" signal (that's
 * the left-stream ThinkingCard's job).
 */
export function RoutingDecision() {
  // Per ADR-0023 Phase 1: routing lives on the current Artifact, not
  // on a per-turn singleton in useInterviewStore. The selector reads
  // through to the canvas's foregrounded artifact.
  const decision = useCurrentRouting();

  if (!decision) {
    return (
      <div className="glass-panel-sm p-3">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-3.5 h-3.5 text-neon-cyan/70" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Routing
          </span>
        </div>
        <p className="text-xs text-slate-600 italic font-mono">
          No active routing decision. Send a query to see how it routes
          through the substrate.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-panel-sm p-3 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Target className="w-3.5 h-3.5 text-neon-cyan/70" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Routing
        </span>
      </div>

      {/* FALLBACK, VISUALLY LOUD. When routing did NOT reach a specialist,
          the reason is the load-bearing signal — not a footnote. This
          banner surfaces the STRUCTURED fallback_reason the supervisor
          captured (instance_not_found, domain_scope_excluded, etc.),
          made legible + actionable, colored by severity (infra outage =
          alarm/red; a real "no" = warn/amber). Rendered only when a
          fallback actually happened — render only what was captured. */}
      {decision.fallback && decision.fallback_reason && (
        <FallbackBanner reason={decision.fallback_reason} />
      )}

      <RoutingRow
        icon={<Compass className="w-3.5 h-3.5 text-neon-blue/80" />}
        slotLabel="About"
        primary={decision.about.label || fallbackSubjectLabel(decision.about.uri)}
        details={
          <div className="space-y-1">
            <DetailLine k="URI" v={decision.about.uri} />
            {decision.about.instance_resolved && decision.about.instance_identifier && (
              <DetailLine
                k="Instance"
                v={decision.about.instance_identifier}
                hint="(matched named entity, not just class)"
              />
            )}
          </div>
        }
      >
        <ConfidenceBar value={decision.about.confidence} />
      </RoutingRow>

      {/* LOSERS FIRST-CLASS. The resolver candidate pool — the winner AND
          what it beat, with scores. This is what makes the decision path
          legible: "prov#Bundle lost to Table at 0.66 vs 0.81" is the kind
          of glance the PROV-contamination diagnosis needed. Rendered only
          when the pool was captured. */}
      {decision.candidates && decision.candidates.length > 0 && (
        <CandidatePool
          candidates={decision.candidates}
          winnerUri={decision.about.uri}
        />
      )}

      <RoutingRow
        icon={<ChevronRight className="w-3.5 h-3.5 text-neon-cyan/80" />}
        slotLabel="Action"
        primary={decision.action.label || fallbackVerbLabel(decision.action.iri)}
        details={
          <div className="space-y-1">
            <DetailLine k="Verb" v={decision.action.iri} />
            <DetailLine
              k="Candidates"
              v={String(decision.action.candidate_count)}
              hint={
                decision.action.candidate_count === 1
                  ? "(N=1 — Contract A confirmed by LLM)"
                  : "(LLM picked from constrained enum)"
              }
            />
            <DetailLine
              k="Classify called"
              v={decision.action.classify_called ? "yes" : "no"}
              hint={
                decision.action.classify_called
                  ? undefined
                  : "(WARN: Contract A property — fit was not confirmed by LLM)"
              }
            />
            {decision.action.owner_persona && (
              <DetailLine
                k="Owner persona"
                v={decision.action.owner_persona}
                hint="(output-side persona on the verb edge — who in the system 'owns' this kind of answer)"
              />
            )}
          </div>
        }
      >
        <ConfidenceBar value={decision.action.confidence} />
        {/* Output-side persona attribution chip. Source: owner_persona
            property on the (input)-[verb]->(output) edge in Neo4j. Per
            [[persona-split]]: this is the substrate persona ("who in
            the system owns this kind of answer"), NOT the caller-
            identity persona (that's a separate future ADR). */}
        {decision.action.owner_persona && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">
              Voice
            </span>
            <span className="text-[10px] font-mono text-neon-purple/80 px-1.5 py-0.5 rounded border border-neon-purple/30 bg-neon-purple/5">
              {decision.action.owner_persona}
            </span>
          </div>
        )}
      </RoutingRow>

      <RoutingRow
        icon={<Cog className="w-3.5 h-3.5 text-neon-purple/80" />}
        slotLabel="Handled by"
        primary={decision.handled_by.engine_name}
        details={
          <div className="space-y-1">
            <DetailLine k="Provider" v={decision.handled_by.provider} />
            {decision.handled_by.endpoint_url && (
              <DetailLine
                k="Endpoint"
                v={decision.handled_by.endpoint_url}
                hint=""
              />
            )}
          </div>
        }
      />
    </motion.div>
  );
}

interface RoutingRowProps {
  icon: React.ReactNode;
  slotLabel: string;
  primary: string;
  details: React.ReactNode;
  children?: React.ReactNode; // confidence bar slot (optional)
}

/**
 * One row of the Routing Decision card. The row itself shows the
 * human-readable primary value; click to expand for the URI / provenance
 * details. The architect's "click any line → expansion shows URI +
 * reasoning" pattern. Expansion is local state, not global, so opening
 * one row doesn't leak into another query's panel.
 */
function RoutingRow({ icon, slotLabel, primary, details, children }: RoutingRowProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 w-[68px]">
            {slotLabel}
          </span>
          <span className="text-xs text-slate-300 font-mono flex-1 truncate group-hover:text-neon-cyan transition-colors">
            {primary}
          </span>
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-neon-cyan" />
          </motion.span>
        </div>
      </button>
      {children && <div className="mt-1.5 ml-[88px]">{children}</div>}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Details panel indented just past the row's slot label
                (icon ~14px + gap 8px = ~22px), so the values sit
                visually grouped with their section title (ABOUT /
                ACTION / HANDLED BY) but get nearly the full card
                width for long URIs and URNs to read naturally.
                Earlier ml-[88px] squeezed long values into a narrow
                right-side column under the primary text. */}
            <div className="mt-2 ml-[22px] p-2 rounded-md bg-slate-900/40 border border-slate-800/50">
              {details}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Severity → Tailwind classes for the fallback banner. alarm (infra
 *  outage) is red; warn (a real "no" the user may act on) is amber; info
 *  is a muted slate. Kept as a lookup so the three tones read at a glance. */
const SEVERITY_STYLES: Record<
  RouteSeverity,
  { border: string; bg: string; text: string; icon: string }
> = {
  alarm: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-red-300",
    icon: "text-red-400",
  },
  warn: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    icon: "text-amber-400",
  },
  info: {
    border: "border-slate-600/40",
    bg: "bg-slate-700/20",
    text: "text-slate-300",
    icon: "text-slate-400",
  },
};

/**
 * FallbackBanner — surfaces WHY routing didn't reach a specialist, loud
 * and honest. The reason is the structured fallback_reason (Part 0); the
 * presentation (title + actionable detail + severity) comes from the one
 * source of truth in lib/routing. This is where instance_not_found and
 * domain_scope_excluded become visible to the user instead of hiding in
 * logs — the whole point of the visualizer arriving after those fixes.
 */
function FallbackBanner({ reason }: { reason: FallbackReason }) {
  const { title, detail, severity } = presentFallbackReason(reason);
  const s = SEVERITY_STYLES[severity];
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-md border ${s.border} ${s.bg} p-2.5`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${s.icon}`} />
        <div className="space-y-1">
          <div className={`text-[11px] font-mono font-semibold uppercase tracking-wider ${s.text}`}>
            {title}
          </div>
          <p className="text-[11px] font-mono leading-relaxed text-slate-400">
            {detail}
          </p>
          {/* The raw reason token, for the auditability path — the
              structured value the supervisor actually emitted. */}
          <div className="text-[9px] font-mono text-slate-600 uppercase tracking-widest pt-0.5">
            {reason}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * CandidatePool — the resolver's candidate pool rendered losers-first-
 * class: winner AND the candidates it beat, each with its score. Sorted
 * by score descending; the winner (uri === the resolved subject) wears a
 * crown; losers are muted but fully visible with their scores. This is
 * the contest, not just the outcome — the glance the PROV-contamination
 * diagnosis lived on ("the winner was prov#Bundle at 0.66").
 */
function CandidatePool({
  candidates,
  winnerUri,
}: {
  candidates: SubjectCandidate[];
  winnerUri: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...candidates].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-neon-blue/60" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 w-[68px]">
            Considered
          </span>
          <span className="text-xs text-slate-400 font-mono flex-1 group-hover:text-neon-cyan transition-colors">
            {sorted.length} candidate{sorted.length === 1 ? "" : "s"}
          </span>
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-neon-cyan" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-[22px] p-2 rounded-md bg-slate-900/40 border border-slate-800/50 space-y-1.5">
              {sorted.map((c, i) => {
                const isWinner = c.uri === winnerUri;
                return (
                  <div key={`${c.uri}-${i}`} className="flex items-center gap-2">
                    {isWinner ? (
                      <Crown className="w-3 h-3 text-neon-cyan flex-shrink-0" />
                    ) : (
                      <span className="w-3 flex-shrink-0" />
                    )}
                    <span
                      className={`text-[11px] font-mono flex-1 truncate ${
                        isWinner ? "text-neon-cyan" : "text-slate-400"
                      }`}
                      title={c.uri}
                    >
                      {c.label || _labelFromUri(c.uri)}
                    </span>
                    {typeof c.score === "number" && (
                      <span
                        className={`text-[10px] font-mono tabular-nums ${
                          isWinner ? "text-neon-cyan/90" : "text-slate-500"
                        }`}
                      >
                        {c.score.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Last path segment / fragment of a URI as a readable fallback label. */
function _labelFromUri(uri: string): string {
  if (!uri) return "(unknown)";
  const frag = uri.split(/[#/]/).filter(Boolean).pop();
  return frag || uri;
}

function DetailLine({
  k,
  v,
  hint,
}: {
  k: string;
  v: string;
  hint?: string;
}) {
  // Stacked layout: label on its own line above the value. Previously
  // label + value lived on the same row with the label taking a fixed
  // 68px left column, which left long URIs/URNs/endpoint URLs only
  // ~150px of right-side width — they wrapped aggressively and looked
  // squashed against the right edge. Stacking gives the value the full
  // card width and the wrapped URL reads left-to-right naturally.
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
        {k}
      </div>
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-mono text-slate-300 flex-1 break-all">
          {v}
          {hint && (
            <span className="ml-1 text-[10px] text-slate-500 italic">{hint}</span>
          )}
        </span>
        {v.startsWith("http") && (
          <a
            href={v}
            target="_blank"
            rel="noreferrer"
            className="text-slate-600 hover:text-neon-cyan flex-shrink-0 mt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
