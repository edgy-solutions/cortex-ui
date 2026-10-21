/**
 * IngestLeafChip — which LEAF (PCN or PDN) a drop was read as, and who said so.
 *
 * Directive (architect, 2026-10-21): a chip with its source after the drop; the leaf may be
 * changed before or after extraction starts, and a change is a LEAF CORRECTION on the row; a "?"
 * sits at `awaiting_kind`; there is NO picker before the drop (the drop stays one gesture).
 *
 * The wire is PROPOSED (packet `sessions/2026-10-21-packet-to-architect-and-lane-01-no-leaf-is-settable-today-a-pdf-drop-parks-at-awaiting-origin-the-chip-needs-three-wire-items.md`
 * §3a/§3b): `leaf` / `leaf_source` on the status row and `POST /ingest/{id}/leaf`. It renders
 * NOTHING until the status row carries the `leaf_source` key — absent is no claim, today's wire.
 * It replaces the dormant 10-09 `IngestKindSuggestion` proposal.
 *
 * Final shape (architect ruling 10-21): one source enum (declared / title / corrected, with
 * `corrected_by`), candidates when the read was not confident, and the same route for the steward at
 * review. `LeafChip` is the presentational part, shared with the review card.
 */
import { useState } from "react";
import { correctIngestLeaf } from "@/lib/ingestTransport";
import {
  INGEST_AWAITING_KIND_STATUS,
  INGEST_LEAVES,
  readActRefusal,
  readIngestErrorMessage,
  readIngestStatusRow,
  type IngestLeaf,
  type IngestLeafCandidate,
  type IngestLeafSource,
  type IngestStatusRow,
} from "@/lib/ingestWire";

/** Past these the server will not take a correction; it decides the finer line and says so. */
const LOCKED_STAGES: ReadonlySet<string> = new Set(["promoted", "rejected", "failed", "review_rejected"]);

export interface LeafChipProps {
  ingestId: string;
  stage: string | null;
  leaf: IngestLeaf | null;
  leafSource: IngestLeafSource | null;
  correctedBy: string | null;
  candidates?: IngestLeafCandidate[];
  /** The host's own lock, beside the stage's: a review card whose task is already decided. */
  locked?: boolean;
  onRow?: (row: IngestStatusRow) => void;
}

/** The label for a leaf; exported so the wording lives in one place. */
export function leafLabel(leaf: IngestLeaf | null, source: IngestLeafSource | null, correctedBy: string | null, stage: string | null): string {
  if (!leaf) return stage === "received" || stage === "extracting" ? "? · not read yet" : "? · not identified";
  const name = leaf.toUpperCase();
  if (source === "declared") return `${name} · declared`;
  if (source === "corrected") return correctedBy ? `${name} · corrected by ${correctedBy}` : `${name} · corrected`;
  if (source === "title") return `${name} · from title`;
  // A leaf with no source (the review body's reader maps an unknown name to null) claims nothing about where it came from.
  return `${name} · source not given`;
}

export function IngestLeafChip({ row, onRow }: { row: IngestStatusRow; onRow?: (row: IngestStatusRow) => void }) {
  if (!("leaf_source" in row)) return null;
  if (row.duplicate !== null) return null;
  if (row.kind === "event") return null;
  return (
    <LeafChip
      ingestId={row.ingest_id}
      stage={row.stage}
      leaf={row.leaf ?? null}
      leafSource={row.leaf_source ?? null}
      correctedBy={row.corrected_by ?? null}
      candidates={row.leaf_candidates}
      onRow={onRow}
    />
  );
}

export function LeafChip({ ingestId, stage, leaf, leafSource: source, correctedBy, candidates, locked = false, onRow }: LeafChipProps) {
  const awaitingKind = stage === INGEST_AWAITING_KIND_STATUS;
  // The picker's default follows the CURRENT stage: the chip mounts at `received` and the row reaches
  // `awaiting_kind` later, so a mount-time default would leave a "?" row waiting with the picker shut.
  // A person's open/close holds only for the stage it was made at.
  const [toggle, setToggle] = useState<{ stage: string | null; open: boolean } | null>(null);
  const open = toggle !== null && toggle.stage === stage ? toggle.open : awaitingKind;
  const setOpen = (next: boolean) => setToggle({ stage, open: next });
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeable = !locked && stage !== null && !LOCKED_STAGES.has(stage);
  const label = leafLabel(leaf, source, correctedBy, stage);

  const pick = async (next: IngestLeaf) => {
    setPosting(true);
    setError(null);
    try {
      const response = await correctIngestLeaf(ingestId, next);
      const parsed = readIngestStatusRow(response);
      if (parsed) onRow?.(parsed);
      setOpen(false);
    } catch (err) {
      setError(readActRefusal(err)?.message ?? readIngestErrorMessage(err) ?? "Change failed.");
    } finally {
      setPosting(false);
    }
  };

  const tone = awaitingKind ? "text-amber-400" : "text-cyan-300";
  return (
    <div
      className="mt-2 flex flex-col gap-1"
      data-leaf-chip
      data-leaf={leaf ?? "?"}
      data-leaf-source={source ?? "none"}
      data-leaf-corrected-by={correctedBy ?? undefined}
    >
      {changeable ? (
        <button
          type="button"
          data-leaf-verb="change"
          className={`self-start text-[11px] font-mono ${tone} underline decoration-dotted`}
          onClick={() => setOpen(!open)}
        >
          {label}
        </button>
      ) : (
        <span className="text-[11px] font-mono text-slate-300">{label}</span>
      )}
      {changeable && open && (
        <div className="flex gap-2">
          {/* A candidate's crop is NOT drawn yet: its bbox has no page_dims, which bboxScale.ts needs (asked of Lane 1). */}
          {(candidates ?? []).map((c, i) => (
            <button
              key={i}
              type="button"
              data-leaf-candidate={c.leaf}
              disabled={posting || leaf === c.leaf}
              className="px-2 py-1 text-[10px] font-mono rounded bg-cyan-600/30 text-cyan-200 disabled:opacity-40"
              onClick={() => void pick(c.leaf)}
            >
              {c.leaf.toUpperCase()} {Math.round(c.score * 100) / 100} · title on p.{c.evidence_ref.page}
            </button>
          ))}
          {INGEST_LEAVES.filter((l) => !(candidates ?? []).some((c) => c.leaf === l)).map((l) => (
            <button
              key={l}
              type="button"
              data-leaf-pick={l}
              disabled={posting || leaf === l}
              className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-cyan-600/30 text-cyan-200 disabled:opacity-40"
              onClick={() => void pick(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            data-leaf-verb="cancel"
            disabled={posting}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-white/5 text-slate-300 disabled:opacity-40"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="text-[10px] font-mono text-rose-400" role="alert" data-leaf-error>
          {error}
        </p>
      )}
    </div>
  );
}
