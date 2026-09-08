/**
 * DOES THE SERVER HAVE A MENU FOR US — a different question from "why this card".
 *
 * ── THE FAILURE THIS READS FOR ────────────────────────────────────────────────────────────
 *
 * A prime run with `wipe: true, nuclear: true` drops the Weaviate `Predicate` collection, and
 * that is where every `rendersAs` row lives — the engines' AND cortex's. The re-register helm
 * hook restarts the nine registering ENGINE deployments, so their rows come back on startup.
 * NOTHING RE-POSTS CORTEX'S: a browser is the only thing that can, and the registration hook
 * fires once per authenticated session and latches.
 *
 * From then on `select_archetype("cortex-ui-desktop", ...)` finds no menu for this caller,
 * widens, declares nothing, and every answer renders `KNOWLEDGE_DOCUMENT · No content
 * available`. Routing is fine. The engines are registered. The graph is correct. Every card is
 * blank because the CALLER's menu was deleted.
 *
 * The remedy that appeared to work — reroll the engines, reroll everything — does nothing for
 * this. Somewhere in that cycle the tab gets reloaded, and THAT is the fix. A remedy that works
 * for a reason nobody can see is exactly the shape that makes a permanent failure look
 * intermittent, which is why this went months without a diagnosis.
 *
 * ── WHY `presentation_source` AND NOT THE WIDENED BASIS ───────────────────────────────────
 *
 * The tempting trigger is the widening itself: an archetype selection that fell back to
 * payload-only is evidence the menu is gone, and it is already computed. IT IS NOT SAFE. A
 * widening has two causes with OPPOSITE repairs:
 *
 *   the menu is gone          -> re-post the registration        (this file)
 *   the menu is present and
 *   this subject is unbound   -> declare a row in the assembler  (a code change)
 *
 * The second is not hypothetical: seven cost subjects were unbound last week and every one of
 * them widened. Re-registering on a widening would have fired on each of those answers and
 * repaired nothing — a poll wearing an event's clothes.
 *
 * `presentation_source` separates them exactly, and not by luck. In `capability_registry.py`
 * every return site derives it from one variable, `anonymous = menu_for(frontend_id) is None`:
 *
 *   "default-menu"   <-> anonymous       -> the server has NO menu for this caller
 *   "unrenderable"   <-> NOT anonymous   -> it has one, and this output is not on it
 *   "registered"     <-> NOT anonymous   -> it has one, and this output is on it
 *
 * So `default-menu` is reachable only when the lookup for our own frontend_id came back empty.
 * That is the state this file detects, and it is the only one re-registration repairs.
 *
 * ── WHY NOT `readPresentation` ────────────────────────────────────────────────────────────
 *
 * That reader drops any record without `selection_basis`, deliberately: it answers "why this
 * card", and provenance that cannot say how it chose is not provenance. But the WORST case here
 * — registry empty, union empty, the post-wipe state before any engine has re-registered —
 * returns `default-menu` with NO basis at all, so that reader returns null for precisely the
 * state we most need to see. Loosening it would weaken a seal that is right for its own
 * question. A different question gets a different reader.
 */

/** The producer's word for "I have no menu for this caller". See the header for why it is exact. */
export const NO_MENU_SOURCE = "default-menu";

/**
 * The OTHER anonymous stamp, and the reason it is matched on the CODE rather than the category.
 *
 * A live view is a standing contract, so the selector refuses to nominate one for a caller it
 * cannot identify — and that check runs inside the same `if anonymous` branch, which makes it
 * the same evidence: the server has no menu for us. Missing it would leave a post-wipe session
 * that asks for a live view with no way back, which is the exact hole this file exists to close.
 *
 * `refused` is a CATEGORY and the producer says so in as many words — it carries its cause in
 * `refusal_code` precisely so a fifth state is not minted the next time a selector-level refusal
 * appears. So the category is not the trigger; this one code is. A future refusal for some
 * unrelated cause must not re-post a registration that is present and fine.
 */
export const REFUSED_SOURCE = "refused";
export const NO_MENU_REFUSAL_CODE = "live_view_requires_registration";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * True when this answer says the server holds no capability menu for US.
 *
 * The frontend_id is checked rather than assumed. The anonymous branches echo back the id the
 * request carried, so for our own answers it is ours; an answer stamped for a DIFFERENT caller
 * says nothing about our registration and must not trigger a re-post. An ABSENT id is accepted:
 * the field is `frontend_id or None` at those sites, older producers may omit it entirely, and
 * the answer came back on our own session regardless.
 */
export function serverHasNoMenuForUs(raw: unknown, ourFrontendId: string): boolean {
  if (!isRecord(raw)) return false;
  if (typeof raw.presentation_source !== "string") return false;
  const source = raw.presentation_source.trim();

  const anonymous =
    source === NO_MENU_SOURCE ||
    (source === REFUSED_SOURCE &&
      typeof raw.refusal_code === "string" &&
      raw.refusal_code.trim() === NO_MENU_REFUSAL_CODE);
  if (!anonymous) return false;

  const stamped = raw.frontend_id;
  if (typeof stamped === "string" && stamped.trim() && stamped.trim() !== ourFrontendId) {
    return false;
  }
  return true;
}

/**
 * True when this answer proves the server DOES hold a menu for us.
 *
 * Used to reset the backoff, so a session that recovers is not left carrying the penalty from
 * an earlier wipe. Only the two non-anonymous labels count: both are stamped from a menu the
 * lookup actually found, and either one is proof the row is back.
 */
export function serverHasOurMenu(raw: unknown, ourFrontendId: string): boolean {
  if (!isRecord(raw)) return false;
  const source = typeof raw.presentation_source === "string" ? raw.presentation_source.trim() : "";
  if (source !== "registered" && source !== "unrenderable") return false;

  const stamped = raw.frontend_id;
  if (typeof stamped === "string" && stamped.trim() && stamped.trim() !== ourFrontendId) {
    return false;
  }
  return true;
}
