/**
 * Pure detector for a live GET /cases capture, keyed on JSON SHAPE, never on file name.
 * Used by the arrival seal in `cases.test.ts`. Test-side only; nothing in the app imports it.
 */
import { readWorkflowCasePayload } from "./cases";

const LIST_KEYS = ["cases", "items", "rows"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCasePayload(v: unknown): boolean {
  if (readWorkflowCasePayload(v).ok) return true;
  const list = Array.isArray(v) ? v : isRecord(v) ? LIST_KEYS.map((k) => v[k]).find(Array.isArray) : undefined;
  return Array.isArray(list) && list.length > 0 && readWorkflowCasePayload(list[0]).ok;
}

function candidates(root: unknown): unknown[] {
  const out: unknown[] = [root];
  if (isRecord(root)) {
    out.push(root.body, root.response);
    if (isRecord(root.response)) out.push(root.response.body);
  }
  return out;
}

function parseJson(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

function jsonBlocks(md: string): unknown[] {
  const values: unknown[] = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  for (let m = re.exec(md); m !== null; m = re.exec(md)) {
    const parsed = parseJson(m[1]);
    if (parsed) values.push(parsed.value);
  }
  return values;
}

/** Paths of the files holding a live GET /cases payload (a `.json` file, or a fenced block in a `.md`). */
export function findCaseCaptures(files: { path: string; text: string }[]): string[] {
  const found: string[] = [];
  for (const f of files) {
    const lower = f.path.toLowerCase();
    let roots: unknown[] = [];
    if (lower.endsWith(".json")) {
      const parsed = parseJson(f.text);
      roots = parsed ? [parsed.value] : [];
    } else if (lower.endsWith(".md")) {
      roots = jsonBlocks(f.text);
    }
    if (roots.some((r) => candidates(r).some(isCasePayload))) found.push(f.path);
  }
  return found;
}
