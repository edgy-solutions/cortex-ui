/**
 * WarningCard's own contract (HAZARD_DECLARATION).
 *
 * A NAMING FACT THE CONTRACT MUST CARRY: the required prop is `error`, and for a
 * HAZARD_DECLARATION render it holds the SUBJECT CONCEPT, not an error message. The name is
 * preserved for backwards compatibility with system-error call sites that share the
 * component. A backend reading only the prop name would send the wrong string.
 */

export const HAZARD_ROW_REQUIREMENTS = {
  /** `hazards` is optional — a declaration with no enumerated hazards still renders. */
  minHazards: 0,
} as const;

/** Empty: `error` is a string and any string renders. */
export const HAZARD_REFUSAL_REASONS = [] as const;

export const WARNING_CARD_CONTRACT = {
  archetype: "HAZARD_DECLARATION",
  component: "WarningCard",
  layout: "grid-col-1",
  fields: {
    /** REQUIRED. Despite the name, this is the SUBJECT CONCEPT for hazard renders. */
    subject_concept: { encoding: "string", required: true, mapsToProp: "error" },
    /** HazardEntity[]: `id` REQUIRED; name/type/description optional. */
    hazards: { encoding: "array", required: false, elementRequiredKeys: ["id"] },
    /** CRITICAL | WARNING | INFO. Defaults to WARNING when absent. */
    severity: { encoding: "enum", required: false, values: ["CRITICAL", "WARNING", "INFO"] },
  },
  rowRequirements: HAZARD_ROW_REQUIREMENTS,
  refusalReasons: HAZARD_REFUSAL_REASONS,
} as const;
