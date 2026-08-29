import { Zap, ArrowUpRight } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { answerSummary, hasCapturedSummary } from "@/lib/answerDisplay";

/**
 * The receipt for a seeding answer: what you asked, what it contains, where it went.
 *
 * CANVAS_SEED is acted on rather than drawn, so for a while it rendered a red "component not
 * found". The first repair said "acted on rather than drawn — the cards it placed are the
 * visible result", which is true and is addressed to the wrong reader: it explains the
 * dispatch model to someone who asked for a portfolio canvas.
 *
 * ── WHAT IT MAY SAY, AND THE ONE LINE IT MAY NOT ─────────────────────────────────────────
 *
 * It states what the answer IS. It never states that an act OCCURRED. A seed answer re-read
 * from scrollback places nothing — the consumer records artifacts present at mount as seen so
 * history cannot re-seed — so "seeded 5 cards onto Portfolio Planning" would be false on
 * exactly the rows most likely to be read, and it would name a destination the payload does
 * not carry. Sealed in `actedOn.seal.test.tsx`: a rendering that claims the act turns red.
 *
 * The manifest is not that claim. "This seed names these five artifacts, in this order" is a
 * reading of the payload, true whenever the row is read and by whom.
 *
 * ── WHY THE LINK IS MATCHED AND NOT RECORDED ─────────────────────────────────────────────
 *
 * The obvious design records the seed's artifact id on the canvas it composed. It was built
 * and reverted: the interpreter receives a payload COMPONENT and not the artifact it came
 * from, so reading such a field would mean threading an artifact id through all five
 * SemanticInterpreter call sites — and a recorded field nothing can reach is the
 * declared-but-unwired shape this repo keeps filing findings about.
 *
 * So the link is derived from local state instead: a canvas that holds exactly the artifacts
 * this seed names IS the board those artifacts were placed on. NAVIGATION, NEVER EVIDENCE —
 * its absence means "this client cannot offer a link" (deleted board, another browser), never
 * "the seed did not run", so nothing is rendered to mark the absence.
 */
export function CanvasSeedReceipt({ comp }: { comp: { archetype: string; [k: string]: unknown } }) {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const canvases = useStageStore((s) => s.canvases);
  const setView = useStageStore((s) => s.setView);

  const raw = Array.isArray(comp.artifact_ids) ? comp.artifact_ids : [];
  const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);

  // The producer sends no `name` today — declared optional, read here, never emitted. The
  // default is shown as a default rather than dressed up as a title the seed chose.
  const declaredName = typeof comp.name === "string" && comp.name.trim() ? comp.name.trim() : null;

  // Exactly-these-artifacts, not merely contains: a board that happens to include the five
  // among twenty others is a different board, and offering it would send the reader somewhere
  // they did not ask to go.
  const board =
    ids.length > 0
      ? canvases.find(
          (c) =>
            c.items.length === ids.length && ids.every((id) => c.items.some((it) => it.id === id)),
        )
      : undefined;

  const byId = new Map(artifacts.map((a) => [a.id, a]));

  return (
    <div className="p-4 glass-panel flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-start gap-3">
          <Zap className="w-4 h-4 text-teal-400/70 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-mono text-xs text-slate-200">
              {declaredName ?? "Portfolio Planning"}
              {!declaredName && (
                <span className="text-slate-500"> · default name</span>
              )}
            </p>
            <p className="font-mono text-[10px] text-slate-500">
              {ids.length} {ids.length === 1 ? "answer" : "answers"}, in slot order
            </p>
          </div>
        </div>
        {board && (
          <button
            onClick={() => setView(board.id)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-teal-500/30 text-teal-300/90 hover:bg-teal-500/10 font-mono text-[10px] flex-shrink-0"
          >
            view canvas
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <ol className="flex flex-col gap-1.5">
        {ids.map((id, i) => {
          const a = byId.get(id);
          return (
            <li key={id} className="flex items-start gap-2 font-mono text-[11px]">
              <span className="w-12 flex-shrink-0 text-[9px] uppercase tracking-widest text-slate-600 pt-0.5">
                {/* The order IS the slot assignment, so the first entry is the anchor and
                    saying so is a reading of the payload rather than a layout claim. */}
                {i === 0 ? "anchor" : `slot ${i + 1}`}
              </span>
              <div className="min-w-0">
                {a ? (
                  <>
                    <p
                      className={
                        hasCapturedSummary(a) ? "text-slate-200" : "text-slate-400 italic"
                      }
                    >
                      {answerSummary(a)}
                    </p>
                    {a.question_text && (
                      <p className="text-[10px] text-slate-500 line-clamp-1">
                        <span className="text-slate-600">Q · </span>
                        {a.question_text}
                      </p>
                    )}
                  </>
                ) : (
                  // Not in this client's answer collection — history not hydrated, another
                  // browser. The id is shown because it is what we actually have; inventing a
                  // label for it would be the manufactured-confidence failure in miniature.
                  <p className="text-slate-500 truncate" title={id}>
                    {id}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
