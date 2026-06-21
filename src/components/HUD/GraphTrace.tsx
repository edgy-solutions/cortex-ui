import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  ChevronDown,
  Target,
  ArrowUp,
  ArrowRight,
  Circle,
} from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";
import type { GraphTraceNode } from "@/api/types";

/**
 * GraphTrace — Phase 4, detailed-mode peek at the substrate walk.
 *
 * Visualizes the actual (S, P) compat-walk: the resolved subject,
 * the subClassOf ancestors traversed (if any), and the verb edge
 * that matched. This is the substrate-grounded proof — NOT a
 * synthesized "reasoning chain" but the literal walk the pipeline did.
 *
 * Collapsed by default. Architect's rationale: "Casual users will
 * glaze. Hide behind a 'Show reasoning' disclosure; default closed."
 * For power users and demos, this is the screen that proves the
 * routing isn't black-box.
 */
export function GraphTrace() {
  const nodes = useInterviewStore((s) => s.graphTrace);
  const [open, setOpen] = useState(false);

  if (!nodes || nodes.length === 0) {
    // Hidden entirely when no trace data — don't show an empty box
    // since it's a detailed-mode feature, not a persistent slot.
    return null;
  }

  return (
    <div className="glass-panel-sm p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-neon-purple/80" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 flex-1">
            Subject Graph
          </span>
          <span className="text-[10px] font-mono text-slate-600 group-hover:text-neon-purple/80 transition-colors">
            {open ? "hide" : "show"} reasoning
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-neon-purple/80" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-0">
              {nodes.map((node, i) => (
                <TraceNodeRow
                  key={`${node.uri}-${i}`}
                  node={node}
                  isFirst={i === 0}
                  isLast={i === nodes.length - 1}
                  prevNode={i > 0 ? nodes[i - 1] : null}
                />
              ))}
            </div>
            <p className="mt-3 pt-3 border-t border-slate-800/40 text-[10px] text-slate-600 italic leading-snug">
              This is the actual subClassOf walk and verb edge the
              routing layer traversed. Substrate-grounded — not a
              synthesized chain of thought.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TraceNodeRowProps {
  node: GraphTraceNode;
  isFirst: boolean;
  isLast: boolean;
  prevNode: GraphTraceNode | null;
}

function TraceNodeRow({ node, isFirst, isLast, prevNode }: TraceNodeRowProps) {
  // Pick connector glyph based on the relationship into THIS node.
  // First row has no inbound connector. Later rows are either subClassOf
  // (ascending arrow) or via_verb (rightward arrow).
  const showConnector = !isFirst;
  const connectorViaVerb = !!node.via_verb;
  const connectorLabel = connectorViaVerb
    ? `via ${node.via_verb}`
    : prevNode
    ? "subClassOf"
    : "";
  const ConnectorIcon = connectorViaVerb ? ArrowRight : ArrowUp;

  // Color the node dot per role.
  let dotClass = "text-slate-500";
  let dotIcon: React.ReactNode = <Circle className="w-3.5 h-3.5" />;
  if (node.role === "resolved_subject") {
    dotClass = "text-neon-green";
    dotIcon = <Target className="w-3.5 h-3.5" />;
  } else if (node.role === "verb_target") {
    dotClass = "text-neon-cyan";
  } else if (node.role === "output_class") {
    dotClass = "text-neon-purple/70";
  } else if (node.role === "ancestor_class") {
    dotClass = "text-slate-500/70";
  }

  return (
    <div className="flex flex-col">
      {showConnector && (
        <div className="flex items-center gap-2 pl-[7px]">
          <div className="flex flex-col items-center">
            <div className="w-px h-3 bg-slate-800/60" />
            <ConnectorIcon
              className={`w-3 h-3 ${
                connectorViaVerb ? "text-neon-cyan/60" : "text-slate-600"
              }`}
            />
          </div>
          <span className="text-[9px] font-mono italic text-slate-600">
            {connectorLabel}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 py-1">
        <span className={dotClass}>{dotIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-300 truncate">
              {node.label}
            </span>
            {node.role === "resolved_subject" && (
              <span className="text-[9px] font-mono text-neon-green/80 uppercase tracking-wider">
                resolved
              </span>
            )}
            {node.role === "verb_target" && (
              <span className="text-[9px] font-mono text-neon-cyan/80 uppercase tracking-wider">
                verb edge
              </span>
            )}
            {typeof node.hops === "number" && node.hops > 0 && (
              <span className="text-[9px] font-mono text-slate-600 tabular-nums">
                +{node.hops} hop{node.hops === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-slate-500 truncate">{node.uri}</p>
        </div>
      </div>
      {/* leave subtle gap before next connector except after last */}
      {!isLast && <div className="h-0.5" />}
    </div>
  );
}
