/**
 * The `/answers` wire (BFF `answer_list.py`): paged SUMMARIES, and a body read on open.
 *
 * `GET /answers?page&size&q` -> `{items, page, size, total}`; `GET /answers/{id}/body` ->
 * `{id, rendered_output, routing, resolved_intent}`. Both are read here, from `unknown`, and a
 * shape that is not the route's body is `null`, never a guess.
 *
 * `ts` is the projection's `created_at` VERBATIM, epoch MILLISECONDS: `rowToArtifact` passes the
 * column through `parseBigInt` unscaled, and `created_at` is read as ms everywhere downstream
 * (`cardExport`: "epoch MILLISECONDS"; `dayOf`/`formatTime` hand it to `Date`). So a summary's
 * `ts` goes into `Artifact.created_at` with no conversion.
 */
import type { Artifact } from "@/api/types";

export const ANSWERS_PATH = "/answers";
export const ANSWERS_PAGE_SIZE = 50;

export function answerBodyPath(id: string): string {
  return `/answers/${encodeURIComponent(id)}/body`;
}

export interface AnswerSubject {
  uri: string;
  label: string;
}

export interface AnswerSummary {
  id: string;
  ts: number;
  title: string;
  summary: string | null;
  /** The projection's `kind` (e.g. "answer"). NOT an archetype. */
  type: string | null;
  status: string;
  subject: AnswerSubject | null;
  archived: boolean;
}

export interface AnswersPage {
  items: AnswerSummary[];
  /** Items the page carried that were left out (no id, or no finite ts), so a short page is not silent. */
  dropped: number;
  page: number;
  size: number;
  total: number;
}

export interface AnswerBody {
  id: string;
  rendered_output: Artifact["rendered_output"] | null;
  routing: Artifact["routing"];
  resolved_intent: Artifact["resolved_intent"];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readSubject(v: unknown): AnswerSubject | null {
  if (!isRecord(v)) return null;
  const uri = typeof v.uri === "string" ? v.uri : "";
  const label = typeof v.label === "string" ? v.label : "";
  return uri || label ? { uri, label } : null;
}

/** `{items, page, size, total}` -> the page; null on a missing `items` array or a non-integer page/size/total. */
export function readAnswersPage(raw: unknown): AnswersPage | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const { page, size, total } = raw;
  if (!Number.isInteger(page) || !Number.isInteger(size) || !Number.isInteger(total)) return null;
  const items: AnswerSummary[] = [];
  let dropped = 0;
  for (const it of raw.items) {
    if (!isRecord(it) || typeof it.id !== "string" || it.id === "" || typeof it.ts !== "number" || !Number.isFinite(it.ts)) {
      dropped++;
      continue;
    }
    items.push({
      id: it.id,
      ts: it.ts,
      title: typeof it.title === "string" ? it.title : "",
      summary: typeof it.summary === "string" ? it.summary : null,
      type: typeof it.type === "string" ? it.type : null,
      // Cast like `rowToArtifact` does; the projection column is NOT NULL.
      status: typeof it.status === "string" ? it.status : "",
      subject: readSubject(it.subject),
      archived: it.archived === true,
    });
  }
  return { items, dropped, page: page as number, size: size as number, total: total as number };
}

/** The body for `id`; null unless the body names that id (a body for another answer is refused). */
export function readAnswerBody(raw: unknown, id: string): AnswerBody | null {
  if (!isRecord(raw) || raw.id !== id) return null;
  const obj = <T>(v: unknown): T | null => (isRecord(v) ? (v as T) : null);
  return {
    id,
    rendered_output: obj<NonNullable<Artifact["rendered_output"]>>(raw.rendered_output),
    routing: obj<NonNullable<Artifact["routing"]>>(raw.routing),
    resolved_intent: obj<Artifact["resolved_intent"]>(raw.resolved_intent) ?? ({} as Artifact["resolved_intent"]),
  };
}

/**
 * A stub the rail can render from a summary. Every field `rowToArtifact` defaults is defaulted the
 * same way; the six body fields are empty and the store marks the row `absent` until it is opened.
 *
 * `durability_status` is "durable": a summary does not say, but a row listed by `/answers` is read
 * from the Postgres projection, so it is in Postgres by definition.
 */
export function summaryToArtifact(item: AnswerSummary): Artifact {
  return {
    id: item.id,
    created_at: item.ts,
    updated_at: 0,
    duration_ms: null,
    valid_as_of: 0,
    valid_until: null,
    question_text: item.title,
    summary: item.summary ?? "",
    resolved_intent: {} as Artifact["resolved_intent"],
    message_id: "",
    status: item.status as Artifact["status"],
    rendered_output: null,
    produced_by: { actor_type: "agent", actor_id: "unknown" } as Artifact["produced_by"],
    produced_for: { user_id: "unknown", is_authenticated: false, entitlement_source: "none" } as Artifact["produced_for"],
    routing: null,
    sources: [],
    graph_trace: [],
    graph_trace_alternates: [],
    derived_from_artifact_id: null,
    durability_status: "durable",
    watermark: 0,
  };
}
