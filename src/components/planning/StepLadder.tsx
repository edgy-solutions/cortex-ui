import { Layers } from "lucide-react";
import { groupDigits, validateStepLadder } from "./StepLadder.contract";

/**
 * A refusal that says which one. Local, matching every other planning card in this
 * directory — the shape is deliberately repeated rather than shared, so a card that refuses
 * differently can, without a common component making that look like a defect.
 */
function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-amber-500/20">
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
          {scope ? `${scope} — nothing to draw` : "nothing to draw"}
        </p>
        <p className="font-mono text-[9px] text-slate-500" data-ladder-refusal>
          {reason}
        </p>
      </div>
    </div>
  );
}

/**
 * The price build-up, as a walk.
 *
 * Six rows in STRIKE ORDER, each with the rate applied, the figure it was struck on, what it
 * added, and where the total stood afterwards. The two middle columns are why this is not a
 * ranking card: `basis` is what lets a reader check that overhead was struck on
 * labour-plus-fringe rather than on the previous total, and `running_total` is what makes the
 * six figures one movement.
 *
 * NOTHING IS SORTED AND NOTHING IS COMPUTED. The order is the producer's, because each step's
 * basis descends from the ones before it; and every figure is rendered from the exact decimal
 * string it arrived as, grouped by string surgery rather than by a number formatter. The
 * producer's HTML formats the same six fields in Python, and the two must agree on every digit
 * — a rounding-in-display that altered a verified number would be the manifest lying by
 * presentation.
 */
export function StepLadder({
  component,
  scope_label,
}: {
  component: unknown;
  scope_label?: string;
}) {
  const result = validateStepLadder(component);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }
  const { steps, price, unitPrice, valueUnit, quantity, rateVintage } = result.ladder;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20" data-step-ladder>
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-cyan-400/80" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Price build-up"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {steps.length} steps
          {/* THE RATE SET, because two build-ups of the same lot differ by this alone. */}
          {rateVintage && <span className="text-slate-500"> · rates {rateVintage}</span>}
          {quantity && <span className="text-slate-500"> · {quantity} units</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-y-1">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-widest text-cyan-400/70">
              <th className="px-3 py-1 font-normal">Step</th>
              <th className="px-3 py-1 font-normal text-right">Rate</th>
              {/* NAMED "STRUCK ON", not "basis": the column's value is that a reader can see
                  WHICH subtotal the rate was applied to, and the domain word does not say it. */}
              <th className="px-3 py-1 font-normal text-right">Struck on</th>
              <th className="px-3 py-1 font-normal text-right">Amount</th>
              <th className="px-3 py-1 font-normal text-right">Running total</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={`${s.name}-${i}`} data-ladder-step={s.name} className="align-baseline">
                <td className="px-3 py-1.5 font-mono text-sm text-slate-100 whitespace-nowrap">
                  <span className="text-slate-600 mr-2 tabular-nums">{i + 1}</span>
                  {s.name}
                </td>
                {/* BLANK, NOT ZERO. The seed step is an amount rather than a factor struck on
                    something; a 0 here would read as a rate that was measured and came out
                    empty, which is a different and false claim. */}
                <td
                  className="px-3 py-1.5 font-mono text-[12px] text-slate-400 text-right tabular-nums"
                  data-ladder-rate={s.rate}
                >
                  {s.rate}
                </td>
                <td
                  className="px-3 py-1.5 font-mono text-[12px] text-slate-500 text-right tabular-nums"
                  data-ladder-basis={s.basis}
                >
                  {groupDigits(s.basis)}
                </td>
                <td className="px-3 py-1.5 font-mono text-sm text-slate-100 text-right tabular-nums">
                  {groupDigits(s.amount)}
                </td>
                <td className="px-3 py-1.5 font-mono text-sm text-cyan-200/90 text-right tabular-nums">
                  {groupDigits(s.runningTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* THE TOTAL, AS THE PRODUCER SENT IT — not the last running total re-labelled. The two
          are asserted equal before this draws; showing the declared figure means the number a
          reader checks against the manifest is the manifest's own. */}
      {price && (
        <div className="mt-4 pt-3 border-t border-white/10 flex items-baseline justify-between gap-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Price{valueUnit && <span className="text-slate-600"> · {valueUnit}</span>}
          </span>
          <span className="font-mono text-lg text-white tabular-nums" data-ladder-price>
            {groupDigits(price)}
          </span>
        </div>
      )}
      {unitPrice && (
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
            Per unit
          </span>
          <span
            className="font-mono text-[12px] text-slate-300 tabular-nums"
            data-ladder-unit-price
          >
            {groupDigits(unitPrice)}
          </span>
        </div>
      )}
    </div>
  );
}
