/**
 * MAY THIS DRAWN CARD BE NAMED AS A PARENT? — the caller's claim, decided in one place.
 *
 * `answering_artifact_id` is a CLAIM this client makes and the server checks. Two call sites
 * always had one to make: an ask card knows the artifact its question was asked on, and the
 * reopen path knows the ask it is answering a second time. THE COMPOSER HAD NEITHER, and it is
 * the surface a free-text turn goes through — so every turn typed into the input bar posted no
 * lineage at all, and a follow-up looked to the graph like a conversation's first word.
 *
 * ── WHY A PREDICATE AND NOT `currentArtifactId` ────────────────────────────────────────────
 *
 * ⛔ The foregrounded id is NOT automatically safe to claim. The server's write is a
 * `MERGE (parent:AnswerArtifact {id: $parent_id})`, and MERGE CREATES WHAT IT CANNOT FIND — an
 * id that names nothing does not fail, it CONJURES a parent into the provenance graph. So the
 * question is not "what is drawn" but "is what is drawn a real answer artifact in the graph of
 * record", and the canvas collection holds three kinds of row for which the answer is no:
 *
 *   1. SYNTHETIC TASK ARTIFACTS. Tasks and answers are one citizen in two states and share the
 *      collection, so `currentArtifactId` is routinely a `task:`-prefixed id. It is a task-store
 *      row id wearing an artifact's clothes; no `AnswerArtifact` ever had it. Claiming one is
 *      the conjure case exactly.
 *
 *   2. ROWS NOT IN THE GRAPH OF RECORD. `durability_status` is the field that answers this and
 *      the reason it is kept orthogonal to `status`: `persistence_failed` means, in the type's
 *      own words, "the user has the answer, but it is NOT in the graph-of-record". A card can be
 *      complete, rendered, and read on screen while nothing upstream has its id. `status` is the
 *      pipeline's account and CANNOT answer the substrate's question — reading it here would be
 *      the collapse that field exists to prevent.
 *
 *   3. THE TURN'S OWN PENDING ROW. A turn foregrounds its own pending artifact at the start, so
 *      a claim read after that point names the very turn making it. Nothing rejects that; it is
 *      a self-parent. Guard 2 catches it — a pending row is `persistence_pending` — but the
 *      ORDER of the read is what the caller must get right, and it is sealed at the call site.
 *
 * ── AND ONE GUARD THAT IS NOT ABOUT CONJURING ──────────────────────────────────────────────
 *
 * AN ASK IS NEVER DEFAULTED TO, even a durable one. `askFold` hides an ask once the server says
 * something derived from it, so a defaulted claim on a drawn ask would fold that ask away — and
 * the turn that folded it was a question the reader typed INSTEAD of answering it. The ask card
 * would vanish and the thing standing in its place would answer something else. Ordinary
 * follow-up lineage between two answers is a relationship worth having; a silent claim to have
 * answered a question the reader left alone is not. An ask answered ON PURPOSE still posts its
 * id — from the ask card, explicitly, which is why this is a DEFAULT and not an override.
 *
 * ── THE STANDING RULING THIS DOES NOT CONTRADICT ───────────────────────────────────────────
 *
 * `askFold.test.ts` pins that the ask card is HANDED the artifact it is on and must never read
 * the focused one, because "a wrong parent is not a wrong edge but a CONJURED node". That ruling
 * is about a PICK, and it stands: an ask's parent is the artifact its question was asked on,
 * which is frequently not the drawn one, and this default never overrides an explicit claim.
 *
 * A composer turn is the case that ruling does not cover. There is no ask, no prop to thread,
 * and nothing else on hand — so the choice is the drawn card or no lineage at all, and it was no
 * lineage at all. The conjure risk the ruling names is answered by the guards above rather than
 * by declining to claim: a task id, a row outside the graph of record, and an ask are each
 * refused, and what remains is an answer the substrate has confirmed it holds.
 */
import type { Artifact } from "@/api/types";
import { isAsk } from "@/lib/askFold";
import { isTaskArtifact } from "@/lib/taskArtifact";

/**
 * The lineage id a turn may claim from the drawn card, or `undefined` for "claim nothing".
 *
 * `undefined` rather than `null` so it composes with `answeringArtifactBody`, which already
 * treats absent and blank alike — one decision about emptiness, not two.
 */
export function drawnLineageClaim(drawn: Artifact | null | undefined): string | undefined {
  if (!drawn) return undefined;
  // A task-store row id is not an AnswerArtifact id. Checked by the shared helper so a task
  // carrying `task_ref` without the prefix is caught too.
  if (isTaskArtifact(drawn)) return undefined;
  // THE SUBSTRATE'S OWN ANSWER. Not `status` — see the header.
  if (drawn.durability_status !== "durable") return undefined;
  // Would fold a question the reader did not answer.
  if (isAsk(drawn)) return undefined;
  const id = (drawn.id ?? "").trim();
  return id ? id : undefined;
}
