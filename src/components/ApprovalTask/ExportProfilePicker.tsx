import { profileLabel, refusalCode, type ExportProfile } from "@/lib/reviewExport";

/** One toggle button per SERVED profile, in served order. Nothing is hard-coded here. */
export function ExportProfilePicker({
  profiles,
  selected,
  onSelect,
}: {
  profiles: ExportProfile[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Export profile">
      {profiles.map((p) => (
        <button
          key={p.name}
          type="button"
          data-export-profile={p.name}
          aria-pressed={selected === p.name}
          onClick={() => onSelect(p.name)}
          className={`px-2 py-1 rounded border text-[11px] font-mono cursor-pointer ${
            selected === p.name
              ? "bg-neon-cyan/15 border-neon-cyan/60 text-neon-cyan"
              : "bg-white/5 border-white/20 text-slate-300 hover:bg-white/10"
          }`}
        >
          {profileLabel(p)} <span className="text-[9px] text-slate-500">{p.format} / {p.scope}</span>
        </button>
      ))}
    </div>
  );
}

export type ExportFailure = { kind: "refused"; status: number; code: string | null } | { kind: "failed"; message: string };

/** A refusal (the server answered with a status) is `refused`; anything else is `failed`. */
export function classifyExportError(err: unknown): ExportFailure {
  const { status, code } = refusalCode(err);
  if (status !== null) return { kind: "refused", status, code };
  return { kind: "failed", message: err instanceof Error ? err.message : "export failed" };
}

export function ExportFailureLine({ failure }: { failure: ExportFailure }) {
  if (failure.kind === "refused") {
    return (
      <p className="text-[11px] font-mono text-amber-400/90" role="status" data-export-refusal={failure.code ?? "unknown"}>
        Refused ({failure.status}): {failure.code ?? "no reason code"}
      </p>
    );
  }
  return (
    <p className="text-[11px] font-mono text-neon-pink" role="status" data-export-failed>
      Export failed: {failure.message}
    </p>
  );
}
