/**
 * Reader for `GET /askable_measures` (invincible-agent #525, merged ba70c92a). Plan:
 * `invincible-agent/sessions/2026-11-22-plan-to-architect-cc-lane-fin-lane-74-lane-01-from-cortex-how-a-served-measure-list-appears.md`.
 *
 * The server already filters `measures` to the caller. Cortex never filters by `cells` (it holds no cell
 * rule, so the field is not read) and never lists a measure of its own: what is drawn is what is served.
 * `composed: false` means the rows were NOT READ, which is not the same as "none".
 */
export const ASKABLE_MEASURE_FIELDS = [
  "verb", "name", "description", "phrasings", "cells", "shape", "unit", "example_ask", "group_label",
] as const;

export type AskableRow = {
  verb: string;
  name: string;
  description: string;
  phrasings: string[];
  shape: string | null;
  unit: string | null;
  exampleAsk: string | null;
  groupLabel: string | null;
};

type Invalid = { source: string; reason: string };

/**
 * The cell the list was filtered for, as SERVED (invincible-agent 87c0707c, #545): `persona` is null only
 * when `cell_source` is `none`. `cellSource` is drawn verbatim: an unlisted value is not refused.
 */
export type AskableCell = { persona: string | null; domains: string[]; cellSource: string };

/** A refusal the server answered with (400 incomplete_override, 403 cell_not_entitled, persona_not_held, ...). */
export type AskableRefusal = { status: number; code: string | null; reason: string };

export type AskableRead =
  | { kind: "unreadable" }
  | { kind: "refused"; refusal: AskableRefusal }
  | { kind: "not-composed"; invalid: Invalid[] }
  | { kind: "ready"; rows: AskableRow[]; unreadableRows: number; invalid: Invalid[]; cell: AskableCell };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const optStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function readRow(raw: unknown): AskableRow | null {
  if (!isObj(raw)) return null;
  const { verb, name, description, phrasings } = raw;
  if (typeof verb !== "string" || verb === "" || typeof name !== "string" || name === "") return null;
  if (typeof description !== "string" || !Array.isArray(phrasings)) return null;
  return {
    verb,
    name,
    description,
    phrasings: phrasings.filter((p): p is string => typeof p === "string"),
    shape: optStr(raw.shape),
    unit: optStr(raw.unit),
    exampleAsk: optStr(raw.example_ask),
    groupLabel: optStr(raw.group_label),
  };
}

export function readAskableMeasures(data: unknown): AskableRead {
  if (!isObj(data)) return { kind: "unreadable" };
  if (typeof data.composed !== "boolean" || !Array.isArray(data.measures)) return { kind: "unreadable" };
  // persona, domains and cell_source are SERVED keys (the response model requires them): an absent one is a
  // reply cortex cannot read, never a default. persona may be null (cell_source "none").
  if (data.persona !== null && typeof data.persona !== "string") return { kind: "unreadable" };
  if (!Array.isArray(data.domains) || !data.domains.every((d) => typeof d === "string")) return { kind: "unreadable" };
  if (typeof data.cell_source !== "string" || data.cell_source === "") return { kind: "unreadable" };
  const cell: AskableCell = { persona: data.persona, domains: [...(data.domains as string[])], cellSource: data.cell_source };
  let invalid: Invalid[] = [];
  if (data.invalid !== undefined) {
    if (!Array.isArray(data.invalid)) return { kind: "unreadable" };
    invalid = data.invalid.flatMap((e): Invalid[] =>
      isObj(e) && typeof e.source === "string" && typeof e.reason === "string"
        ? [{ source: e.source, reason: e.reason }]
        : [],
    );
  }
  if (!data.composed) return { kind: "not-composed", invalid };
  const rows: AskableRow[] = [];
  let unreadableRows = 0;
  for (const m of data.measures) {
    const r = readRow(m);
    if (r) rows.push(r);
    else unreadableRows += 1;
  }
  return { kind: "ready", rows, unreadableRows, invalid, cell };
}

export function matchesSearch(row: AskableRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  return [row.name, row.description, ...row.phrasings].some((s) => s.toLowerCase().includes(needle));
}

export function groupRows(rows: AskableRow[]): { label: string | null; rows: AskableRow[] }[] {
  const groups: { label: string | null; rows: AskableRow[] }[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.label === r.groupLabel);
    if (!g) {
      g = { label: r.groupLabel, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

/**
 * A refusal read off an axios-style error (`response.status`, `response.data.detail`). The detail is either a
 * string (a 422/503 from the pick) or an object `{error, message}` (400 incomplete_override, 403
 * cell_not_entitled, persona_not_held). The reason is the SERVED words; the code is the served `error`.
 * Null when the error carries no HTTP response (unreachable), which is not a refusal.
 */
export function readAskableRefusal(err: unknown): AskableRefusal | null {
  const r = isObj(err) && isObj(err.response) ? err.response : null;
  if (!r || typeof r.status !== "number") return null;
  return refusalFromDetail(r.status, isObj(r.data) ? r.data.detail : undefined);
}

export function refusalFromDetail(status: number, detail: unknown): AskableRefusal {
  if (typeof detail === "string" && detail.trim() !== "") return { status, code: null, reason: detail };
  if (isObj(detail)) {
    const code = optStr(detail.error);
    const reason = optStr(detail.message) ?? optStr(detail.reason) ?? code;
    if (reason !== null) return { status, code, reason };
  }
  return { status, code: null, reason: `The server refused this (${status}).` };
}

/** What an Ask sends: the entry verb as listed, no bindings (the server asks for any unbound parameter). */
export function askablePick(verb: string): { verb: string; bindings: Record<string, string> } {
  return { verb, bindings: {} };
}
