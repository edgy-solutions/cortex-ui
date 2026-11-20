import { bounded } from "./boundedWarning";

export type ServedList = { label: string | null; items: string[]; total: number };

/**
 * Structured lists served on a refusal (PROPOSED, unratified; architect 11-19 ruling d:
 * a message never carries a list). Keyed on no code, label or list name.
 * `total` counts items the producer holds, including served items that failed the guard.
 */
export function readServedLists(v: unknown): ServedList[] {
  if (!Array.isArray(v)) return [];
  const out: ServedList[] = [];
  for (const e of v) {
    if (typeof e !== "object" || e === null || Array.isArray(e)) continue;
    const o = e as Record<string, unknown>;
    if (!Array.isArray(o.items)) continue;
    const served = o.items.length;
    const items: string[] = [];
    for (const it of o.items) {
      const b = bounded(it);
      if (b !== null) items.push(b);
    }
    const total =
      typeof o.total === "number" && Number.isInteger(o.total) && o.total >= served ? o.total : served;
    if (total === 0) continue;
    out.push({ label: bounded(o.label), items, total });
  }
  return out;
}
