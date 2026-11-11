import { Plus, X } from "lucide-react";

/**
 * The lasso action bar: bulk-add the selected cards to a canvas, start a new canvas with them, clear, and (when the
 * caller may export) "Export as...". Extracted from `GlobalCanvasStage`; the stage keeps the handlers.
 */
export function SelectionActionBar({
  count,
  canvases,
  onAdd,
  onNew,
  onClear,
  onExport,
}: {
  count: number;
  canvases: { id: string; name: string }[];
  onAdd: (canvasId: string) => void;
  onNew: () => void;
  onClear: () => void;
  onExport?: () => void;
}) {
  return (
    <div
      data-overlay
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl border border-neon-cyan/30 bg-slate-950/95 backdrop-blur-sm px-3 py-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
        {count} selected → Add to
      </span>
      {canvases.map((c) => (
        <button
          key={c.id}
          onClick={() => onAdd(c.id)}
          className="rounded-md border border-neon-cyan/30 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/15 transition-colors"
        >
          {c.name}
        </button>
      ))}
      <button
        onClick={onNew}
        className="flex items-center gap-1 rounded-md border border-dashed border-slate-600/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan transition-colors"
      >
        <Plus className="w-2.5 h-2.5" />
        New
      </button>
      {onExport && (
        <button
          data-export-as
          onClick={onExport}
          className="rounded-md border border-slate-600/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan transition-colors"
        >
          Export as…
        </button>
      )}
      <button
        onClick={onClear}
        className="ml-1 text-slate-500 hover:text-rose-400"
        title="Clear selection"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
