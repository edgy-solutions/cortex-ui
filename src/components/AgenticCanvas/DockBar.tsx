import { useState } from "react";
import { LayoutGrid, Columns, Plus, X, Check } from "lucide-react";
import {
  useStageStore,
  type CanvasUse,
  type CustomCanvas,
} from "@/store/useStageStore";

/**
 * DockBar — the canvas dock (ADR-0028 canvas-dock model, Stage 3). Pinned below
 * the stage: GLOBAL (static, derived) + one chip per custom canvas + NEW.
 *
 * - Click a chip → the stage shows that canvas.
 * - Chips are DROP TARGETS: drag a card (or a list row) onto a chip to add it
 *   to that canvas; onto NEW to create-with-that-item. Chips expose
 *   `data-canvas-chip` so the list's pointer-drag routes here too (canvasDrop).
 * - NEW → a small create popover: name + an OPTIONAL ADR-0028 "use"
 *   (aggregation / workflow / relationship) carried as metadata only (no
 *   behavior yet — the use-driven arrangements are the post-canvas edge arc).
 * - Double-click a custom chip to rename; ✕ to delete. GLOBAL can't be renamed
 *   or deleted (it's derived).
 *
 * Replaces the old "MY CANVAS" toggle + pins overlay.
 */

const USES: { value: CanvasUse | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "aggregation", label: "Aggregation" },
  { value: "workflow", label: "Workflow seed" },
  { value: "relationship", label: "Relationship" },
];

export function DockBar() {
  const view = useStageStore((s) => s.view);
  const canvases = useStageStore((s) => s.canvases);
  const setView = useStageStore((s) => s.setView);
  const createCanvas = useStageStore((s) => s.createCanvas);
  const renameCanvas = useStageStore((s) => s.renameCanvas);
  const deleteCanvas = useStageStore((s) => s.deleteCanvas);
  const addItemAuto = useStageStore((s) => s.addItemAuto);

  const [hover, setHover] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUse, setNewUse] = useState<CanvasUse | "">("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null); // delete arm

  const onChipDrop = (chipId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // don't let the stage's drop-at-point also fire
    setHover(null);
    const aid = e.dataTransfer.getData("text/plain");
    if (!aid) return;
    if (chipId === "__new__") {
      const id = createCanvas(`Canvas ${canvases.length + 1}`, undefined, true);
      addItemAuto(id, aid);
    } else {
      addItemAuto(chipId, aid);
    }
  };

  const submitCreate = () => {
    createCanvas(newName || `Canvas ${canvases.length + 1}`, newUse || undefined, true);
    setNewName("");
    setNewUse("");
    setCreating(false);
  };

  return (
    <div
      data-overlay
      className="absolute bottom-0 left-0 right-0 h-14 flex items-center gap-2 px-4 border-t border-neon-cyan/12 bg-slate-950/85 backdrop-blur-sm z-20"
    >
      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600 flex-shrink-0">
        Canvases
      </span>

      {/* GLOBAL — static, derived, not a drop target for adds. */}
      <button
        data-canvas-chip="global"
        onClick={() => setView("global")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
          view === "global"
            ? "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan"
            : "border-neon-cyan/25 text-slate-400 hover:text-slate-200"
        }`}
      >
        <LayoutGrid className="w-3 h-3" />
        Global
      </button>

      {/* Custom canvases */}
      {canvases.map((c) => (
        <ChipCustom
          key={c.id}
          canvas={c}
          active={view === c.id}
          hover={hover === c.id}
          editing={editId === c.id}
          editName={editName}
          onPick={() => setView(c.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setHover(c.id);
          }}
          onDragLeave={() => setHover(null)}
          onDrop={(e) => onChipDrop(c.id, e)}
          onStartRename={() => {
            setEditId(c.id);
            setEditName(c.name);
          }}
          onEditName={setEditName}
          onCommitRename={() => {
            renameCanvas(c.id, editName);
            setEditId(null);
          }}
          confirming={confirmId === c.id}
          onDeleteClick={() => {
            // Two-step: first click arms, second confirms (prevents an
            // accidental one-click delete of a whole canvas).
            if (confirmId === c.id) {
              deleteCanvas(c.id);
              setConfirmId(null);
            } else {
              setConfirmId(c.id);
            }
          }}
          onCancelDelete={() => setConfirmId((id) => (id === c.id ? null : id))}
        />
      ))}

      {/* + NEW */}
      <button
        data-canvas-chip="__new__"
        onClick={() => setCreating((v) => !v)}
        onDragOver={(e) => {
          e.preventDefault();
          setHover("__new__");
        }}
        onDragLeave={() => setHover(null)}
        onDrop={(e) => onChipDrop("__new__", e)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-dashed transition-colors ${
          hover === "__new__"
            ? "border-neon-cyan/70 bg-neon-cyan/16 text-neon-cyan"
            : "border-slate-600/60 text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40"
        }`}
      >
        <Plus className="w-3 h-3" />
        New
      </button>

      <span className="ml-auto text-[9px] font-mono text-slate-700 flex-shrink-0">
        drag answers onto a canvas
      </span>

      {/* Create popover */}
      {creating && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-72 rounded-lg border border-neon-cyan/30 bg-slate-950/95 backdrop-blur-sm p-3 shadow-xl z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            New canvas
          </div>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder={`Canvas ${canvases.length + 1}`}
            className="w-full bg-slate-900/70 border border-slate-700/60 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon-cyan/40 mb-2"
          />
          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">
            Use (optional)
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {USES.map((u) => (
              <button
                key={u.value || "none"}
                onClick={() => setNewUse(u.value)}
                className={`rounded px-2 py-1 text-[9px] font-mono uppercase tracking-wider border transition-colors ${
                  newUse === u.value
                    ? "border-neon-purple/50 bg-neon-purple/15 text-neon-purple"
                    : "border-slate-700/60 text-slate-500 hover:text-slate-300"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={submitCreate}
              className="flex-1 flex items-center justify-center gap-1 rounded-md bg-neon-cyan/15 border border-neon-cyan/40 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/25 transition-colors"
            >
              <Check className="w-3 h-3" />
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-md border border-slate-700/60 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChipCustom({
  canvas,
  active,
  hover,
  editing,
  editName,
  onPick,
  onDragOver,
  onDragLeave,
  onDrop,
  onStartRename,
  onEditName,
  onCommitRename,
  confirming,
  onDeleteClick,
  onCancelDelete,
}: {
  canvas: CustomCanvas;
  active: boolean;
  hover: boolean;
  editing: boolean;
  editName: string;
  onPick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onStartRename: () => void;
  onEditName: (v: string) => void;
  onCommitRename: () => void;
  confirming: boolean;
  onDeleteClick: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div
      data-canvas-chip={canvas.id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseLeave={onCancelDelete}
      className={`group flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
        hover
          ? "border-dashed border-neon-cyan/70 bg-neon-cyan/16 text-neon-cyan"
          : active
          ? "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan"
          : "border-neon-cyan/25 text-slate-300 hover:text-slate-100"
      }`}
    >
      <Columns className="w-3 h-3 flex-shrink-0" />
      {editing ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => onEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") onCommitRename();
          }}
          onBlur={onCommitRename}
          className="w-24 bg-slate-900/70 border border-neon-cyan/30 rounded px-1 text-[10px] font-mono text-slate-100 focus:outline-none"
        />
      ) : (
        <button onClick={onPick} onDoubleClick={onStartRename} className="whitespace-nowrap">
          {canvas.name}
        </button>
      )}
      {canvas.use && (
        <span className="text-[8px] text-neon-purple/70" title={`use: ${canvas.use}`}>
          ◆
        </span>
      )}
      <span className="text-slate-500 tabular-nums">{canvas.items.length}</span>
      {confirming ? (
        <button
          onClick={onDeleteClick}
          className="ml-0.5 rounded px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 transition-colors"
          title="Click again to confirm"
        >
          Delete?
        </button>
      ) : (
        <button
          onClick={onDeleteClick}
          className="ml-0.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete canvas"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
