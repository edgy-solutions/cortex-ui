/**
 * Deterministic, seeded synthetic `answer_artifact_projection` rows, alice-like.
 *
 *   - median row about 6 KB serialized;
 *   - rendered_output spread over MULTI_SERIES (recharts), CHART_WIDGET (recharts), SHORTFALL_GRID,
 *     VARIANCE_TREE and KNOWLEDGE_DOCUMENT; about 45% mount a chart;
 *   - routing.about.instance_identifier shared in groups of 1-40 (same-subject edges exist);
 *   - created_at spread over ~60 days, newest = "now".
 *
 * The archetype payloads are cut from the REAL finance captures in sessions/ (the same ones
 * the unit tests use), with the numbers perturbed per row, so every card draws what it draws in
 * production rather than an empty state.
 *
 * Rows are emitted the way Electric sends them: jsonb columns as JSON STRINGS, int8 as strings.
 * `summaryOnly` drops rendered_output, routing, resolved_intent and graph_trace: what a
 * summary-only list route would carry.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SESSIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../sessions");

function capture(name: string): Record<string, unknown> {
  const j = JSON.parse(readFileSync(path.join(SESSIONS, `2026-09-19-payload-finance-${name}.json`), "utf8")) as {
    projected: Array<{ payload: Record<string, unknown> }>;
  };
  return j.projected[0]!.payload;
}

/** mulberry32 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PERF_PREFIX = "PERF-ANS";
export const PERF_USER = "alice";
const DAY = 86_400_000;

type Archetype = "MULTI_SERIES" | "CHART_WIDGET" | "SHORTFALL_GRID" | "VARIANCE_TREE" | "KNOWLEDGE_DOCUMENT";
const MIX: Array<[Archetype, number]> = [
  ["MULTI_SERIES", 0.3],
  ["CHART_WIDGET", 0.15],
  ["SHORTFALL_GRID", 0.2],
  ["VARIANCE_TREE", 0.15],
  ["KNOWLEDGE_DOCUMENT", 0.2],
];

export interface SyntheticOpts {
  n: number;
  seed?: number;
  now?: number;
  summaryOnly?: boolean;
}

export function buildRows(opts: SyntheticOpts): Array<Record<string, unknown>> {
  const { n, seed = 20261010, now = Date.UTC(2026, 9, 10, 12, 0, 0), summaryOnly = false } = opts;
  const rand = rng(seed);
  const multi = capture("burn-rate");
  const shortfall = capture("funding-status");
  const variance = capture("variance-decomposition");
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const jitter = (v: number) => Math.round(v * (0.7 + rand() * 0.6));

  // Subject groups of 1-40 (about half of answers sit in a group of 2+).
  const subjectOf: string[] = [];
  let g = 0;
  while (subjectOf.length < n) {
    const size = rand() < 0.45 ? 1 : 1 + Math.floor(rand() * 40);
    for (let i = 0; i < size && subjectOf.length < n; i++) subjectOf.push(`urn:perf:instance:${g}`);
    g++;
  }
  // shuffle so group members are not adjacent in time
  for (let i = subjectOf.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [subjectOf[i], subjectOf[j]] = [subjectOf[j]!, subjectOf[i]!];
  }

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i++) {
    let r = rand();
    let archetype: Archetype = "KNOWLEDGE_DOCUMENT";
    for (const [a, p] of MIX) {
      if (r < p) {
        archetype = a;
        break;
      }
      r -= p;
    }
    const created = now - Math.floor(rand() * 60 * DAY);
    const tag = `${PERF_PREFIX}-${String(i).padStart(5, "0")}`;
    const subj = subjectOf[i]!;
    const subjLabel = `Program ${subj.split(":").pop()}`;

    let component: Record<string, unknown>;
    switch (archetype) {
      case "MULTI_SERIES": {
        const rows0 = (multi.rows as Array<Record<string, unknown>>) ?? [];
        const rows = [...rows0, ...rows0].slice(0, 6 + Math.floor(rand() * 7)).map((row, k) => ({
          ...row,
          period: `FY26-${String(k + 1).padStart(2, "0")}`,
          burn: jitter(row.burn as number),
          planned: jitter(row.planned as number),
        }));
        component = { ...multi, rows, scope_label: subjLabel };
        break;
      }
      case "CHART_WIDGET":
        component = {
          archetype: "CHART_WIDGET",
          chart_type: pick(["BAR", "LINE"]),
          subject_concept: subjLabel,
          sql_query: "SELECT month, revenue FROM sales GROUP BY month",
          chart_data: JSON.stringify(Array.from({ length: 24 }, (_, k) => ({
            month: `2026-${String((k % 12) + 1).padStart(2, "0")}-${k < 12 ? "a" : "b"}`,
            revenue: jitter(100_000),
            cost: jitter(70_000),
          }))),
        };
        break;
      case "SHORTFALL_GRID": {
        const rows = (shortfall.rows as Array<Record<string, unknown>>).slice(0, 8 + Math.floor(rand() * 4));
        component = { ...shortfall, rows: rows.map((row) => ({ ...row, gap: jitter(row.gap as number) })) };
        break;
      }
      case "VARIANCE_TREE":
        component = JSON.parse(JSON.stringify(variance)) as Record<string, unknown>;
        break;
      default:
        component = {
          archetype: "KNOWLEDGE_DOCUMENT",
          title: `Note ${tag}`,
          markdown_content: Array.from(
            { length: 14 },
            (_, k) =>
              `## Section ${k}\n\nParagraph ${k} about ${subjLabel}: the schedule slipped by ${Math.floor(rand() * 90)} days ` +
              `and the review board asked for a revised baseline before the next milestone gate.`,
          ).join("\n\n"),
        };
    }

    const summary = `${tag} ${subjLabel} ${archetype.toLowerCase().replace(/_/g, " ")}`;
    const routing = {
      route_status: "matched",
      fallback: false,
      fallback_reason: null,
      about: {
        label: `Program ${(i % 7) + 1}`,
        uri: `urn:perf:class:${i % 7}`,
        confidence: 0.9,
        instance_resolved: true,
        instance_identifier: subj,
        instance_label: subjLabel,
      },
      action: {
        label: "fin Burn Rate",
        iri: "mesh:finBurnRate",
        confidence: 0.86,
        classify_called: true,
        candidate_count: 8,
        owner_persona: "PROGRAM_FINANCE_ANALYST",
      },
      handled_by: { engine_name: "iagent-engine-fin", provider: "iagent-engine-fin", endpoint_url: "http://engine/measure" },
    };
    const graphTrace = Array.from({ length: 12 }, (_, k) => ({
      step: k,
      node: `urn:perf:node:${k}`,
      label: `hop ${k}`,
      detail: "x".repeat(60),
    }));

    const row: Record<string, unknown> = {
      id: `perf-${String(i).padStart(5, "0")}`,
      created_at: String(created),
      updated_at: String(created),
      duration_ms: String(500 + Math.floor(rand() * 9000)),
      valid_as_of: String(created),
      valid_until: null,
      question_text: `${tag} what is the status of ${subjLabel}?`,
      summary,
      message_id: `msg-${i}`,
      status: "complete",
      produced_by: JSON.stringify({ actor_type: "agent", actor_id: "iagent-engine-fin" }),
      produced_for: JSON.stringify({ user_id: PERF_USER, is_authenticated: true, entitlement_source: "topaz" }),
      sources: JSON.stringify([]),
      graph_trace_alternates: JSON.stringify([]),
      derived_from_artifact_id: null,
      durability_status: "durable",
      watermark: String(created),
    };
    if (!summaryOnly) {
      row.resolved_intent = JSON.stringify({ subject: subj, verb: "burn_rate", padding: "y".repeat(300) });
      row.rendered_output = JSON.stringify({ archetype, components: [component] });
      row.routing = JSON.stringify(routing);
      row.graph_trace = JSON.stringify(graphTrace);
    } else {
      row.resolved_intent = null;
      row.rendered_output = null;
      row.routing = null;
      row.graph_trace = null;
    }
    rows.push(row);
  }
  return rows;
}

/** Electric column types for the schema header, so the client parses like production. */
export const SCHEMA = {
  id: { type: "text" },
  created_at: { type: "int8" },
  updated_at: { type: "int8" },
  duration_ms: { type: "int8" },
  valid_as_of: { type: "int8" },
  valid_until: { type: "int8" },
  watermark: { type: "int8" },
  question_text: { type: "text" },
  summary: { type: "text" },
  message_id: { type: "text" },
  status: { type: "text" },
  durability_status: { type: "text" },
  derived_from_artifact_id: { type: "text" },
  resolved_intent: { type: "jsonb" },
  rendered_output: { type: "jsonb" },
  produced_by: { type: "jsonb" },
  produced_for: { type: "jsonb" },
  routing: { type: "jsonb" },
  sources: { type: "jsonb" },
  graph_trace: { type: "jsonb" },
  graph_trace_alternates: { type: "jsonb" },
};

export function medianRowBytes(rows: Array<Record<string, unknown>>): number {
  const sizes = rows.map((r) => JSON.stringify(r).length).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 0;
}
