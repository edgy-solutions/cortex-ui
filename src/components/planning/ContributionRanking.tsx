import { useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { showMeasure } from "@/lib/showMeasure";
import { CellInspector } from "./CellInspector";
import {
  validateContributionRanking,
  type ContributionRow,
} from "./ContributionRanking.contract";

/**
 * CONTRIBUTION_RANKING — N entities ordered by how much each contributes to one total.
 *
 * A LIVE VIEW (ADR-0042). Order comes from the producer and is rendered verbatim; re-sorting
 * here would be a second implementation of the ranking, and the two would disagree the first
 * time the producer changed its tie-break.
 *
 * THE SHARE IS THE ANSWER, not the amount. "Which of these is driving it" is answered by the
 * proportion — a $400K contributor is a different fact at 8% of the total than at 80% — so the
 * bar is drawn from `share_of_total` and the amount rides beside it.
 *
 * IT KNOWS NO DOMAIN. "Control account", "variance" and "work package" appear nowhere; the
 * payload supplies `value_label` and the entity names.
 */

/** Shared with DELTA_SET on purpose: the two cards mean the same thing by the same colours. */
const TONE = {
  favourable: { bar: "bg-emerald-500/70", text: "text-emerald-300" },
  adverse: { bar: "bg-rose-500/70", text: "text-rose-300" },
  unstated: { bar: "bg-slate-500/60", text: "text-slate-300" },
} as const;

function toneOf(row: ContributionRow) {
  // THE PRODUCER'S VERDICT, never inferred from the sign. In cost variance a positive number is
  // favourable; in another measure the same sign is not. Absent means UNSTATED — a neutral mark
  // rather than a guess dressed as a judgement.
  if (row.favourable === true) return TONE.favourable;
  if (row.favourable === false) return TONE.adverse;
  return TONE.unstated;
}

function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-amber-500/20">
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
          {scope ? `${scope} — nothing to draw` : "nothing to draw"}
        </p>
        <p className="font-mono text-[9px] text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

export function ContributionRanking({
  rows,
  value_label,
  value_unit,
  scope_label,
  valid_as_of,
  state_version,
}: {
  rows: unknown;
  value_label?: string;
  value_unit?: string;
  scope_label?: string;
  valid_as_of?: string;
  state_version?: number;
}) {
  const [selected, setSelected] = useState<ContributionRow | null>(null);
  const result = validateContributionRanking(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }
  const ranked = result.rows;

  // The bar's full width is the LARGEST share present, so the ranking stays legible when every
  // contributor is small. Scaling to 100% would draw four invisible bars for a set whose
  // biggest driver is 9%. Computed from what is shown, never from an assumed total.
  const widest = ranked.reduce(
    (m, r) => (typeof r.share_of_total === "number" ? Math.max(m, Math.abs(r.share_of_total)) : m),
    0,
  );

  return (
    <div className="glass-panel p-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="w-1.5 h-1.5 rounded-full bg-neon-purple/80 flex-shrink-0" />
        <h3 className="font-semibold text-slate-100">Ranking</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {ranked.length} {ranked.length === 1 ? "contributor" : "contributors"}
          {value_label ? ` · ${value_label}` : ""}
        </span>
      </div>

      <ol className="mt-3 flex flex-col gap-1.5">
        {ranked.map((r, i) => {
          const tone = toneOf(r);
          const share = typeof r.share_of_total === "number" ? r.share_of_total : null;
          return (
            <li key={r.entity_id || `${r.entity_name}-${i}`}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[.04] transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[9px] text-slate-600 w-4 flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="font-mono text-[12px] text-slate-200 truncate min-w-0 flex-1">
                    {r.entity_name}
                  </span>
                  <span className={`font-mono text-[12px] tabular-nums ${tone.text}`}>
                    {formatAmount(r.contribution, value_unit)}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 w-12 text-right tabular-nums">
                    {/* NULL SHARE IS ABSENT, NOT ZERO. The total was nought; there is no share
                        of nothing, and 0% would read as "contributes nothing". */}
                    {share === null ? "—" : `${showMeasure(share * 100)}%`}
                  </span>
                </div>
                <span className="mt-1 block h-0.5 w-full rounded-sm bg-slate-100/10">
                  <span
                    className={`block h-full rounded-sm ${tone.bar}`}
                    style={{
                      width:
                        share !== null && widest > 0
                          ? `${Math.min(100, (Math.abs(share) / widest) * 100)}%`
                          : "0%",
                    }}
                  />
                </span>
                {/* A CAVEAT BELONGS ON ITS ROW. This one says a level-of-effort account's
                    schedule variance is structurally zero and carries no information about
                    progress — shown anywhere else, it is a caveat nobody connects to the
                    number it qualifies. */}
                {r.note && (
                  <span className="mt-1 block font-mono text-[9px] text-amber-400/70 leading-snug">
                    {r.note}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-2 font-mono text-[9px] text-slate-500 flex items-center gap-3 flex-wrap">
        <span>bar = share of total</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/60" /> favourable
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-rose-500/60" /> adverse
        </span>
      </p>

      {selected && (
        <CellInspector
          onDismiss={() => setSelected(null)}
          title={<>{selected.entity_name}</>}
          headline={
            <>
              {formatAmount(selected.contribution, value_unit)}
              {typeof selected.share_of_total === "number" && (
                <span className="text-slate-400">
                  {" "}
                  · {showMeasure(selected.share_of_total * 100)}% of total
                </span>
              )}
            </>
          }
          lines={[
            typeof selected.bcws === "number" ? (
              <>
                BCWS {formatAmount(selected.bcws, value_unit)} · BCWP{" "}
                {formatAmount(selected.bcwp ?? NaN, value_unit)} · ACWP{" "}
                {formatAmount(selected.acwp ?? NaN, value_unit)}
              </>
            ) : null,
            selected.note ? <span className="text-amber-400/80">{selected.note}</span> : null,
          ]}
        />
      )}

      {(valid_as_of || state_version !== undefined) && (
        <p className="mt-3 font-mono text-[9px] text-slate-500">
          {valid_as_of && <>valid as of {valid_as_of}</>}
          {state_version !== undefined && <> · state v{state_version}</>}
        </p>
      )}
    </div>
  );
}
