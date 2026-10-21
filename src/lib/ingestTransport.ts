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
  fetchIngestMine as realFetchIngestMine,
  disputeIngestOrigin as realDisputeIngestOrigin,
  correctIngestLeaf as realCorrectIngestLeaf,
  retryIngest as realRetryIngest,
  fetchIngestSource as realFetchIngestSource,
  fetchIngestExtraction as realFetchIngestExtraction,
} from "@/api/client";
import type { IngestSource } from "@/api/client";
import type { IngestLeaf } from "./ingestWire";
import {
  uploadIngest as mockUploadIngest,
  fetchIngestStatus as mockFetchIngestStatus,
  fetchIngestMine as mockFetchIngestMine,
  disputeIngestOrigin as mockDisputeIngestOrigin,
  correctIngestLeaf as mockCorrectIngestLeaf,
  mockRetryIngest,
  fetchIngestSource as mockFetchIngestSource,
  fetchIngestExtraction as mockFetchIngestExtraction,
} from "./ingestMock";
import { isIngestMockEnabled } from "./ingestFlag";

export function uploadIngest(file: File, kind: string, onBehalfOf: string, contentKind: string): Promise<unknown> {
  return isIngestMockEnabled()
    ? mockUploadIngest(file, kind, onBehalfOf, contentKind)
    : realUploadIngest(file, kind, onBehalfOf, contentKind);
}

export function fetchIngestStatus(ingestId: string): Promise<unknown> {
  return isIngestMockEnabled() ? mockFetchIngestStatus(ingestId) : realFetchIngestStatus(ingestId);
}

/** `GET /ingest/mine` — see `src/api/client.ts`'s `fetchIngestMine`. */
export function fetchIngestMine(limit: number, before: string | null = null): Promise<unknown> {
  return isIngestMockEnabled() ? mockFetchIngestMine(limit, before) : realFetchIngestMine(limit, before);
}

/** CORTEX-PROPOSED — see `src/api/client.ts`'s `disputeIngestOrigin` doc comment. */
export function disputeIngestOrigin(ingestId: string, onBehalfOf: string): Promise<{ steward_task_id: string }> {
  return isIngestMockEnabled()
    ? mockDisputeIngestOrigin(ingestId, onBehalfOf)
    : realDisputeIngestOrigin(ingestId, onBehalfOf);
}

/** PROPOSED — see `src/api/client.ts`'s `correctIngestLeaf`. */
export function correctIngestLeaf(ingestId: string, leaf: IngestLeaf): Promise<unknown> {
  return isIngestMockEnabled() ? mockCorrectIngestLeaf(ingestId, leaf) : realCorrectIngestLeaf(ingestId, leaf);
}

/** `POST /ingest/{id}/retry`, no body — see `src/api/client.ts`'s `retryIngest`. */
export function retryIngest(ingestId: string): Promise<unknown> {
  return isIngestMockEnabled() ? mockRetryIngest(ingestId) : realRetryIngest(ingestId);
}

/** `GET /ingest/{id}/extraction` — see `src/api/client.ts`'s `fetchIngestExtraction`. */
export function fetchIngestExtraction(ingestId: string): Promise<unknown> {
  return isIngestMockEnabled() ? mockFetchIngestExtraction(ingestId) : realFetchIngestExtraction(ingestId);
}

/** `GET /ingest/{id}/source` — see `src/api/client.ts`'s `fetchIngestSource`. */
export function fetchIngestSource(ingestId: string): Promise<IngestSource> {
  return isIngestMockEnabled() ? mockFetchIngestSource(ingestId) : realFetchIngestSource(ingestId);
}
