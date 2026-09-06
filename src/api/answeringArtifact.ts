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
 * A FUNCTION RATHER THAN A SPREAD, for the reason `boundSlotsBody` is one: the distinction
 * between absent and empty is not testable inside an object literal. An empty string is not a
 * missing id — it is a claim to have answered an artifact with no name, which the server would
 * refuse and which no caller means.
 */
export function answeringArtifactBody(
  artifactId?: string | null,
): Record<string, never> | { answering_artifact_id: string } {
  const id = (artifactId ?? "").trim();
  if (!id) return {};
  return { [ANSWERING_ARTIFACT_FIELD]: id } as { answering_artifact_id: string };
}
