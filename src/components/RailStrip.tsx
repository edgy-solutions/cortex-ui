import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A collapsed rail: what is behind it, that it is alive, and a way in.
 *
 * ── NO ICONS, AND THE REASON IS NOT "TOO NOISY" ──────────────────────────────────────────
 *
 * The answers list DOES have meaningful icons — the archetype glyph on every row is the one
 * dimension of that list that varies, and scanning 117 rows for a funding gap is faster by
 * shape than by reading two lines of text. But those glyphs work because they sit BESIDE the
 * text they qualify. A strip of twenty bare glyphs has lost exactly that: five repeating
 * symbols with no way to tell one cost curve from another. The icon disambiguates within a
 * labelled row; alone it disambiguates nothing.
 *
 * So a collapsed rail says three things and stops: what is behind it (the vertical label),
 * that it is alive (the count), and how to get in (the chevron). Anything more is a worse
 * version of the thing it is standing in for.
 *
 * ── THE CHEVRON IS NOT A HOVER TARGET ────────────────────────────────────────────────────
 *
 * Hover peeks the rail open, but the chevron is drawn unconditionally. A mode whose exit is
 * only discoverable by hovering traps anyone who did not build it — and in a demo the person
 * driving may be exactly that person.
 */
export function RailStrip({
  label,
  count,
  side,
  pinned,
  onToggle,
}: {
  label: string;
  /** Optional — a rail with nothing to count shows no number rather than a zero. */
  count?: number;
  side: "left" | "right";
  pinned: boolean;
  onToggle: () => void;
}) {
  const Chevron = side === "left" ? ChevronRight : ChevronLeft;
  return (
    <div
      className={`w-12 h-full flex-shrink-0 flex flex-col items-center gap-3 py-3 bg-surface-dark ${
        side === "left" ? "border-r" : "border-l"
      } border-glass-border`}
      data-rail-strip={side}
    >
      <button
        type="button"
        onClick={onToggle}
        title={pinned ? `Collapse ${label}` : `Open ${label}`}
        aria-label={pinned ? `Collapse ${label}` : `Open ${label}`}
        className="text-slate-500 hover:text-neon-cyan"
        data-rail-toggle
      >
        <Chevron className="w-4 h-4" />
      </button>

      {typeof count === "number" && (
        <span className="px-1 rounded bg-white/5 text-[9px] font-mono text-slate-400 tabular-nums">
          {count}
        </span>
      )}

      {/* The label runs vertically because a 48px strip has no horizontal room, and a
          truncated word is worse than a rotated one. */}
      <span
        className="text-[9px] font-mono uppercase tracking-widest text-slate-500 whitespace-nowrap"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {label}
      </span>
    </div>
  );
}
