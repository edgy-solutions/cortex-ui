/**
 * The wire name for a pick made from a menu — ONE constant, because the failure it prevents is
 * silent.
 *
 * `gateway.py` declares `bound_slots: dict[str, str] | None` and reads `request.bound_slots`.
 * A body posting `slots` is not rejected: the model simply parses `bound_slots` as None, the
 * supervisor sees no pick, and the turn proceeds AS IF THE USER HAD NOT ANSWERED — a wrong
 * answer with no error at either end. There is no 422 to notice and no log line to find.
 *
 * So the name is written once and every producer of the body derives it from here, and a test
 * asserts the posted key equals what the gateway model declares.
 */
export const BOUND_SLOTS_FIELD = "bound_slots" as const;

/**
 * Coerce a merged slot map to what the gateway's model accepts.
 *
 * `dict[str, str]` is declared, and pydantic v2 does NOT coerce an int into a str — a numeric
 * slot value would 422 the WHOLE request, taking the message with it. Values are stringified
 * rather than dropped: a slot silently missing is the same silent-default failure the name
 * constant exists to prevent, one field further in.
 */
export function toBoundSlots(slots: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

/**
 * The pick's slice of the request body — `{}` when there is no pick.
 *
 * A FUNCTION RATHER THAN A SPREAD AT THE CALL SITE, because the distinction it encodes is one
 * a conditional in a literal cannot be tested for. `{bound_slots: {}}` is NOT "no pick": the
 * server branches on the field being absent, so an empty object is a CLAIM that a menu was
 * answered, and it would be validated against a recomputed menu and refused. Absent is the
 * only honest way to say nothing was picked.
 */
export function boundSlotsBody(
  boundSlots?: Record<string, string>,
): Record<string, never> | { bound_slots: Record<string, string> } {
  if (!boundSlots || Object.keys(boundSlots).length === 0) return {};
  return { [BOUND_SLOTS_FIELD]: boundSlots } as { bound_slots: Record<string, string> };
}
