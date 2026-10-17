import { MODEL_QUESTIONS, type ModelQuestion } from "./contract";

export type QuestionState = "answered" | "deferred" | "not-recorded" | "unreadable";

export interface ReadAnswer {
  state: QuestionState;
  /** Answered: the value, lists joined with ", ". */
  value?: string;
  source?: string;
  reason?: string;
  /** Unreadable only: the key was not on the wire at all (vs. present but malformed). */
  missing?: boolean;
}

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const nonBlank = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

const UNREADABLE: ReadAnswer = { state: "unreadable" };

/**
 * The safe set is ENUMERATED: exactly the well-formed shapes below count; everything else is
 * unreadable. Notably `{state: "open"}` is unreadable — a ratified model cannot hold an open
 * question; "open" only exists on a proposal. And the wire spelling is `not_recorded` (underscore).
 */
function readOne(raw: unknown): ReadAnswer {
  if (!isPlainObject(raw)) return UNREADABLE;
  const state = Object.hasOwn(raw, "state") ? raw.state : undefined;
  if (state === "not_recorded") return { state: "not-recorded" };
  if (state === "answered") {
    const v = raw.value;
    let value: string | null = null;
    if (nonBlank(v)) value = v;
    else if (Array.isArray(v) && v.length > 0 && v.every(nonBlank)) value = v.join(", ");
    if (value === null) return UNREADABLE;
    const out: ReadAnswer = { state: "answered", value };
    if (nonBlank(raw.source)) out.source = raw.source;
    return out;
  }
  if (state === "deferred") {
    if (!nonBlank(raw.reason)) return UNREADABLE;
    return { state: "deferred", reason: raw.reason };
  }
  return UNREADABLE;
}

export function questionState(raw: unknown): QuestionState {
  return readOne(raw).state;
}

export function readAnswers(answers: unknown): {
  byQuestion: Record<ModelQuestion, ReadAnswer>;
  unknownKeys: string[];
} {
  const plain = isPlainObject(answers);
  const byQuestion = {} as Record<ModelQuestion, ReadAnswer>;
  for (const q of MODEL_QUESTIONS) {
    if (plain && Object.hasOwn(answers, q)) byQuestion[q] = readOne(answers[q]);
    else byQuestion[q] = { state: "unreadable", missing: true };
  }
  const known: readonly string[] = MODEL_QUESTIONS;
  const unknownKeys = plain ? Object.keys(answers).filter((k) => !known.includes(k)) : [];
  return { byQuestion, unknownKeys };
}
