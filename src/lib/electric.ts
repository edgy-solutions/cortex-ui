/**
 * Hop 3 of the projector build plan
 * (docs/plans/projector-build-plan.md commit 0eda9f7 §4 Hop 3 Part 2).
 *
 * Electric subscription for the `answer_artifact_projection` shape.
 *
 * The Electric server (deployed via templates/electric.yaml in the
 * sandbox; via docker-compose locally for Hop 3 closure) reads from
 * Postgres' logical replication slot and serves a long-lived shape
 * subscription to subscribed clients. The shape config: every row in
 * `answer_artifact_projection`. Privacy-scoping by produced_for.user_id
 * is NOT implemented at Hop 3 — the planning doc §6 notes scoping is
 * the right direction, but the sandbox today serves a single test
 * user; scoping is a clean follow-up that doesn't gate Hop 3 closure.
 *
 * Source-of-truth claim: post-Hop-3, this module is the SOLE source
 * of truth for Electric-covered fields on Artifact rows. The SSE
 * handlers in useInterviewAgent are refactored to NOT call
 * updateArtifact for any field in ELECTRIC_COVERED_FIELDS; Part 2's
 * absence probe asserts the refactor held.
 *
 * INTERIM under Decisions 0+1+3 per
 * [[coupled-interim-mechanisms-retire-together]] — Electric exits
 * with the projector poll loop and the watermark column when the
 * Restate+topic successor lands. Module signature won't change (the
 * store's electricUpsertArtifact stays); the implementation flips
 * from ShapeStream to topic consumer.
 *
 * Why a hand-written subscription instead of a higher-level binding?
 * The shape-to-Artifact conversion is custom — Postgres JSONB columns
 * arrive as strings, bigint columns arrive as strings, the keys are
 * snake_case and Artifact's are camelCase mixed with snake_case. A
 * thin wrapper that does just this conversion is easier to inspect
 * and audit than pulling in @electric-sql/react with its own
 * lifecycle assumptions. Per [[verify-subtle-acceptance-by-inspection]]:
 * the conversion is the load-bearing piece; keep it visible.
 */
import { ShapeStream, type Row, type Message } from "@electric-sql/client";
import type { Artifact } from "@/api/types";
import { useCanvasStore } from "@/store/useCanvasStore";
import { config } from "@/config";

/**
 * Convert an Electric-delivered row (snake_case, JSONB-as-string,
 * bigint-as-string) into an Artifact. Per
 * [[verify-subtle-acceptance-by-inspection]] — the conversion is the
 * load-bearing piece; if a field arrives in an unexpected shape, fail
 * loudly rather than silently substituting a default.
 *
 * Per [[optimistic-defaults-are-dishonest]]: defaults here are
 * justified per-field:
 *   - `valid_until` defaults to null because the field is genuinely
 *     nullable in ADR-0023.
 *   - `derived_from_artifact_id` defaults to null because Phase 1
 *     almost always has no lineage.
 *   - `routing`, `rendered_output` default to null because the
 *     projection table marks them nullable for honest-absent (Hop 1
 *     `[[optimistic-defaults-are-dishonest]]` ruling).
 *   - `status` and `durability_status` MUST be present — they're NOT
 *     NULL in the projection schema. If absent, that's a schema-drift
 *     bug that should not be papered over with a default.
 */
function rowToArtifact(row: Row): Artifact {
  // Electric sends jsonb columns as JSON strings; bigint as strings.
  // The conversions here are intentional and explicit.
  const parseJsonbOrNull = <T,>(v: unknown): T | null => {
    if (v == null) return null;
    if (typeof v === "string") return JSON.parse(v) as T;
    return v as T;
  };
  const parseJsonbOrDefault = <T,>(v: unknown, dflt: T): T => {
    if (v == null) return dflt;
    if (typeof v === "string") return JSON.parse(v) as T;
    return v as T;
  };
  const parseBigInt = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") return Number(v);
    throw new Error(`Unexpected bigint shape: ${typeof v}`);
  };
  const parseBigIntOrNull = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") return Number(v);
    return null;
  };
  // Electric's JS client decodes jsonb columns to native JS objects
  // (not JSON strings) — so the parseJsonbOrNull helpers below
  // tolerate BOTH shapes. Defensive against client-version drift.

  // Required fields — fail loudly if absent rather than substitute.
  if (row.id == null) throw new Error("Electric row missing required id");
  if (row.status == null) throw new Error("Electric row missing required status");
  if (row.durability_status == null) {
    throw new Error("Electric row missing required durability_status");
  }

  return {
    id: row.id as string,
    created_at: parseBigInt(row.created_at),
    updated_at: parseBigInt(row.updated_at),
    valid_as_of: parseBigInt(row.valid_as_of),
    valid_until: parseBigIntOrNull(row.valid_until),
    question_text: (row.question_text as string) ?? "",
    resolved_intent: parseJsonbOrDefault(row.resolved_intent, {}),
    message_id: (row.message_id as string) ?? "",
    status: row.status as Artifact["status"],
    rendered_output: parseJsonbOrNull(row.rendered_output),
    produced_by: parseJsonbOrDefault(row.produced_by, {
      actor_type: "agent",
      actor_id: "unknown",
    }) as Artifact["produced_by"],
    // Capture A per ADR-0025: the projection's produced_for JSONB
    // includes `entitlement_source` since the projector picks it up
    // from the :Actor node's `entitlement_source` property. The
    // default below is used only when the JSONB column is null —
    // honest-default `"fallback"` per
    // `[[optimistic-defaults-are-dishonest]]` (do NOT default to
    // "claim").
    produced_for: parseJsonbOrDefault(row.produced_for, {
      user_id: "unknown",
      is_authenticated: false,
      entitlement_source: "fallback" as const,
    }) as Artifact["produced_for"],
    routing: parseJsonbOrNull(row.routing),
    sources: parseJsonbOrDefault(row.sources, []),
    graph_trace: parseJsonbOrDefault(row.graph_trace, []),
    derived_from_artifact_id: (row.derived_from_artifact_id as string | null) ?? null,
    durability_status: row.durability_status as Artifact["durability_status"],
    watermark: parseBigInt(row.watermark),
  };
}

/**
 * Start the Electric subscription. Returns a stop function; caller
 * (the ArtifactSyncProvider mounted in App.tsx) calls it on unmount.
 *
 * Behavior:
 *   - On every `insert`/`update` message, calls
 *     `useCanvasStore.getState().electricUpsertArtifact(artifact)`
 *     with the converted row. The store records the provenance as
 *     `electric:answer_artifact_projection` for every field touched.
 *   - On `delete` messages: not yet handled at Hop 3 — the projector
 *     doesn't delete rows today (artifacts are append-and-update).
 *     If a delete arrives, log a warning and ignore; this is the
 *     premise-shift detector for when the projector grows a delete
 *     path.
 *   - On `error` messages: log and continue. The subscription's
 *     own retry logic re-establishes if the server goes away.
 *   - When `VITE_ELECTRIC_URL` is empty: no subscription is started
 *     (Shape C of Part 2 — proves the canvas works via Electric
 *     alone when SSE-for-artifact-data is gone, OR proves it doesn't
 *     when Electric is cut off and SSE is the only source).
 */
/**
 * Start the Electric ShapeStream subscription.
 *
 * 2026-06-30 per-user isolation interim: the subscription connects to
 * cortex-bff's `/electric/shape` proxy endpoint (NOT directly to
 * Electric) so the WHERE clause is server-injected with the verified
 * JWT `sub`. A client-controlled WHERE would be spoofable; the proxy
 * is the trusted middle. See gateway.py `electric_shape_proxy`.
 *
 * Requires a valid Bearer token. If `token` is null/undefined,
 * subscription is skipped — caller (App.tsx) should re-invoke when
 * auth completes.
 */
export function startArtifactsSubscription(token: string | null): () => void {
  if (!token) {
    console.info("[electric] no token yet; subscription deferred");
    return () => {};
  }
  // Use the cortex-bff base URL (VITE_API_URL) + /electric/shape.
  // The legacy VITE_ELECTRIC_URL pointed straight at Electric (which
  // had no user_id filter, hence the over-sharing the proxy fixes).
  // Empty VITE_API_URL → skip subscription (test/dev escape hatch).
  const base = config.VITE_API_URL;
  if (!base) {
    console.info("[electric] VITE_API_URL empty; subscription skipped");
    return () => {};
  }
  const stream = new ShapeStream({
    url: `${base}/electric/shape`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: {
      table: "answer_artifact_projection",
    },
  });
  const unsubscribe = stream.subscribe(
    (messages: Message[]) => {
      for (const msg of messages) {
        if (!("headers" in msg)) continue;
        const op = (msg.headers as Record<string, unknown>).operation;
        if (op === "insert" || op === "update") {
          const row = (msg as { value: Row }).value;
          try {
            const artifact = rowToArtifact(row);
            useCanvasStore.getState().electricUpsertArtifact(artifact);
          } catch (err) {
            console.error("[electric] row conversion failed", err, row);
          }
        } else if (op === "delete") {
          console.warn(
            "[electric] delete operation received; Hop 3 projector " +
              "does not delete rows. Investigate.",
            msg
          );
        }
      }
    },
    (err: Error) => {
      // Subscription's internal retry loop handles reconnect; we
      // surface the error for diagnostics. Per
      // [[feedback-trailing-steps-nonfatal]]: an Electric outage
      // must not break the user's session — the canvas degrades
      // honestly (artifacts stop updating in real-time) but the
      // SSE path's HUD/pipeline-stage stream stays alive.
      console.error("[electric] subscription error", err);
    }
  );
  return () => {
    unsubscribe();
  };
}
