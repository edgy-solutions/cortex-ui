/**
 * The wire names for an answer to an ask that HAD NO MENU — two scalars, one constant each,
 * for the same reason `bound_slots` has one: the failure they prevent is silent.
 *
 * `gateway.py` declares `spoken_slot: str | None` and `spoken_answer: str | None` and reads
 * `request.spoken_slot` / `request.spoken_answer`. A body posting any other name is not
 * rejected — the model parses the field it wants as None, the supervisor sees no answer, and
 * the turn proceeds AS IF THE READER HAD NOT ANSWERED. No 422, no log line, nothing anywhere
 * saying so. That is the identical shape `BOUND_SLOTS_FIELD` exists to stop, one path over.
 *
 * WHY NOT `bound_slots`, AND THE SEPARATION IS THE SAFETY. A RESPEAK ask had NO menu by
 * construction — `options.length === 0` is the branch that makes it a RESPEAK at all — so
 * `validate_bound_slots` refuses its slot as `no_menu` BY DESIGN. Routing unvalidatable words
 * through the validated path would 422 or take the silent default. A separate name says what
 * the value is: words a person typed, not a pick from a list.
 *
 * WHY TWO SCALARS RATHER THAN A DICT. A RESPEAK ask asks about exactly one slot and there is
 * exactly one answer. A dict would reimport the `{}`-versus-absent ambiguity `boundSlotsBody`
 * exists to prevent, for no gain.
 */
export const SPOKEN_SLOT_FIELD = "spoken_slot" as const;
export const SPOKEN_ANSWER_FIELD = "spoken_answer" as const;

/** What a RESPEAK carries beside its phrase. Both halves or neither — see `spokenAnswerBody`. */
export interface SpokenAnswer {
  slot: string;
  answer: string;
}

/**
 * The answer's slice of the request body — `{}` when nothing was spoken.
 *
 * A FUNCTION RATHER THAN A SPREAD AT THE CALL SITE, for the reason `boundSlotsBody` is one:
 * the distinctions it encodes are not testable in a conditional inside an object literal.
 *
 * BOTH FIELDS OR NEITHER. An answer with no slot has nowhere to land, and a slot with no
 * answer is a claim that someone replied with nothing — so a half-populated pair is never
 * posted. The two are written together here, once, and the caller cannot post one alone.
 *
 * ABSENT, NOT EMPTY. The gateway declares `str | None`, so an omitted field parses as None
 * while `""` parses as an empty string: "nobody answered" and "answered with nothing" stay
 * distinguishable at the model, and only the first is true of an ordinary turn.
 */
export function spokenAnswerBody(
  spoken?: SpokenAnswer,
): Record<string, never> | { spoken_slot: string; spoken_answer: string } {
  if (!spoken) return {};
  const slot = spoken.slot.trim();
  const answer = spoken.answer.trim();
  if (!slot || !answer) return {};
  return { [SPOKEN_SLOT_FIELD]: slot, [SPOKEN_ANSWER_FIELD]: answer } as {
    spoken_slot: string;
    spoken_answer: string;
  };
}
