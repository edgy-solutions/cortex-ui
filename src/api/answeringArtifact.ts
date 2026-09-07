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
