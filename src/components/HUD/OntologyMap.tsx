import { motion, AnimatePresence } from "framer-motion";
import { Tag } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";

const categoryColors: Record<string, string> = {
  Asset: "text-neon-blue border-neon-blue/30 bg-neon-blue/5",
  Concept: "text-neon-purple border-neon-purple/30 bg-neon-purple/5",
  Process: "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5",
};

export function OntologyMap() {
  const terms = useInterviewStore((s) => s.ontologyTerms);
  const isProcessing = useInterviewStore((s) => s.isProcessing);

  // Live-only widget: concepts stream during the ask and are NOT persisted
  // on the answer. It shows ONLY while a turn is in flight; when you're
  // recalling a past answer (or idle) it disappears entirely rather than
  // showing stale terms from the last turn. The persisted, structured
  // grounding for a recalled answer lives in the Decision Path + Subject
  // Graph (artifact-backed), which is where it belongs.
  if (!isProcessing) return null;

  return (
    <div className="glass-panel-sm p-3">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-3.5 h-3.5 text-neon-purple/70" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Ontology Map
        </span>
        {terms.length > 0 && (
          <span className="ml-auto text-[10px] font-mono text-neon-purple/50">
            {terms.length}
          </span>
        )}
      </div>

      {terms.length === 0 ? (
        // Honest empty state: this is a LIVE grounding widget — concepts
        // stream in while a question is being answered and are not
        // persisted on the answer. So on retrieval of a past answer it's
        // empty by design (the Decision Path + Subject Graph carry the
        // persisted, structured grounding). Say that, rather than reading
        // as a broken panel.
        <p className="text-xs text-slate-600 italic font-mono leading-relaxed">
          Concepts surface here live while a question is being answered.
          For a past answer, see its Decision Path.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {terms.map((term) => (
              <motion.span
                key={term.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                  categoryColors[term.category] ?? categoryColors.Concept
                }`}
              >
                <span className="opacity-60">{term.category}:</span>
                <span className="font-medium">{term.label}</span>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
