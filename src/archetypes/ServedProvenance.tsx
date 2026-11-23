/**
 * The producer's `data_provenance` sentence, drawn exactly as served.
 *
 * Architect's order, 2026-11-23: "Show the source and as-of on a finance answer when fin serves them."
 *
 * VERBATIM, NEVER PARSED. The card shows the producer's sentence. It does not extract the as-of or
 * the source URN, adds no words of its own ("Source:", "as of"), and does not reformat dates. The
 * as-of shows when, and only when, the producer's sentence contains it. Parsing prose would make
 * cortex the second implementation of the producer's `ticket_clause`, and the two would disagree the
 * day the clause changes. A structured as-of is the producer's to serve (SDK
 * `AnswerProvenance.as_of`, draft iagent-mesh-sdk #18); until then the sentence is the claim.
 *
 * Blank, non-string or absent draws nothing (no empty box).
 */

/** A non-blank string, returned untrimmed as served; anything else is undefined. */
export const readServedProvenance = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

export function ServedProvenance({
  text,
  ...rest
}: { text: string | undefined } & Record<`data-${string}`, string | boolean>) {
  if (text === undefined) return null;
  return (
    <p
      data-served-provenance
      className="rounded border border-sky-400/30 bg-sky-500/10 px-2 py-1 font-mono text-[10px] text-sky-200"
      {...rest}
    >
      {text}
    </p>
  );
}
