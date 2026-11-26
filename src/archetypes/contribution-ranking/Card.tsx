import { Fragment, useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { ServedProvenance, readServedProvenance } from "../ServedProvenance";
import { showMeasure } from "@/lib/showMeasure";
import { CellInspector } from "@/components/planning/CellInspector";
import {
  validateContributionRanking,
  type ContributionRow,
} from "./contract";

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
  // The producer's declared tail, drawn as the last line of the list by `readWithheldTail`.
  // `withheld_contribution_exact` is deliberately NOT here: like `contribution_exact` it stays
  // an extra.
  "withheld_contributors",
  "withheld_contribution",
]);

export type WithheldTail =
  | { kind: "none" }
  | { kind: "tail"; count: number; contribution: number }
  | { kind: "disagree" };

/**
 * Reads the tail the producer declares when it truncates a ranking.
 *
 * Producer: `agent_fleet/finance_agent/measure_modules/variance_driver_ranking.py` at 9b6f4c9f,
 * lines 59-82. `rank_drivers` cuts to `top_n` and, WHEN IT TRUNCATES, puts on EVERY returned row
 * `withheld_contributors` (how many were cut) and `withheld_contribution` (their summed
 * contribution). Its docstring: "`top_n` hiding contributors without saying so is a partial list
 * that looks complete."
 *
 * The proper fix is an envelope-level `remainder` declaration, proposed to fin 11-23 (packet
 * `2026-11-23-packet-to-lane-fin-...-waterfall-paging-download-...`); this reads the per-row
 * fields until then.
 *
 *   none      no row carries either field
 *   tail      every row carries both, identical, a positive integer count and a finite amount
 *   disagree  anything else. The producer stamps identical values on every row by construction,
 *             so a mismatch means the producer changed: say so rather than guess.
 */
export function readWithheldTail(rows: readonly ContributionRow[]): WithheldTail {
  const has = (v: unknown) => v !== undefined && v !== null;
  const pairs = rows.map((r) => {
    const x = r as unknown as Record<string, unknown>;
    return { n: x.withheld_contributors, c: x.withheld_contribution };
  });
  if (pairs.every((p) => !has(p.n) && !has(p.c))) return { kind: "none" };
  if (!pairs.every((p) => has(p.n) && has(p.c))) return { kind: "disagree" };
  const { n, c } = pairs[0];
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return { kind: "disagree" };
  if (typeof c !== "number" || !Number.isFinite(c)) return { kind: "disagree" };
  if (!pairs.every((p) => p.n === n && p.c === c)) return { kind: "disagree" };
  return { kind: "tail", count: n, contribution: c };
}

/**
 * ── THE BRANCH CENSUS, ADR-0055 §2 ────────────────────────────────────────────────────────
 *
 * This card was the worked case for the packaging gate: SIXTEEN branch points against FOUR
 * machine-readable attributes, which is the ratio that found it. A decision no attribute names is
 * a decision a replacement can silently drop, so before this card can be a package every branch
 * is classified — and the presentational ones are WRITTEN DOWN, because an exclusion nobody
 * recorded is indistinguishable from a branch nobody looked at.
 *
 * ⛔ THE FIRST PASS DECLARED ONLY `signedSet` — the branch I had looked at hardest — and that was
 * corrected to the population before it landed. The error names an instance; the fix is owed to
 * the population.
 *
 * CARRIES A CLAIM, AND IS NOW DECLARED:
 *
 *   data-no-verdict       the producer stated no favourable/adverse judgement
 *   data-legend-partial   some rows were judged and some were not
 *   data-sign-withheld    the DATA has one direction only, so a plus would assert a movement
 *   data-share-absent     the total was nought — a null share is absent, and 0% would read as
 *                         "contributes nothing"
 *   data-extras-dropped   a value ARRIVED that has no one-cell rendering here — declared on the
 *                         row's count marker, listed by name in the detail view
 *   data-extra-columns    fields the payload carried beyond the ones this card consumes — declared
 *                         on the row's count marker, listed in the detail view
 *   data-card-extras      CARD-LEVEL fields the payload carried beyond the ones it consumes
 *   data-withheld-tail    the producer truncated the ranking and declared the tail
 *   data-withheld-disagree the declared tail is inconsistent across rows
 *
 * EXCLUDED AS PRESENTATIONAL, each with its reason:
 *
 *   CONSUMED_FIELDS skip      those fields ARE rendered, in the row and the inspector. Nothing is
 *                             lost, so there is no absence to declare.
 *   no extras at all          a row carrying only the consumed fields is complete. "No extras" is
 *                             not an absence of anything claimed.
 *   singular/plural           "contributor" vs "contributors". Grammar.
 *   scope wording             which sentence the empty state uses; the refusal itself is already
 *                             said by `DeliberateEmpty` with the validator's reason.
 *   `value_label` absent      a caption. The UNIT travels separately in `value_unit` and is
 *                             always applied, so an absent label costs a name and not a meaning.
 *   `note` absent             the producer had nothing to add. Not a withheld thing.
 *   bound absent              no `threshold` arrived. A RANKING WITH NO BOUND IS COMPLETE — it
 *                             ranks contributions, and nothing about it waits on a bound. Same
 *                             reading as `note`: the producer sent nothing, so there is no
 *                             withheld thing to declare. ⚠ NOT the same fact as a bound that
 *                             ARRIVED and was not drawn, which is the W4-2 defect itself.
 *   inspector open/closed     reader state, not payload state.
 *   bar width                 derived from the largest share present, for legibility. It asserts
 *                             nothing the figures do not already say.
 *   freshness stamp absent    `valid_as_of`/`state_version` absent means the payload carried no
 *                             freshness facts. The card asserts nothing about freshness either
 *                             way, so there is no claim to withhold. ⚠ IF THIS CARD EVER BECOMES
 *                             A LIVE VIEW, that stops being true and this line is the one to
 *                             revisit — a live view with no stamp IS a claim.
 */
/**
 * A scalar worth showing beside a figure — a real number, a non-empty string, or a BOOLEAN.
 *
 * ⛔ A BOOLEAN IS A ONE-CELL VALUE, and refusing it made this card print the SAME SENTENCE
 * for `true` and for `false`. Measured on the walk: the supplier-concentration payload carries
 * `above_threshold` on every row, and every row rendered "above_threshold — not drawable here"
 * — identical for the suppliers over the bound and the ones under it. A flag that arrived and
 * says the opposite thing on two rows was collapsed into one indistinguishable string, which is
 * worse than dropping it silently: it LOOKS like a reported field.
 *
 * SHOWN VERBATIM, UNDER THE PRODUCER'S OWN FIELD NAME — `true` / `false`, never a local
 * synonym, a tick or a colour. THIS CARD KNOWS NO DOMAIN: nothing here is keyed on the word
 * "threshold", and neither value is toned, because whether `true` is the good outcome is the
 * producer's semantic call — the same guess-dressed-as-a-judgement this card refuses for
 * `favourable`.
 *
 * Objects, arrays and non-finite numbers STAY undrawable. Having no one-cell form is a different
 * fact from having one nobody had written down yet.
 */
function displayableExtra(v: unknown): string | number | boolean | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // `false` IS A VALUE, not an absence — and the `shown === null` test below is strict for
  // exactly this reason. A truthiness check there would drop every false flag and leave the rows
  // UNDER the bound looking like rows the producer said nothing about.
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

/**
 * The extra fields the payload carries and this card was dropping: `extrasOf` finds them,
 * `ExtraCount` counts them on the row, `InspectorExtras` names them in the detail view.
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
 *
 * THE ROW COUNTS, THE DETAIL VIEW NAMES (architect 11-23 via Chris: "The ranking card prints raw
 * field names under each row (acwp_exact, share_of_total_exact). Show the labelled values a person
 * needs and move the rest behind the detailed view."). The field names are the producer's and are
 * still not prettified — ADR-0045 — so they belong in the view a reader opens on purpose, not
 * under every row. The count stays on the row because a field that arrived must not look absent;
 * the attributes stay on the row because the parity seal reads them unclicked.
 */
function extrasOf(row: ContributionRow): {
  extras: [string, string | number | boolean][];
  dropped: string[];
} {
  const extras: [string, string | number | boolean][] = [];
  // A FIELD THIS CARD CANNOT DRAW IS STILL A FIELD THAT ARRIVED. `displayableExtra` refuses an
  // object, an array and a NaN — correctly, since none has a one-cell rendering — but dropping
  // them silently is the defect this whole column exists to repair, one level down: the reader
  // sees a complete row and a key is missing from it.
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(row as unknown as Record<string, unknown>)) {
    if (CONSUMED_FIELDS.has(k)) continue;
    const shown = displayableExtra(v);
    if (shown === null) {
      // ⛔ "THE PRODUCER SENT NOTHING" AND "A VALUE EXISTS THAT THIS CARD CANNOT DRAW" ARE
      // DIFFERENT FACTS, and only the second is this card dropping anything.
      //
      // `null`, `undefined` and a blank string are the producer declining to fill the key —
      // there is nothing to lose and naming it would print a hole, which is what the column
      // beside this one refuses. An OBJECT, an ARRAY or a non-finite number is a value that
      // ARRIVED and has no one-cell rendering; dropping THAT silently shows a complete-looking
      // row with a key missing from it.
      //
      // Collapsing the two was my first attempt and an existing seal caught it — it asserted
      // that a null field prints no hole, and it was right.
      const absent =
        v === null || v === undefined || (typeof v === "string" && v.trim().length === 0);
      if (!absent) dropped.push(k);
      continue;
    }
    extras.push([k, shown]);
  }
  return { extras, dropped };
}

/** The row's nameless count of what the detail view holds. */
function ExtraCount({ row }: { row: ContributionRow }) {
  const { extras, dropped } = extrasOf(row);
  const n = extras.length + dropped.length;
  if (n === 0) return null;
  return (
    <span
      className="mt-1 block font-mono text-[9px] text-slate-500"
      data-extra-columns
      data-extra-count={n}
    >
      {n} more {n === 1 ? "field" : "fields"} in detail
      {dropped.length > 0 && (
        <span className="text-amber-500/70" data-extras-dropped={dropped.join(",")}>
          {" "}
          · {dropped.length} not drawable
        </span>
      )}
    </span>
  );
}

/** The detail view's list: every extra field verbatim, and the undrawable ones by name. */
function InspectorExtras({ row }: { row: ContributionRow }) {
  const { extras, dropped } = extrasOf(row);
  if (extras.length === 0 && dropped.length === 0) return null;
  return (
    <>
      {extras.length > 0 && (
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums"
          data-inspector-extras
        >
          {extras.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-slate-600">{k}</dt>
              <dd className="text-slate-400">{String(v)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {/*
        NAMES, NEVER VALUES — the same rule the HUD's unread-fields panel keeps, and for the same
        two reasons: a value this card has no treatment for has no units and no formatter, and an
        undeclared field may carry what the classification does not permit on this surface. The
        reader is entitled to know a key arrived; what is in it is a different question.
      */}
      {dropped.length > 0 && (
        <p
          className="font-mono text-[10px] text-amber-500/70"
          data-inspector-dropped={dropped.join(",")}
        >
          {dropped.join(", ")} — not drawable here
        </p>
      )}
    </>
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

function DeliberateEmpty({ reason, scope, provenance }: { reason: string; scope?: string; provenance?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-amber-500/20">
      {/* A refused finance answer still says where its data came from (flow card precedent). */}
      <ServedProvenance text={provenance} />
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
  threshold,
  threshold_defaulted,
  data_provenance,
  valid_as_of,
  state_version,
}: {
  rows: unknown;
  value_label?: string;
  value_unit?: string;
  scope_label?: string;
  /**
   * THE BOUND THE PRODUCER STATED, and whether the caller chose it. Carried as the producer
   * typed them — `threshold` arrives as a STRING ("0.25"), because the verb emits
   * `str(Decimal)`, and it is not reparsed, rescaled or turned into a percentage here.
   *
   * ⛔ THE CARD STILL KNOWS NO DOMAIN. It does not compare any row against this number, does not
   * tone a row by it, and does NOT read `suppliers_above_threshold` — a count this card derived
   * itself would be a second implementation of the producer's own verdict, and the two would
   * disagree the first time that comparison changed from `>` to `>=`. The bound is DISPLAYED,
   * never APPLIED.
   */
  threshold?: string | number;
  threshold_defaulted?: boolean;
  data_provenance?: unknown;
  valid_as_of?: string;
  state_version?: number;
}) {
  const [selected, setSelected] = useState<ContributionRow | null>(null);
  const result = validateContributionRanking(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} provenance={readServedProvenance(data_provenance)} />;
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
  const tail = readWithheldTail(ranked);

  /**
   * THE BOUND, GIVEN THE SAME TREATMENT AS A ROW'S EXTRAS — and through the SAME function, not
   * a second copy of its rules.
   *
   * W4-2: the producer stated `threshold` "0.25" and `threshold_defaulted` true and the bound
   * was NOWHERE ON SCREEN, so the card showed a concentration ranking while silently withholding
   * the number the whole verdict is struck against. Its own engine calls that the
   * EAC-without-method ambiguity in another costume: the figures are unactionable without the
   * assumption that produced them.
   *
   * ⛔ `displayableExtra` IS REUSED DELIBERATELY. Card-level scalars and row-level ones are the
   * same question one level up, and writing the admission rule twice is how the two drift —
   * `threshold_defaulted: false` renders here for exactly the reason a false row flag does, and
   * it would take a second bug fixed twice to keep that true if this had its own copy.
   *
   * NAMES ARE THE PRODUCER'S AND VALUES ARE VERBATIM: "0.25" is not reparsed into 25%, and
   * `threshold_defaulted` is not reworded into prose about who chose it. A ranking with no
   * bound says nothing at all — see the census.
   */
  const cardExtras: [string, string | number | boolean][] = [];
  for (const [k, v] of [
    ["threshold", threshold],
    ["threshold_defaulted", threshold_defaulted],
  ] as const) {
    const shown = displayableExtra(v);
    if (shown !== null) cardExtras.push([k, shown]);
  }

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
          {/*
            THE SIGN WAS WITHHELD, AND SAYING SO IS WHAT MAKES IT CHECKABLE.

            The decision above — whether these figures carry a `+` — was real and invisible. It
            lived as one character of rendered text with nothing naming it, so A REPLACEMENT CARD
            COULD SILENTLY DROP THE GATING AND PASS EVERY SEAL: each declared absence would still
            be declared while the card printed a direction the data cannot carry. Measured on this
            card as sixteen branches against four attributes, which is the worked case for
            ADR-0055 §2 and the reason a decision no attribute names may not be packaged.

            ⛔ NOT THE SAME FACT AS `no-verdict`, though both touch the word "direction", and
            collapsing them would be this card's own defect turned on itself:

              data-no-verdict      THE PRODUCER stated no favourable/adverse judgement
              data-sign-withheld   THE DATA has no second direction — every row is positive, so a
                                   plus would assert a movement where there are only shares

            Both can be true at once and they have different repairs: the first is answered by the
            producer emitting a verdict, the second never is, because a pure breakdown is not
            missing anything.
          */}
          {!signedSet && (
            <span className="text-slate-500" data-sign-withheld>
              {" "}
              · unsigned — no sign shown
            </span>
          )}
        </span>
        {/* THE BOUND RIDES IN THE HEADER because it qualifies the WHOLE ranking, not any one
            row — the same reason a row's caveat rides on its row. Rendered in the extras
            vocabulary so a reader meets card-level and row-level producer fields in one
            visual language. */}
        {cardExtras.length > 0 && (
          <span className="flex flex-wrap gap-x-3 gap-y-0.5" data-card-extras>
            {cardExtras.map(([k, v]) => (
              <span key={k} className="font-mono text-[10px] text-slate-500 tabular-nums">
                <span className="text-slate-600">{k} </span>
                {String(v)}
              </span>
            ))}
          </span>
        )}
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
                        of nothing, and 0% would read as "contributes nothing".
                        DECLARED, not just drawn: the em-dash was the whole of this claim and a
                        replacement rendering 0% would have passed every seal. */}
                    {share === null ? (
                      <span data-share-absent>—</span>
                    ) : (
                      `${showMeasure(share * 100)}%`
                    )}
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
                {/* How many other fields the producer sent for this row — see extrasOf. */}
                <ExtraCount row={r} />
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
        {tail.kind === "tail" && (
          <li
            data-withheld-tail
            data-withheld-count={tail.count}
            className="px-2 py-2 font-mono text-[11px] text-slate-500 tabular-nums"
          >
            {tail.count} more, totalling {formatAmount(tail.contribution, value_unit)}, not shown
          </li>
        )}
        {tail.kind === "disagree" && (
          <li data-withheld-disagree className="px-2 py-2 font-mono text-[10px] text-amber-500/70">
            the rows disagree on what was withheld — tail not shown
          </li>
        )}
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
        >
          <InspectorExtras row={selected} />
        </CellInspector>
      )}

      {readServedProvenance(data_provenance) !== undefined && (
        <div className="mt-3">
          <ServedProvenance text={readServedProvenance(data_provenance)} />
        </div>
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
