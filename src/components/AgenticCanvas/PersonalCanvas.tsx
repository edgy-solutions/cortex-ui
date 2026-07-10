import { useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LayoutGrid } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { PinnedAnswerCard } from "./PinnedAnswerCard";

/**
 * PersonalCanvas — the minimal personal canvas (ADR-0028 v1).
 *
 * Mounted as an OVERLAY in Layout's canvas section (like NodeInspector),
 * so it's available regardless of whether an artifact is foregrounded —
 * the pinned set is a per-user surface, independent of the current
 * artifact. Renders the answers pinned via drag as SPO-tagged cards.
 *
 * v1 is the ARRANGEMENT workspace only: pin, position, remove, trace.
 * It does NOT compute eligibility over the set (that's v2 aggregation) —
 * but the cards CARRY their SPO so v2/v3 can, without re-derivation.
 *
 * Always renders a small toggle (with the live pin count) so the canvas
 * is reachable; the overlay body is the drop target's visual layer and
 * the drag-bounds for repositioning pinned cards.
 */
export function PersonalCanvas() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const pins = useAnswerPanelStore((s) => s.pins);
  const canvasOpen = useAnswerPanelStore((s) => s.canvasOpen);
  const setCanvasOpen = useAnswerPanelStore((s) => s.setCanvasOpen);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Resolve each pin to its artifact; drop dangling pins from the render
  // (the answer was cleared from the collection). Honest-absent: a pin
  // with no backing answer just isn't shown.
  const byId = useMemo(() => {
    const m = new Map<string, (typeof artifacts)[number]>();
    for (const a of artifacts) m.set(a.id, a);
    return m;
  }, [artifacts]);

  const livePins = useMemo(
    () => pins.filter((p) => byId.has(p.answerId)),
    [pins, byId]
  );

  return (
    <>
      {/* Toggle FAB — always present so the canvas is reachable; shows
          the live pin count. */}
      <button
        onClick={() => setCanvasOpen(!canvasOpen)}
        className={`absolute bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2 rounded-full font-mono text-[10px] uppercase tracking-wider border transition-colors shadow-lg ${
          canvasOpen
            ? "bg-neon-cyan/20 border-neon-cyan/50 text-neon-cyan"
            : "bg-slate-900/90 border-slate-700/60 text-slate-300 hover:border-neon-cyan/40"
        }`}
        title="Personal canvas"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        My Canvas
        {livePins.length > 0 && (
          <span className="min-w-4 h-4 px-1 rounded-full bg-neon-cyan/30 text-neon-cyan text-[9px] flex items-center justify-center">
            {livePins.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {canvasOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 flex flex-col bg-surface-dark/95 backdrop-blur-sm"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-glass-border flex-shrink-0">
              <LayoutGrid className="w-4 h-4 text-neon-cyan/80" />
              <span className="font-mono text-xs uppercase tracking-widest text-slate-200">
                My Canvas
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {livePins.length} pinned
              </span>
              <button
                onClick={() => setCanvasOpen(false)}
                className="ml-auto text-slate-500 hover:text-slate-200 transition-colors"
                title="Close canvas"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body — drop target visual layer + drag bounds for cards. */}
            <div
              ref={bodyRef}
              className="relative flex-1 min-h-0 overflow-hidden"
            >
              {livePins.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                  <LayoutGrid className="w-8 h-8 text-slate-700 mb-3" />
                  <p className="font-mono text-xs text-slate-500 mb-1">
                    Drag answers here
                  </p>
                  <p className="font-mono text-[10px] text-slate-600 max-w-xs leading-relaxed">
                    Pull answers from the list onto the canvas to arrange
                    them. Each card carries its subject, verb, and trace.
                  </p>
                </div>
              )}

              {livePins.map((pin) => {
                const artifact = byId.get(pin.answerId);
                if (!artifact) return null;
                return (
                  <PinnedAnswerCard
                    key={pin.answerId}
                    pin={pin}
                    artifact={artifact}
                    bounds={bodyRef}
                    onTrace={() => setCanvasOpen(false)}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
