/**
 * Bounded warnings. Architect ruling 2026-11-19: a failure reason that reaches a user is a
 * code and a bounded message; raw prompts and raw model output stay in telemetry and are
 * never rendered here. One short line per warning, detail behind a click; 160 characters on
 * a single line is cortex's own guard, and anything else is shown as "detail withheld".
 *
 * The guard is enumerated as the SAFE set (one line, <= 160) rather than a list of bad
 * forms, because cortex cannot tell raw model output from a reason by reading it.
 * Shape (doc-tools, packet 2026-11-19): { code, message, telemetry_ref } or a legacy string.
 */
export const WARNING_MESSAGE_MAX = 160;

export interface ShownWarning {
  code: string | null;
  /** null means withheld. */
  message: string | null;
  telemetryRef: string | null;
  withheld: boolean;
}

export function bounded(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  if (t.includes("\n") || t.includes("\r")) return null;
  if (t.length > WARNING_MESSAGE_MAX) return null;
  return t;
}

export function boundWarning(w: unknown): ShownWarning | null {
  if (w === null || w === undefined) return null;
  if (typeof w === "string") {
    const message = bounded(w);
    return { code: null, message, telemetryRef: null, withheld: message === null };
  }
  if (typeof w === "object" && !Array.isArray(w)) {
    const o = w as Record<string, unknown>;
    const message = bounded(o.message);
    return {
      code: bounded(o.code),
      message,
      telemetryRef: bounded(o.telemetry_ref),
      withheld: message === null,
    };
  }
  return { code: null, message: null, telemetryRef: null, withheld: true };
}

export function boundWarnings(list: unknown): ShownWarning[] {
  if (!Array.isArray(list)) return [];
  const out: ShownWarning[] = [];
  for (const w of list) {
    const b = boundWarning(w);
    if (b) out.push(b);
  }
  return out;
}
