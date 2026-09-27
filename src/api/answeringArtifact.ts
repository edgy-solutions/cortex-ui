/**
 * The wire name for "this turn answers that ask" — one constant, for the third time and the
 * same reason: posting the wrong name is not rejected, it is ignored.
 *
 * `gateway.py` declares `answering_artifact_id: str | None` and reads
 * `request.answering_artifact_id`. A body posting anything else parses as None, the lineage
 * claim is silently absent, and the fold never happens — no error, just two cards forever.
 *
 * ── THE CLAIM IS THE CLIENT'S AND THE DECISION IS THE SERVER'S, AND THE NAMES SAY SO ──────
 *
 * We post `answering_artifact_id`; the artifact comes back carrying `derived_from_artifact_id`.
 * Two names for what could have been one field, because the server does NOT take the claim at
 * face value: it honours it only when the turn actually carries an answer — a pick or words —
 * and refuses it otherwise. One name would make that check look like a rename.
 *
 * WHY THE GUARD EXISTS AT ALL, which is worth knowing on this side too: the write is a
 * `MERGE (parent:AnswerArtifact {id: $parent_id})`, and MERGE CREATES what it cannot find. An
 * unguarded claim would not record a wrong parent — it would CONJURE an artifact into the
 * provenance graph by naming it, and the rail would fold two cards onto a lineage nobody
 * produced.
 */
export const ANSWERING_ARTIFACT_FIELD = "answering_artifact_id" as const;

/**
 * The claim's slice of the request body — `{}` when this turn answers no ask.
 *
 * A FUNCTION RATHER THAN A SPREAD AT THE CALL SITE — and the reason first recorded here was
 * FALSE. It said the absent-versus-empty distinction "is not testable in a conditional inside
 * an object literal". `useInterviewAgent.test.ts` had captured the outgoing request since
 * before this file existed and asserts on it directly; the seal was one import away. What got
 * written instead was a source-text guard, chosen because the stronger form had been recorded
 * as nonexistent.
 *
 * The extraction is still right — one place for a decision three fields share — but a recorded
 * conclusion about a test deserves the same suspicion as the test. This one stopped anyone
 * looking for a year's worth of the wrong reason in a day. The body is asserted on the body
 * now, in `describe("what an answered ask actually posts")`.
 *
 * An empty string is not a missing id — it is a claim to have answered an artifact with no
 * name, which the server would refuse and which no caller means.
 */
export function answeringArtifactBody(
  artifactId?: string | null,
): Record<string, never> | { answering_artifact_id: string } {
  const id = (artifactId ?? "").trim();
  if (!id) return {};
  return { [ANSWERING_ARTIFACT_FIELD]: id } as { answering_artifact_id: string };
}

/**
 * ── WHETHER THE SERVER WILL HONOUR THE CLAIM, DECIDED BESIDE THE CLAIM ────────────────────
 *
 * The header above says the server "honours it only when the turn actually carries an answer".
 * That sentence was true, sat one function away from the code that posts the claim, and NOTHING
 * CHECKED IT. `boundSlots.test.ts` asserts that a guard named `_answers_something` exists in
 * `gateway.py` and never reads what its condition is, so cortex could not learn the one fact
 * that matters: a turn typed into the composer satisfies neither clause.
 *
 * MEASURED 2026-09-27 against `gateway.py`:
 *
 *     _answers_something = bool(request.bound_slots) or bool(request.spoken_answer)
 *     _answering_artifact_id = (request.answering_artifact_id or None) if _answers_something else None
 *
 * and all THREE consumers read the post-guard variable — the pre-resolved route (which is what
 * skips /plan, /resolve and /classify_predicate), the accumulated chain slots, and
 * `derived_from_artifact_id` on the written artifact. So a refused claim does not cost a wrong
 * arrow; it costs the route skip, the inherited slots AND the lineage edge, all three, silently.
 *
 * ⛔ THIS RETURNS THREE STATES AND NOT A BOOLEAN. "Nothing was claimed" and "a claim was thrown
 * away" are the two outcomes this repo keeps confusing, and a boolean spells them the same. The
 * gateway itself has exactly these three audible branches — REFUSED, ACCEPTED, and an ordinary
 * question worth no line — so the mirror has three too, one for one.
 *
 * PYTHON TRUTHINESS, NOT JS TRUTHINESS, AND THE DIFFERENCE IS THE WHOLE POINT OF THE FUNCTION:
 * `bool({})` is False where `{}` is truthy, so a body posting an empty `bound_slots` map is
 * REFUSED by the server while the obvious JS spelling of this check would call it honoured. The
 * one place the mirror is deliberately laxer than cortex is whitespace: `bool(" ")` is True to
 * Python, and `spokenAnswerBody` trims such an answer away before it can ever be posted. This
 * function answers "what will the server do", never "what should cortex have sent".
 */
export type LineageClaimVerdict = "honoured" | "refused" | "no_claim";

/** The only three fields of the posted body that bear on the verdict. */
export interface LineageBearingBody {
  bound_slots?: Record<string, string>;
  spoken_answer?: string;
  answering_artifact_id?: string;
}

export function lineageClaimVerdict(body: LineageBearingBody): LineageClaimVerdict {
  // `bool(request.answering_artifact_id or None)` — an empty string is no claim, which is also
  // the state `answeringArtifactBody` produces by omitting the key entirely.
  if (!body.answering_artifact_id) return "no_claim";
  // `bool(request.bound_slots)`: a non-empty MAP. Keyed on the key count rather than on the
  // object's own truthiness, because that is the clause JS gets backwards.
  const carriesPick = Object.keys(body.bound_slots ?? {}).length > 0;
  // `bool(request.spoken_answer)`: a non-empty STRING, untrimmed, mirroring the server.
  const carriesWords = (body.spoken_answer ?? "") !== "";
  return carriesPick || carriesWords ? "honoured" : "refused";
}
