import { useMemo } from 'react';
import { useCanvasStore, useCurrentArtifact, useCurrentRouting } from '../../store/useCanvasStore';
import { useStageStore } from '@/store/useStageStore';
import { SemanticInterpreter } from '../registry/SemanticInterpreter';
import { useMeshConfig, DynamicIcon } from '@/lib/meshPersonaConfig';
import { Layers, Route } from 'lucide-react';
import { InlineFigures } from './InlineFigures';
import { DecisionMap } from './DecisionMap';
import { WorkflowLens } from './WorkflowLens';
import { taskKindLabel } from '@/lib/taskArtifact';

/**
 * CanvasPane — view OVER the artifact collection per ADR-0023.
 *
 * Reads the foregrounded artifact via `useCurrentArtifact` and renders
 * its `rendered_output.components`. The render component contract
 * (SemanticInterpreter consuming a components array) is unchanged from
 * the pre-collection shape; only the source-of-truth path changes
 * (previously: useCanvasStore.activeComponents single slot;
 * now: the current artifact's rendered_output.components).
 *
 * Pending artifacts render the "awaiting" state — that's the
 * create-pending half of the responsiveness flow (acceptance #2) made
 * visible. Once `useInterviewAgent` calls `updateArtifact(id, {
 * status: "complete", rendered_output: { components } })`, the canvas
 * lights up.
 *
 * Prior artifacts in the collection are NOT shown by this component
 * today — Phase 1 keeps a "current artifact foregrounded" shape so
 * the canvas-as-collection is structurally correct without committing
 * to a specific UI metaphor (tabs / projects / free-spatial — deferred
 * per ADR-0023 §"What stays deferred"). The collection IS there in
 * the store; surfacing prior artifacts is a Phase 2/UI-cleanup arc
 * decision.
 */
export const CanvasPane = () => {
  const { personaConfig } = useMeshConfig();
  const artifact = useCurrentArtifact();
  const routing = useCurrentRouting();
  // Two PEER views of one artifact: the composed Answer, and the Decision
  // Map (how the engine got there). Tabs express "two equal lenses", not a
  // slide-in annotation — and the map gets the full canvas it needs.
  // The Answer / Decision-Map peer view is SHARED with the camera-stage focus
  // tab (useStageStore.focusTab): entering full-pane keeps whichever view you
  // were on when zoomed in, and toggling here persists back to the focus
  // overlay. (Aliased as view/setView so the rest of this file is unchanged.)
  const view = useStageStore((s) => s.focusTab);
  const setView = useStageStore((s) => s.setFocusTab);
  const activeTab = useCanvasStore((s) => s.activeTab);
  const setActiveTab = useCanvasStore((s) => s.setActiveTab);
  const artifactCount = useCanvasStore((s) => s.artifacts.length);
  const currentIndex = useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return -1;
    return s.artifacts.findIndex((a) => a.id === id);
  });

  // The components for the current artifact (empty until status=complete
  // and rendered_output is populated).
  const components = useMemo<any[]>(() => {
    return (artifact?.rendered_output?.components as any[] | undefined) ?? [];
  }, [artifact]);

  // 1. Extract unique personas from the current artifact's components.
  const uniquePersonas = useMemo(() => {
    const personas = new Set<string>();
    components.forEach((comp: any) => {
      if (comp?.source_persona) personas.add(comp.source_persona);
    });
    return Array.from(personas);
  }, [components]);

  // 2. Filter components based on active tab.
  const filteredComponents = useMemo(() => {
    if (activeTab === "ALL") return components;
    return components.filter((comp: any) => comp?.source_persona === activeTab);
  }, [components, activeTab]);

  // Honest empty/transitional states per ADR-0023 lifecycle:
  // - no current artifact → "Awaiting Mesh Artifacts" (true empty)
  // - artifact pending → "Working on it…" (live, working)
  // - artifact failed → "This attempt failed." (honest — the turn
  //   happened but produced no canvas content; the routing card may
  //   still show what was tried; the failure is the answer, not a
  //   silent looks-like-nothing-happened)
  // - artifact complete with 0 components → "No components produced."
  //   (honest "finalized empty" — distinguishable from pending)
  if (!artifact) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950/50 border-l border-white/10">
        <p className="font-mono text-slate-600 text-xs tracking-widest uppercase">
          Awaiting Mesh Artifacts...
        </p>
      </div>
    );
  }

  // A TASK is not an answer — NONE of the answer chrome (no "Q·" header, no
  // persona sub-tabs). But the three tabs are citizen-agnostic LENSES
  // (content / provenance / focus), so a task keeps them, relabeled: the content
  // lens is its archetype card (Review / Task), the provenance lens is the
  // Workflow (the task-side peer of an answer's Decision Map). Same citizenship,
  // its own costume + its own nouns.
  if (artifact.task_ref) {
    const taskRef = artifact.task_ref;
    const onWorkflow = view === "map";
    return (
      <div className="h-full w-full bg-slate-900 border-l border-white/10 flex flex-col">
        <div className="w-full flex items-center px-6 pt-4 pb-2 border-b border-white/5 gap-2 shrink-0">
          <button
            onClick={() => setView("answer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold ${
              !onWorkflow ? "border-neon-pink text-neon-pink bg-neon-pink/10" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
            }`}
          >
            <Layers className="w-4 h-4" />
            {taskKindLabel(taskRef.kind)}
          </button>
          <button
            onClick={() => setView("map")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold ${
              onWorkflow ? "border-neon-cyan text-neon-cyan bg-neon-cyan/10" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
            }`}
          >
            <Route className="w-4 h-4" />
            Workflow
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {onWorkflow ? (
            <WorkflowLens taskRef={taskRef} />
          ) : components.length > 0 ? (
            <SemanticInterpreter payload={{ components }} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="font-mono text-xs tracking-widest uppercase text-slate-500">
                Loading review…
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Question header — sourced from the artifact's own durable
  // `question_text` (projected through Electric, rehydrates on refresh)
  // NOT from `useInterviewStore` (ephemeral messages, gone after reload).
  // Every visible artifact self-describes the prompt that produced it,
  // regardless of whether the chat pane still has the message in memory.
  //
  // Per architect Decision A (overnight 2026-06-27): "This is NOT
  // message-persistence and NOT reconstruction — it is reading the field
  // that already exists from the store that already persists it." The
  // [[fork-a-finding-cortex-ui-vs-adr-0023]] Messages-vs-Artifacts
  // distinction is preserved: Messages still live in
  // useInterviewStore (ephemeral), Artifacts still live in
  // useCanvasStore (durable); we just stopped sourcing the canvas's
  // own header from the wrong store.
  const artifactHeader = (
    <div className="w-full flex items-baseline justify-between px-6 pt-4 pb-2 gap-4 shrink-0 border-b border-white/5">
      <p
        className="font-mono text-xs text-slate-300 truncate"
        title={artifact.question_text}
      >
        <span className="text-slate-500 tracking-widest uppercase mr-2">
          Q
        </span>
        {artifact.question_text || (
          <span className="text-slate-600 italic">no question recorded</span>
        )}
      </p>
      {artifactCount > 1 && (
        <span className="font-mono text-[9px] text-slate-500 tracking-widest uppercase whitespace-nowrap">
          Artifact {currentIndex + 1} of {artifactCount}
        </span>
      )}
    </div>
  );

  if (components.length === 0) {
    const empty =
      artifact.status === "pending"
        ? { label: "Working on it…", tone: "text-slate-500" }
        : artifact.status === "failed"
        ? { label: "This attempt failed.", tone: "text-rose-400/80" }
        : { label: "No components produced.", tone: "text-amber-400/80" };
    return (
      <div className="h-full w-full flex flex-col bg-slate-950/50 border-l border-white/10">
        {artifactHeader}
        <div className="flex-1 flex items-center justify-center">
          <p className={`font-mono text-xs tracking-widest uppercase ${empty.tone}`}>
            {empty.label}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-900 border-l border-white/10 flex flex-col">
      {artifactHeader}
      {/* Tab Navigation — Answer + Decision Map are PEER views of the
          artifact; persona chips sub-filter the Answer. Shows whenever
          there's an answer to filter OR a routing decision to map. */}
      {(uniquePersonas.length > 0 || routing) && (
        <div className="w-full flex items-center px-6 pt-4 pb-2 border-b border-white/5 gap-2 overflow-x-auto hide-scrollbar shrink-0">
          {/* Answer (was "Full Dashboard") */}
          <button
            onClick={() => { setView("answer"); setActiveTab("ALL"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold
              ${view === "answer" && activeTab === "ALL"
                ? "border-neon-blue text-neon-blue bg-neon-blue/10"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
          >
            <Layers className="w-4 h-4" />
            Answer
          </button>

          {/* Decision Map — the coequal "how it got there" lens, sitting
              directly beside Answer as its peer. */}
          {routing && (
            <button
              onClick={() => setView("map")}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold
                ${view === "map"
                  ? "border-neon-cyan text-neon-cyan bg-neon-cyan/10"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
            >
              <Route className="w-4 h-4" />
              Decision Map
            </button>
          )}

          {/* Persona sub-tabs — ONLY when >1 persona actually produced
              components. With a single answering persona the per-persona
              tab just duplicates "Answer", so it's suppressed (that
              redundant tab was the "why is it back" the eye caught). */}
          {uniquePersonas.length > 1 && uniquePersonas.map(personaKey => {
            const config = personaConfig[personaKey];
            if (!config) return null;
            const isActive = view === "answer" && activeTab === personaKey;

            return (
              <button
                key={personaKey}
                onClick={() => { setView("answer"); setActiveTab(personaKey); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold
                  ${isActive
                    ? `border-current ${config.color} ${config.bg}`
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
              >
                <DynamicIcon name={config.icon} className="w-4 h-4" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Content Area — the Answer, or the full-canvas Decision Map. */}
      {view === "map" ? (
        <div className="flex-1 min-h-0">
          <DecisionMap />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {/* SemanticInterpreter handles the grid, col-spans, and
              RadarReveal for the LLM-generated answer body. */}
          <SemanticInterpreter payload={{ components: filteredComponents }} />
          <InlineFigures artifact={artifact} />
        </div>
      )}
    </div>
  );
};
