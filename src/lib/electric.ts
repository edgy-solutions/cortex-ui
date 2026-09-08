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
/**
 * Exported for its tests. This is the one place a projection row becomes an
 * Artifact, so it is where a wire value that is absent, malformed or nonsensical
 * has to be turned into something the UI can render honestly — and that is worth
 * testing against real shapes rather than pinning with a source regex.
 */
export function rowToArtifact(row: Row): Artifact {
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
  /**
   * A duration is not just a number — it is a number that CANNOT be negative and
   * cannot be NaN, and both are reachable from the wire (`Number("abc")`, a
   * producer subtracting timestamps in the wrong order). Either would render as a
   * confident `-3s` or `NaNs` beside a real answer, which is worse than showing
   * nothing: an absent duration reads as "not recorded", a wrong one reads as a
   * measurement. Refuse to absence, the same way `cardSize` refuses a non-finite
   * dimension rather than laying out a broken card.
   *
   * Zero is allowed through deliberately — a sub-millisecond cache hit is a real
   * measurement, and swallowing it would make the fastest answers look unmeasured.
   */
  const parseDurationMs = (v: unknown): number | null => {
    const n = parseBigIntOrNull(v);
    if (n === null || !Number.isFinite(n) || n < 0) {
      // ABSENT AND REFUSED RENDER THE SAME AND MUST NOT DIAGNOSE THE SAME.
      //
      // Both end as `null`, which is right for the card — a wrong duration reads as a
      // measurement, so refusing to absence is the correct render. But the two states have
      // DIFFERENT OWNERS: a column that is null or missing is the projection's, a value that
      // arrived and was refused is the producer's. Collapsed, "no time is showing" sends
      // everyone to look in the same wrong place, which is what it just cost.
      //
      // This is the `fetch_registered_entries` rule applied to a scalar: `None` for could-not-
      // reach and `{}` for reached-and-empty have opposite repairs and must not fold together.
      // Said to the console rather than the surface, because the reader is owed absence and the
      // ENGINEER is owed the reason.
      if (v != null) {
        // eslint-disable-next-line no-console
        console.warn(
          "[electric] duration_ms ARRIVED AND WAS REFUSED for row",
          row.id,
          "— raw value:",
          v,
          `(${typeof v})`,
          ". Absent is the projection's to fix; refused is the producer's. This is the second.",
        );
      }
      return null;
    }
    return n;
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
    // Absent until the producer emits it; absence is rendered as absence.
    duration_ms: parseDurationMs(row.duration_ms),
    valid_as_of: parseBigInt(row.valid_as_of),
    valid_until: parseBigIntOrNull(row.valid_until),
    question_text: (row.question_text as string) ?? "",
    // The captured S·P headline from the projection. "" when absent
    // (legacy/thin-routing rows) — the card degrades to question_text.
    summary: (row.summary as string) ?? "",
    resolved_intent: parseJsonbOrDefault(row.resolved_intent, {}),
    message_id: (row.message_id as string) ?? "",
    status: row.status as Artifact["status"],
    rendered_output: parseJsonbOrNull(row.rendered_output),
    produced_by: parseJsonbOrDefault(row.produced_by, {
      actor_type: "agent",
      actor_id: "unknown",
    }) as Artifact["produced_by"],
    // Capture A per ADR-0025 / ADR-0026 step 6: the projection's
    // produced_for JSONB includes `entitlement_source` since the projector
    // picks it up from the :Actor node's `entitlement_source` property.
    // The default below is used only when the JSONB column is null —
    // honest-default `"none"` per `[[optimistic-defaults-are-dishonest]]`
    // (do NOT default to "topaz"; step 6's two states are topaz | none).
    produced_for: parseJsonbOrDefault(row.produced_for, {
      user_id: "unknown",
      is_authenticated: false,
      entitlement_source: "none" as const,
    }) as Artifact["produced_for"],
    routing: parseJsonbOrNull(row.routing),
    sources: parseJsonbOrDefault(row.sources, []),
    graph_trace: parseJsonbOrDefault(row.graph_trace, []),
    // Verb-leg alternates — sibling to graph_trace (see Artifact type).
    // Projector-covered once Hop 2 persists it; [] until then.
    graph_trace_alternates: parseJsonbOrDefault(row.graph_trace_alternates, []),
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
 *   - On `delete` messages: removes the artifact from the collection
 *     via `removeArtifact(id)`. The projector grew a delete path
 *     (pre-summary rows are prunable), so the Hop-3 premise ("append-
 *     and-update only") no longer holds — the old ignore-and-warn
 *     premise-shift detector fired and this is its resolution.
 *   - On `must-refetch` control: drops non-pending artifacts so an
 *     Electric re-sync can't leave stale rows; the snapshot rebuilds.
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
  // transport-exception: ShapeStream is a different transport (long-poll replication),
  // so it cannot ride the axios wrapper. It carries the caller's OIDC bearer, and the
  // route it targets is cortex-bff's `/electric/shape` PROXY — never Electric directly —
  // so the WHERE clause is server-injected from the verified JWT `sub` rather than
  // client-controlled. See gateway.py `electric_shape_proxy`.
  // DECLARED ABOVE THE COMMENT BLOCK, not between it and the call. The transport guard walks
  // up from `new ShapeStream(` through the CONTIGUOUS comment block and stops at the first
  // line of code, so a statement wedged in here severs the `transport-exception:` marker from
  // the call it declares — which is exactly how this file broke the build once.
  const controller = new AbortController();
  // THE STREAM MUST BE ABORTABLE, AND `unsubscribe()` DOES NOT ABORT IT.
  //
  // `ShapeStream.subscribe()` returns a closure that does exactly one thing —
  // `subscribers.delete(subscriptionId)` — verified in
  // node_modules/@electric-sql/client/dist/index.mjs. It detaches the CALLBACK. The internal
  // long-poll loop keeps running. `unsubscribeAll()` is no better: it clears subscribers and
  // detaches the visibility/wake listeners, and the fetch loop continues.
  //
  // WHICH TURNED THE TOKEN REFRESH INTO A LEAK. The bearer below is baked in at construction,
  // so a stream carries one token for life. The effect in App.tsx re-fires on refresh and
  // starts a NEW stream, but the old one was never stopped — it goes on polling
  // `/electric/shape` with a token that expires an hour later, then 401s
  // `{"detail":"Token has expired"}` forever, as an unhandled promise rejection, because a
  // retry loop cannot fix a credential. One orphan per refresh, each one permanent.
  //
  // `signal` is the only thing that stops it, so the caller's cleanup aborts.
  //
  // transport-exception: ShapeStream is a different transport (long-poll replication), so it
  // cannot ride the axios wrapper. It carries the caller's OIDC bearer, and the route it
  // targets is cortex-bff's `/electric/shape` PROXY — never Electric directly — so the WHERE
  // clause is server-injected from the verified JWT `sub` rather than client-controlled.
  // See gateway.py `electric_shape_proxy`.
  const stream = new ShapeStream({
    url: `${base}/electric/shape`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: {
      table: "answer_artifact_projection",
    },
    signal: controller.signal,
  });
  const unsubscribe = stream.subscribe(
    (messages: Message[]) => {
      for (const msg of messages) {
        if (!("headers" in msg)) continue;
        const headers = msg.headers as Record<string, unknown>;

        // Control: `must-refetch` means the cached shape is invalid —
        // Electric will re-send the current snapshot. Drop all
        // Electric-sourced (non-pending) artifacts so the re-sync can't
        // leave ghosts; pending client-created artifacts are kept (they
        // aren't in the shape yet). The subsequent inserts rebuild the set.
        if (headers.control === "must-refetch") {
          const st = useCanvasStore.getState();
          for (const a of st.artifacts) {
            if (a.status !== "pending") st.removeArtifact(a.id);
          }
          continue;
        }

        const op = headers.operation;
        if (op === "insert" || op === "update") {
          const row = (msg as { value: Row }).value;
          try {
            const artifact = rowToArtifact(row);
            useCanvasStore.getState().electricUpsertArtifact(artifact);
          } catch (err) {
            console.error("[electric] row conversion failed", err, row);
          }
        } else if (op === "delete") {
          // The projector grew a delete path (rows can be pruned from
          // answer_artifact_projection). Electric delivers the deleted
          // row's key columns; remove it from the collection. This
          // resolves the Hop-3 premise-shift the old warning flagged.
          const row = (msg as { value?: Row }).value;
          const id = row?.id;
          if (id != null) {
            useCanvasStore.getState().removeArtifact(String(id));
          } else {
            console.warn("[electric] delete without id", msg);
          }
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
      //
      // A 401 IS NOT AN OUTAGE AND THE RETRY LOOP CANNOT FIX IT. The comment above is true of
      // a network fault and false of an expired credential: retrying with the same baked-in
      // bearer 401s identically, forever. It is named separately so a dead subscription reads
      // as a dead subscription rather than as a flaky connection — the two want different
      // remedies, and only one of them resolves by waiting.
      if (isAuthFailure(err)) {
        console.error(
          "[electric] subscription REJECTED — the bearer is no longer accepted, so this stream " +
            "will not recover on its own. A silent renew should abort it and start a new one.",
          err,
        );
        return;
      }
      console.error("[electric] subscription error", err);
    }
  );
  return () => {
    unsubscribe();
    // See the note at construction: this, not `unsubscribe()`, is what stops the polling.
    controller.abort();
  };
}

/**
 * Whether a stream error is the server refusing the credential rather than the network
 * failing. Read off the status the client reports; nothing here parses a message string.
 */
export function isAuthFailure(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  return status === 401 || status === 403;
}
