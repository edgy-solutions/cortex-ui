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
 * ── THE LINK IS RECORDED NOW, AND THE OLD REASON IS GONE ─────────────────────────────────
 *
 * This once matched the board by its CONTENTS, because "the interpreter receives a payload
 * component and not the artifact it came from, so reading a recorded field would mean
 * threading an artifact id through all five SemanticInterpreter call sites". That threading
 * happened — the ask card needs the same id to answer against — so the reason expired, and
 * content-matching was never as good: a board the user had added one card to stopped matching
 * and the link silently vanished.
 *
 * `seededFrom` is the board's own record of which answer built it. Matching on it is exact,
 * survives editing the board, and is the same key the store's idempotency and its tombstone
 * use — one identity for the relationship instead of three approximations of it.
 *
 * ── AND THE OFFER NO LONGER DEPENDS ON THE BOARD EXISTING ────────────────────────────────
 *
 * Hiding the button when no board was found meant the card said nothing at the two moments a
 * reader most needs it: before the board has been built, and after they deleted it. Both look
 * identical to "this feature did nothing".
 *
 * So the button is always offered when the seed names ids, and says which act it will perform.
 * NAVIGATION, NEVER EVIDENCE still holds: "build canvas" is an offer to compose a board now,
 * not a claim that one was composed before.
 */
export function CanvasSeedReceipt({
  comp,
  artifactId,
}: {
  comp: { archetype: string; [k: string]: unknown };
  /** The seed ANSWER this receipt is drawn for. Absent only where nothing threaded it. */
  artifactId?: string;
}) {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const canvases = useStageStore((s) => s.canvases);
  const setView = useStageStore((s) => s.setView);
  const seedCanvas = useStageStore((s) => s.seedPortfolioCanvas);

  const raw = Array.isArray(comp.artifact_ids) ? comp.artifact_ids : [];
  const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);

  // The producer sends no `name` today — declared optional, read here, never emitted. The
  // default is shown as a default rather than dressed up as a title the seed chose.
  const declaredName = typeof comp.name === "string" && comp.name.trim() ? comp.name.trim() : null;

  // BY RECORD FIRST. `seededFrom` is exact and survives a board the user has edited.
  //
  // The contents match stays as a FALLBACK, and only that: boards composed before boards
  // recorded their seed have no `seededFrom`, and dropping the old rule would have made every
  // one of them lose its link on upgrade. Exactly-these-artifacts, never merely-contains — a
  // board holding the five among twenty others is a different board.
  const board =
    ids.length === 0
      ? undefined
      : (artifactId ? canvases.find((c) => c.seededFrom === artifactId) : undefined) ??
        canvases.find(
          (c) =>
            !c.seededFrom &&
            c.items.length === ids.length &&
            ids.every((id) => c.items.some((it) => it.id === id)),
        );

  const open = () => {
    if (board) {
      setView(board.id);
      return;
    }
    // REQUESTED, so a board the user deleted is rebuilt rather than refused. The tombstone
    // exists to stop the WATCHER resurrecting it on reload; a click is the opposite instruction.
    const id = seedCanvas(ids, declaredName ?? "Portfolio Planning", true, artifactId, true);
    if (id) setView(id);
  };

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
        {ids.length > 0 && (
          <button
            onClick={open}
            className="flex items-center gap-1 px-2 py-1 rounded border border-teal-500/30 text-teal-300/90 hover:bg-teal-500/10 font-mono text-[10px] flex-shrink-0"
          >
            {/* The VERB is the honest part. "view" promises a board that exists; "build"
                promises to compose one now. Saying "view" in both states would be the
                manufactured-confidence failure applied to a button. */}
            {board ? "view canvas" : "build canvas"}
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
