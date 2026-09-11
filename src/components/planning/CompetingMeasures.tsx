import { formatAmount } from "@/lib/formatAmount";
import {
  validateCompetingMeasures,
  type CompetingMeasureRow,
} from "./CompetingMeasures.contract";

/**
 * COMPETING_MEASURES — N methods measuring one quantity, with the SPREAD as the finding.
 *
 * See `CompetingMeasures.contract.ts` for why this is a distinct archetype, why MATRIX_GRID is
 * the closest fit and still wrong, and why the spread is rendered rather than derived.
 *
 * The one rule that governs every decision below: R-001 rules that *pinning hides the
 * divergence that is the finding*. A card that prints three figures and leaves the reader to
 * subtract two of them has published the numbers and withheld the answer.
 */
export interface CompetingMeasuresProps {
  methods: unknown;
  /** Producer-computed. Never derived here — see the contract's `spreadIsUpstream`. */
  spread?: number | null;
  spread_percent_of_bac?: number | null;
  lowest_value?: number | null;
  highest_value?: number | null;
  methods_compared?: number | null;
  methods_answered?: number | null;
  all_methods_answered?: boolean | null;
  reference_value?: number | null;
  value_unit?: string;
  scope_label?: string;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function CompetingMeasures({
  methods,
  spread,
  spread_percent_of_bac,
  lowest_value,
  highest_value,
  methods_compared,
  methods_answered,
  all_methods_answered,
  value_unit,
  scope_label,
}: CompetingMeasuresProps) {
  const result = validateCompetingMeasures(methods);
  if (result.kind === "empty") {
    return (
      <div className="rounded-md border border-slate-700/50 bg-slate-800/30 p-4" data-refused>
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
          {result.reason}
        </p>
      </div>
    );
  }

  const rows = result.rows;
  const answered = rows.filter((r) => num(r.value) !== null);
  const lo = num(lowest_value);
  const hi = num(highest_value);
  const spreadValue = num(spread);
  const spreadPct = num(spread_percent_of_bac);

  const asked = num(methods_compared) ?? rows.length;
  const replied = num(methods_answered) ?? answered.length;
  // TRUSTED FROM THE PRODUCER WHEN STATED, derived only as a fallback — and the fallback is a
  // count of rows, not a subtraction of figures. See `spreadIsUpstream`.
  const complete = typeof all_methods_answered === "boolean" ? all_methods_answered : replied === asked;

  // The bar scale is over the ANSWERING methods only. Including a null would put a zero-length
  // bar beside real ones and read as "this method says nothing is left", which is a figure.
  const barMax = Math.max(...answered.map((r) => Math.abs(num(r.value)!)), 0);

  return (
    <div className="flex flex-col gap-3" data-competing-measures>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-mono text-sm text-slate-200">
            {scope_label ? `${scope_label} · ` : ""}
            {rows.length} methods
          </h3>
          {/*
            THE FINDING, FIRST AND WITHOUT ARITHMETIC. This is the line R-001 is about: the
            spread and what fraction of the reference quantity it is. Printed above the figures
            rather than beneath them, because a reader who stops after the numbers has read the
            data and missed the answer.
          */}
          {spreadValue !== null ? (
            <p className="font-mono text-[11px] text-amber-400/90" data-spread>
              spread {formatAmount(spreadValue, value_unit)}
              {spreadPct !== null ? ` · ${(spreadPct * 100).toFixed(1)}% of reference` : ""}
            </p>
          ) : replied >= 2 ? (
            /*
              THE PRODUCER DID NOT REPORT IT, and this card may not compute it. Said rather
              than omitted: the methods below genuinely disagree, so a card that showed the
              figures with no spread line would read as agreement. Same rule as the ranking that
              says "no direction stated" rather than drawing grey and hoping.
            */
            <p className="font-mono text-[11px] text-amber-400/80" data-spread-unreported>
              spread not reported — the methods below disagree; the figure was not sent
            </p>
          ) : null}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {lo !== null && hi !== null
            ? `${formatAmount(lo, value_unit)} – ${formatAmount(hi, value_unit)}`
            : value_unit ?? ""}
        </span>
      </div>

      {/*
        ABSENCE IS ON THE CARD, not inferred from a short list. `2 of 3 answered` is what stops
        the remaining two looking like the whole comparison — the reader cannot see the absence
        of a row they were never shown, and this card does show every row, so this line is the
        belt to that braces.
      */}
      {!complete && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-amber-400/80" data-incomplete>
          {replied} of {asked} methods answered — this is not a full comparison
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {rows.map((r) => (
          <MethodRow key={r.method} row={r} barMax={barMax} unit={value_unit} />
        ))}
      </ol>
    </div>
  );
}

function MethodRow({
  row,
  barMax,
  unit,
}: {
  row: CompetingMeasureRow;
  barMax: number;
  unit?: string;
}) {
  const value = num(row.value);
  const width = value !== null && barMax > 0 ? (Math.abs(value) / barMax) * 100 : 0;

  return (
    <li className="flex flex-col gap-1" data-method={row.method}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] text-slate-200">{row.method}</span>
        {value !== null ? (
          <span className="font-mono text-[12px] text-slate-100 tabular-nums">
            {formatAmount(value, unit)}
          </span>
        ) : (
          /*
            THE ROW SURVIVES ITS OWN ABSENCE. Dropping it would turn a comparison of three into
            a comparison of two without appearing to. The REASON is shown where the figure would
            have been, so the gap is explained at the point a reader looks for the number.
          */
          <span
            className="font-mono text-[10px] uppercase tracking-widest text-amber-400/80"
            data-unavailable
          >
            {row.unavailable_reason}
          </span>
        )}
      </div>
      {/*
        `formula` is half the answer — it is what lets a reader see WHY two methods diverge,
        rather than only that they do. Never truncated away: three figures with no formulas are
        three unattributed numbers.
      */}
      <p className="font-mono text-[10px] text-slate-500 break-words">{row.formula}</p>
      {value !== null && (
        <span className="h-1 rounded-sm bg-slate-700/40 overflow-hidden">
          <span className="block h-full bg-slate-400/50" style={{ width: `${width}%` }} />
        </span>
      )}
      {row.secondary && row.secondary.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          {row.secondary.map((s) => (
            <span key={s.label} className="font-mono text-[10px] text-slate-500 tabular-nums">
              {s.label} {num(s.value) !== null ? formatAmount(s.value as number, unit) : "—"}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
