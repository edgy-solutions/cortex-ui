import React from "react";
import { AlertCircle, FileText, Zap } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Lazy-loaded or imported directly for interpretation
import { WarningCard } from "../NeuralStream/WarningCard";
import { isActedOn } from "@/registry/actedOnArchetypes";
import { CanvasSeedReceipt } from "./CanvasSeedReceipt";
import { useMeshConfig, DynamicIcon } from "@/lib/meshPersonaConfig";
import { ChartWidget } from "../mesh/ChartWidget";
import { FederatedImage } from "../mesh/FederatedImage";
// DigitalTwinWidget is intentionally not imported — the
// DIGITAL_TWIN_3D archetype dispatch was removed 2026-06-26 (user
// deferred the digital-twin concept until it gets a proper visual
// pass). The widget file is preserved at
// `../mesh/DigitalTwinWidget.tsx` so the work isn't lost; re-import
// here and re-add the dispatch case when the concept is revisited.
import { ProcessTopologyCard } from "./ProcessTopologyCard";
import { GroupedReviewTable } from "../GroupedReview/GroupedReviewTable";
import { WorkflowObservationView } from "../WorkflowObservation/WorkflowObservationView";
import { InstancesByPropertyView } from "../InstancesByProperty/InstancesByPropertyView";
import { ApprovalTaskCard } from "../ApprovalTask/ApprovalTaskCard";
import { TriageTaskCard } from "@/components/TriageTask/TriageTaskCard";
import { PeriodSeries } from "@/components/planning/PeriodSeries";
import { ShortfallGrid } from "@/components/planning/ShortfallGrid";
import { ThresholdGrid } from "@/components/planning/ThresholdGrid";
import { MatrixGrid } from "@/components/planning/MatrixGrid";
import { DeltaSet } from "@/components/planning/DeltaSet";
import { IntervalTimeline } from "@/components/planning/IntervalTimeline";
import { commitDrag } from "@/lib/planDrag";
import { DecisionRecord } from "@/components/planning/DecisionRecord";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";
import { publishToSuperset } from "@/api/client";
import { isMockGroundingEnabled } from "@/lib/mockGroundingEmitter";
import { toast } from "sonner";

/**
 * SupplyTable — ASSET_STATE_METRIC render.
 *
 * Rebuilt 2026-06-26 (user feedback):
 *   - Table "always rendered as two columns and truncated all the
 *     other data" — caused by the description column using
 *     `text-right`+`text-[9px]`+`tracking-tight`+`uppercase` which
 *     visually crushed it into illegibility against the third
 *     column. Now each column has clear width allocation and
 *     readable typography.
 *   - "Two dots at the top, one blinks but doesn't do anything" —
 *     those were decorative pulse indicators that didn't reflect
 *     any real state. Removed entirely. Honest > decorative.
 *
 * Structure matches the ChartWidget for consistency: glass-panel
 * container, pulsing cyan dot + bold title + small subtitle,
 * footer info row.
 */
const SupplyTable = ({ data, subject }: { data: any[]; subject?: string }) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="glass-panel p-6 my-4 border-cyan-500/20">
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
            Asset registry empty
          </p>
          <p className="font-mono text-[9px] text-slate-500">
            no rows attached to this archetype
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
      {/* Header — matches ChartWidget */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {subject || "Asset Registry"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          Asset Registry · {data.length} {data.length === 1 ? "row" : "rows"}
        </p>
      </div>

      {/* Table — width-allocated columns so the metadata column has
          room to breathe instead of being squeezed by uppercase 9px
          right-aligned text. Name takes its natural width; type is a
          compact chip; metadata fills the remainder. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/70 w-1/3">
                Name
              </th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/70 w-[20%]">
                Type
              </th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/70">
                Metadata
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="hover:bg-cyan-500/[0.04] transition-colors"
              >
                <td className="px-3 py-3 text-slate-100 font-semibold font-mono text-sm align-top">
                  {row.name || row.id}
                </td>
                <td className="px-3 py-3 align-top">
                  {row.type ? (
                    <span className="inline-flex px-2 py-0.5 rounded font-mono text-[10px] uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      {row.type}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-300 text-sm align-top">
                  {row.description || (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer — matches chart pattern */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50">Rows:</span>
          <span>{data.length}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * MarkdownRenderer — KNOWLEDGE_DOCUMENT archetype render.
 *
 * Rebuilt 2026-06-26 (user feedback iterations):
 *   - v1 was a bare div with `prose-invert prose-slate` defaults
 *     — "looks like it's not even markdown."
 *   - v2 added glass-panel container + cyan-themed `prose-*`
 *     modifiers. Those did NOTHING because `@tailwindcss/typography`
 *     isn't installed in this project (Tailwind v4 setup, no
 *     plugin) — every `prose` class was a no-op. Markdown rendered
 *     as plain unstyled HTML; "everything in bright white, all the
 *     same, hard to read."
 *   - v3 (current) — drop the plugin dependency entirely. Pass a
 *     `components` map to react-markdown so each HTML element gets
 *     its own Tailwind classes directly. Full control, zero plugin
 *     dependency, every element actually styled.
 *
 * Color discipline:
 *   - Headings: white bold; h1/h2 get a cyan-500/20 underline.
 *   - Body paragraphs: slate-200 (calmer than white; easier on eyes).
 *   - Strong: white (lifted from body for visible bold).
 *   - Em: cyan-200 italic (the registry's accent for emphasis).
 *   - Inline code: cyan-300 on cyan-500/10 ground, monospace.
 *   - Code blocks: slate-950/60 with cyan-500/10 border.
 *   - Links: cyan-400, hover cyan-300, medium weight.
 *   - Blockquote: cyan-500/40 left border, slate-300.
 *   - Lists: slate-200 text, cyan bullet markers.
 *   - Tables: cyan-400/80 uppercase tracking-widest headers
 *     (matches SupplyTable language), slate-200 cells, subtle
 *     dividers.
 *
 * The body color is deliberately NOT pure white. White body text on
 * dark backgrounds reads as "yelling" once volume gets above a few
 * lines — slate-200 keeps long-form content scannable.
 */
const MarkdownRenderer = ({
  content,
  subject,
}: {
  content: string;
  subject?: string;
}) => {
  const wordCount = content
    ? content.split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
      {/* Header — matches ChartWidget / topology / table */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {subject || "Knowledge Document"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold flex items-center gap-2">
          <FileText className="w-3 h-3" />
          Knowledge Document · {wordCount} {wordCount === 1 ? "word" : "words"}
        </p>
      </div>

      {/* Markdown body — each HTML element mapped to a styled component */}
      <div className="text-sm leading-relaxed">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-white tracking-tight border-b border-cyan-500/20 pb-2 mb-4 mt-6 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold text-white tracking-tight border-b border-cyan-500/10 pb-1.5 mb-3 mt-6 first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold text-cyan-100 tracking-tight mb-2 mt-5 first:mt-0">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold text-cyan-200 mb-2 mt-4 first:mt-0">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-slate-200 leading-relaxed my-3">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="text-white font-semibold">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="text-cyan-200 italic">{children}</em>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-medium underline decoration-cyan-500/30 hover:decoration-cyan-400/60 transition-colors"
              >
                {children}
              </a>
            ),
            // react-markdown emits <code> for inline. Block code is
            // wrapped in <pre><code>. We style inline here; the <pre>
            // wrapper handles block presentation, and we reset the
            // inline styling when nested inside it.
            code: ({ className, children, ...rest }) => {
              const isBlock = (className || "").includes("language-");
              if (isBlock) {
                // Inside <pre>; let pre's styling drive the block.
                return (
                  <code
                    className="block font-mono text-[13px] text-cyan-200 leading-relaxed"
                    {...rest}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className="font-mono text-[0.85em] text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-slate-950/60 border border-cyan-500/10 rounded-lg p-4 my-4 overflow-x-auto">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-cyan-500/40 pl-4 my-4 text-slate-300 italic">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-6 my-3 text-slate-200 marker:text-cyan-500/60 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-6 my-3 text-slate-200 marker:text-cyan-500/60 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            hr: () => <hr className="border-cyan-500/20 my-6" />,
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="w-full text-left text-sm border-collapse">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-cyan-500/20">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-white/5">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-cyan-500/[0.04] transition-colors">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/80">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2.5 text-slate-200 align-top">{children}</td>
            ),
            img: ({ src, alt }) => (
              <div className="my-6 rounded-xl overflow-hidden border border-cyan-500/15 bg-black/50 p-2">
                <FederatedImage
                  src={src || ""}
                  alt={alt}
                  className="w-full max-h-[500px] object-contain rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                />
                {alt && (
                  <p className="text-center mt-2 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                    {alt}
                  </p>
                )}
              </div>
            ),
          }}
        >
          {content}
        </Markdown>
      </div>

      {/* Footer — matches chart pattern */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50">Words:</span>
          <span>{wordCount}</span>
        </div>
      </div>
    </div>
  );
};

// Re-export the canonical type from api/types
export type { SemanticUIContainer } from "@/api/types";

interface SemanticInterpreterProps {
  payload: { components: any[] }; // DashboardUI shape
  // The citizen shell passes this at overview zoom: the "dense" preview cap.
  // Dense archetypes (tables) render first N rows + a "⌄ K more" affordance so
  // the frame scales by width, not height. Unset (focus/full view) = render all.
  previewRows?: number;
}

// Render a single semantic component by archetype
const renderComponent = (
  comp: any,
  onPublish: (sql: string, title: string) => void,
  previewRows?: number,
) => {
  switch (comp.archetype) {
    case "PROCESS_TOPOLOGY":
      // Redesigned 2026-06-26 — clean horizontal flow of blocks +
      // connectors instead of ReactFlow/WorkflowCanvas's
      // cyberpunk-theatrical render (circle triggers with pulse
      // rings, glitch hover, three-color palette). The new
      // ProcessTopologyCard matches the ChartWidget's visual language
      // (glass-panel, cyan accent, geometric blocks). See its
      // module docstring for the design.
      return (
        <ProcessTopologyCard
          subject_concept={comp.subject_concept}
          nodes={comp.nodes || []}
          edges={comp.edges || []}
        />
      );

    case "HAZARD_DECLARATION":
      return (
        <WarningCard
          error={comp.subject_concept}
          hazards={comp.hazards}
          // Pass the full severity through (was: isCritical boolean).
          // The card now renders the severity as a small chip rather
          // than a hardcoded "STRUCTURAL RISK ALERT" / "SAFETY
          // CONSTRAINT" header — those leaked a military/structural
          // domain assumption that doesn't generalize. See
          // WarningCard's module docstring.
          severity={comp.severity}
        />
      );

    case "ASSET_STATE_METRIC":
      return (
        <SupplyTable
          data={comp.metrics}
          subject={comp.subject_concept}
        />
      );

    case "KNOWLEDGE_DOCUMENT":
      return (
        <MarkdownRenderer
          content={comp.markdown_content}
          subject={comp.subject_concept}
        />
      );

    case "CHART_WIDGET":
      return (
        <ChartWidget
          data={comp.chart_data}
          type={comp.chart_type}
          subject={comp.subject_concept}
          sql={comp.sql_query}
          // Declared by the producer, never inferred here — the axis says "$" only when the
          // answer says it is money. See ChartWidget.contract.ts `value_unit`.
          valueUnit={comp.value_unit}
          onPublish={onPublish}
        />
      );

    case "GROUPED_REVIEW":
      // PCN/PDN part-obsolescence grouped review — one approver resolves N
      // affected parts in a single accept-all-with-exceptions action. `comp.batch`
      // is the server-side per-approver-filtered ReviewBatch (Seal 2). On the
      // canvas this is a task-card; onResolved settles the task in the timeline
      // (the sealed submission path inside GroupedReviewTable is unchanged).
      return (
        <GroupedReviewTable
          batch={comp.batch}
          onResolved={() => markTaskResolvedByTaskId(comp.batch.batch_id)}
          maxPreviewRows={previewRows}
        />
      );

    case "APPROVAL_TASK":
      // A non-grouped HITL task (qualification / workflow_ack / access_request)
      // as a canvas card — accept/reject through the same sealed /act bridge.
      return <ApprovalTaskCard task={comp.task} />;

    case "TRIAGE_TASK":
      // A THIRD SPECIES: an input the pipeline could NOT prepare, not a decision.
      // Acknowledge (reason required) / Re-drive — never approve/reject, which the
      // API also refuses (422). This card shipped as APPROVAL_TASK first, and the
      // buttons it inherited would have written provenance the data cannot
      // represent. See docs/plans/triage-card-archetype.md (invincible-agent).
      return <TriageTaskCard task={comp.task} />;

    case "WORKFLOW_OBSERVATION":
      // "Watch my workflow" — the read-only, gated domain view of a running
      // workflow. `comp.projection` is the observer-facing ObservationProjection
      // (no redactions — audit-only, stripped server-side per slice-3 §6).
      return <WorkflowObservationView projection={comp.projection} />;

    case "INSTANCES_BY_PROPERTY":
      // GENERIC "instances of a class, filtered by one property" table. The PCN
      // parts-by-disposition-state dashboard is its first instance — everything
      // domain-specific is in the payload VALUES (columns/rows/vocabulary), the
      // widget knows none of it. `comp` IS the InstancesByPropertyPayload.
      return <InstancesByPropertyView payload={comp} />;

    case "PERIOD_SERIES":
      // A LIVE VIEW (ADR-0042) — content is a function of mutable plan state and is replaced
      // wholesale on re-evaluation. Structural, not domain: the payload carries its own
      // labels and this renderer draws a series of periods against a threshold, so a second
      // question of the same shape needs no code here.
      //
      // Registered so it is ADDRESSABLE. Without its binding a period series is not refused,
      // it is ABSORBED — probed 2026-08-21, a [{period,total}] payload satisfied CHART_WIDGET
      // and drew as a bar chart with `presentation_source: "registered"`. Only
      // `selection_basis` said otherwise.
      return (
        <PeriodSeries
          rows={comp.rows}
          scope_label={comp.scope_label}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );

    case "DECISION_RECORD":
      // NOT a live view — the only planning card that is not. It describes an ACT, at a time,
      // by a named actor, and recomputing it would let the record drift with the state it was
      // decided against. `acted_at` is a fact, not a freshness stamp.
      return (
        <DecisionRecord
          decision={comp.decision}
          ops={comp.ops}
          alternatives={comp.alternatives}
          question_trail={comp.question_trail}
          scope_label={comp.scope_label}
        />
      );

    case "INTERVAL_TIMELINE":
      // A LIVE VIEW (ADR-0042). Nested intervals whose TOP LEVEL MEANING is stated by the
      // payload (`group_kind`), never inferred here — guessing from whether an id looks like
      // one thing or another is how a capability pivot silently renders as an initiative one.
      //
      // The drop is REFUSED by the component and disposed server-side; no op is applied
      // locally. See IntervalTimeline.tsx for why the library's `update-task` is the commit
      // and `move-task` (the docs' example) is not.
      return (
        <IntervalTimeline
          rows={comp.rows}
          milestones={comp.milestones}
          scope_label={comp.scope_label}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
          // THE DRAG'S COMMIT. Wired here rather than inside the component, because WHICH
          // SCENARIO a drag lands in is app state, not card state — and the card must stay
          // renderable by anything holding rows, including tests and a storybook.
          //
          // `comp.state_ref` is what the drag commits against: a card evaluated against a
          // scenario drags THERE, and a baseline-evaluated card forks a sandbox first, because
          // Engine P refuses a schedule op on baseline by design.
          onMoveProject={(move) =>
            void commitDrag({
              stateRef: comp.state_ref,
              projectId: move.project_id,
              start: move.start,
              end: move.end,
            })
          }
        />
      );

    case "SHORTFALL_GRID":
      // A LIVE VIEW (ADR-0042). Subjects x periods, secured against needed. Its colour means
      // DEFICIT -> RISK, which is why it is not THRESHOLD_GRID (breach -> danger, where
      // over_threshold would have to carry true for "under") and not MATRIX_GRID (distance ->
      // progress, which would make money wear level's name). Structural: the payload's first
      // consumer is org funding gaps and nothing here knows that word.
      return (
        <ShortfallGrid
          rows={comp.rows}
          value_label={comp.value_label}
          value_unit={comp.value_unit}
          scope_label={comp.scope_label}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );

    case "THRESHOLD_GRID":
      // A LIVE VIEW (ADR-0042). Subjects x periods against a threshold each subject OWNS —
      // structural, so the payload's first consumer (site change-load) is invisible here.
      return (
        <ThresholdGrid
          rows={comp.rows}
          value_label={comp.value_label}
          scope_label={comp.scope_label}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );

    case "MATRIX_GRID":
      // A LIVE VIEW (ADR-0042). Rows x columns of a level against a PER-CELL target. Distinct
      // from THRESHOLD_GRID on purpose: that one asks "is this over a line" (a breach, read as
      // danger), this one asks "how far from the goal" (a distance, read as progress). One
      // colour ramp cannot serve both readings of the same hue.
      return (
        <MatrixGrid
          rows={comp.rows}
          level_label={comp.level_label}
          scope_label={comp.scope_label}
          as_of={comp.as_of}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );

    case "DELTA_SET":
      // INV-3's card and a LIVE VIEW (ADR-0042). Renders a COMPARISON, never a state: the
      // room sees the price of a change beside its benefit, which a before-and-after leaves
      // the reader to work out. Magnitudes are displayed VERBATIM — one place formats them.
      return (
        <DeltaSet
          effects={comp.effects}
          scope_label={comp.scope_label}
          baseline_label={comp.baseline_label}
          headline={comp.headline}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );

    // DIGITAL_TWIN_3D dispatch removed 2026-06-26 — falls through to
    // the "UI COMPONENT NOT FOUND" default render (honest: tells the
    // truth about archetypes the registry doesn't currently handle).
    // The widget file at `../mesh/DigitalTwinWidget.tsx` is preserved
    // for the future revisit.

    default:
      // ACTED ON, not drawn — and therefore not missing.
      //
      // The registry has a category for answers nothing renders: a binding declares a
      // `consumer` instead of a `component`, and CANVAS_SEED`s contract says outright that
      // "nothing renders that answer as a card". The interpreter was never told, so the one
      // archetype the model deliberately has no component for reported itself as a component
      // that could not be found — an alarm raised by a successful operation.
      //
      // The contract`s own header refuses to invent a placeholder component, calling that
      // `classification-is-not-existence committed on purpose`. This is the inverse error and
      // worth naming as one: claiming something is ABSENT when nothing was ever meant to be
      // there. Both mistake the map for the territory; they just point opposite ways.
      if (isActedOn(comp.archetype)) {
        // A bespoke receipt where one exists; the category fallback where one does not. The CASE
        // is the PRESENTATION, never the escape from the alarm — the not-found branch is avoided
        // by the CATEGORY check above it, so the next consumer binding is covered the day it is
        // declared even though nobody has written it a card yet.
        if (comp.archetype === "CANVAS_SEED") return <CanvasSeedReceipt comp={comp} />;
        // WHAT THIS MAY AND MAY NOT SAY. It states what the answer IS — a seed carrying N
        // ids — and never that the act HAPPENED. A historical seed re-read on a later page
        // load places nothing (the consumer primes its seen-set at mount so scrollback cannot
        // re-seed), so "seeded 5 cards" would be false on exactly the rows most likely to be
        // read. The count is verbatim from the payload; the destination is not in the payload
        // at all and is not guessed.
        const ids = Array.isArray(comp.artifact_ids) ? comp.artifact_ids.length : null;
        return (
          <div className="p-4 glass-panel flex items-start gap-3">
            <Zap className="w-4 h-4 text-teal-400/70 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-mono text-xs text-slate-300">
                {comp.archetype}
                {ids !== null ? ` · ${ids} artifacts` : ""}
              </p>
              <p className="font-mono text-[10px] text-slate-500">
                Acted on rather than drawn — the cards it placed are the visible result.
              </p>
            </div>
          </div>
        );
      }
      return (
        <div className="p-4 glass-panel border-amber-500/30 flex flex-col gap-3">
          <div className="flex items-start gap-3 border-b border-amber-500/20 pb-3">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-mono text-xs text-amber-500 font-bold">UI COMPONENT NOT FOUND: {comp.archetype}</p>
              <p className="font-mono text-[10px] text-slate-400">
                The mesh returned a new UI widget type. Raw data payload is displayed below:
              </p>
            </div>
          </div>
          <div className="bg-black/50 p-3 rounded text-[10px] font-mono text-slate-300 overflow-x-auto max-h-60 overflow-y-auto">
            <pre>{JSON.stringify(comp, null, 2)}</pre>
          </div>
        </div>
      );
  }
};

// Full-width archetypes — the components that need ROW space (a
// table, a chart's x-axis, a process flow, a markdown doc, a 3D
// twin). The 2-column grid would crush these to 50% canvas width
// when the viewport is narrow; the rebuild table and hazard cards
// looked "shrunk" at smaller window sizes specifically because they
// were excluded here. Added 2026-06-26.
const isFullWidth = (archetype: string) =>
  archetype === "PROCESS_TOPOLOGY" ||
  archetype === "KNOWLEDGE_DOCUMENT" ||
  archetype === "CHART_WIDGET" ||
  archetype === "ASSET_STATE_METRIC" ||
  archetype === "HAZARD_DECLARATION" ||
  archetype === "GROUPED_REVIEW" ||
  archetype === "WORKFLOW_OBSERVATION" ||
  archetype === "INSTANCES_BY_PROPERTY" ||
  archetype === "PERIOD_SERIES" ||
  archetype === "THRESHOLD_GRID" ||
  archetype === "SHORTFALL_GRID" ||
  archetype === "MATRIX_GRID" ||
  archetype === "DELTA_SET" ||
  archetype === "INTERVAL_TIMELINE" ||
  archetype === "DECISION_RECORD" ||
  // A sparse APPROVAL_TASK was UNREGISTERED here, so it inherited col-span-1 and
  // rendered as a corner postage-stamp (a half-grid cell) — presentation by
  // accident, not by decision. It fills its frame; the "compact" tier centers it.
  archetype === "APPROVAL_TASK" ||
  // Same reasoning as APPROVAL_TASK above: a sparse card must fill its frame rather
  // than inherit a corner postage-stamp by omission.
  archetype === "TRIAGE_TASK";

export const SemanticInterpreter: React.FC<SemanticInterpreterProps> = ({ payload, previewRows }) => {
  const { personaConfig } = useMeshConfig();

  const handlePublish = async (sql: string, title: string) => {
    // Mock-grounding mode: the publish-to-superset action genuinely
    // requires a live backend (gateway → Analyst Service →
    // Superset). Faking success here would be misleading (nothing
    // actually got published); letting the request fall through
    // produces a confusing CORS error toast. Honest middle path:
    // intercept and tell the user explicitly the action is
    // backend-gated.
    if (isMockGroundingEnabled()) {
      toast.info("Publish requires a live backend", {
        description:
          `Mock-grounding mode is on. ` +
          `"${title}" would publish to Superset via Analyst Service in production.`,
        duration: 6000,
      });
      return;
    }

    const toastId = toast.loading("Publishing to Superset...");
    try {
      const result = await publishToSuperset(sql, title);
      toast.success("Chart Published!", {
        id: toastId,
        description: `View at: ${result.summary}`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Failed to publish chart:", err);
      toast.error("Publication failed", {
        id: toastId,
        description: "The Analyst Service is currently unreachable.",
      });
    }
  };

  if (!payload || !payload.components || !Array.isArray(payload.components)) {
    return null;
  }

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
      {payload.components.map((comp, index) => {
        const persona = comp.source_persona;
        const pCfg = persona ? personaConfig[persona] : null;

        // Use a stable key based on the component data if possible, else fallback to index + archetype
        const stableKey = `${comp.archetype}-${comp.subject_concept}-${index}`;

        return (
          <div
            key={stableKey}
            className={isFullWidth(comp.archetype) ? "col-span-full" : "col-span-1"}
          >
            {/* Persona attribution badge */}
            {pCfg && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${pCfg.bg} ${pCfg.color}`}>
                <DynamicIcon name={pCfg.icon} className="w-3 h-3" />
                {pCfg.label}
              </div>
            )}
            {renderComponent(comp, handlePublish, previewRows)}
          </div>
        );
      })}
    </div>
  );
};
