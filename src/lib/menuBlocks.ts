/**
 * The reader for `GET /menu_blocks`, and the merge of what it serves into cortex's assembled menu.
 *
 * DRAFT UNTIL FINANCE'S BLOCKS ARE SERVED (architect, 2026-11-22). Built against 74's shape; nothing
 * here has met a captured body. The test fixture is CONSTRUCTED from the producer's source row.
 *
 * PRODUCER: invincible-agent `src/iagent/gateway.py` (GET /menu_blocks) and `src/iagent/menu_blocks.py`,
 * merged in PR #427.
 *
 * FOUR STATES, kept apart because collapsing any two is a silent wrong answer:
 *   unreachable  the call failed; cortex knows nothing.
 *   unreadable   a body arrived that is not the envelope (not an object, `composed` not a boolean, or
 *                `composed:true` with `blocks` not an array). Say so; do not guess.
 *   uncomposed   `composed:false`: the producer did NOT read its registry. NOT an empty menu.
 *   ready        `composed:true`. `blocks:[]` here means genuinely none.
 *
 * AN EMPTY OR ABSENT ANSWER NEVER REMOVES A HAND ROW. Only a served block that speaks for a hand row
 * replaces it, and only that row.
 *
 * THE KEY IS THE PAIR (subject_uri, object_uri), NOT THE SUBJECT. Every finance measure shares the
 * subject `fin:DeclaredMeasureSeries` across two archetypes, so a served MultiSeries block must not
 * remove a hand FlowDecomposition row for the same subject. Subjects are compared as strings.
 *
 * A block's `archetype` is the object CLASS (cortex's `object_uri`), not cortex's `archetype` token.
 * Cortex can draw a class only if some assembled row already carries it; that row is the template.
 * A served pair with no template is reported as `undrawable` and not registered.
 *
 * Each block is validated on its own: one bad block is skipped and named, the rest are kept. Unknown
 * extra keys on a block or the envelope are tolerated, never a skip: a declared field is coming.
 * Several blocks may share one pair (different `declared_by`); they merge into one capability with
 * the fits unioned in first-seen order.
 */
import type { AssembledCapability } from "@/registry/assembleCapabilities";

export interface ServedBlock {
  subject: string;
  archetype: string;
  persona_fit: string[];
  domain_fit: string[];
  declared_by: string;
}

export type MenuBlocksRead =
  | { kind: "unreachable" }
  | { kind: "unreadable"; reason: string }
  | { kind: "uncomposed" }
  | {
      kind: "ready";
      blocks: ServedBlock[];
      invalid: { source: string; reason: string }[];
      skipped: { index: number; reason: string }[];
    };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const nonEmpty = (v: unknown): v is string => isStr(v) && v.length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function checkBlock(b: unknown): ServedBlock | string {
  if (!isObj(b)) return "block is not an object";
  for (const f of ["subject", "archetype", "declared_by"] as const) {
    if (!nonEmpty(b[f])) return `${f} is not a non-empty string`;
  }
  for (const f of ["persona_fit", "domain_fit"] as const) {
    if (!isStrArr(b[f])) return `${f} is not an array of strings`;
  }
  return {
    subject: b.subject as string,
    archetype: b.archetype as string,
    persona_fit: [...(b.persona_fit as string[])],
    domain_fit: [...(b.domain_fit as string[])],
    declared_by: b.declared_by as string,
  };
}

export function readMenuBlocks(body: unknown | null): MenuBlocksRead {
  if (body === null) return { kind: "unreachable" };
  if (!isObj(body)) return { kind: "unreadable", reason: "body is not an object" };
  if (typeof body.composed !== "boolean") {
    return { kind: "unreadable", reason: "composed is not a boolean" };
  }
  if (!body.composed) return { kind: "uncomposed" };
  if (!Array.isArray(body.blocks)) {
    return { kind: "unreadable", reason: "composed is true but blocks is not an array" };
  }
  const blocks: ServedBlock[] = [];
  const skipped: { index: number; reason: string }[] = [];
  body.blocks.forEach((raw, index) => {
    const r = checkBlock(raw);
    if (typeof r === "string") skipped.push({ index, reason: r });
    else blocks.push(r);
  });
  const invalid =
    Array.isArray(body.invalid) &&
    body.invalid.every((i) => isObj(i) && isStr(i.source) && isStr(i.reason))
      ? (body.invalid as { source: string; reason: string }[]).map((i) => ({
          source: i.source,
          reason: i.reason,
        }))
      : [];
  return { kind: "ready", blocks, invalid, skipped };
}

export interface MergeReport {
  state: MenuBlocksRead["kind"];
  replaced: string[];
  added: string[];
  undrawable: string[];
  served_invalid: number;
  skipped: number;
}

function union(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const x of b) if (!out.includes(x)) out.push(x);
  return out;
}

/**
 * contract_source: the copied row keeps the TEMPLATE's value (`...template`). The type allows only
 * "derived" | "legacy"; the served row draws through the template's contract, so its provenance is
 * the template's.
 */
export function mergeServedBlocks(
  assembled: AssembledCapability[],
  read: MenuBlocksRead,
): { capabilities: AssembledCapability[]; report: MergeReport } {
  const report: MergeReport = {
    state: read.kind,
    replaced: [],
    added: [],
    undrawable: [],
    served_invalid: read.kind === "ready" ? read.invalid.length : 0,
    skipped: read.kind === "ready" ? read.skipped.length : 0,
  };
  if (read.kind !== "ready" || read.blocks.length === 0) {
    return { capabilities: assembled, report };
  }

  // Index BEFORE any replacement: this is how cortex knows it can draw the class.
  const templates = new Map<string, AssembledCapability>();
  for (const c of assembled) if (!templates.has(c.object_uri)) templates.set(c.object_uri, c);

  const pairs = new Map<string, { subject: string; archetype: string; persona: string[]; domain: string[] }>();
  for (const b of read.blocks) {
    const k = JSON.stringify([b.subject, b.archetype]);
    const g = pairs.get(k);
    if (g) {
      g.persona = union(g.persona, b.persona_fit);
      g.domain = union(g.domain, b.domain_fit);
    } else {
      pairs.set(k, {
        subject: b.subject,
        archetype: b.archetype,
        persona: union([], b.persona_fit),
        domain: union([], b.domain_fit),
      });
    }
  }

  const out = [...assembled];
  for (const g of pairs.values()) {
    const label = `${g.subject} -> ${g.archetype}`;
    const template = templates.get(g.archetype);
    if (!template) {
      report.undrawable.push(label);
      continue;
    }
    const cap: AssembledCapability = {
      ...template,
      subject_uri: g.subject,
      object_uri: g.archetype,
      persona_fit: g.persona,
      domain_fit: g.domain,
    };
    const at = out.findIndex((c) => c.subject_uri === g.subject && c.object_uri === g.archetype);
    if (at >= 0) {
      out[at] = cap;
      report.replaced.push(label);
    } else {
      out.push(cap);
      report.added.push(label);
    }
  }
  return { capabilities: out, report };
}
