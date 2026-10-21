/** Small total readers for the output renders: absent is absent, never the text "undefined". */
export const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export const rec = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const strList = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");
