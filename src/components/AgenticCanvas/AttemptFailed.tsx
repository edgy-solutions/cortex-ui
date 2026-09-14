import type { Artifact } from "@/api/types";
import { readExclusions } from "@/lib/routing";

/**
 * A FAILED ARTIFACT, SAID SO — and named, where the person who hit it is already looking.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────
 *
 * A finance brief came back with `status: failed`, `rendered_output` 0 bytes, and an
 * `excluded[]` naming the gate that removed the verb. The canvas tile rendered the summary line
 * and nothing else — **identical to a successful answer that produced no components, and
 * identical to one still in flight.** `status` was in the row the whole time; this surface did
 * not read it.
 *
 * It cost two hours and three reads of the artifact store to establish what the row already
 * said. That is the point of this component: not error handling for its own sake, but putting
 * the diagnosis where the reader is, instead of somewhere they must know to go.
 *
 * ── THE SAME CLASS AS A COUNTER THAT INCREMENTS ON A DEAD PORT ────────────────────────────
 *
 * `registered 3/3` against a port nothing was listening on is a failure recorded honestly in a
 * LOG nobody reads. This was a failure recorded honestly in a COLUMN nobody reads. Same shape,
 * opposite end of the pipe, and both produce a green-looking surface over a thing that did not
 * happen.
 *
 * ── THE GATE'S WORDS, NEVER THIS SURFACE'S ────────────────────────────────────────────────
 *
 * `ExcludedCandidate`'s contract is explicit and predates this: *the three fields are the
 * producer's, read verbatim and never interpreted — this surface has no vocabulary of gates and
 * must not acquire one, or the next gate anyone adds renders as an unknown token instead of
 * inheriting the trace.* So "arity" is printed as "arity". Nothing here knows what a gate is.
 *
 * ── AND IT RENDERS ON BOTH SURFACES ───────────────────────────────────────────────────────
 *
 * The full pane already said "This attempt failed." and named no reason; the canvas tile said
 * nothing at all. One component, two mount points — a failure visible on one surface and blank
 * on the other is the shape that makes a defect look intermittent.
 */
export function AttemptFailed({ artifact, compact }: { artifact: Artifact; compact?: boolean }) {
  if (artifact.status !== "failed") return null;

  const excluded = readExclusions(artifact.routing?.excluded);

  return (
    <div
      className="rounded border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-left"
      data-attempt-failed
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-rose-400/90">
        this attempt failed
      </p>
      {excluded.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5" data-failure-exclusions>
          {excluded.map((e) => (
            <li key={`${e.verb}-${e.gate}`} className="font-mono text-[11px] text-slate-300">
              {/* The verb, then the gate that removed it. Verbatim — see the header. */}
              <span className="text-slate-200">{shortVerb(e.verb)}</span>
              <span className="text-slate-500"> not eligible: </span>
              <span className="text-amber-400/90">{e.gate || "unstated gate"}</span>
              {/* The gate's own words, when it gave any. Absent is left absent rather than
                  filled with a paraphrase of the gate name. */}
              {e.reason && <span className="text-slate-500"> — {e.reason}</span>}
            </li>
          ))}
        </ul>
      ) : (
        /*
         * FAILED WITH NO TRACE is a different fact from failed-and-explained, and saying so is
         * what stops a reader hunting for a reason that was never recorded. The producer may
         * not have captured one; this surface must not invent one.
         */
        <p className="mt-1 font-mono text-[11px] text-slate-400" data-failure-untraced>
          No eligibility trace was recorded for this attempt.
        </p>
      )}
      {!compact && artifact.routing?.fallback_reason && (
        <p className="mt-1 font-mono text-[10px] text-slate-500">
          {artifact.routing.fallback_reason}
        </p>
      )}
    </div>
  );
}

/**
 * The verb's local name, for a card-width line.
 *
 * FOLDED THE WAY THE REGISTRY FOLDS IT — on `#` then `:` — so `mesh:finProgramBrief` and the
 * full IRI render the same token. Not a rename: the full value is still what the producer sent
 * and is on the element's title for anyone who needs it.
 */
function shortVerb(verb: string): string {
  return verb.split("#").pop()!.split(":").pop() || verb;
}
