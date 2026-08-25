import {
  FileText,
  BarChart3,
  Gauge,
  Network,
  AlertTriangle,
  Box,
  GanttChartSquare,
  TrendingUp,
  Grid3x3,
  Grid2x2,
  Scale,
  GitCompare,
  Gavel,
  List,
  Activity,
  CheckSquare,
  Inbox,
  ClipboardCheck,
  HelpCircle,
} from "lucide-react";
import type { AnswerArchetype } from "@/lib/answerDisplay";

/**
 * ArchetypeGlyph — the type glyph, keyed on the REAL BAML SemanticArchetype
 * (NOT the mock's invented doc/dash). `fallback` is an ORTHOGONAL amber △
 * overlay that rides on ANY archetype — it is not a type.
 *
 * Colors follow the mock's palette: doc/blue, chart/purple, fallback/amber,
 * with sensible colors for the archetypes the mock didn't enumerate.
 */
export function ArchetypeGlyph({
  archetype,
  fallback,
  size = "sm",
}: {
  archetype: AnswerArchetype;
  fallback: boolean;
  size?: "sm" | "md";
}) {
  const { Icon, color } = glyphFor(archetype);
  const cls = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <span className="relative flex-shrink-0">
      <Icon className={`${cls} ${color}`} />
      {fallback && (
        <AlertTriangle
          className="absolute -bottom-1 -right-1 w-2 h-2 text-amber-400 fill-amber-950"
          strokeWidth={2.5}
        />
      )}
    </span>
  );
}

export function glyphFor(t: AnswerArchetype): {
  Icon: typeof FileText;
  color: string;
} {
  switch (t) {
    case "KNOWLEDGE_DOCUMENT":
      return { Icon: FileText, color: "text-neon-blue/80" }; // ▤ doc
    case "CHART_WIDGET":
      return { Icon: BarChart3, color: "text-neon-purple/80" }; // ◉ dashboard/chart
    case "ASSET_STATE_METRIC":
      return { Icon: Gauge, color: "text-neon-green/80" };
    case "PROCESS_TOPOLOGY":
      return { Icon: Network, color: "text-neon-cyan/80" };
    case "HAZARD_DECLARATION":
      return { Icon: AlertTriangle, color: "text-amber-400/90" };
    case "DIGITAL_TWIN_3D":
      return { Icon: Box, color: "text-neon-pink/80" };
    // The planning family. Glyphs are STRUCTURAL, matching the archetypes themselves — a
    // shortfall grid draws a balance rather than a coin, because the archetype is "secured
    // against needed" and knows nothing about money. Its first consumer is funding; the next
    // one will not be, and a money glyph would have to be un-picked then.
    case "INTERVAL_TIMELINE":
      return { Icon: GanttChartSquare, color: "text-neon-cyan/80" };
    case "PERIOD_SERIES":
      return { Icon: TrendingUp, color: "text-neon-purple/80" };
    case "THRESHOLD_GRID":
      return { Icon: Grid3x3, color: "text-amber-400/90" };
    case "MATRIX_GRID":
      return { Icon: Grid2x2, color: "text-neon-green/80" };
    case "SHORTFALL_GRID":
      return { Icon: Scale, color: "text-neon-pink/80" };
    case "DELTA_SET":
      return { Icon: GitCompare, color: "text-neon-blue/80" };
    case "DECISION_RECORD":
      return { Icon: Gavel, color: "text-neon-cyan/80" };
    case "INSTANCES_BY_PROPERTY":
      return { Icon: List, color: "text-neon-blue/80" };
    case "WORKFLOW_OBSERVATION":
      return { Icon: Activity, color: "text-neon-green/80" };
    // Task species. They already carry a kind BADGE in the list row, so the glyph is
    // secondary identification rather than the primary one.
    case "APPROVAL_TASK":
      return { Icon: CheckSquare, color: "text-neon-green/80" };
    case "TRIAGE_TASK":
      return { Icon: Inbox, color: "text-amber-400/90" };
    case "GROUPED_REVIEW":
      return { Icon: ClipboardCheck, color: "text-neon-purple/80" };
    default:
      return { Icon: HelpCircle, color: "text-slate-500" };
  }
}
