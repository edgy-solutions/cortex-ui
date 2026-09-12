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

/**
 * Row fields this card ALREADY renders or reasons about. Anything else the producer sends is a
 * column being dropped, and is shown.
 *
 * A DENYLIST RATHER THAN AN ALLOWLIST, deliberately. An allowlist of renderable extras has to
 * be extended for every verb that adds a field, and until someone does the column is silently
 * missing — which is the defect being repaired. A denylist only grows when this card starts
 * consuming a NEW field itself, which is a change whoever makes it is already inside.
 */
const CONSUMED_FIELDS = new Set([
  "entity_id",
  "entity_name",
  "contribution",
  "share_of_total",
  "favourable",
  "note",
  "rank",
  // Read by the inspection panel rather than the row, so consumed rather than dropped.
  "bcws",
  "bcwp",
  "acwp",
  // The producer's own verdict vocabulary, deliberately NOT read as a judgement — see the
  // unjudged-ranking block. Showing it as a column would reintroduce it as one.
  "direction",
]);

/** A scalar worth showing beside a figure — a real number, or a non-empty string. */
function displayableExtra(v: unknown): string | number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

/**
 * The columns the payload carries and this card was dropping.
 *
 * Rows arrive with fields beyond contribution and share — a labour breakdown sends hours and
 * rate, an earned-value row sends its own inputs — and the card showed only the money.
 * `expected_fields` gates nothing, because every archetype but CHART_WIDGET returns
 * NOT_EVALUATED, so a card with a missing column draws happily and scores as a pass. It is
 * invisible unless somebody looks for it.
 *
 * THE LABEL IS THE PRODUCER'S FIELD NAME AND IS NOT PRETTIFIED. A title-cased local synonym is
 * the translation layer ADR-0045 refused, and the cost lane hit exactly that this week: one
 * verb title-cased its own keys while another read a label table, so two verbs over the same
 * six factors spoke two vocabularies.
 *
 * NOT FORMATTED AS MONEY EITHER. An hours count and an hourly rate are not currency, and the
 * money formatter would print them as dollars — a unit this card was never told they carry.
 */
function ExtraColumns({ row }: { row: ContributionRow }) {
  const extras: [string, string | number][] = [];
  for (const [k, v] of Object.entries(row as unknown as Record<string, unknown>)) {
    if (CONSUMED_FIELDS.has(k)) continue;
    const shown = displayableExtra(v);
    if (shown === null) continue;
    extras.push([k, shown]);
  }
  if (extras.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5" data-extra-columns>
      {extras.map(([k, v]) => (
        <span key={k} className="font-mono text-[10px] text-slate-500 tabular-nums">
          <span className="text-slate-600">{k} </span>
          {String(v)}
        </span>
      ))}
    </span>
  );
}

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

  /**
   * HOW MANY ROWS THE PRODUCER ACTUALLY JUDGED — and the reason this is counted at all.
   *
   * `favourable` absent renders as a grey bar, which was the right call and, on its own, an
   * invisible one: a payload where NO row carries a verdict draws a full ranking of grey bars
   * under a legend advertising two colours that never appear. It looks like a complete card.
   *
   * THAT IS THE SHAPE MOST LIKELY TO BE SCORED AS A PASS. A card that fails to draw gets
   * investigated; a card that draws without a distinction it was supposed to make does not —
   * and the live case is exactly this: one cost verb emits `direction: up|down|flat` where this
   * reads `favourable`, so every row arrives unjudged and the ranking is silently flattened.
   *
   * NOTHING HERE INFERS A VERDICT. Reading `direction` and deciding that "up" means adverse is
   * the producer's semantic call — a cost category rising may or may not be bad — and taking it
   * would be the guess-dressed-as-a-judgement this component refuses everywhere else. What
   * cortex owes is to say that the judgement is MISSING rather than to draw as if it were
   * neutral.
   */
  const judged = ranked.filter((r) => typeof r.favourable === "boolean").length;
  const noneJudged = judged === 0;

  /**
   * IS THIS A SIGNED SET, OR A SET OF SHARES?
   *
   * The plus was added for a variance decomposition, where some contributions push a total up
   * and others pull it down: there a bare number reads as a magnitude and the direction has to
   * be inferred from a colour, which is the channel a projector loses first.
   *
   * IT IS WRONG ON A PURE BREAKDOWN. A cost breakdown's rows are all positive shares of one
   * total, and "+$4.9M" reads as MOVEMENT — a rise of 4.9M — when the figure is 62% of the
   * spend. The payload sends a plain positive number and asserts no direction; the plus
   * asserted one on its behalf, which is the manufactured-confidence failure this card refuses
   * everywhere else.
   *
   * DECIDED FROM THE DATA, not from the domain. If any row is negative the set is signed and
   * the plus distinguishes two directions; if none is, there is no second direction for it to
   * distinguish and it is decoration with a false reading attached.
   */
  const signedSet = ranked.some((r) => r.contribution < 0);

  return (
    <div className="glass-panel p-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-xl font-semibold text-slate-100">Ranking</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {ranked.length} {ranked.length === 1 ? "contributor" : "contributors"}
          {value_label ? ` · ${value_label}` : ""}
          {/* SAID, NOT SHOWN BY OMISSION. Absence of a verdict is a fact about the payload and
              the reader is entitled to it — otherwise a flattened ranking is indistinguishable
              from one where everything genuinely sat level. */}
          {noneJudged && (
            <span className="text-amber-400/80" data-no-verdict>
              {" "}
              · no direction stated
            </span>
          )}
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
                className="w-full text-left px-2 py-2 rounded hover:bg-white/[.04] transition-colors"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] text-slate-600 w-5 flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  {/* THE NAME IS CONTENT, not a label on a number. It reads at the weight of a
                      thing a reader is looking FOR — this list is scanned for a name, then the
                      number beside it is read. */}
                  <span className="text-[15px] font-semibold text-slate-100 truncate min-w-0 flex-1">
                    {r.entity_name}
                  </span>
                  {/* THE SIGN IS SHOWN EXPLICITLY, including the plus. In a list where some
                      contributions push a total up and others pull it down, a bare number reads
                      as a magnitude and the direction has to be inferred from a colour — which
                      is the channel a projector loses first. `formatAmount` already carries a
                      minus; only the plus has to be added. */}
                  <span className={`font-mono text-[15px] font-semibold tabular-nums ${tone.text}`}>
                    {signedSet && r.contribution > 0 ? "+" : ""}
                    {formatAmount(r.contribution, value_unit)}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 w-16 text-right tabular-nums">
                    {/* NULL SHARE IS ABSENT, NOT ZERO. The total was nought; there is no share
                        of nothing, and 0% would read as "contributes nothing". */}
                    {share === null ? "—" : `${showMeasure(share * 100)}%`}
                  </span>
                </div>
                <span className="mt-1.5 block h-1.5 w-full rounded-full bg-slate-100/[.07]">
                  <span
                    className={`block h-full rounded-full ${tone.bar}`}
                    style={{
                      width:
                        share !== null && widest > 0
                          ? `${Math.min(100, (Math.abs(share) / widest) * 100)}%`
                          : "0%",
                    }}
                  />
                </span>
                {/* Every other field the producer sent for this row — see ExtraColumns. */}
                <ExtraColumns row={r} />
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

      {/* WHAT THE MARKS MEAN on the left, WHAT THE COLOURS MEAN on the right. Split because
          they answer different questions and a single run of six items reads as one list of
          six equal things. */}
      <div className="mt-3 flex items-center justify-between gap-4 flex-wrap font-mono text-[9px] uppercase tracking-widest text-slate-500">
        <span>bar = share of total</span>
        {/* THE LEGEND DESCRIBES WHAT IS ON SCREEN, not what this card can draw. Advertising
            favourable and adverse over a ranking of grey bars tells a reader the colours mean
            something here and invites them to read the absence of green as "nothing was
            favourable" rather than as "nothing was judged". */}
        {noneJudged ? (
          <span className="flex items-center gap-1.5" data-legend-unjudged>
            <span className="inline-block w-3 h-2 rounded-sm bg-slate-500/60" /> direction not
            stated by the producer
          </span>
        ) : (
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-sm bg-emerald-500/60" /> favourable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-sm bg-rose-500/60" /> adverse
            </span>
            {/* A MIXED SET IS ALSO A CLAIM. Some rows judged and some not is a different payload
                from all judged, and grey among colours must not read as a third verdict. */}
            {judged < ranked.length && (
              <span className="flex items-center gap-1.5" data-legend-partial>
                <span className="inline-block w-3 h-2 rounded-sm bg-slate-500/60" /> not stated
              </span>
            )}
          </span>
        )}
      </div>

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
