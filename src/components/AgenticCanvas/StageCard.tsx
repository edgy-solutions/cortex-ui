import { useRef } from "react";
import { GitBranch, GripVertical, X } from "lucide-react";
import type { Artifact } from "@/api/types";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { FitBox } from "./FitBox";
import { AnsweredChip } from "./AnsweredChip";
import { useFlipState } from "./useFlipState";
import { DecisionMap } from "./DecisionMap";
import { useStageStore } from "@/store/useStageStore";
import { answerSPO, answerSummary, isUnresolved } from "@/lib/answerDisplay";
import { taskKindLabel } from "@/lib/taskArtifact";
import { WorkflowLens } from "./WorkflowLens";
import { STAGE_CARD } from "@/lib/stageConstants";
import { overviewTier, DENSE_PREVIEW_ROWS } from "@/lib/overviewTier";
import { InterpretationStrip, FreshnessStamp, hasInterpretation } from "./InterpretationStrip";
import { useMeshConfig, DynamicIcon } from "@/lib/meshPersonaConfig";

export { STAGE_CARD };

/**
 * StageCard — one answer on the camera stage. Renders the ACTUAL answer (reuses
 * SemanticInterpreter over rendered_output.components) at world scale, so the
 * overview shows real content shrunk and focus zooms it to legibility. When
 * this card is the focused one AND the peer-view toggle is on Decision Map, its
 * body swaps to <DecisionMap/> (which reads the current artifact) — that's the
 * "Answer / Decision Map tabs over the zoomed card" requirement.
 *
 * Positioning + camera live in GlobalCanvasStage; this component is presentation
 * only. Single click focuses (handled by parent), double-click → full-pane.
 */
export function StageCard({
  artifact,
  focused,
  onClick,
  onDoubleClick,
  style,
  onGripDown,
  onResizeDown,
  onRemove,
  selected,
  dragIds,
  onDragComplete,
  size,
}: {
  artifact: Artifact;
  focused: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  style: React.CSSProperties;
  /** Custom-canvas mode: a grip to pointer-drag the item within the canvas. */
  onGripDown?: (e: React.PointerEvent) => void;
  /** Custom-canvas mode: drag the corner to resize. Size is arrangement (ADR-0042 section 4)
   *  and persists with the canvas, so this writes through the store like a move does. */
  onResizeDown?: (e: React.PointerEvent) => void;
  /** Custom-canvas mode: remove the item from the canvas. */
  onRemove?: () => void;
  /** Lasso multi-select highlight (global overview). */
  selected?: boolean;
  /** The ids to carry when this card is dragged — the whole selection if this
   *  card is part of it, else just this card. Enables multi-card drag-to-chip. */
  dragIds?: string[];
  /** Called after a successful MULTI drag-drop, so the caller can clear the
   *  lasso selection. */
  onDragComplete?: () => void;
  /** World-space footprint. ADR-0042 §4: size is ARRANGEMENT, owned by the UI and
   *  persisted with the canvas. Absent → the default card size, which is what every
   *  canvas authored before per-item dimensions existed carries. */
  size?: { w: number; h: number };
}) {
  const custom = Boolean(onGripDown || onRemove);
  const focusTab = useStageStore((s) => s.focusTab);
  const spo = answerSPO(artifact);
  const fallback = isUnresolved(artifact);
  // A task wears its own costume, not the answer's: header names the task + its
  // state, not "answer". Its archetype card (GROUPED_REVIEW / APPROVAL_TASK)
  // supplies the body — same citizenship, different costume.
  const task = artifact.task_ref;
  const taskPending = task?.task_state === "pending";
  // Asked of the strip itself rather than restated here — see `hasInterpretation`. The footer
  // sizes itself around this, so a second opinion would show up as a clipped question.
  const showsStrip = !task && custom && hasInterpretation(artifact);
  // Read from the FIRST component's captured attribution, the same field the interpreter
  // reads. Not inferred from the answer, and absent when the payload declared none.
  const { personaConfig } = useMeshConfig();
  const components =
    (artifact.rendered_output?.components as unknown[] | undefined) ?? [];
  const hasRendered = components.length > 0;
  // Absent when the payload declared no persona — the eyebrow then shows subject and verb and
  // nothing else, rather than a chip captioned with a guess.
  const sourcePersona = (components[0] as { source_persona?: string } | undefined)?.source_persona;
  const personaCfg = sourcePersona ? personaConfig[sourcePersona] : null;

  const showMap = focused && focusTab === "map";

  /**
   * THE BACK FACE MOUNTS ON FIRST FLIP AND STAYS MOUNTED.
   *
   * A flip needs both faces rendered at once — a face hidden with `display: none` measures
   * zero, and `FitBox` sizes its content from `clientWidth`/`scrollHeight`, so the map would
   * arrive at scale 0 the first time it showed. But `DecisionMap` takes NO PROPS: it reads the
   * CURRENT artifact and fires a `fetchDecisionSubgraph` on mount. Mounting it eagerly on every
   * card would be one network call per card on the stage, and every back would show the same
   * map — correct only for the focused card, which is the one case that already worked.
   *
   * So: nothing is mounted until this card is first turned over, and after that it stays, so
   * every later flip is a transform with no fetch behind it.
   */
  const everFlipped = useRef(false);
  if (showMap) everFlipped.current = true;
  const backMounted = everFlipped.current;

  /**
   * THE 3D EXISTS ONLY WHILE THE CARD IS TURNING, and that is the fix for the blurry back.
   *
   * A face inside a live `preserve-3d` context is composited as a texture, and the map's
   * content is itself scaled down by `FitBox` — so the browser rasterised it once, at the
   * layer's resolution, and resampled that bitmap instead of re-rendering the text. It arrived
   * soft and STAYED soft, because nothing ever invalidated the layer. Every trick for forcing a
   * re-raster is a guess about a particular engine; removing the 3D is not.
   *
   * So the turn is three states, not two: flat on the front, THREE-DIMENSIONAL FOR HALF A
   * SECOND, flat on the back. Settled, the visible face has no transformed ancestor at all and
   * renders as ordinary text.
   *
   * `renderFlipped` lags `showMap` by one frame ON PURPOSE. The 3D context has to be in the DOM
   * BEFORE the angle changes, or the browser has no transition to run and the card snaps.
   */
  const { renderFlipped, flipping } = useFlipState(showMap);

  /** The card's own appearance, rendered on BOTH faces so the skin turns with the contents. */
  const faceSkin = `flex h-full w-full flex-col overflow-hidden rounded-xl border bg-slate-900/95 shadow-xl ${
    selected
      ? "border-neon-cyan ring-4 ring-neon-cyan/20"
      : focused
      ? "border-neon-cyan/70"
      : fallback
      ? "border-amber-700/40"
      : "border-neon-cyan/25 hover:border-neon-cyan/50"
  }`;

  // A card that carries its OWN dimensions is a PANEL; one that does not is a PREVIEW.
  //
  // FitBox shrinks a fixed 640-wide block to fit, by the smaller of the width and height
  // ratios. That is right for the global overview, where every card is a uniform 360x280 and
  // the point is to see the whole answer at a glance. It is wrong for a workspace canvas: a
  // chart whose natural block is taller than the card's aspect ratio gets scaled by HEIGHT and
  // then under-fills the width, so it reads as a thumbnail floating in margins rather than as
  // a panel. On a 360x280 card that is roughly 30% of the width left empty.
  //
  // Arrangement is UI-owned (ADR-0042 §4), so a card the user or a template gave dimensions to
  // has already declared how much room its content gets. Honour that: render at the card's
  // real width and let the content lay itself out, exactly as it does in the full pane.
  const sized = Boolean(size && (size.w !== STAGE_CARD.w || size.h !== STAGE_CARD.h));

  /**
   * POINTER GESTURES vs THE NATIVE DRAG, and why the resize corner behaved so strangely.
   *
   * The card is `draggable` for the drag-onto-a-dock-chip gesture. HTML5 drag and pointer
   * events are two different input systems on the same element, and the drag wins: once a
   * native drag starts, the browser STOPS firing pointermove and pointerup and fires drag
   * events instead.
   *
   * That single fact produced every symptom of the broken resize:
   *
   *   - Grabbing the corner started a native drag (the handle is inside a draggable ancestor,
   *     and `draggable={false}` on the child is not reliably enough). The "pill" that moved
   *     was this card's custom drag IMAGE, not the card.
   *   - The card did not resize, because the resize listens on pointermove and pointermove had
   *     stopped firing.
   *   - Its pointerup never arrived either, so the resize listeners were never removed. They
   *     sat armed on the document.
   *   - After the drop, the next mouse movement reached those stale listeners and the card
   *     began resizing from the ORIGINAL pointerdown coordinates — which is why the anchor was
   *     nowhere near the corner and the drop point became the new origin.
   *   - Ending that phantom resize meant clicking, which landed on the card and selected it.
   *
   * The fix is to make the two systems mutually exclusive rather than to fight the symptoms:
   * a pointer gesture PREVENTS the native drag from starting at all, and captures the pointer
   * so its move and up events cannot be stolen. `preventDefault` on pointerdown suppresses
   * drag initiation; the ref is belt-and-braces for browsers that start the drag anyway.
   */
  const gesturing = useRef(false);

  const beginGesture =
    (handler?: (e: React.PointerEvent) => void) => (e: React.PointerEvent) => {
      if (!handler) return;
      gesturing.current = true;
      // Stops the native drag before it starts, and keeps the gesture off the card's select.
      e.preventDefault();
      e.stopPropagation();
      // Route every subsequent move/up to this element, so a fast drag that leaves the handle
      // does not hand the gesture to whatever is underneath.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      handler(e);
    };

  /** A gesture that MOVED must not also register as a click on the card. */
  const endGesture = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    // Cleared on the next tick so the click event that follows pointerup still sees it.
    setTimeout(() => {
      gesturing.current = false;
    }, 0);
  };

  return (
    <div
      data-stage-card
      onClick={(e) => {
        // A move or resize ends in a pointerup, which the browser follows with a click. Without
        // this, finishing a resize selects (and at focus zoom, enlarges) the card — the gesture
        // reporting itself as a decision the user did not make.
        if (gesturing.current) {
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      onDoubleClick={onDoubleClick}
      style={{
        ...style,
        width: size?.w ?? STAGE_CARD.w,
        height: size?.h ?? STAGE_CARD.h,
        // Stage-2 morph rides these; opacity is the focus-dim.
        transition:
          "left 650ms cubic-bezier(.3,.75,.25,1), top 650ms cubic-bezier(.3,.75,.25,1), opacity 400ms ease, border-color 200ms ease",
      }}
      /* THE ROOT NO LONGER LOOKS LIKE A CARD — the FACES do. Border, background, radius and
         shadow moved onto them, because a card whose skin stays put while its contents rotate
         is not a card turning over; it is a hole in a card with something spinning behind it,
         which is exactly how it read. What stays here is everything that is not the card's
         appearance: position, size, the morph transition, and every gesture — so dragging,
         resizing and selection are untouched by the turn. */
      className="absolute cursor-pointer flip-stage"
    >
      {/* ONE SKIN, RENDERED TWICE. Both faces are the same card — same border, same focus ring,
          same corner — so the thing that rotates is the card and not its contents. Written once
          and shared, because two copies of a focus-state ternary is two places for the selected
          border to stop agreeing with itself. */}
      <div className="flip-holder" data-flipping={flipping ? "" : undefined} data-flipped={renderFlipped ? "" : undefined}>
        <div className="flip-face" data-face="front" data-active={renderFlipped ? undefined : ""}>
          <div className={faceSkin}>
        {/* Header: subject identifier + TRACE hint (answer) — or task kind + state.
            ON A CANVAS IT IS ALSO THE MOVE HANDLE, like a window title bar. The grip icon stays
            as the affordance, but the whole strip is grabbable — hunting a 14px icon to move a
            card is a target nobody should have to hit. The BODY stays free for text selection,
            which is the reason the move lives here and not on the card as a whole. */}
        <div
          onPointerDown={custom ? beginGesture(onGripDown) : undefined}
          onPointerUp={custom ? endGesture : undefined}
          onPointerCancel={custom ? endGesture : undefined}
          // THE HEADER IS THE GRAB AREA, in BOTH views, and that is what makes the body selectable.
          //
          // A draggable element cannot have its text selected. While the whole card carried
          // `draggable`, no card body could be swept and copied — in global OR on a canvas — and
          // dragging a body started a chip-drag, so the thing that followed the cursor was the drag
          // IMAGE while the card sat still. That was the "pill".
          //
          // Now the grab area is the header strip in both views: in GLOBAL it starts the
          // drag-onto-a-dock-chip gesture; on a CANVAS it moves the card. Same place, same mental
          // model, and the body below it is content the reader can select.
          //
          // (An earlier attempt gated `draggable` on `!gesturing.current`. That could never work:
          // `gesturing` is a REF, and mutating a ref does not re-render, so the rendered attribute
          // kept whatever value it had at the last render. The `onDragStart` bail is the guard
          // that actually runs.)
          draggable={!custom}
          onDragStart={(e) => {
            if (gesturing.current) {
              e.preventDefault();
              return;
            }
            // Drag a card onto a dock chip to add it. If this card is part of a
            // lasso selection, drag the WHOLE selection (comma-joined ids);
            // otherwise just this card. dataTransfer is the source of truth.
            const ids = dragIds && dragIds.length ? dragIds : [artifact.id];
            e.dataTransfer.setData("text/plain", ids.join(","));
            e.dataTransfer.effectAllowed = "copyMove";
            // The card lives inside the camera's CSS transform (translate+scale),
            // which breaks the browser's DEFAULT drag ghost — it renders far off to
            // the side / off-screen. Supply a small custom drag image pinned under
            // the cursor so the drag is legible and tracks the hand.
            const ghost = document.createElement("div");
            ghost.textContent =
              ids.length > 1 ? `${ids.length} answers` : spo.subjectLabel || "answer";
            ghost.style.cssText =
              "position:fixed;top:-1000px;left:-1000px;padding:6px 10px;border-radius:8px;" +
              "background:#0C1D24;border:1px solid rgba(44,217,238,.55);color:#EAF7F9;" +
              "font:600 11px 'JetBrains Mono',ui-monospace,monospace;white-space:nowrap;" +
              "pointer-events:none;z-index:9999;box-shadow:0 8px 20px rgba(0,0,0,.5)";
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 14, 14);
            // Remove after the browser has snapshotted it for the drag image.
            setTimeout(() => ghost.remove(), 0);
          }}
          onDragEnd={(e) => {
            // After a successful MULTI drop, clear the lasso selection.
            if (dragIds && dragIds.length > 1 && e.dataTransfer.dropEffect !== "none") {
              onDragComplete?.();
            }
          }}
          className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 flex-shrink-0 ${
            custom ? "cursor-grab active:cursor-grabbing select-none" : ""
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              task
                ? taskPending
                  ? "bg-neon-pink animate-pulse"
                  : "bg-slate-500"
                : fallback
                ? "bg-amber-500/70"
                : "bg-neon-cyan"
            }`}
          />
          {/* THE SUBJECT IS WHAT GIVES WAY. Six cards on one program share a subject and differ
              only by verb, so when both halves truncate the reader loses the ONE word that tells
              them apart — "NOTIONAL PROGRAM MER… · fin Eac Calcula…" names nothing. `min-w-0`
              is what makes this span actually shrink: a flex child will not go below its content
              width without it, which is why adding `truncate` alone never did anything here. */}
          <span
            className={`text-[11px] font-mono uppercase tracking-widest truncate min-w-0 ${
              task && taskPending ? "text-neon-pink/90" : "text-slate-400"
            }`}
          >
            {task ? taskKindLabel(task.kind) : spo.subjectLabel || (fallback ? "unresolved" : "answer")}
            {/* SUBJECT · VERB, on one line, and only where there is room for it.
                The header used to carry the subject alone and push the verb into a separate strip
                below, which cost a whole row of vertical for two words. Read together they are
                the card's provenance in a glance — "portfolio, cost curve" — and the archetype
                title underneath becomes the thing the eye lands on, which is the contrast a
                reader actually navigates by. */}
            {!task && custom && spo.verbLabel && (
              <span className="text-slate-600"> · {spo.verbLabel}</span>
            )}
          </span>
          {/* PERSONA, as a tag in the eyebrow rather than a block above the content.
              It was rendered by SemanticInterpreter as a bold 10px pill on its own line, which
              cost a full row per card and read as the loudest thing on a card whose content is a
              chart. Here it sits beside the subject and verb — the same line of provenance — and
              costs nothing. The interpreter still draws it on surfaces that have no eyebrow. */}
          {!task && personaCfg && (
            <span
              className={`flex-shrink-0 inline-flex items-center gap-1 px-1 py-px rounded border text-[8px] font-mono uppercase tracking-widest ${personaCfg.bg} ${personaCfg.color}`}
              title={personaCfg.label}
            >
              <DynamicIcon name={personaCfg.icon} className="w-2.5 h-2.5" />
              {personaCfg.label}
            </span>
          )}
          {task ? (
            <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-slate-500">
              {taskPending ? "pending" : task.task_state}
            </span>
          ) : custom ? (
            /* ADR-0042 §4: the card displays the as-of of the evaluation it is showing. */
            <span className="ml-auto flex-shrink-0">
              <FreshnessStamp artifact={artifact} />
            </span>
          ) : (
            !custom && spo.verbLabel && (
              /* SHRINKS LAST, not first. It was `truncate max-w-[45%]` with no shrink priority,
                 so the verb was clipped at the same time as the subject beside it — and the verb
                 is the half that disambiguates. The cap stays as a bound on a pathological verb,
                 but a real one ("fin Funding Status") now renders whole and the subject yields. */
              <span className="ml-auto flex-shrink-0 text-[10px] font-mono text-neon-purple/70 truncate max-w-[60%]">
                {spo.verbLabel}
              </span>
            )
          )}
          {onGripDown && (
            <button
              // Same gesture contract as the resize corner. The move grip had the identical
              // latent bug — `draggable={false}` on the child does not reliably stop the
              // draggable ANCESTOR from starting a drag, and a drag that starts here kills the
              // pointermove the move depends on.
              onPointerDown={beginGesture(onGripDown)}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              onDragStart={(e) => e.preventDefault()}
              draggable={false}
              className="ml-auto text-slate-600 hover:text-neon-cyan cursor-grab active:cursor-grabbing flex-shrink-0"
              title="Drag to move"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          {onRemove && (
            <button
              // The header is a move handle now, so a press on this button must not also start a
              // drag — otherwise removing a card nudges it first.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className={`text-slate-600 hover:text-rose-400 flex-shrink-0 ${onGripDown ? "" : "ml-auto"}`}
              title="Remove from canvas"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
  
        {/* Body first, provenance after — see the footer below. */}
        {/* Body: the content lens (answer / task card), or the provenance lens when
            toggled at focus — Decision Map for an answer, Workflow for a task.
  
        {/* Body: the answer. The turn happens one level up, on the card as a whole — see
            the faces in the render root. */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {hasRendered && sized ? (
            // PANEL. The card was given room; the content uses it. No scaling, so a chart fills
            // the width it was allotted instead of being letterboxed inside it. Overflow scrolls
            // rather than clipping, because a card sized slightly too small should still be
            // readable — the alternative is content silently cut off with nothing saying so.
            <div className="absolute inset-0 overflow-auto custom-scrollbar p-3">
              <div className="[&_.glass-panel]:!my-0 [&_.grid]:!gap-3">
                <SemanticInterpreter payload={{ components }} hidePersona artifactId={artifact.id} />
              </div>
            </div>
          ) : hasRendered ? (
            // PREVIEW. Shrink the WHOLE answer to fit the card — nothing clipped, so the
            // chart / table / document is fully legible at card scale (the point
            // of the canvas). Rendered at a natural width, then scaled down.
            <div className="absolute inset-0 p-2">
              <FitBox naturalWidth={640}>
                <div className="[&_.glass-panel]:!my-0 [&_.grid]:!gap-3">
                  {/* At overview zoom the shell caps a "dense" citizen to a preview
                      so FitBox scales it by WIDTH (readable) instead of by HEIGHT
                      (the long-list shrink). compact/visual render whole — FitBox
                      centers the compact card and scales the visual one. */}
                  <SemanticInterpreter
                    payload={{ components }}
                    hidePersona
                    previewRows={
                      overviewTier((components?.[0] as { archetype?: string } | undefined)?.archetype) === "dense"
                        ? DENSE_PREVIEW_ROWS
                        : undefined
                    }
                  />
                </div>
              </FitBox>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
              {/* WHAT WAS ANSWERED, while the answer is in flight. See `AnsweredChip`: the strip
                  cannot say this yet because the server's account does not exist until the
                  answer lands, and this card is what a person looks at in the meantime. */}
              <AnsweredChip artifact={artifact} />
              <p
                className={`text-[13px] font-mono leading-snug text-center ${
                  isUnresolved(artifact) ? "text-amber-400/80 italic" : "text-slate-300"
                }`}
              >
                {answerSummary(artifact)}
              </p>
            </div>
          )}
        </div>
  
        {/* FOOTER: how the question was read, and the question itself.
            The interpretation strip used to sit ABOVE the body, between the header and the
            content, where it cost a full row of vertical before the reader reached the answer.
            It is provenance — the thing you look at second, when you want to know how the system
            read you — so it belongs after the content rather than in front of it. Same
            information, and the card's own title is now the first thing under the eyebrow.
            It renders nothing when the payload captured no interpretation; a fabricated one is
            worse than none, because it is what a reader would trust. */}
        <div className="flex items-end justify-between gap-3 px-3 py-1.5 border-t border-slate-800/60 flex-shrink-0">
          {/* The strip's column exists only when the strip does. An always-present flex child
              reserved half the row for nothing on the GLOBAL stage — `custom` is false there,
              since a computed arrangement has no grip or remove handler to pass — and the
              question then truncated into that empty space. */}
          {showsStrip && (
            <div className="min-w-0 flex-1">
              <InterpretationStrip artifact={artifact} />
            </div>
          )}
          <span
            className={
              "flex items-center gap-1.5 text-[10px] font-mono text-slate-500 truncate italic " +
              // THE CAP IS FOR SHARING, NOT DECORATION. It exists so the question cannot crowd
              // out the interpretation beside it; with nothing beside it, capping at 55% clips a
              // phrase there is room to read in full.
              (showsStrip ? "max-w-[55%]" : "min-w-0 flex-1 justify-end")
            }
            title={artifact.question_text || undefined}
          >
            <GitBranch className="w-2.5 h-2.5 text-slate-600 flex-shrink-0 not-italic" />
            {artifact.question_text || "—"}
          </span>
        </div>
  
          </div>
        </div>

        {/* THE BACK IS THE SAME CARD, TURNED. Same skin and the same provenance footer; only the
            body differs, because "how it decided" is a different view of ONE answer rather than
            a second answer. */}
        <div className="flip-face" data-face="back" data-active={renderFlipped ? "" : undefined}>
          <div className={faceSkin}>
        {/* Header: subject identifier + TRACE hint (answer) — or task kind + state.
            ON A CANVAS IT IS ALSO THE MOVE HANDLE, like a window title bar. The grip icon stays
            as the affordance, but the whole strip is grabbable — hunting a 14px icon to move a
            card is a target nobody should have to hit. The BODY stays free for text selection,
            which is the reason the move lives here and not on the card as a whole. */}
        <div
          onPointerDown={custom ? beginGesture(onGripDown) : undefined}
          onPointerUp={custom ? endGesture : undefined}
          onPointerCancel={custom ? endGesture : undefined}
          // THE HEADER IS THE GRAB AREA, in BOTH views, and that is what makes the body selectable.
          //
          // A draggable element cannot have its text selected. While the whole card carried
          // `draggable`, no card body could be swept and copied — in global OR on a canvas — and
          // dragging a body started a chip-drag, so the thing that followed the cursor was the drag
          // IMAGE while the card sat still. That was the "pill".
          //
          // Now the grab area is the header strip in both views: in GLOBAL it starts the
          // drag-onto-a-dock-chip gesture; on a CANVAS it moves the card. Same place, same mental
          // model, and the body below it is content the reader can select.
          //
          // (An earlier attempt gated `draggable` on `!gesturing.current`. That could never work:
          // `gesturing` is a REF, and mutating a ref does not re-render, so the rendered attribute
          // kept whatever value it had at the last render. The `onDragStart` bail is the guard
          // that actually runs.)
          draggable={!custom}
          onDragStart={(e) => {
            if (gesturing.current) {
              e.preventDefault();
              return;
            }
            // Drag a card onto a dock chip to add it. If this card is part of a
            // lasso selection, drag the WHOLE selection (comma-joined ids);
            // otherwise just this card. dataTransfer is the source of truth.
            const ids = dragIds && dragIds.length ? dragIds : [artifact.id];
            e.dataTransfer.setData("text/plain", ids.join(","));
            e.dataTransfer.effectAllowed = "copyMove";
            // The card lives inside the camera's CSS transform (translate+scale),
            // which breaks the browser's DEFAULT drag ghost — it renders far off to
            // the side / off-screen. Supply a small custom drag image pinned under
            // the cursor so the drag is legible and tracks the hand.
            const ghost = document.createElement("div");
            ghost.textContent =
              ids.length > 1 ? `${ids.length} answers` : spo.subjectLabel || "answer";
            ghost.style.cssText =
              "position:fixed;top:-1000px;left:-1000px;padding:6px 10px;border-radius:8px;" +
              "background:#0C1D24;border:1px solid rgba(44,217,238,.55);color:#EAF7F9;" +
              "font:600 11px 'JetBrains Mono',ui-monospace,monospace;white-space:nowrap;" +
              "pointer-events:none;z-index:9999;box-shadow:0 8px 20px rgba(0,0,0,.5)";
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 14, 14);
            // Remove after the browser has snapshotted it for the drag image.
            setTimeout(() => ghost.remove(), 0);
          }}
          onDragEnd={(e) => {
            // After a successful MULTI drop, clear the lasso selection.
            if (dragIds && dragIds.length > 1 && e.dataTransfer.dropEffect !== "none") {
              onDragComplete?.();
            }
          }}
          className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 flex-shrink-0 ${
            custom ? "cursor-grab active:cursor-grabbing select-none" : ""
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              task
                ? taskPending
                  ? "bg-neon-pink animate-pulse"
                  : "bg-slate-500"
                : fallback
                ? "bg-amber-500/70"
                : "bg-neon-cyan"
            }`}
          />
          {/* THE SUBJECT IS WHAT GIVES WAY. Six cards on one program share a subject and differ
              only by verb, so when both halves truncate the reader loses the ONE word that tells
              them apart — "NOTIONAL PROGRAM MER… · fin Eac Calcula…" names nothing. `min-w-0`
              is what makes this span actually shrink: a flex child will not go below its content
              width without it, which is why adding `truncate` alone never did anything here. */}
          <span
            className={`text-[11px] font-mono uppercase tracking-widest truncate min-w-0 ${
              task && taskPending ? "text-neon-pink/90" : "text-slate-400"
            }`}
          >
            {task ? taskKindLabel(task.kind) : spo.subjectLabel || (fallback ? "unresolved" : "answer")}
            {/* SUBJECT · VERB, on one line, and only where there is room for it.
                The header used to carry the subject alone and push the verb into a separate strip
                below, which cost a whole row of vertical for two words. Read together they are
                the card's provenance in a glance — "portfolio, cost curve" — and the archetype
                title underneath becomes the thing the eye lands on, which is the contrast a
                reader actually navigates by. */}
            {!task && custom && spo.verbLabel && (
              <span className="text-slate-600"> · {spo.verbLabel}</span>
            )}
          </span>
          {/* PERSONA, as a tag in the eyebrow rather than a block above the content.
              It was rendered by SemanticInterpreter as a bold 10px pill on its own line, which
              cost a full row per card and read as the loudest thing on a card whose content is a
              chart. Here it sits beside the subject and verb — the same line of provenance — and
              costs nothing. The interpreter still draws it on surfaces that have no eyebrow. */}
          {!task && personaCfg && (
            <span
              className={`flex-shrink-0 inline-flex items-center gap-1 px-1 py-px rounded border text-[8px] font-mono uppercase tracking-widest ${personaCfg.bg} ${personaCfg.color}`}
              title={personaCfg.label}
            >
              <DynamicIcon name={personaCfg.icon} className="w-2.5 h-2.5" />
              {personaCfg.label}
            </span>
          )}
          {task ? (
            <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-slate-500">
              {taskPending ? "pending" : task.task_state}
            </span>
          ) : custom ? (
            /* ADR-0042 §4: the card displays the as-of of the evaluation it is showing. */
            <span className="ml-auto flex-shrink-0">
              <FreshnessStamp artifact={artifact} />
            </span>
          ) : (
            !custom && spo.verbLabel && (
              /* SHRINKS LAST, not first. It was `truncate max-w-[45%]` with no shrink priority,
                 so the verb was clipped at the same time as the subject beside it — and the verb
                 is the half that disambiguates. The cap stays as a bound on a pathological verb,
                 but a real one ("fin Funding Status") now renders whole and the subject yields. */
              <span className="ml-auto flex-shrink-0 text-[10px] font-mono text-neon-purple/70 truncate max-w-[60%]">
                {spo.verbLabel}
              </span>
            )
          )}
          {onGripDown && (
            <button
              // Same gesture contract as the resize corner. The move grip had the identical
              // latent bug — `draggable={false}` on the child does not reliably stop the
              // draggable ANCESTOR from starting a drag, and a drag that starts here kills the
              // pointermove the move depends on.
              onPointerDown={beginGesture(onGripDown)}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              onDragStart={(e) => e.preventDefault()}
              draggable={false}
              className="ml-auto text-slate-600 hover:text-neon-cyan cursor-grab active:cursor-grabbing flex-shrink-0"
              title="Drag to move"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          {onRemove && (
            <button
              // The header is a move handle now, so a press on this button must not also start a
              // drag — otherwise removing a card nudges it first.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className={`text-slate-600 hover:text-rose-400 flex-shrink-0 ${onGripDown ? "" : "ml-auto"}`}
              title="Remove from canvas"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
  
            <div className="flex-1 min-h-0 overflow-hidden relative">
              {backMounted ? (
                <div className="absolute inset-0 p-2">
                  <FitBox naturalWidth={640}>
                    <div style={{ width: 640, height: task ? undefined : 380 }}>
                      {task ? <WorkflowLens taskRef={task} /> : <DecisionMap />}
                    </div>
                  </FitBox>
                </div>
              ) : (
                /* A FIRST FLIP LANDS BEFORE THE FETCH RETURNS. The map's request starts when it
                   mounts, so the turn finishes first — and an empty back reads as broken rather
                   than as pending. */
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                    reading the decision…
                  </span>
                </div>
              )}
            </div>
        {/* FOOTER: how the question was read, and the question itself.
            The interpretation strip used to sit ABOVE the body, between the header and the
            content, where it cost a full row of vertical before the reader reached the answer.
            It is provenance — the thing you look at second, when you want to know how the system
            read you — so it belongs after the content rather than in front of it. Same
            information, and the card's own title is now the first thing under the eyebrow.
            It renders nothing when the payload captured no interpretation; a fabricated one is
            worse than none, because it is what a reader would trust. */}
        <div className="flex items-end justify-between gap-3 px-3 py-1.5 border-t border-slate-800/60 flex-shrink-0">
          {/* The strip's column exists only when the strip does. An always-present flex child
              reserved half the row for nothing on the GLOBAL stage — `custom` is false there,
              since a computed arrangement has no grip or remove handler to pass — and the
              question then truncated into that empty space. */}
          {showsStrip && (
            <div className="min-w-0 flex-1">
              <InterpretationStrip artifact={artifact} />
            </div>
          )}
          <span
            className={
              "flex items-center gap-1.5 text-[10px] font-mono text-slate-500 truncate italic " +
              // THE CAP IS FOR SHARING, NOT DECORATION. It exists so the question cannot crowd
              // out the interpretation beside it; with nothing beside it, capping at 55% clips a
              // phrase there is room to read in full.
              (showsStrip ? "max-w-[55%]" : "min-w-0 flex-1 justify-end")
            }
            title={artifact.question_text || undefined}
          >
            <GitBranch className="w-2.5 h-2.5 text-slate-600 flex-shrink-0 not-italic" />
            {artifact.question_text || "—"}
          </span>
        </div>
  
          </div>
        </div>
      </div>

      {/* Resize corner. Only on a custom canvas, because GLOBAL is a computed arrangement with
          no per-item state to write a size into — a handle there would look like it worked and
          persist nothing.

          `onPointerDown` rather than a drag event, matching the move grip: the card is
          `draggable` for the drag-to-chip gesture, and a native drag starting here would fight
          the resize. `stopPropagation` in the handler keeps the click off the card's select. */}
      {onResizeDown && (
        <span
          onPointerDown={beginGesture(onResizeDown)}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
          role="separator"
          aria-label="Resize card"
          title="Drag to resize"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-40 hover:opacity-100 transition-opacity"
          style={{
            // A corner wedge rather than an icon: it reads as an affordance at any card size,
            // and it does not compete with the footer text for the last few pixels.
            background:
              "linear-gradient(135deg, transparent 0 55%, rgba(45,212,191,.75) 55% 70%, transparent 70% 80%, rgba(45,212,191,.75) 80% 95%, transparent 95%)",
          }}
        />
      )}
    </div>
  );
}
