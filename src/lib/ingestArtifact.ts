/**
 * Drop → Artifact adapter.
 *
 * A drop is a TURN: it rides the answers rail as a synthetic `Artifact` of archetype `INGEST`,
 * exactly as a HITL task does (`taskArtifact.ts` is the precedent) — same collection, same
 * `currentArtifactId` selection, no second surface. Distinguished by the `ingest:` id prefix.
 *
 * ⛔ An ingest artifact is NOT an answer. It is client-made, never in the graph of record, and
 * must never be sent to a server route as one (export, ask lineage, canvas save). Every site that
 * excludes task-artifacts for that reason excludes this too — see `isIngestArtifact`.
 *
 * Only fields the client holds are carried: the filename and kind it sent, the upload phase, and
 * the status row it polled, including the `failed` reason and the notice id when the row carries one.
 */
import type { Artifact } from "@/api/types";
import { INGEST_DUPLICATE_STATUS, INGEST_STAGES, ingestPollingDone, type ExtractionDefect, type IngestKind, type IngestStage, type IngestStatusRow } from "@/lib/ingestWire";

export const INGEST_ARTIFACT_PREFIX = "ingest:";

export const ingestArtifactId = (key: string): string => INGEST_ARTIFACT_PREFIX + key;

export const isIngestArtifactId = (id: string): boolean => id.startsWith(INGEST_ARTIFACT_PREFIX);

export const isIngestArtifact = (a: Pick<Artifact, "id">): boolean => isIngestArtifactId(a.id);

/** The `ingest` object carried by the artifact's one `INGEST` component. */
export interface IngestComponent {
  /** null while uploading, on an upload that failed, or on a duplicate with no original named. */
  ingest_id: string | null;
  filename: string;
  kind: IngestKind | null;
  /** The badge: `uploading`, `error`, `duplicate`, `not found`, or the row's stage. */
  badge: string;
  /** The server's `detail`, verbatim, when the upload was refused. */
  error: string | null;
  /** The original's id when this drop is a duplicate. */
  duplicate_of: string | null;
  /** What the upload response said when it called this drop a duplicate; null otherwise. */
  duplicate_message: string | null;
  /** The note typed with the drop, verbatim; null when there was none. */
  note: string | null;
  extraction_defect: ExtractionDefect | null;
  /** The producer's `failure.reason`, verbatim, when its stage is `failed`; on a fleet that sends no `failure` (before 33b80988) the row's `detail` instead; null for every other stage (rejected included). */
  reason: string | null;
  /** `failure.reason_code` verbatim (open vocabulary), only when failed; null when unclassified, absent, or not failed. */
  reason_code: string | null;
  /** The row's `attempt` (1 on arrival, +1 per retry); null when the wire sent none. */
  attempt: number | null;
  /** The notice's own identifier from the status row; null when absent or null on the wire. */
  notice_id: string | null;
}

/** What the sync hook knows about one drop. */
export interface IngestEntry {
  /** The ingest id once the server gave one (so the id survives a reload); the turn id before that, and for a duplicate. */
  key: string;
  filename: string;
  kind: IngestKind | null;
  /** epoch ms */
  droppedAt: number;
  phase: "uploading" | "status" | "error";
  ingestId: string | null;
  error: string | null;
  /** This session's upload was accepted (202 with an id); false for a drop remembered from storage. */
  acceptedThisSession: boolean;
  /** The upload response said "already processed". */
  duplicate: { message: string; ofIngestId: string | null } | null;
  /** The note typed with the drop (a stored drop has none). */
  note: string | null;
  row: IngestStatusRow | null;
  notFound: boolean;
}

function badgeOf(e: IngestEntry): string {
  if (e.phase === "uploading") return "uploading";
  if (e.phase === "error") return "error";
  if (e.duplicate !== null || e.row?.duplicate) return INGEST_DUPLICATE_STATUS;
  if (e.notFound) return "not found";
  if (e.row?.stage) return e.row.stage;
  // The upload was accepted (202 with an id) and no status has been read yet: that IS received.
  // A reloaded drop with no row yet has said nothing, and says so.
  return e.acceptedThisSession ? "received" : "checking";
}

export function ingestComponentOf(e: IngestEntry): IngestComponent {
  return {
    ingest_id: e.ingestId,
    filename: e.filename,
    kind: e.row?.kind ?? e.kind,
    badge: badgeOf(e),
    error: e.phase === "error" ? e.error : null,
    duplicate_of: e.duplicate?.ofIngestId ?? e.row?.duplicate?.of_ingest_id ?? null,
    duplicate_message: e.duplicate?.message ?? null,
    note: e.note || null,
    extraction_defect: e.row?.extraction_defect ?? null,
    reason: e.row?.stage === "failed" ? (e.row.failure?.reason ?? e.row.detail ?? null) : null,
    reason_code: e.row?.stage === "failed" ? (e.row.failure?.reason_code ?? null) : null,
    attempt: e.row?.attempt ?? null,
    notice_id: e.row?.notice_id ?? null,
  };
}

/**
 * A drop that is still moving: uploading, or at a stage `ingestPollingDone` does not call terminal
 * (received, extracting, review). The composer badge counts these. `checking` (a remembered drop
 * whose status has not been read yet) is NOT counted: it has said nothing, and counting it would
 * flash every stored, long-finished drop as in flight on each reload.
 */
export function ingestInFlight(c: Pick<IngestComponent, "badge">): boolean {
  if (c.badge === "uploading") return true;
  return (INGEST_STAGES as readonly string[]).includes(c.badge) && !ingestPollingDone({ stage: c.badge as IngestStage, duplicate: null });
}

/** The `INGEST` component an artifact carries, or null if it is not an ingest artifact. */
export function ingestComponentFrom(a: Pick<Artifact, "rendered_output">): IngestComponent | null {
  const c = a.rendered_output?.components?.[0] as { archetype?: unknown; ingest?: IngestComponent } | undefined;
  return c && c.archetype === "INGEST" && c.ingest ? c.ingest : null;
}

export function ingestToArtifact(e: IngestEntry): Artifact {
  const comp = ingestComponentOf(e);
  const kind = comp.kind;
  return {
    id: ingestArtifactId(e.key),
    created_at: e.droppedAt,
    updated_at: e.droppedAt,
    valid_as_of: e.droppedAt,
    valid_until: null,
    question_text: kind ? `dropped as ${kind}` : "",
    summary: e.filename, // the timeline lead line (answerSummary reads this)
    resolved_intent: {},
    message_id: "",
    status: "complete",
    rendered_output: { components: [{ archetype: "INGEST", ingest: comp }] },
    produced_by: { actor_type: "user", actor_id: "ingest" },
    produced_for: { user_id: "", is_authenticated: true, entitlement_source: "none" },
    routing: null,
    sources: [],
    graph_trace: [],
    graph_trace_alternates: [],
    derived_from_artifact_id: null,
    // Never in the graph of record: the ask-lineage claim refuses on this alone, and refuses by id too.
    durability_status: "persistence_pending",
    watermark: 0,
  };
}
