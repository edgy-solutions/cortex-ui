/**
 * The body of the ONE opened answer, under the `answerSummaries` flag. A stub from `/answers` has
 * no `rendered_output`/`routing`; when it becomes the open artifact (`currentArtifactId`) this reads
 * its body once, and the HUD panels, `AnswerBody` and the canvas all see it through the store. The
 * rail never calls this. `view` is what the canvas shows meanwhile: "loading", or "failed" (with `retry`).
 */
import { useEffect, useMemo } from "react";
import type { Artifact } from "@/api/types";
import { useCanvasStore } from "@/store/useCanvasStore";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { ensureBody, wantsBody } from "@/lib/answersPaging";

export function useOpenedAnswerBody(artifact: Artifact | null): { view: "loading" | "failed" | null; retry: () => void } {
  const summaries = useMemo(() => isFeatureEnabled("answerSummaries"), []);
  const id = artifact?.id ?? null;
  const status = artifact?.status;
  const bodyState = useCanvasStore((s) => (id ? s.bodies[id] : undefined)) ?? "absent";
  const wanted = summaries && artifact !== null && wantsBody(artifact);
  // On open, and when a pending answer completes under the reader. Not on every state change: a
  // failed read must not re-fire itself.
  useEffect(() => {
    if (summaries && id) void ensureBody(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, id, status]);
  const view = !wanted ? null : bodyState === "failed" ? "failed" : bodyState === "loaded" ? null : "loading";
  return { view, retry: () => id && void ensureBody(id) };
}
