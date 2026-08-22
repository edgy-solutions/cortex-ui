/**
 * DELTA_SET — INV-3's card. Consequences grouped by direction.
 *
 * A LIVE VIEW (ADR-0042): it updates as the scenario's ops change, and its freshness stamp is
 * per evaluation.
 *
 * IT RENDERS MAGNITUDE STRINGS VERBATIM. `magnitude` arrives pre-formatted from computed
 * values ("-$1.00M in FY26-Q3", "1 dependency violated (D4)"), and nothing here rebuilds it
 * from `delta`. A second formatter would disagree with the first about rounding on the day it
 * mattered, and "diff magnitudes wrong in the room" is the plan's highest-severity correctness
 * risk. One place formats; this displays.
 *
 * DEGRADED IS RENDERED FIRST. A room reading a proposal needs the cost before the benefit —
 * leading with what improved is how a trade-off gets approved without its price being read.
 * The ordering is in the contract's `groupByDirection`, not a local sort, so it cannot drift.
 */
import {
  groupByDirection, validateDeltaSet, type DeltaDirection, type DeltaEffect,
} from "./DeltaSet.contract";

export interface DeltaSetProps {
  effects: unknown;
  scope_label?: string;
  baseline_label?: string;
  /** A one-sentence headline written from the effect rows under the narration contract's
   *  number-check. Optional by design — the card is complete without it. */
  headline?: string;
  valid_as_of?: string;
  state_version?: number;
}

const TONE: Record<DeltaDirection, { dot: string; text: string; label: string }> = {
  degraded: { dot: "bg-rose-500", text: "text-rose-300", label: "what this costs" },
  improved: { dot: "bg-emerald-500", text: "text-emerald-300", label: "what this buys" },
  neutral: { dot: "bg-slate-500", text: "text-slate-400", label: "no material change" },
};

function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-amber-500/20">
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
          {scope ? `${scope} — cannot compare` : "cannot compare"}
        </p>
        <p className="font-mono text-[9px] text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

/**
 * NOT a refusal — an ANSWER. "Nothing material changed" is useful to a room considering a
 * move, and it is styled as a finding rather than as an absence.
 */
function NothingMaterial({ scope, baseline }: { scope?: string; baseline?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-cyan-500" />
        <h3 className="text-xl font-bold text-white tracking-tight leading-none">
          {scope || "Comparison"}
        </h3>
      </div>
      <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold mb-4">
        vs {baseline || "baseline"}
      </p>
      <p className="font-mono text-sm text-slate-300">
        No material change.
      </p>
      <p className="mt-1 font-mono text-[11px] text-slate-500">
        Every measure moved by less than its materiality floor, or not at all.
      </p>
    </div>
  );
}

export function DeltaSet({
  effects, scope_label, baseline_label, headline, valid_as_of, state_version,
}: DeltaSetProps) {
  const result = validateDeltaSet(effects);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }
  if (result.effects.length === 0) {
    return <NothingMaterial scope={scope_label} baseline={baseline_label} />;
  }

  const groups = groupByDirection(result.effects);
  const degraded = result.effects.filter((e) => e.direction === "degraded").length;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${degraded ? "bg-rose-500" : "bg-emerald-500"} animate-pulse`} />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Comparison"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          vs {baseline_label || "baseline"} · {result.effects.length} effect
          {result.effects.length === 1 ? "" : "s"}
        </p>
      </div>

      {headline && (
        <p className="mb-5 text-sm text-slate-200 leading-relaxed border-l-2 border-cyan-500/40 pl-3">
          {headline}
        </p>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.direction}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-1.5 h-1.5 rounded-full ${TONE[g.direction].dot}`} />
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                {TONE[g.direction].label}
              </span>
            </div>
            <ul className="space-y-2">
              {g.effects.map((e: DeltaEffect, i: number) => (
                <li key={`${e.metric}-${i}`} className="pl-4 border-l border-white/10">
                  {/* VERBATIM. Nothing here rebuilds a magnitude from `delta`. */}
                  <p className={`font-mono text-sm ${TONE[g.direction].text}`}>{e.magnitude}</p>
                  <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                    {e.metric}
                    {e.affected.length > 0 && (
                      <span className="text-slate-400"> · {e.affected.join(", ")}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {(valid_as_of || state_version !== undefined) && (
        <div className="mt-5 pt-3 border-t border-white/5 flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {valid_as_of ? `as of ${valid_as_of}` : "as of —"}
          </span>
          {state_version !== undefined && (
            <span className="font-mono text-[9px] text-slate-600">state v{state_version}</span>
          )}
        </div>
      )}
    </div>
  );
}
