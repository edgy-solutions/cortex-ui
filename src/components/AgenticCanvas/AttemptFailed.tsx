import type { Artifact } from "@/api/types";
import {
  flagStanding,
  readEngineFailure,
  readExclusionSplit,
  readFailureCause,
} from "@/lib/routing";

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
/*
 * NO `compact` VARIANT ANY MORE. It existed to drop the failure reason on the canvas tile, and
 * the tile is the surface a reader actually lands on — so the variant's only effect was to hide
 * the most important fact exactly where it was most needed. Both mounts now render the same
 * card, which is also what stops the two surfaces drifting apart again.
 */
export function AttemptFailed({ artifact }: { artifact: Artifact }) {
  if (artifact.status !== "failed") return null;

  // PARTITIONED, because the two are opposite decisions arriving under one key. A verb the
  // arity gate KEPT and marked is a live candidate the disposition should have ASKED about —
  // rendering it as "excluded" asserts the reverse of what happened.
  const { removed, flagged } = readExclusionSplit(
    artifact.routing?.excluded,
    (artifact.routing as { flags?: unknown } | null | undefined)?.flags,
  );
  // THE DISPATCH'S OWN ACCOUNT, which is a different question from which candidates a gate set
  // aside. Read first and rendered first: exclusions are routing WORKING, and leading with them
  // sends a reader to audit a gate that behaved correctly.
  const cause = readFailureCause(artifact.routing);
  // WHAT CAME BACK, read ahead of what the router considered. The card used to say "no
  // eligibility trace was recorded" on these — true, and the wrong field: the trace is genuinely
  // empty when the gate PASSED and the engine then failed.
  const engine = readEngineFailure(artifact.resolved_intent);

  return (
    <div
      className="rounded border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-left"
      data-attempt-failed
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-rose-400/90">
        this attempt failed
      </p>
      {engine && (
        <div
          className="mt-1"
          data-engine-failure
          data-failure-kind={engine.kind}
          data-failure-status={engine.statusCode ?? undefined}
        >
          {engine.kind === "no_outcome" ? (
            /* NOT AN ENGINE FAILURE, and rendered differently because the repair is elsewhere:
               nothing failed downstream, the pipeline ended without recording an outcome. Drawn
               in amber rather than rose so it does not read as a fault in a service. */
            <p className="font-mono text-[11px] text-amber-300/90">
              the pipeline recorded no outcome for this turn
            </p>
          ) : engine.kind === "no_response" ? (
            /* THE LEAST IN THE RECORD IS THE COMMONEST FAILURE. A timeout or a DNS failure has
               no response at all, so there is no status and no body — said in words rather than
               rendered as empty fields, which would read as a malformed record. */
            <p className="font-mono text-[11px] text-rose-200/90">
              <span className="text-rose-300">the engine did not answer</span>
              <span className="text-slate-400"> — {engine.exception}</span>
              {engine.endpoint && <span className="text-slate-400"> · {engine.endpoint}</span>}
            </p>
          ) : (
            /* The architect's line: status and endpoint are the two a reader acts on. */
            <p className="font-mono text-[11px] text-rose-200/90">
              <span className="text-rose-300">
                {engine.exception} {engine.statusCode}
              </span>
              {engine.endpoint && <span className="text-slate-400"> · {engine.endpoint}</span>}
            </p>
          )}
          {engine.message && (
            <p className="mt-0.5 font-mono text-[10px] leading-snug text-slate-400">
              {engine.message}
            </p>
          )}
          {engine.requestBody !== undefined && (
            /* WHAT WAS ACTUALLY SENT, not a reconstruction — behind a disclosure because it is
               the second look, not the first. Recovering the previous one of these took a replay
               against the live pod with a hand-rebuilt body; if a 422 names a missing field, the
               body that omitted it is now on the same row. */
            <details className="mt-1">
              <summary className="cursor-pointer font-mono text-[10px] text-slate-500">
                request body as sent
              </summary>
              <pre
                className="mt-1 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[10px] text-slate-300"
                data-failure-request-body
              >
                {JSON.stringify(engine.requestBody, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
      {cause && (
        /* SHOWN IN COMPACT TOO. This was previously last, dimmed, and dropped entirely when
           compact — and compact is the canvas tile, which is where a reader actually lands. The
           most important fact on the card was the one hidden on the surface people read. */
        <p
          className="mt-1 font-mono text-[11px] text-rose-200/90"
          data-failure-cause
          data-route-status={cause.status || undefined}
        >
          {cause.status && (
            <>
              {/* VERBATIM. `infra_error` (routing could not run) and `no_match` (it ran and
                  landed nowhere) have opposite repairs, and a paraphrase collapses them. */}
              <span className="text-slate-400">routing reported </span>
              <span className="text-rose-300">{cause.status}</span>
            </>
          )}
          {cause.reason && (
            <>
              <span className="text-slate-400">{cause.status ? " — " : "reason: "}</span>
              <span className="text-rose-300">{cause.reason}</span>
            </>
          )}
        </p>
      )}
      {flagged.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5" data-failure-flags>
          {flagged.map((e) => (
            <li
              key={`${e.verb}-${e.gate}`}
              className="font-mono text-[11px] text-slate-300"
              // THE JOIN GUARD, not a defect count. Both halves derive from one field, so
              // this CANNOT fire today and a panel of "consistent" is not evidence of zero
              // defects — see `flagStanding`. It watches for the two declarations drifting
              // apart, which is the only way contradiction becomes possible.
              data-flag-standing={flagStanding(e, artifact.routing?.about?.instance_resolved)}
            >
              <span className="text-slate-200">{shortVerb(e.verb)}</span>
              {/* NOT "excluded". The gate kept this verb — the turn abstained for the reason it
                  should have asked about, which is the actionable half: the reader can supply
                  the missing thing. Saying "excluded by arity" tells them the opposite. */}
              <span className="text-slate-500"> was kept and flagged: </span>
              <span className="text-amber-400/90">{e.reason || e.gate || "unstated"}</span>
              <span className="text-slate-500"> — asked rather than excluded</span>
              {flagStanding(e, artifact.routing?.about?.instance_resolved) ===
                "contradicted" && (
                /* The record denies itself: an instance DID resolve on this turn, and the only
                   condition under which this gate flags is that none did. Said plainly, because
                   the reader would otherwise go looking for an instance to supply that the turn
                   already had. */
                <span className="text-rose-400/90">
                  {" "}
                  — but an instance resolved on this turn; the flag contradicts the record
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {removed.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5" data-failure-exclusions>
          {removed.map((e) => (
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
      ) : flagged.length === 0 && !cause && !engine ? (
        /*
         * FAILED WITH NO TRACE is a different fact from failed-and-explained, and saying so is
         * what stops a reader hunting for a reason that was never recorded. The producer may
         * not have captured one; this surface must not invent one.
         *
         * Only when NEITHER half has rows: a failure explained entirely by flags is explained.
         */
        <p className="mt-1 font-mono text-[11px] text-slate-400" data-failure-untraced>
          No eligibility trace was recorded for this attempt.
        </p>
      ) : null}
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
