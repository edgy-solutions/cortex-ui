/**
 * `project_id` -> "project". The `_id` suffix is a fact about a SIGNATURE, not about a thing,
 * and reading it back at a person asks them for an opaque key when the whole point of a menu is
 * that they do not have one.
 *
 * SHARED, because the ask card and the in-flight chip must name the same slot the same way. Two
 * copies would drift the day one of them learns about a suffix the other has not met.
 */
export function slotWord(slot: string): string {
  return slot.replace(/_id$/, "").replace(/_/g, " ");
}
