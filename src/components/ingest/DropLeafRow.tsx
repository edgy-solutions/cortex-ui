/**
 * DropLeafRow — the kind question on a pending PDF drop (architect 2026-10-23, overriding the
 * 10-21 "no picker before the drop"): one radio per leaf the caller's `droppable_kinds` serves, then [Not sure]. Nothing is selected until the
 * dropper answers; "Not sure" is a valid answer and sends no leaf.
 *
 * LATER: pre-select the title read's proposal here when one exists (`value` seeded by the caller).
 */
import type { DropLeafChoice } from "@/store/useIngestComposerStore";
import type { IngestLeaf } from "@/lib/ingestWire";

/** INTERIM display table until lane 01's `drop_leaves [{leaf, label}]` (SDK v0.9.11) serves labels; a leaf missing
 *  here renders upper-cased. Config names the case (architect 2026-10-30): this is display only, never the menu. */
const LEAF_LABELS: Record<string, string> = { pcn: "PCN", pdn: "PDN" };


export interface DropLeafRowProps {
  /** The offered leaves, in served order (`offeredDropLeaves`). Empty -> only "Not sure" and a no-kinds line. */
  leaves: IngestLeaf[];
  value: DropLeafChoice | null;
  onChange: (choice: DropLeafChoice) => void;
}

export function DropLeafRow({ leaves, value, onChange }: DropLeafRowProps) {
  return (
    <div
      className="flex items-center gap-2"
      data-ingest-leaf-row
      data-ingest-leaf-selected={value ?? "none"}
    >
      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Kind</span>
      <div role="radiogroup" aria-label="Document kind" className="flex items-center gap-1.5">
        {[...leaves.map((l) => ({ choice: l as DropLeafChoice, label: LEAF_LABELS[l] ?? l.toUpperCase() })), { choice: "unsure" as DropLeafChoice, label: "Not sure" }].map(({ choice, label }) => {
          const selected = value === choice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={selected}
              data-ingest-leaf-option={choice}
              onClick={() => onChange(choice)}
              className={`px-2 py-1 rounded-lg border text-[11px] font-mono ${
                selected
                  ? "bg-neon-cyan/10 border-neon-cyan/60 text-neon-cyan"
                  : "border-slate-600/50 text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {leaves.length === 0 && (
        <span className="text-[10px] font-mono text-amber-400" data-ingest-leaf-none>
          No document kinds served for your account
        </span>
      )}
    </div>
  );
}
