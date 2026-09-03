import { useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { showMeasure } from "@/lib/showMeasure";
import { CellInspector } from "./CellInspector";
import {
  validateForecastMeasure,
  type ForecastRow,
} from "./ForecastMeasure.contract";
import { ACCENT, ACCENT_DEEP, OVER } from "@/lib/chartPalette";

/**
 * FORECAST_MEASURE — one forecast, and the method that produced it.
 *
 * A LIVE VIEW (ADR-0042): a forecast is a function of performance reported so far, and more
 * reported periods move it.
 *
 * THE METHOD IS RENDERED WITH THE SAME WEIGHT AS THE NUMBER, and that is the whole component.
 * Engine F refuses a bare "what's the EAC" because its three formulas span about 14% of the
 * budget on the same program. A card showing the figure alone would make that choice silently
 * on the reader's behalf, at the last step, after the engine declined to. So the method and its
 * formula sit beside the figure rather than under it, and a payload without them draws NOTHING.
 *
 * IT KNOWS NO DOMAIN in its own name; the field names are the producer's IPMDAR vocabulary,
 * adopted by ADR-0045 so an analyst's phrasing resolves without a translation layer, and read
 * verbatim here.
 */
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

/** A supporting quantity. Absent renders an em dash — never a zero, which is a measurement. */
function Tile({
  label,
  value,
  unit,
  adverse,
  raw,
}: {
  label: string;
  value?: number;
  unit?: string;
  /** Carries the breach colour on the BORDER as well as the value: on a projector the border
   *  survives what a text colour does not. */
  adverse?: boolean;
  /** Pre-formatted, for a dimensionless index that is not an amount. */
  raw?: string;
}) {
  const known = raw !== undefined || (typeof value === "number" && Number.isFinite(value));
  return (
    <div
      className={`min-w-0 rounded border px-3 py-2 ${
        adverse ? "border-rose-500/40 bg-rose-500/[.06]" : "border-white/10"
      }`}
    >
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
      <p
        className="font-mono text-[15px] tabular-nums"
        style={{ color: adverse ? OVER : "#e2e8f0" }}
      >
        {known ? raw ?? formatAmount(value as number, unit) : <span className="text-slate-600">—</span>}
      </p>
    </div>
  );
}

/** A swatch, a name and an amount, under the bar. An absent amount says so rather than zero. */
function BarKey({
  colour,
  label,
  value,
  unit,
}: {
  colour: string;
  label: string;
  value?: number;
  unit?: string;
}) {
  const known = typeof value === "number" && Number.isFinite(value);
  return (
    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-400">
      <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colour }} />
      {label}{" "}
      {known ? formatAmount(value as number, unit) : <span className="text-slate-600">—</span>}
    </span>
  );
}

export function ForecastMeasure({
  rows,
  value_unit,
  scope_label,
  valid_as_of,
  state_version,
}: {
  rows: unknown;
  value_unit?: string;
  scope_label?: string;
  valid_as_of?: string;
  state_version?: number;
}) {
  const [inspecting, setInspecting] = useState(false);
  const result = validateForecastMeasure(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }
  const row: ForecastRow = result.row;

  // OVER BUDGET IS THE PRODUCER'S SUBTRACTION, read not repeated. `vac` is budget minus
  // forecast, so negative means the forecast exceeds the budget. Absent `vac` means the card
  // states no verdict rather than computing one from `bac` itself.
  const overBudget = typeof row.vac === "number" && row.vac < 0;

  return (
    <div className="glass-panel p-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ACCENT }} />
        <h3 className="font-semibold text-slate-100">Forecast</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {row.program_name || scope_label || ""}
          {row.as_of_period ? ` · as of ${row.as_of_period}` : ""}
        </span>
      </div>

      {/* THE NUMBER AND ITS METHOD, TOGETHER. Not a headline with a caption — the method line
          carries the same visual weight class as the figure, because it is half the answer.
          THE FIGURE IS NOT COLOURED BY THE VERDICT. A forecast is not itself good or bad; the
          VARIANCE is, and colouring the headline made the reader read a judgement into the
          measurement. The breach colour now lives on the tile that carries the judgement. */}
      <div className="mt-3 flex items-end gap-4 flex-wrap">
        <p className="font-mono text-4xl tabular-nums leading-none text-slate-100">
          {formatAmount(row.eac, value_unit)}
        </p>
        <div className="min-w-0">
          <p
            className="font-mono text-[11px] uppercase tracking-widest"
            style={{ color: ACCENT }}
          >
            {row.method} method
          </p>
          <p className="font-mono text-[11px] text-slate-400">{row.formula}</p>
        </div>
      </div>

      {/* WHERE THE FORECAST SITS AGAINST THE BUDGET, as one bar.
          THE TRACK IS THE FORECAST, and every segment is a quantity the producer DECLARED:
          spent (`acwp`) and to-complete (`etc`) sum to it exactly, because `etc` is defined as
          eac − acwp upstream. The over-budget tail is |`vac`| drawn ON the end of the track
          rather than appended to it — appending would make the bar total a number that is not
          any quantity at all, and the legend would then label widths nobody reported. */}
      {typeof row.acwp === "number" && row.eac > 0 && (
        <div className="mt-4">
          <div className="relative h-2 w-full rounded-sm overflow-hidden bg-slate-100/10">
            <div className="absolute inset-0 flex">
              <span
                style={{ width: `${Math.min(100, (row.acwp / row.eac) * 100)}%`, background: ACCENT }}
              />
              {typeof row.etc === "number" && (
                <span
                  style={{
                    width: `${Math.min(100, (row.etc / row.eac) * 100)}%`,
                    background: ACCENT_DEEP,
                  }}
                />
              )}
            </div>
            {overBudget && typeof row.vac === "number" && (
              <span
                className="absolute inset-y-0 right-0"
                style={{
                  width: `${Math.min(100, (Math.abs(row.vac) / row.eac) * 100)}%`,
                  background: OVER,
                }}
              />
            )}
          </div>
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <BarKey colour={ACCENT} label="spent" value={row.acwp} unit={value_unit} />
            <BarKey colour={ACCENT_DEEP} label="to complete" value={row.etc} unit={value_unit} />
            {overBudget && typeof row.vac === "number" && (
              <BarKey colour={OVER} label="over budget" value={Math.abs(row.vac)} unit={value_unit} />
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="budget" value={row.bac} unit={value_unit} />
        <Tile label="variance" value={row.vac} unit={value_unit} adverse={overBudget} />
        {/* THE INDICES ARE NOT AMOUNTS. Formatted through showMeasure so a dimensionless ratio
            never acquires a currency symbol from a card whose other tiles are money. */}
        <Tile
          label="cpi"
          raw={typeof row.cpi === "number" ? showMeasure(row.cpi, 2) : undefined}
          adverse={typeof row.cpi === "number" && row.cpi < 1}
        />
        <Tile
          label="spi"
          raw={typeof row.spi === "number" ? showMeasure(row.spi, 2) : undefined}
          adverse={typeof row.spi === "number" && row.spi < 1}
        />
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {typeof row.percent_complete === "number" && (
          <span>{showMeasure(row.percent_complete * 100)}% complete</span>
        )}
        {/* HOW MUCH THE PROJECTION RESTS ON. A forecast from one reported period and one from
            twelve are different claims wearing the same number. */}
        {typeof row.reported_periods === "number" && (
          <span className={row.reported_periods <= 1 ? "text-amber-400/80" : undefined}>
            {row.reported_periods === 1
              ? "1 reported period — thin basis"
              : `${row.reported_periods} reported periods`}
          </span>
        )}
        <button
          type="button"
          onClick={() => setInspecting(true)}
          className="ml-auto text-slate-500 hover:text-neon-cyan underline decoration-dotted"
        >
          inspect
        </button>
      </div>

      {inspecting && (
        <CellInspector
          onDismiss={() => setInspecting(false)}
          title={<>{row.program_name || scope_label || "forecast"} · {row.method}</>}
          headline={<>{row.formula}</>}
          lines={[
            <>
              BCWS {formatAmount(row.bcws ?? NaN, value_unit)} · BCWP{" "}
              {formatAmount(row.bcwp ?? NaN, value_unit)} · ACWP{" "}
              {formatAmount(row.acwp ?? NaN, value_unit)}
            </>,
            typeof row.reported_periods === "number" ? (
              <>projected from {row.reported_periods} reported period{row.reported_periods === 1 ? "" : "s"}</>
            ) : null,
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
