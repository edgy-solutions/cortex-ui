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
        <p className="text-xs text-slate-600 italic font-mono">
          No concepts extracted yet...
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
