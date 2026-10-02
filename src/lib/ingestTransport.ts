/**
 * ingestTransport — picks the real ingest wire (`src/api/client.ts`) or the in-memory mock
 * (`src/lib/ingestMock.ts`) by `isIngestMockEnabled()`.
 *
 * Every UI component under `src/components/ingest/` imports ONLY from here, never from
 * `client.ts` or `ingestMock.ts` directly, so neither is hard-wired into the component tree.
 *
 * Promote/reject are NOT re-exported here — the row carries no task; the review verbs are acted
 * on through the existing, already-served `actOnHumanTask` in `src/api/client.ts` directly, mock
 * or not (see `IngestStatusCard`'s doc comment).
 */
import {
  uploadIngest as realUploadIngest,
  fetchIngestStatus as realFetchIngestStatus,
  disputeIngestOrigin as realDisputeIngestOrigin,
} from "@/api/client";
import {
  uploadIngest as mockUploadIngest,
  fetchIngestStatus as mockFetchIngestStatus,
  disputeIngestOrigin as mockDisputeIngestOrigin,
} from "./ingestMock";
import { isIngestMockEnabled } from "./ingestFlag";

export function uploadIngest(file: File, kind: string, onBehalfOf: string): Promise<unknown> {
  return isIngestMockEnabled()
    ? mockUploadIngest(file, kind, onBehalfOf)
    : realUploadIngest(file, kind, onBehalfOf);
}

export function fetchIngestStatus(ingestId: string): Promise<unknown> {
  return isIngestMockEnabled() ? mockFetchIngestStatus(ingestId) : realFetchIngestStatus(ingestId);
}

/** CORTEX-PROPOSED — see `src/api/client.ts`'s `disputeIngestOrigin` doc comment. */
export function disputeIngestOrigin(ingestId: string, onBehalfOf: string): Promise<{ steward_task_id: string }> {
  return isIngestMockEnabled()
    ? mockDisputeIngestOrigin(ingestId, onBehalfOf)
    : realDisputeIngestOrigin(ingestId, onBehalfOf);
}
