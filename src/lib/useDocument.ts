/**
 * useDocument(ingestId) -- the document behind an ingest id, as the rail and the review card both
 * read it. The row is `useIngestStatusStore`'s (the one poller); a missing row REGISTERS the id with
 * that poller (`track`) -- this hook never fetches. `finished` is `ingestPollingDone`.
 */
import { useEffect } from "react";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { ingestPollingDone, type IngestStatusRow } from "@/lib/ingestWire";
import { documentReviewIngestId } from "@/lib/documents";

export interface DocumentView {
  row: IngestStatusRow | null;
  finished: boolean;
  reviewTask: HumanTask | null;
}

export function useDocument(ingestId: string): DocumentView {
  const row = useIngestStatusStore((s) => s.rows[ingestId] ?? null);
  const track = useIngestStatusStore((s) => s.track);
  const epoch = useIngestStatusStore((s) => s.epoch);
  const reviewTask = useHumanTaskStore(
    (s) => s.tasks.find((t) => t.status === "pending" && documentReviewIngestId(t) === ingestId) ?? null,
  );
  const hasRow = row !== null;
  useEffect(() => {
    if (!hasRow) track(ingestId);
  }, [hasRow, ingestId, track, epoch]);
  return { row, finished: row !== null && ingestPollingDone(row), reviewTask };
}
