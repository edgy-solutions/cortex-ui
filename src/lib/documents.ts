/**
 * The `documents` adapter (refactor item 5): the rail and the review card read ONE description of
 * "the document behind an ingest_id". This file is the pure half; `useDocument.ts` is the hook.
 *
 * `documentReviewIngestId` is THE predicate for "this task is the review of document X". The
 * dispatcher (`ApprovalTaskCard`) and the rail's attach (`IngestStatusCard`, via `useDocument`) both
 * call it, so a kind or shape added here reaches both and neither can forget it. Today the only kind
 * is `document_promotion` (see `promotionReviewIngestId`); `status === "pending"` is NOT part of it:
 * the card draws a decided task too, while the rail attaches only a task still waiting on a person.
 */
import { promotionReviewIngestId } from "@/lib/promotionReview";

export function documentReviewIngestId(task: { kind: string; payload?: unknown }): string | null {
  return promotionReviewIngestId(task.kind, task.payload);
}
