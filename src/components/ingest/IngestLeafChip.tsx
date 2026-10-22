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
import { FRACTION_PAGE } from "@/lib/evidenceRef";
import { PdfEvidencePane } from "@/components/ApprovalTask/PdfEvidencePane";
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
  if (!leaf) {
    // "Not read yet" is for a run that is actually running; a read that gave up says so and asks.
    if (stage === "received" || stage === "extracting") return "? · not read yet";
    if (stage === INGEST_AWAITING_KIND_STATUS) return "? · couldn't tell — pick one";
    return "? · not identified";
  }
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
  // A person's open/close holds only for the stage it was made at. At `awaiting_kind` the picker is not
  // a toggle at all (below): the row is waiting on the pick, so it is always on the card.
  const [toggle, setToggle] = useState<{ stage: string | null; open: boolean } | null>(null);
  const toggled = toggle !== null && toggle.stage === stage && toggle.open;
  const setOpen = (next: boolean) => {
    setToggle({ stage, open: next });
    if (!next) setShowAt(null);
  };
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which candidate's crop is shown (one at a time). It closes with the picker and with the candidates.
  // Held for the stage it was made at, like the picker's own open/close; closing the picker clears it.
  const [showAt, setShowAt] = useState<{ stage: string | null; leaf: IngestLeaf } | null>(null);
  const shownLeaf = showAt !== null && showAt.stage === stage ? showAt.leaf : null;
  const setShownLeaf = (next: IngestLeaf | null) => setShowAt(next === null ? null : { stage, leaf: next });

  const changeable = !locked && stage !== null && !LOCKED_STAGES.has(stage);
  const open = changeable && (awaitingKind || toggled);
  const shown = open ? (candidates ?? []).find((c) => c.leaf === shownLeaf) : undefined;
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
      {changeable && !awaitingKind ? (
        <button
          type="button"
          data-leaf-verb="change"
          className={`self-start text-[11px] font-mono ${tone} underline decoration-dotted`}
          onClick={() => setOpen(!toggled)}
        >
          {label}
        </button>
      ) : (
        <span className={`text-[11px] font-mono ${awaitingKind && changeable ? tone : "text-slate-300"}`}>{label}</span>
      )}
      {open && (
        <div className="flex gap-2">
          {(candidates ?? []).map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <button
                type="button"
                data-leaf-candidate={c.leaf}
                disabled={posting || leaf === c.leaf}
                className="px-2 py-1 text-[10px] font-mono rounded bg-cyan-600/30 text-cyan-200 disabled:opacity-40"
                onClick={() => void pick(c.leaf)}
              >
                {c.leaf.toUpperCase()} {Math.round(c.score * 100) / 100} · title on p.{c.evidence_ref.page}
              </button>
              <button
                type="button"
                data-leaf-candidate-show={c.leaf}
                aria-label={`${shownLeaf === c.leaf ? "Hide" : "Show"} the title the read used for ${c.leaf.toUpperCase()}`}
                className="px-1.5 py-1 text-[10px] font-mono rounded bg-white/5 text-slate-300"
                onClick={() => setShownLeaf(shownLeaf === c.leaf ? null : c.leaf)}
              >
                {shownLeaf === c.leaf ? "hide" : "show"}
              </button>
            </span>
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
          {!awaitingKind && (
            <button
              type="button"
              data-leaf-verb="cancel"
              disabled={posting}
              className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-white/5 text-slate-300 disabled:opacity-40"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {shown && (
        <div data-leaf-crop={shown.leaf}>
          <PdfEvidencePane
            ingestId={ingestId}
            target={{ page: shown.evidence_ref.page, bbox: shown.evidence_ref.bbox, page_dims: FRACTION_PAGE, units: null }}
            quality="cell"
            caption={`Outlined: the title the read used on p${shown.evidence_ref.page}.`}
          />
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
