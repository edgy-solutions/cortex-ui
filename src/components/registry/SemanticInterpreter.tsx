import React from "react";
import { AlertCircle, Zap } from "lucide-react";

// Lazy-loaded or imported directly for interpretation
import { WarningCard } from "../NeuralStream/WarningCard";
import { isActedOn } from "@/registry/actedOnArchetypes";
import { CanvasSeedReceipt } from "./CanvasSeedReceipt";
import { ForecastMeasure } from "../planning/ForecastMeasure";
import { archetypePackage } from "@/archetypes/registry";
import { RawFields } from "@/archetypes/RawFields";
import { rawFieldsOf } from "@/lib/rawFields";
import { pick } from "@/archetypes/defineArchetype";
import { carriesItsRequest } from "@/lib/fallbackDisclosure";
import { AskCardConnected } from "../elicitation/AskCardConnected";
import { RefusalCard } from "./RefusalCard";
import { readRefusalEnvelope } from "@/lib/refusalEnvelope";
import { NamedHole } from "./NamedHole";
import { SourceLedger } from "../ledger/SourceLedger";
import { StepLadder } from "../planning/StepLadder";
import { useMeshConfig, DynamicIcon } from "@/lib/meshPersonaConfig";
import { ChartWidget } from "../mesh/ChartWidget";
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
import { ThresholdGrid } from "@/components/planning/ThresholdGrid";
import { MatrixGrid } from "@/components/planning/MatrixGrid";
import { IntervalTimeline } from "@/components/planning/IntervalTimeline";
import { commitDrag } from "@/lib/planDrag";
import { DecisionRecord } from "@/components/planning/DecisionRecord";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";
import { publishToSuperset } from "@/api/client";
import { isMockGroundingEnabled } from "@/lib/mockGroundingEmitter";
import { toast } from "sonner";
import { ProvenanceFloorLabel } from "@/components/ingest/ProvenanceFloorLabel";
import { OriginUnresolvedBanner } from "@/components/ingest/OriginUnresolvedBanner";

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
 * MarkdownRenderer (KNOWLEDGE_DOCUMENT) moved to `src/archetypes/knowledge-document/Card.tsx`
 * — ADR-0055 step 2. The dispatch below (`case "KNOWLEDGE_DOCUMENT":`) is the packaged
 * pattern; see that file for the component itself and `knowledgeDocumentView.ts` (moved
 * alongside it) for the routing between pages / abstain / plain markdown.
 */

// Re-export the canonical type from api/types
export type { SemanticUIContainer } from "@/api/types";

interface SemanticInterpreterProps {
  payload: { components: any[] }; // DashboardUI shape
  /**
   * WHICH ARTIFACT THESE COMPONENTS BELONG TO — threaded explicitly, and it must never be read
   * from "the current artifact" instead.
   *
   * An ask card answers by claiming lineage to the artifact it is ON, and on a canvas several
   * artifacts render at once while exactly one is current. A component that asked the store
   * which artifact is selected would attach a pick to whichever card the reader happened to
   * have focused — and the server MERGEs on that id, so a wrong parent is not a wrong edge but
   * a CONJURED node. The one component that needs this is the one place it is passed.
   *
   * Absent on surfaces that render components outside an artifact; the ask card then claims no
   * lineage, which is the honest outcome rather than a guessed one.
   */
  artifactId?: string;
  // The citizen shell passes this at overview zoom: the "dense" preview cap.
  // Dense archetypes (tables) render first N rows + a "⌄ K more" affordance so
  // the frame scales by width, not height. Unset (focus/full view) = render all.
  previewRows?: number;
  /**
   * Suppress the per-component persona badge, because the SURFACE is already showing it.
   *
   * A canvas card renders the persona as a small tag in its own eyebrow, beside the subject
   * and verb, where it costs nothing. The badge here is a block above the component and costs
   * a full row of a card that is already short of vertical — the same row the interpretation
   * strip used to cost before it moved to the footer.
   *
   * A PROP AND NOT A DELETION. Surfaces that are not cards — the pane, a pinned answer — have
   * no eyebrow to put it in, and for them the badge is the only attribution there is.
   */
  hidePersona?: boolean;
}

// Render a single semantic component by archetype
const renderComponent = (
  comp: any,
  onPublish: (sql: string, title: string) => void,
  previewRows?: number,
  // Threaded rather than read from the store — see `artifactId` on the props. Only the ask
  // card uses it, and only to claim lineage to the artifact it is ON.
  artifactId?: string,
) => {
  // THE REFUSAL GATE (PR #13). Keyed on the envelope, not an archetype list: a refused projected
  // component carries `rows: []` and would otherwise draw its own empty state ("no contributors
  // recorded"), which reads as "no failures".
  const refusal = readRefusalEnvelope(comp);
  if (refusal)
    return (
      <RefusalCard
        envelope={refusal}
        archetype={comp.archetype}
        scopeLabel={typeof comp.scope_label === "string" ? comp.scope_label : undefined}
      />
    );

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

    case "KNOWLEDGE_DOCUMENT": {
      // ADR-0055 step 2 — packaged. `knowledgeDocumentView`'s three-way routing (pages /
      // abstain / plain markdown) now lives inside the Card itself; see
      // `src/archetypes/knowledge-document/Card.tsx`.
      const pkg = archetypePackage("KNOWLEDGE_DOCUMENT");
      if (!pkg) break;
      const MarkdownRenderer = pkg.Card;
      return (
        <MarkdownRenderer
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
        />
      );
    }

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

    case "SHORTFALL_GRID": {
      // A LIVE VIEW (ADR-0042). Subjects x periods, secured against needed. Its colour means
      // DEFICIT -> RISK, which is why it is not THRESHOLD_GRID (breach -> danger, where
      // over_threshold would have to carry true for "under") and not MATRIX_GRID (distance ->
      // progress, which would make money wear level's name). Structural: the payload's first
      // consumer is org funding gaps and nothing here knows that word.
      //
      // ADR-0055 §2 — packaged. Same data-driven dispatch as CONTRIBUTION_RANKING:
      // `valid_as_of`/`state_version` are passed explicitly, OUTSIDE `pick(reads)` — the
      // producer carries that pair "for every archetype", never in a per-archetype tuple.
      const pkg = archetypePackage("SHORTFALL_GRID");
      if (!pkg) break;
      // Bound to the package's own component name — see the COMPETING_MEASURES case's note on
      // `assembleCapabilities.test.ts`'s JSX-tag scan.
      const ShortfallGrid = pkg.Card;
      return (
        <ShortfallGrid
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );
    }

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

    case "STEP_LADDER":
      // A price built up by striking factors IN ORDER. Not a ranking — see the contract: each
      // step's basis descends from the ones before it, so sorting would break the walk and
      // assert a magnitude order nobody stated.
      return <StepLadder component={comp} scope_label={comp.scope_label} />;

    case "SOURCE_LEDGER":
      // N sources, EVERY ONE ACCOUNTED FOR — a row per source whatever happened to it, so
      // "three sources, one of which said nothing" is distinguishable from "two sources". The
      // card keys on each row's own disposition and never on which dispositions are PRESENT:
      // a `fail`-refusal producer cannot emit a hole at all, so a hole-free ledger is ordinary.
      return <SourceLedger component={comp} />;

    case "NAMED_HOLE":
      // ADR-0050 §5. NOT an answer and NOT an empty card: a panel the template declared and
      // this caller may not invoke. Blank already means "nothing was captured" on these
      // surfaces, so the hole has to be a present card saying the opposite thing.
      return <NamedHole component={comp} />;

    case "ELICITATION":
      // A QUESTION, NOT AN ANSWER. It fell through to KNOWLEDGE_DOCUMENT before this case
      // existed, which put a request for input in the answer rail wearing a document's frame.
      // The component draws no card chrome for the same reason.
      return <AskCardConnected component={comp} answeringArtifactId={artifactId} />;

    case "MULTI_SERIES": {
      // Several DECLARED series over the same periods, no cap. NOT PERIOD_SERIES, which is one
      // producer's cost curve wearing a generic name — seven required keys, hardcoded capex and
      // expense bars, an "over by" column against a cap. See the package's contract.ts.
      //
      // ADR-0055 §2 — packaged. Same data-driven dispatch as CONTRIBUTION_RANKING:
      // `valid_as_of`/`state_version` are passed explicitly, OUTSIDE `pick(reads)` — the
      // producer carries that pair "for every archetype", never in a per-archetype tuple.
      const pkg = archetypePackage("MULTI_SERIES");
      if (!pkg) break;
      // Bound to the package's own component name — see the COMPETING_MEASURES case's note on
      // `assembleCapabilities.test.ts`'s JSX-tag scan.
      const MultiSeries = pkg.Card;
      return (
        <MultiSeries
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );
    }

    case "VARIANCE_TREE": {
      // THE FIRST ARCHETYPE WITH DEPTH. Nothing in the projection arm nests, and nesting is not
      // a field that can be added to a series, a grid or a ranking — the producer's own words:
      // "the decomposition is the output type rather than a rendering choice".
      //
      // ADR-0055 §2 — packaged. Same data-driven dispatch as CONTRIBUTION_RANKING:
      // `valid_as_of`/`state_version` are passed explicitly, OUTSIDE `pick(reads)` — the
      // producer carries that pair "for every archetype", never in a per-archetype tuple.
      const pkg = archetypePackage("VARIANCE_TREE");
      if (!pkg) break;
      // Bound to the package's own component name — see the COMPETING_MEASURES case's note on
      // `assembleCapabilities.test.ts`'s JSX-tag scan.
      const VarianceTree = pkg.Card;
      return (
        <VarianceTree
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );
    }

    case "COMPETING_MEASURES": {
      // N METHODS MEASURING ONE QUANTITY, where the SPREAD is the finding. The plural of
      // FORECAST_MEASURE — whose own contract says "a list of them is a series, which is a
      // different archetype" and whose header names this exact three-way disagreement as its
      // reason to exist. Not MATRIX_GRID, which is the closest fit and would draw every figure
      // while withholding the finding: a spread spans ROWS and a matrix renders cells.
      //
      // ADR-0055 — the first package. Dispatch is data-driven off the registry rather than a
      // hand-written prop list: `pkg.row.payload_key` names the rows prop and `pkg.reads` is
      // exactly the envelope fields this archetype is given (never the whole `comp`, and never
      // the wider `row.passthrough` the wire declares but this card does not consume — see the
      // package's `index.ts`). Envelope facts are read from the component, never recomputed from
      // the rows — see the contract's `spreadIsUpstream`.
      const pkg = archetypePackage("COMPETING_MEASURES");
      if (!pkg) break; // Should not happen outside a test that stubs the registry — falls to the
      // "UI COMPONENT NOT FOUND" panel below, same as any other unregistered archetype.
      // Bound to the package's own component name, not a generic placeholder — not only for
      // readability: `assembleCapabilities.test.ts` derives "what the interpreter dispatches" by
      // scanning this file's source for the JSX tag opened after each `case`, and a shared
      // placeholder name would read as every registry-backed archetype dispatching one component.
      const CompetingMeasures = pkg.Card;
      return (
        <CompetingMeasures
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
        />
      );
    }

    case "WORKFLOW_CASE": {
      // ADR-0055's second package. Same data-driven dispatch as COMPETING_MEASURES, same reason
      // for the local PascalCase binding below (assembleCapabilities.test.ts's JSX-tag scan).
      const pkg = archetypePackage("WORKFLOW_CASE");
      // No case object, nothing to decide and nothing to draw — the card would read
      // `subject_ref` off undefined. Same rule the fallback split applies (`carriesItsRequest`).
      if (!pkg || !carriesItsRequest(comp, pkg.id)) break;
      const WorkflowCase = pkg.Card;
      return (
        <WorkflowCase
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
        />
      );
    }

    case "ILLUSTRATION": {
      // ADR-0055, cortex-proposed (see contract.ts's header). Same data-driven dispatch as
      // WORKFLOW_CASE, same reason for the local PascalCase binding below
      // (assembleCapabilities.test.ts's JSX-tag scan).
      const pkg = archetypePackage("ILLUSTRATION");
      // No illustration object, nothing to decide and nothing to draw — the card would read
      // `icn` off undefined. Same presence rule WORKFLOW_CASE applies (`carriesItsRequest`).
      if (!pkg || !carriesItsRequest(comp, pkg.id)) break;
      const Illustration = pkg.Card;
      return (
        <Illustration
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
        />
      );
    }

    case "CONTRIBUTION_RANKING": {
      // N entities ordered by their share of one total. NOT a DELTA_SET: that is N metrics with
      // one comparison, grouped by direction and deliberately unordered. Here the order IS the
      // answer and `share_of_total` has no slot there — see the contract's axis test.
      //
      // ADR-0055 §2 — packaged. Same data-driven dispatch as COMPETING_MEASURES/WORKFLOW_CASE/
      // ILLUSTRATION: `pkg.row.payload_key` names the rows prop and `pkg.reads`
      // (`CONTRIBUTION_RANKING_ENVELOPE_FIELDS`) is exactly the 5 envelope fields this card
      // reads — never `verdict`/`method`, which the producer's tuple carries
      // (`agent_fleet/presentation_agent/main.py:850`, mirrored at `row.ts`) but this card does
      // not consume.
      //
      // `valid_as_of`/`state_version` are passed explicitly, OUTSIDE `pick(reads)` — the
      // producer carries that pair "for every archetype", never as a per-archetype passthrough
      // entry (see `main.py`'s own comment at the `state_ref`/`state_version` loop), so they are
      // not part of this package's declared row either.
      const pkg = archetypePackage("CONTRIBUTION_RANKING");
      if (!pkg) break;
      // Bound to the package's own component name, not a generic placeholder — see the
      // COMPETING_MEASURES case's note on `assembleCapabilities.test.ts`'s JSX-tag scan.
      const ContributionRanking = pkg.Card;
      return (
        <ContributionRanking
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );
    }

    case "FORECAST_MEASURE":
      // ONE forecast, and the METHOD that produced it — rendered together, or not at all.
      // Engine F's three EAC formulas span about 14% of the budget on the same program, which
      // is why its method slot is mandatory and the router refuses a bare ask. A card showing
      // the figure without the method would make that choice silently at the last step.
      return (
        <ForecastMeasure
          rows={comp.rows}
          value_unit={comp.value_unit}
          scope_label={comp.scope_label}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );

    case "DELTA_SET": {
      // INV-3's card and a LIVE VIEW (ADR-0042). Renders a COMPARISON, never a state: the
      // room sees the price of a change beside its benefit, which a before-and-after leaves
      // the reader to work out. Magnitudes are displayed VERBATIM — one place formats them.
      //
      // ADR-0055 §2 — packaged. Same data-driven dispatch as CONTRIBUTION_RANKING:
      // `valid_as_of`/`state_version` are passed explicitly, OUTSIDE `pick(reads)` — the
      // producer carries that pair "for every archetype", never in a per-archetype tuple.
      const pkg = archetypePackage("DELTA_SET");
      if (!pkg) break;
      // Bound to the package's own component name — see the COMPETING_MEASURES case's note on
      // `assembleCapabilities.test.ts`'s JSX-tag scan.
      const DeltaSet = pkg.Card;
      return (
        <DeltaSet
          {...{
            [pkg.row.payload_key]: comp[pkg.row.payload_key],
            ...pick(comp, pkg.reads),
          }}
          valid_as_of={comp.valid_as_of}
          state_version={comp.state_version}
        />
      );
    }

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
        if (comp.archetype === "CANVAS_SEED")
          return <CanvasSeedReceipt comp={comp} artifactId={artifactId} />;
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
  archetype === "FORECAST_MEASURE" ||
  archetype === "CONTRIBUTION_RANKING" ||
  archetype === "COMPETING_MEASURES" ||
  archetype === "VARIANCE_TREE" ||
  archetype === "MULTI_SERIES" ||
  archetype === "INTERVAL_TIMELINE" ||
  archetype === "DECISION_RECORD" ||
  // A sparse APPROVAL_TASK was UNREGISTERED here, so it inherited col-span-1 and
  // rendered as a corner postage-stamp (a half-grid cell) — presentation by
  // accident, not by decision. It fills its frame; the "compact" tier centers it.
  archetype === "APPROVAL_TASK" ||
  // Same reasoning as APPROVAL_TASK above: a sparse card must fill its frame rather
  // than inherit a corner postage-stamp by omission.
  archetype === "TRIAGE_TASK" ||
  // WORKFLOW_CASE's multi-section layout (header, stages, history, options, approval
  // chain, artifact) needs the full row on a narrow viewport, same as COMPETING_MEASURES.
  archetype === "WORKFLOW_CASE" ||
  // ILLUSTRATION's contract declares "full-width" (contract.ts) — a drawn SVG wants the row,
  // same reasoning as the two above.
  archetype === "ILLUSTRATION";

export const SemanticInterpreter: React.FC<SemanticInterpreterProps> = ({ payload, previewRows, hidePersona, artifactId }) => {
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
            {/* Persona attribution. Sized as a TAG, not a button: it is a label on the answer,
                not something to press, and at the previous 10px/bold/2.5-padding it read as the
                loudest element on a card whose actual content is a chart. */}
            {pCfg && !hidePersona && (
              <div className={`inline-flex items-center gap-1 px-1.5 py-px mb-1 rounded border text-[8px] font-mono uppercase tracking-widest ${pCfg.bg} ${pCfg.color}`}>
                <DynamicIcon name={pCfg.icon} className="w-2.5 h-2.5" />
                {pCfg.label}
              </div>
            )}
            {/* ADR-0041 §7: the provenance-floor label, above EVERY archetype's own
                rendering — archetype-agnostic by construction, not a per-case addition.
                `ProvenanceFloorLabel` self-guards via `readProvenanceFloor` and draws nothing
                when `comp.provenance_floor` is absent or unreadable (field renamed by the
                2026-09-30 dispatch — see ingestWire.ts for the prior name). */}
            <ProvenanceFloorLabel component={comp} />
            {/* CORTEX-PROPOSED ORIGIN (`src/lib/ingestOrigin.ts`) — same mount site as
                `ProvenanceFloorLabel` immediately above: archetype-agnostic by construction.
                `OriginUnresolvedBanner` self-guards and draws nothing when
                `comp.origin` is absent, malformed, or resolved. */}
            <OriginUnresolvedBanner component={comp} />
            {renderComponent(comp, handlePublish, previewRows, artifactId)}
            {/* THE RAW SECTION — mounted HERE, at the one place every dispatched component passes
                through (package cases, switch cases, the acted-on and not-found defaults, and the
                `break` fall-throughs alike), never per branch. The human's 2026-10-07 ruling
                (ADR-0055 amendment requested of Lane 1). `no_declaration` draws nothing. */}
            {(() => {
              const raw = rawFieldsOf(comp);
              return raw.status === "raw" ? <RawFields fields={raw.fields} /> : null;
            })()}
          </div>
        );
      })}
    </div>
  );
};
