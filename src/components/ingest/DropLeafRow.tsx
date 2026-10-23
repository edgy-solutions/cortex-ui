/**
 * DropLeafRow — the kind question on a pending PDF drop (architect 2026-10-23, overriding the
 * 10-21 "no picker before the drop"): [PCN] [PDN] [Not sure]. Nothing is selected until the
 * dropper answers; "Not sure" is a valid answer and sends no leaf.
 *
 * LATER: pre-select the title read's proposal here when one exists (`value` seeded by the caller).
 */
import type { DropLeafChoice } from "@/store/useIngestComposerStore";

const OPTIONS: { choice: DropLeafChoice; label: string }[] = [
  { choice: "pcn", label: "PCN" },
  { choice: "pdn", label: "PDN" },
  { choice: "unsure", label: "Not sure" },
];

export interface DropLeafRowProps {
  value: DropLeafChoice | null;
  onChange: (choice: DropLeafChoice) => void;
}

export function DropLeafRow({ value, onChange }: DropLeafRowProps) {
  return (
    <div
      className="flex items-center gap-2"
      data-ingest-leaf-row
      data-ingest-leaf-selected={value ?? "none"}
    >
      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Kind</span>
      <div role="radiogroup" aria-label="Document kind" className="flex items-center gap-1.5">
        {OPTIONS.map(({ choice, label }) => {
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
    </div>
  );
}
