import { motion } from "framer-motion";
import { presentConfidence } from "@/lib/confidence";

interface ConfidenceBarProps {
  /** Raw 0..1 confidence float as the pipeline reported it. */
  value: number | null | undefined;
  /** Show the raw percent next to the bar (defaults on for transparency). */
  showRawOnHover?: boolean;
  /** Optional className for layout containment. */
  className?: string;
}

/**
 * Honest confidence presentation per architect's ruling 2026-06-21.
 *
 * - The bucket label is the bucket's REAL name (incl. "low confidence",
 *   "very low confidence"). NEVER softened to "exploratory".
 * - Low/very-low buckets render with an actionable nudge underneath
 *   ("Rephrasing may help…") — per architect: "pair low confidence
 *   with what to do about it".
 * - The raw float is preserved as a hover tooltip so power users can
 *   audit without exposing the float to casual users by default.
 * - Bar width tracks the float (not the bucket), so two scores at
 *   0.62 look identical even if the bucket boundary is at 0.6 — the
 *   reader sees the truth, not a quantized lie.
 *
 * Governing principle (architect): "surface what the pipeline actually
 * did; never synthesize, soften, or hide it — the honest route is the
 * whole value, including when the route was uncertain."
 */
export function ConfidenceBar({
  value,
  showRawOnHover = true,
  className = "",
}: ConfidenceBarProps) {
  const c = presentConfidence(value);
  const tooltip = showRawOnHover ? `Raw confidence: ${c.raw.toFixed(2)}` : undefined;
  return (
    <div className={className} title={tooltip}>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${c.colorClass} rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${c.widthPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <span
          className={`font-mono text-[10px] tabular-nums whitespace-nowrap ${
            c.bucket === "high"
              ? "text-neon-green/80"
              : c.bucket === "medium"
              ? "text-neon-cyan/80"
              : c.bucket === "low"
              ? "text-amber-400/90"
              : "text-red-400/90"
          }`}
        >
          {c.label}
        </span>
      </div>
      {c.nudge && (
        <p className="mt-1 text-[10px] text-slate-500 italic leading-snug">
          {c.nudge}
        </p>
      )}
    </div>
  );
}
