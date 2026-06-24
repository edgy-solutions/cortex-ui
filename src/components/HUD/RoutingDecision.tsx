import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Compass, Cog, ChevronRight, ExternalLink } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";
import { ConfidenceBar } from "./ConfidenceBar";
import { fallbackVerbLabel, fallbackSubjectLabel } from "@/lib/confidence";

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
  const decision = useInterviewStore((s) => s.routeDecision);

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
            <div className="mt-2 ml-[88px] p-2 rounded-md bg-slate-900/40 border border-slate-800/50">
              {details}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
