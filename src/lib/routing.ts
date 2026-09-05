/**
 * Routing decision-path presentation — the fallback_reason vocabulary,
 * made legible for the decision-path visualizer (Part 1).
 *
 * The supervisor captures a STRUCTURED closed-enum fallback_reason and the
 * gateway projection now passes it through verbatim (it used to re-derive a
 * coarser vocabulary — a resolution-discard at the render seam). This module
 * is the single place that turns each reason into human-readable, honest,
 * where-possible-ACTIONABLE text. Two of these reasons are the ones the
 * abstention arc and the PII-exploit made structural — this is where they
 * become VISIBLE to the user instead of hiding in logs:
 *   - instance_not_found   — the structural abstention gate's honest "you
 *                            named X, no provider knows it"
 *   - domain_scope_excluded — the deny primitive's data shadow (capabilities
 *                            exist, your entitlements exclude them)
 *
 * RED-FIRST GUARD (no test runner in this repo): the switch is exhaustive
 * over FallbackReason via a `never` default. Add an enum value without a
 * case and `tsc` (the build gate) fails — the compile-time equivalent of a
 * failing parametrized test. Never soften a reason into a euphemism; the
 * governing principle is surface-what-happened.
 */

/**
 * The closed enum the supervisor emits (dynamic_supervisor.py) PLUS the
 * legacy heuristic values the gateway's backward-compat branch can still
 * produce for pre-Part-0 materializations. All values that can arrive on
 * the wire must have a case below.
 */
export type FallbackReason =
  // structured closed enum (Part 0 capture)
  | "subject_unknown"
  | "instance_not_found"
  | "no_compatible_verbs"
  | "domain_scope_excluded"
  | "no_verb_classified"
  | "infra_error"
  // legacy heuristic values (pre-Part-0 materializations, backward compat)
  | "no_subject"
  | "no_predicate_matched"
  | "low_confidence";

/** How loud the fallback banner renders. */
export type RouteSeverity = "info" | "warn" | "alarm";

export interface FallbackPresentation {
  /** Short, loud headline for the banner. */
  title: string;
  /** One-line honest explanation; actionable where the user can act. */
  detail: string;
  /** Drives the banner's color/iconography. alarm = infra outage (red);
   *  warn = a real "no" the user may act on (amber); info = benign. */
  severity: RouteSeverity;
}

/**
 * Map a fallback_reason to its presentation. Exhaustive by construction:
 * the `never` default makes a missing case a COMPILE error.
 */
export function presentFallbackReason(
  reason: FallbackReason,
): FallbackPresentation {
  switch (reason) {
    case "subject_unknown":
    case "no_subject": // legacy alias
      return {
        title: "Subject not grounded",
        detail:
          "No ontology class matched your query — the system couldn't tell " +
          "what you're asking about. You may want to rephrase with a more " +
          "specific term.",
        severity: "warn",
      };

    case "instance_not_found":
      return {
        title: "Named item not found",
        detail:
          "You named a specific item, but no provider in the mesh " +
          "recognizes it. Check that the identifier is exact, or ask about " +
          "its general category instead of the specific instance.",
        severity: "warn",
      };

    case "no_compatible_verbs":
      return {
        title: "No capability for this subject",
        detail:
          "The subject resolved, but no registered capability operates on " +
          "it — nothing in the mesh knows how to answer this kind of " +
          "question about it yet.",
        severity: "warn",
      };

    case "domain_scope_excluded":
      return {
        title: "Excluded by your entitlements",
        detail:
          "Capabilities exist for this subject, but your current " +
          "entitlements exclude them all. This is an access-scope outcome, " +
          "not a gap in the system — a different persona or domain may see " +
          "more.",
        severity: "warn",
      };

    case "no_verb_classified":
    case "no_predicate_matched": // legacy alias
    case "low_confidence": // legacy alias
      return {
        title: "No confident action",
        detail:
          "Candidate capabilities existed, but none confidently fit the " +
          "query — the system chose not to guess. You may want to rephrase.",
        severity: "warn",
      };

    case "infra_error":
      return {
        title: "Routing unavailable",
        detail:
          "Routing couldn't run — a backend service was unreachable. This " +
          "is an outage to fix, not a 'no answer' about your query.",
        severity: "alarm",
      };

    default: {
      // Exhaustiveness guard: if a new FallbackReason is added without a
      // case, this line fails to compile (tsc is the build gate). The
      // render seam is not allowed to silently drop a reason.
      const _exhaustive: never = reason;
      return {
        title: "Fell back to general search",
        detail: String(_exhaustive),
        severity: "info",
      };
    }
  }
}

/**
 * ── WHAT A GATE REMOVED, AND WHY THAT CHANGES THE ABSTENTION ──────────────────────────────
 *
 * `candidates` is what SURVIVED. Every eligibility gate — domain, arity, argument-fit,
 * permission, the productive-option gate — can delete the only verb that fits, and the record
 * afterwards shows only the survivors. So an abstention on a pool of one reads as "the
 * classifier was not sure" when the truth is "the gate deleted the answer before the classifier
 * saw it". Those need different remedies, and until now the record could not tell them apart.
 *
 * NOTHING HERE INTERPRETS A GATE. There is no vocabulary of gate names in this file and there
 * must not be one: the whole point is that the NEXT gate anyone adds inherits the trace, and a
 * closed enum would render it as an unknown token — the silent-removal defect, one layer up and
 * wearing a switch statement.
 */
export interface ReadExclusion {
  verb: string;
  gate: string;
  reason: string;
}

/**
 * Read the exclusions off a routing record, keeping only entries that say something.
 *
 * A row with no verb names nothing; a row with neither gate nor reason is a removal that
 * declines to explain itself, which is the thing this field exists to end. Both are dropped
 * rather than rendered as blanks — a chip reading "— excluded by :" is worse than no chip,
 * because it looks like the system said something.
 */
export function readExclusions(excluded: unknown): ReadExclusion[] {
  if (!Array.isArray(excluded)) return [];
  const out: ReadExclusion[] = [];
  for (const e of excluded) {
    if (typeof e !== "object" || e === null) continue;
    const r = e as Record<string, unknown>;
    const verb = typeof r.verb === "string" ? r.verb.trim() : "";
    const gate = typeof r.gate === "string" ? r.gate.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (!verb) continue;
    if (!gate && !reason) continue;
    out.push({ verb, gate, reason });
  }
  return out;
}

/**
 * The abstention, told apart.
 *
 * NOTHING FIT and SOMETHING FIT AND WAS REMOVED are different events with different remedies,
 * and they rendered identically. The second is usually the user's cue to rephrase — naming an
 * instance is exactly what an arity exclusion is asking for — and that cue was unreachable.
 *
 * The base presentation is unchanged when there are no exclusions, so this can never make an
 * ordinary abstention louder than it was. When there are, the detail SAYS what was removed and
 * by which gate, in the gate's own words.
 */
export function presentAbstention(
  reason: FallbackReason,
  excluded: unknown,
): FallbackPresentation & { excluded: ReadExclusion[] } {
  const base = presentFallbackReason(reason);
  const rows = readExclusions(excluded);
  if (rows.length === 0) return { ...base, excluded: rows };

  const first = rows[0];
  const named = rows.length === 1 ? first.verb : `${first.verb} and ${rows.length - 1} more`;
  return {
    ...base,
    // NOT a replacement for the reason the producer gave. The abstention is still whatever it
    // was; this says the part the record used to swallow.
    detail:
      `${base.detail} ${named} fit this subject and ` +
      (first.gate ? `was removed by the ${first.gate} gate` : "was removed") +
      (first.reason ? `: ${first.reason}` : "") +
      ".",
    excluded: rows,
  };
}
