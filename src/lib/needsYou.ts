/**
 * "Needs you" — the drops waiting on a person to say what kind they are (stage `awaiting_kind`).
 * Keyed on the stage alone; the server's reason for it is not ours to interpret.
 */
import type { Artifact } from "@/api/types";
import { ingestComponentFrom } from "@/lib/ingestArtifact";
import { INGEST_AWAITING_KIND_STATUS, type IngestStatusRow } from "@/lib/ingestWire";

/** Ids of the ingest artifacts at `awaiting_kind`, in artifact order. */
export function needsYouArtifactIds(artifacts: readonly Pick<Artifact, "id" | "rendered_output">[]): string[] {
  return artifacts.filter((a) => ingestComponentFrom(a)?.badge === INGEST_AWAITING_KIND_STATUS).map((a) => a.id);
}

type StageRows = Readonly<Record<string, Pick<IngestStatusRow, "stage">>>;

/**
 * The ingest ids that just ENTERED `awaiting_kind`: at it in `next`, and present in `prev` at another
 * stage. A row first seen there (the `/ingest/mine` load after a reload) is not an entry: the header
 * count covers it, and a page load must not fire one toast per waiting drop.
 */
export function enteredAwaitingKind(prev: StageRows, next: StageRows): string[] {
  return Object.keys(next).filter((id) => {
    if (next[id].stage !== INGEST_AWAITING_KIND_STATUS) return false;
    const before = prev[id];
    return before !== undefined && before.stage !== INGEST_AWAITING_KIND_STATUS;
  });
}
