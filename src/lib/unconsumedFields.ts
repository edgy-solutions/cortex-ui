/**
 * PAYLOAD KEYS NO ARCHETYPE READ — R-075's missing half, made a control.
 *
 * R-075 rules that if a message string enumerates anything, the enumeration is a FIELD. That
 * catches the PRODUCER. Nothing catches the other end: a correct field, emitted by a producer
 * that did the right thing, sitting unread indefinitely because the consumer was never written.
 * Nothing fails. Nobody sees it.
 *
 * ── THE COST OF NOT HAVING THIS, measured twice in one week ───────────────────────────────
 *
 * `available` — the list of values a refused slot WILL accept — has been a field on the cost
 * engine's refusal since it was added, with the engine's own comment saying "same key as
 * VintageRequired above, so a consumer reads one field for what may I say instead". No consumer
 * was ever written: zero readers in the dispatch chain, zero in the presentation agent. It took
 * a four-hop source trace across two repos to establish that. On screen, the refusal simply
 * read as prose.
 *
 * `candidates` on an abstain is the same shape one layer over, and `uri`-versus-`verb` on the
 * exclusions trace was the same shape a week earlier — every arity exclusion discarded silently
 * over a field name, while both ends believed the trace was live.
 *
 * So: the keys a payload CARRIED that no archetype READ are listed, by name, in the HUD's
 * detailed mode. The next `available` is visible on screen the day it is emitted instead of
 * after somebody spends four hops on it.
 *
 * ── ⛔ IT REPORTS, IT NEVER RENDERS ───────────────────────────────────────────────────────
 *
 * A listed key is a FINDING, not a value. This module returns NAMES ONLY — the report type has
 * nowhere to put a value, deliberately, so the constraint is structural rather than a rule
 * someone has to remember.
 *
 * Two reasons. A value drawn from a field nobody declared a treatment for is a value rendered
 * without units, without a formatter and without anyone having decided what it means — which is
 * how an hours count gets printed as dollars. And an undeclared field may carry something the
 * classification does not permit on this surface; the safe disclosure is that a key exists, not
 * what is in it.
 *
 * ── AN UNDECLARED ARCHETYPE REPORTS AS UNDECLARED, NOT AS ALL-UNREAD ──────────────────────
 *
 * Several bound archetypes have no contract in this repo. For those, EVERY key would look
 * unread, and a control that lists twenty keys on an ordinary card is noise that gets it
 * switched off within the week — after which the real finding has no arm at all. So the absence
 * of a declaration is its own state and says so.
 *
 * ── WHAT THIS CANNOT SEE ──────────────────────────────────────────────────────────────────
 *
 * It compares against a contract's DECLARED fields, not against what the component actually
 * reads. A contract that declares a field its component ignores counts as read here — the
 * declared-but-unwired shape, which this does not detect and `ADR-0017`-style registration
 * seals do. It also sees only the top level: a field nested inside a declared object is
 * invisible to it.
 */
import { SUPPLY_TABLE_CONTRACT } from "@/components/registry/SupplyTable.contract";
import { CANVAS_SEED_CONTRACT } from "@/components/registry/CanvasSeed.contract";
import { CHART_WIDGET_CONTRACT } from "@/components/mesh/ChartWidget.contract";
import { COMPETING_MEASURES_CONTRACT } from "@/components/planning/CompetingMeasures.contract";
import { CONTRIBUTION_RANKING_CONTRACT } from "@/components/planning/ContributionRanking.contract";
import { DECISION_RECORD_CONTRACT } from "@/components/planning/DecisionRecord.contract";
import { DELTA_SET_CONTRACT } from "@/components/planning/DeltaSet.contract";
import { ELICITATION_CONTRACT } from "@/components/elicitation/Elicitation.contract";
import { FORECAST_MEASURE_CONTRACT } from "@/components/planning/ForecastMeasure.contract";
import { GROUPED_REVIEW_CONTRACT } from "@/components/GroupedReview/GroupedReviewTable.contract";
import { WARNING_CARD_CONTRACT } from "@/components/registry/WarningCard.contract";
import { INTERVAL_TIMELINE_CONTRACT } from "@/components/planning/IntervalTimeline.contract";
import { MARKDOWN_RENDERER_CONTRACT } from "@/components/registry/MarkdownRenderer.contract";
import { MATRIX_GRID_CONTRACT } from "@/components/planning/MatrixGrid.contract";
import { MULTI_SERIES_CONTRACT } from "@/components/planning/MultiSeries.contract";
import { NAMED_HOLE_CONTRACT } from "@/components/registry/NamedHole.contract";
import { PERIOD_SERIES_CONTRACT } from "@/components/planning/PeriodSeries.contract";
import { PROCESS_TOPOLOGY_CONTRACT } from "@/components/registry/ProcessTopologyCard.contract";
import { SHORTFALL_GRID_CONTRACT } from "@/components/planning/ShortfallGrid.contract";
import { STEP_LADDER_CONTRACT } from "@/components/planning/StepLadder.contract";
import { THRESHOLD_GRID_CONTRACT } from "@/components/planning/ThresholdGrid.contract";
import { VARIANCE_TREE_CONTRACT } from "@/components/planning/VarianceTree.contract";

/** Every contract in this repo, keyed by the archetype it declares. */
const CONTRACTS: Record<string, { archetype: string; fields?: Record<string, unknown> }> = {
  [SUPPLY_TABLE_CONTRACT.archetype]: SUPPLY_TABLE_CONTRACT,
  [CANVAS_SEED_CONTRACT.archetype]: CANVAS_SEED_CONTRACT,
  [CHART_WIDGET_CONTRACT.archetype]: CHART_WIDGET_CONTRACT,
  [COMPETING_MEASURES_CONTRACT.archetype]: COMPETING_MEASURES_CONTRACT,
  [CONTRIBUTION_RANKING_CONTRACT.archetype]: CONTRIBUTION_RANKING_CONTRACT,
  [DECISION_RECORD_CONTRACT.archetype]: DECISION_RECORD_CONTRACT,
  [DELTA_SET_CONTRACT.archetype]: DELTA_SET_CONTRACT,
  [ELICITATION_CONTRACT.archetype]: ELICITATION_CONTRACT,
  [FORECAST_MEASURE_CONTRACT.archetype]: FORECAST_MEASURE_CONTRACT,
  [GROUPED_REVIEW_CONTRACT.archetype]: GROUPED_REVIEW_CONTRACT,
  [WARNING_CARD_CONTRACT.archetype]: WARNING_CARD_CONTRACT,
  [INTERVAL_TIMELINE_CONTRACT.archetype]: INTERVAL_TIMELINE_CONTRACT,
  [MARKDOWN_RENDERER_CONTRACT.archetype]: MARKDOWN_RENDERER_CONTRACT,
  [MATRIX_GRID_CONTRACT.archetype]: MATRIX_GRID_CONTRACT,
  [MULTI_SERIES_CONTRACT.archetype]: MULTI_SERIES_CONTRACT,
  [NAMED_HOLE_CONTRACT.archetype]: NAMED_HOLE_CONTRACT,
  [PERIOD_SERIES_CONTRACT.archetype]: PERIOD_SERIES_CONTRACT,
  [PROCESS_TOPOLOGY_CONTRACT.archetype]: PROCESS_TOPOLOGY_CONTRACT,
  [SHORTFALL_GRID_CONTRACT.archetype]: SHORTFALL_GRID_CONTRACT,
  [STEP_LADDER_CONTRACT.archetype]: STEP_LADDER_CONTRACT,
  [THRESHOLD_GRID_CONTRACT.archetype]: THRESHOLD_GRID_CONTRACT,
  [VARIANCE_TREE_CONTRACT.archetype]: VARIANCE_TREE_CONTRACT,
};

/**
 * Keys that are STRUCTURAL rather than payload — present on every component and not a field
 * any archetype is expected to declare.
 *
 * `archetype` is the discriminant itself. Kept deliberately short: every name added here is a
 * key this control stops being able to report, so the list is a denylist of last resort rather
 * than a convenient place to silence noise.
 */
const STRUCTURAL = new Set(["archetype"]);

export type UnconsumedReport =
  /** The component names no archetype — a different defect, and not this one's to report. */
  | { status: "no_archetype" }
  /** This repo has no contract for that archetype, so "unread" cannot be computed. */
  | { status: "no_declaration"; archetype: string }
  /** Every key the payload carried is declared by the contract. */
  | { status: "all_read"; archetype: string }
  /** Keys the payload carried that the contract does not declare. NAMES ONLY. */
  | { status: "unread"; archetype: string; keys: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Which keys of this component no archetype declared.
 *
 * Sorted, so the report is stable between renders and two cards carrying the same gap read the
 * same way.
 */
export function unconsumedFields(component: unknown): UnconsumedReport {
  if (!isRecord(component)) return { status: "no_archetype" };
  const archetype = typeof component.archetype === "string" ? component.archetype.trim() : "";
  if (!archetype) return { status: "no_archetype" };

  const contract = Object.hasOwn(CONTRACTS, archetype) ? CONTRACTS[archetype] : undefined;
  if (!contract || !isRecord(contract.fields)) return { status: "no_declaration", archetype };

  const declared = new Set(Object.keys(contract.fields));
  const keys = Object.keys(component)
    .filter((k) => !STRUCTURAL.has(k) && !declared.has(k))
    .sort();
  return keys.length === 0 ? { status: "all_read", archetype } : { status: "unread", archetype, keys };
}
