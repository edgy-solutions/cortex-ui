import {
  isHole,
  isKnownDisposition,
  validateSourceLedger,
  type LedgerRow,
} from "./SourceLedger.contract";

/**
 * SourceLedger — every source accounted for, each row a finding or a named absence.
 *
 * See the contract for the vocabulary and for why `unsummarised` is a finding rather than a
 * hole. This file's job is that each of the five reads as ITSELF, and that the sixth — a term
 * this card does not know — reads as unclassified rather than as either.
 *
 * ⛔ NOTHING HERE KEYS ON WHICH DISPOSITIONS ARE PRESENT. A `fail`-refusal producer can never
 * emit a hole, so a hole-free ledger is ordinary for it. A "no absences" banner, a completeness
 * badge, or a count of holes rendered as reassurance would all be wrong on every cost review —
 * and wrong in the flattering direction, which is the one nobody reports.
 */
export function SourceLedger({ component }: { component: unknown }) {
  const result = validateSourceLedger(component);
  if (result.kind === "empty") {
    // A ledger accounting for nothing cannot support the claim this archetype makes. Said
    // plainly rather than drawn as a heading over a blank space, which reads as "nothing was
    // wrong".
    return (
      <p
        className="font-mono text-[11px] text-amber-400/80 px-1 py-2"
        data-ledger-refused={result.reason}
      >
        {result.reason}
      </p>
    );
  }
  const { rows, summary } = result.ledger;

  return (
    <div className="glass-panel p-4" data-source-ledger>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-xl font-semibold text-slate-100">Ledger</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {rows.length} {rows.length === 1 ? "source" : "sources"}
        </span>
      </div>

      {/* THE PRODUCER'S PROSE. Kept because this archetype replaced a document for its first
          consumer, and a card that dropped the summary would be a regression bought with a new
          archetype — the silently-narrowed answer arriving through the renderer. */}
      {summary && (
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300" data-ledger-summary>
          {summary}
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <LedgerEntry key={`${r.source}-${r.disposition}`} row={r} />
        ))}
      </ul>
    </div>
  );
}

/** One accounted source. */
function LedgerEntry({ row }: { row: LedgerRow }) {
  const known = isKnownDisposition(row.disposition);
  const hole = known && isHole(row.disposition);

  return (
    <li
      className="flex flex-col gap-0.5 border-l-2 border-slate-700/50 pl-3"
      data-ledger-row={row.source}
      data-ledger-disposition={row.disposition || undefined}
      /* Named, never dropped and never guessed — see the contract. A row this card cannot
         classify still counts as a source accounted for. */
      data-ledger-unknown={known ? undefined : ""}
      data-ledger-hole={hole ? "" : undefined}
    >
      <span className="font-mono text-[11px] text-slate-200">{row.label}</span>

      {!known ? (
        /* NOT a finding and NOT a hole. Guessing either asserts a decision from not recognising
           a word, which is the failure `NamedHole` and the `disposal` split both refuse. */
        <span className="font-mono text-[10px] text-amber-400/90">
          this source reported {row.disposition ? `"${row.disposition}"` : "no disposition"},
          which this view does not know how to read
        </span>
      ) : row.disposition === "finding" ? (
        <span className="font-mono text-[11px] text-slate-300" data-ledger-verdict>
          {row.verdict}
        </span>
      ) : row.disposition === "unsummarised" ? (
        /* R-073. A FINDING row: the caller IS entitled and the verb DID run, so drawing a hole
           would tell a reader they lack access they have. The evidence is the actionable half. */
        <span className="font-mono text-[10px] text-slate-400" data-ledger-unsummarised>
          no verdict emitted by {row.source}
        </span>
      ) : row.disposition === "empty" ? (
        /* The verb answered and legitimately had nothing. Distinct from `unsummarised`, where
           there IS content — and the link below is how a reader CHECKS this one. */
        <span className="font-mono text-[10px] text-slate-400" data-ledger-empty>
          answered with nothing to report
        </span>
      ) : (
        /* The two hole terms. The producer's own words for why; never synthesised when absent. */
        <span className="font-mono text-[10px] text-amber-400/80" data-ledger-hole-reason>
          {row.disposition === "unentitled"
            ? "not available to you"
            : "this source could not be reached"}
          {row.reason ? ` — ${row.reason}` : ""}
        </span>
      )}

      {/* THE EVIDENCE, and its absence is a fact rather than a blank. A refused verb HAS no
          artifact; a row that produced one links it, INCLUDING an `empty` row — the link is how
          a reader checks "answered with nothing" rather than taking this card's word. */}
      {row.artifact ? (
        <span className="font-mono text-[9px] text-slate-500" data-ledger-artifact={row.artifact}>
          evidence: {row.artifact}
        </span>
      ) : (
        <span className="font-mono text-[9px] text-slate-600" data-ledger-no-artifact>
          no evidence recorded for this source
        </span>
      )}
    </li>
  );
}
