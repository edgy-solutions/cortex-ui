import React from "react";
import { AlertTriangle, ShieldAlert, Info } from "lucide-react";

interface HazardEntity {
  id: string;
  name?: string;
  type?: string;
  description?: string;
}

type Severity = "CRITICAL" | "WARNING" | "INFO";

interface WarningCardProps {
  /**
   * For HAZARD_DECLARATION renders: the subject concept of the hazard
   * (e.g., "M67 grenade assembly station — known hazards").
   *
   * For system-error renders (used by MessageBubble): the error
   * message itself. Both cases display this as the bold card title.
   * The prop name `error` is preserved for backwards compatibility
   * with the system-error call sites.
   */
  error: string;
  hazards?: HazardEntity[];
  /**
   * Explicit severity. Preferred over `isCritical` going forward.
   * Defaults to "WARNING" when neither is provided.
   */
  severity?: Severity;
  /**
   * Backwards-compat shortcut — `true` → CRITICAL, `false`/missing →
   * WARNING. New call sites should pass `severity` directly.
   */
  isCritical?: boolean;
}

/**
 * Severity-keyed palette + icon. Each severity owns a distinct
 * accent so a hazard can't be mistaken for a routine answer — this
 * is the one place in the registry where matching the cyan-calm
 * chart language would WEAKEN the signal (user feedback, 2026-06-26).
 *
 * No hardcoded headers like "STRUCTURAL RISK ALERT" / "SAFETY
 * CONSTRAINT" anymore — those leaked a military/structural domain
 * assumption that doesn't generalize. Severity is now a small chip,
 * the subject concept becomes the bold title.
 */
const SEVERITY_CONFIG: Record<
  Severity,
  {
    Icon: React.ComponentType<{ className?: string }>;
    bg: string;
    border: string;
    shadow: string;
    text: string;
    dot: string;
    chipBg: string;
    chipBorder: string;
    chipText: string;
    pulseOnCritical: boolean;
  }
> = {
  CRITICAL: {
    Icon: ShieldAlert,
    bg: "bg-rose-950/40",
    border: "border-rose-500/50",
    shadow: "shadow-[0_0_30px_rgba(244,63,94,0.15)]",
    text: "text-rose-500",
    dot: "bg-rose-500",
    chipBg: "bg-rose-500/15",
    chipBorder: "border-rose-500/40",
    chipText: "text-rose-300",
    pulseOnCritical: true,
  },
  WARNING: {
    Icon: AlertTriangle,
    bg: "bg-amber-950/40",
    border: "border-amber-500/50",
    shadow: "shadow-[0_0_30px_rgba(245,158,11,0.15)]",
    text: "text-amber-500",
    dot: "bg-amber-500",
    chipBg: "bg-amber-500/15",
    chipBorder: "border-amber-500/40",
    chipText: "text-amber-300",
    pulseOnCritical: false,
  },
  INFO: {
    Icon: Info,
    bg: "bg-sky-950/40",
    border: "border-sky-500/50",
    shadow: "shadow-[0_0_30px_rgba(14,165,233,0.15)]",
    text: "text-sky-400",
    dot: "bg-sky-400",
    chipBg: "bg-sky-500/15",
    chipBorder: "border-sky-500/40",
    chipText: "text-sky-300",
    pulseOnCritical: false,
  },
};

export const WarningCard: React.FC<WarningCardProps> = ({
  error,
  hazards,
  severity,
  isCritical,
}) => {
  // Resolve severity: explicit prop > isCritical shorthand > default
  const resolvedSeverity: Severity =
    severity ?? (isCritical ? "CRITICAL" : "WARNING");
  const cfg = SEVERITY_CONFIG[resolvedSeverity];
  const Icon = cfg.Icon;

  return (
    <div
      className={`w-full p-5 rounded-xl border backdrop-blur-md ${cfg.bg} ${cfg.border} ${cfg.shadow}`}
    >
      {/* Header — subject_concept is the title; severity is a chip */}
      <div className="flex items-start gap-3 mb-4 border-b border-white/10 pb-3">
        <Icon
          className={`w-6 h-6 ${cfg.text} flex-shrink-0 mt-0.5 ${
            cfg.pulseOnCritical ? "animate-pulse" : ""
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white tracking-tight text-base leading-tight">
              {error}
            </h3>
            <span
              className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-widest uppercase border ${cfg.chipBg} ${cfg.chipBorder} ${cfg.chipText}`}
            >
              {resolvedSeverity}
            </span>
          </div>
        </div>
      </div>

      {/* Hazards List */}
      {hazards && hazards.length > 0 ? (
        <div className="space-y-3">
          {hazards.map((hazard, index) => (
            <div
              key={hazard.id || index}
              className="p-3 bg-black/40 rounded-lg border border-white/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="font-mono text-xs text-white font-semibold uppercase tracking-wider">
                  {hazard.name || "Unknown Hazard"}
                </span>
                {hazard.type && (
                  <span className="ml-auto text-[9px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                    {hazard.type}
                  </span>
                )}
              </div>
              {hazard.description && (
                <p className="text-sm text-slate-300 pl-4 border-l-2 border-white/10 ml-1 mt-2">
                  {hazard.description}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center font-mono text-xs text-slate-500 bg-black/20 rounded-lg">
          No specific hazards extracted.
        </div>
      )}
    </div>
  );
};
