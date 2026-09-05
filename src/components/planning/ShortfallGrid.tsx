/**
 * SHORTFALL_GRID — subjects × periods, secured against needed.
 *
 * A LIVE VIEW (ADR-0042, `recomputes: true`). Content is replaced wholesale on re-evaluation;
 * the freshness stamp is the one THIS evaluation carried, never a mint-time one.
 *
 * IT KNOWS NO DOMAIN. "Funding", "org", "money" appear in no branch — the payload supplies
 * `value_label`, `value_unit` and the subject names. Its first consumer is org funding gaps and
 * nothing here knows that word, which is what lets the same renderer serve the next question of
 * this shape without being edited.
 *
 * ── THREE THINGS THIS RENDERER REFUSES TO DO, because its contract states them ───────────────
 *
 *  1. **It does not infer the verdict.** `state` is stated by the producer and read verbatim.
 *     The contract is explicit that `pledged-not-firm` is INVISIBLE to any comparison of
 *     required against committed — a renderer that coloured by arithmetic would silently
 *     collapse it into "met" and lose the distinction the archetype exists for.
 *  2. **It does not re-derive `shortfall`.** Computed upstream; two places subtracting is two
 *     places to disagree, and the one on screen would be the one nobody could audit.
 *  3. **An absent cell renders as a GAP, never 0.** "Nobody owes anything here" and "somebody
 *     owes zero here" are different claims and only the second is a measurement.
 *
 * ── THE SEMANTIC AXIS ────────────────────────────────────────────────────────────────────────
 *
 * Colour here means DEFICIT → RISK. Not breach → danger (ThresholdGrid, where the bad case is
 * over a line) and not distance → progress (MatrixGrid, where the gap is a journey). A met row
 * is quiet, a pledged-but-unfirm row warns, a short row alarms. The three ramps are three
 * different sentences and this one says "someone still has to be chased".
 *
 * ── WHY `secured` IS RENDERED EVEN WHERE IT LOOKS REDUNDANT ─────────────────────────────────
 *
 * On the current seed `committed == secured` on every row. That is a property of THIS SEED, not
 * of the model — `FundingCommitment.status` is `pending | committed | approved`, and a single
 * pending commitment separates them. Dropping the field because today's data makes it look
 * redundant is the evacuated-population error the contract names, so the detail panel shows
 * `secured` always and the cell surfaces it whenever it differs from `committed`.
 */
import { CellInspector } from "./CellInspector";
import { useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import {
  validateShortfallGrid,
  type ShortfallCell,
  type ShortfallState,
} from "./ShortfallGrid.contract";

export interface ShortfallGridProps {
  rows: unknown;
  /** What the amounts MEAN. The renderer never invents a label. */
  value_label?: string;
  /** The unit the amounts are in. Absent means silent — magnitude only, no invented notation. */
  value_unit?: string;
  scope_label?: string;
  valid_as_of?: string;
  state_version?: number;
}

/**
 * Axes derived locally rather than borrowed from ThresholdGrid's contract: these two archetypes
 * exist BECAUSE they differ, and importing one's helper into the other would be the first thread
 * of the coupling their separation was written to prevent.
 *
 * Period order is the PAYLOAD's order, deduplicated. The renderer does not know the fiscal
 * calendar and must not invent one by sorting.
 */
function gridAxes(cells: ShortfallCell[]): { subjects: string[]; periods: string[] } {
  const periods: string[] = [];
  const subjects: string[] = [];
  for (const c of cells) {
    if (!periods.includes(c.period)) periods.push(c.period);
    if (!subjects.includes(c.subject_id)) subjects.push(c.subject_id);
  }
  return { subjects, periods };
}

/** Read from `state`, never from the numbers — see refusal 1 above. */
/**
 * THE THREE STATES DIFFER IN FORM, NOT ONLY IN HUE.
 *
 * They were three fills — rose, amber, slate — and a colour ramp is the first thing a projector
 * washes out, which left three states reading as one wash of warm cells. The DASHED border on
 * "pledged but not firm" survives that: a dashed outline says provisional in a way no tint does,
 * and it is the distinction a room chasing funders actually needs.
 *
 * Amber is retired here on purpose. It was doing double duty — warning on this grid, and
 * "unresolved" on the answer rail — and a colour that means two things means neither.
 */
function cellStyle(state: ShortfallState): string {
  switch (state) {
    case "short":
      return "bg-rose-500/[.12] text-rose-200 border border-rose-400/50";
    case "pledged-not-firm":
      // FUNDED, BUT NOT FIRM. Dashed rather than tinted: the money is pledged, so it is not a
      // shortfall; it is not secured, so it is not settled either.
      return "bg-transparent text-slate-200 border border-dashed border-teal-400/40";
    case "met":
      return "bg-teal-500/[.10] text-slate-100 border border-teal-400/40";
    default:
      // An unrecognised state is not silently styled as met: a verdict this renderer does not
      // know is a verdict it must not colour, or a future vocabulary lands looking healthy.
      return "bg-slate-700/20 text-slate-400 ring-1 ring-slate-500/30";
  }
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

export function ShortfallGrid({
  rows,
  value_label,
  value_unit,
  scope_label,
  valid_as_of,
  state_version,
}: ShortfallGridProps) {
  const [selected, setSelected] = useState<ShortfallCell | null>(null);
  // The acceptance rule is read from the contract, not reimplemented — this component cannot
  // enforce a rule its contract does not state.
  const result = validateShortfallGrid(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }

  const cells = result.rows;
  const { subjects, periods } = gridAxes(cells);
  const at = (s: string, p: string) =>
    cells.find((c) => c.subject_id === s && c.period === p) ?? null;
  const names = new Map(cells.map((c) => [c.subject_id, c.subject_name || c.subject_id]));
  const amount = (v: number) => formatAmount(v, value_unit);
  // Counted from the stated verdicts, not from arithmetic over the amounts.
  const short = cells.filter((c) => c.state === "short");
  const unfirm = cells.filter((c) => c.state === "pledged-not-firm");

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              short.length ? "bg-rose-500" : unfirm.length ? "bg-amber-400" : "bg-cyan-500"
            }`}
          />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Shortfall grid"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {subjects.length} × {periods.length}
          {value_label && <span className="text-slate-400"> · {value_label}</span>}
          {short.length > 0 && <span className="text-rose-400"> · {short.length} short</span>}
          {/* Surfaced separately BECAUSE it is the distinction this archetype exists for:
              "pledged enough on paper" is a different sentence from "short", and a room
              deciding who to chase needs the difference. */}
          {unfirm.length > 0 && (
            <span className="text-amber-400"> · {unfirm.length} not firm</span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70" />
              {periods.map((p) => (
                <th
                  key={p}
                  className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70 text-center"
                >
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s}>
                {/* THE LABEL COLUMN SIZES TO ITS CONTENT, CAPPED — it used to claim half the
                    card and push the later periods off the right edge behind a scrollbar.
                    Two separate causes, and fixing either alone leaves the other:

                      * `whitespace-nowrap` made a long label ("Research, Development, Test and
                        Evaluation") demand its full single-line width, so the periods got
                        whatever was left and the table overflowed;
                      * in a `w-full` auto-layout table this column also ABSORBS SPARE WIDTH,
                        which is the dead band between the labels and the first period at full
                        card width — nothing was overflowing there, the column was just greedy.

                    `w-[1%]` shrinks the column to its content, and the cap lives on an inner
                    block because `max-width` on a `td` is ignored under auto table layout —
                    it has to be on something that is not a table cell to be honoured at all. */}
                <td className="px-3 py-2 font-mono text-sm text-slate-100 align-middle w-[1%]">
                  <span className="block max-w-[13rem]">{names.get(s)}</span>
                </td>
                {periods.map((p) => {
                  const cell = at(s, p);
                  if (!cell) {
                    // THE GAP. Absent is not zero — see the contract's absentIsNotZero.
                    return (
                      <td key={p} className="px-3 py-3 text-center">
                        <span className="font-mono text-[11px] text-slate-700">·</span>
                      </td>
                    );
                  }
                  const unfirmCell = cell.secured !== cell.committed;
                  return (
                    <td key={p} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelected(cell)}
                        className={`w-full px-3 py-3 rounded font-mono text-sm text-center transition-colors ${cellStyle(
                          cell.state,
                        )}`}
                        /* The computed context, not the label: what this cell claims, with its
                           numbers, in one sentence — every figure read from the payload. */
                        title={`${amount(cell.committed)} committed of ${amount(cell.required)} required${
                          unfirmCell ? `, ${amount(cell.secured)} firm` : ""
                        }${cell.shortfall > 0 ? ` — short ${amount(cell.shortfall)}` : ""}`}
                      >
                        {/* ALLOCATED AGAINST REQUIRED, on one line. Stacked, the second number
                            read as a separate fact; inline, the pair reads as the ratio it is. */}
                        <span className="whitespace-nowrap">
                          <span className="font-semibold">{amount(cell.committed)}</span>
                          <span className="text-[10px] opacity-60"> / {amount(cell.required)}</span>
                        </span>
                        {/* THE FIRM SUBSET, on every cell rather than only where it differs.
                            It was shown only when secured ≠ committed, which reads as "this one
                            is special" — but "all of it is firm" is a fact a reader chasing
                            funders needs on the cells that are FINE just as much as on the ones
                            that are not, and its absence is what made them look identical. */}
                        <span className="block text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                          firm {amount(cell.secured)}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WHAT THE CELL SAYS on the left, WHAT ITS FORM MEANS on the right.
          The three states are named with the payload's own vocabulary rather than a reading of
          it: "pledged but not firm" is a state this grid is TOLD, not one it works out from
          comparing committed against secured — that comparison is invisible to a reader and
          the distinction is the whole reason the third state exists. */}
      <div className="mt-3 flex items-center justify-between gap-4 flex-wrap font-mono text-[9px] uppercase tracking-widest text-slate-500">
        <span>allocated / required · firm below</span>
        <span className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border border-teal-400/50 bg-teal-500/[.10]" />
            funded · firm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border border-dashed border-teal-400/50" />
            funded · not firm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border border-rose-400/60 bg-rose-500/[.12]" />
            short
          </span>
        </span>
      </div>

      {/* WHY a cell is what it is. All three quantities, always — `secured` shows here even when
          it equals `committed`, because its absence from the panel is what would teach a reader
          that the distinction does not exist. */}
      {selected && (
        <CellInspector
          onDismiss={() => setSelected(null)}
          title={<>{names.get(selected.subject_id)} · {selected.period}</>}
          headline={
            <>
              {amount(selected.committed)} committed of {amount(selected.required)} required
            </>
          }
          lines={[
            <>
              {amount(selected.secured)} firm
              {selected.secured !== selected.committed && (
                <span className="text-amber-400">
                  {" "}· {amount(selected.committed - selected.secured)} pledged but not firm
                </span>
              )}
            </>,
            selected.shortfall > 0 ? (
              <span className="text-rose-400">short {amount(selected.shortfall)}</span>
            ) : null,
          ]}
        />
      )}

      {(valid_as_of || state_version !== undefined) && (
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-3">
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
