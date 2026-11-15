import { useEffect, useRef, useState } from "react";
import { readDeepLink } from "@/lib/deepLink";
import { fetchCase, type FetchCaseResult } from "@/lib/cases";
import { taskArtifactId } from "@/lib/taskArtifact";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useComposerPrefillStore } from "@/store/useComposerPrefillStore";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { heldTasks } from "@/archetypes/workflow-case/caseOptions";

/**
 * Landing for the three deep links (`/case/{id}`, `/task/{task_id}`, `/ask?q=`). Mounted once, inside the
 * authenticated surface, so "the logged-in person" is already settled. The link is CONSUMED on
 * mount (URL reset to `/`): the app has no router, so a lingering path would lie about what is on
 * screen, and a reload must not re-type a question.
 */
export function DeepLinkLanding() {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the link is one-shot
    started.current = true;
    const link = readDeepLink(window.location.pathname, window.location.search);
    if (link === null) return;
    window.history.replaceState({}, document.title, "/");
    if (link.kind === "ask") useComposerPrefillStore.getState().offer(link.q);
    else if (link.kind === "task") setTaskId(link.taskId);
    else setCaseId(link.caseId);
  }, []);

  if (taskId !== null) return <TaskLanding taskId={taskId} onClose={() => setTaskId(null)} />;
  if (caseId === null) return null;
  return <CaseLanding caseId={caseId} onClose={() => setCaseId(null)} />;
}

function openTask(rowId: string) {
  const id = taskArtifactId(rowId);
  useCanvasStore.getState().setCurrentArtifact(id);
  useStageStore.getState().focus(id);
  useStageStore.getState().openFullPane();
}

/** The sentence for every way a task link can come to nothing. ONE sentence, no wording that tells apart
 *  not-a-recipient, already decided and unknown (existence oracle), and no request behind it. */
const NOTHING_WAITING = "Nothing is waiting for you at this link.";

/**
 * `/task/{task_id}`: matched against the viewer's OWN queue, on the LOGICAL `taskId` (`task_id` on the wire),
 * never the row `id`. Nothing is decided until the first queue snapshot has applied; a queue error before it is
 * shown as the error, never as "nothing waiting". More than one pending row for the task (several rows, one
 * task) opens the first in queue order, as a single held task opens on `/case/{id}`.
 */
function TaskLanding({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const loaded = useHumanTaskStore((s) => s.queueLoaded);
  const error = useHumanTaskStore((s) => s.queueError);
  const tasks = useHumanTaskStore((s) => s.tasks);

  const match = loaded ? tasks.find((t) => t.status === "pending" && t.taskId != null && t.taskId === taskId) : undefined;

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !match) return;
    opened.current = true;
    openTask(match.id);
    onClose();
  }, [match, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (match) return null;

  let body: React.ReactNode;
  if (!loaded) {
    body =
      error !== null ? (
        <p className="font-mono text-[11px] text-amber-400" data-task-link="error">
          {error}
        </p>
      ) : (
        <p className="font-mono text-[11px] text-slate-500" data-task-link="loading">
          loading…
        </p>
      );
  } else {
    body = (
      <p className="font-mono text-[11px] text-slate-300" data-task-link="nothing">
        {NOTHING_WAITING}
      </p>
    );
  }
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-label="Task link"
      data-deep-link-panel
    >
      <div className="glass-panel max-w-3xl w-full max-h-[85vh] overflow-auto p-4 flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Close task link"
            onClick={onClose}
            className="px-2 py-1 font-mono text-xs text-slate-400 hover:text-white"
          >
            Close
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

function CaseLanding({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [result, setResult] = useState<FetchCaseResult | null>(null);
  const tasks = useHumanTaskStore((s) => s.tasks);

  useEffect(() => {
    let cancelled = false;
    void fetchCase(caseId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  // The viewer's own pending task on this case opens; none, or more than one to choose between, is the panel.
  const held = result?.ok ? heldTasks(result.payload, tasks) : [];
  const storeTask = held.length === 1 ? held[0] : undefined;

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !storeTask) return;
    opened.current = true;
    openTask(storeTask.id);
    onClose();
  }, [storeTask, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (storeTask) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-label={`Case ${caseId}`}
      data-deep-link-panel
    >
      <div className="glass-panel max-w-3xl w-full max-h-[85vh] overflow-auto p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-sm text-slate-200 break-all">Case {caseId}</h2>
          <button
            type="button"
            aria-label="Close case"
            onClick={onClose}
            className="px-2 py-1 font-mono text-xs text-slate-400 hover:text-white"
          >
            Close
          </button>
        </div>
        <CaseBody caseId={caseId} result={result} />
      </div>
    </div>
  );
}

function CaseBody({ caseId, result }: { caseId: string; result: FetchCaseResult | null }) {
  if (result === null) {
    return (
      <p className="font-mono text-[11px] text-slate-500" data-case-link="loading">
        loading case…
      </p>
    );
  }
  if (result.ok) {
    return (
      <div data-case-link="case">
        {/* artifactId is deliberately undefined, and SPELLED so askFold's every-element seal can see
            the choice: this panel is not a canvas artifact, so there is no artifact this case
            sits ON, and the one component drawn is a WORKFLOW_CASE, which mounts no ask card. */}
        <SemanticInterpreter
          payload={{ components: [{ archetype: "WORKFLOW_CASE", case: result.payload }] }}
          artifactId={undefined}
        />
      </div>
    );
  }
  if (result.reason === "not_found") {
    // ONE sentence for an absent case and one the caller may not read (existence oracle).
    return (
      <p className="font-mono text-[11px] text-rose-400" data-case-link="absent">
        No case {caseId} that you can see.
      </p>
    );
  }
  if (result.reason === "runner_unavailable") {
    return (
      <p className="font-mono text-[11px] text-amber-400" data-case-link="unavailable">
        The case service is unavailable. Try the link again shortly.
      </p>
    );
  }
  return (
    <p className="font-mono text-[11px] text-amber-400" data-case-link="error">
      Could not read case {caseId} ({result.reason}).
    </p>
  );
}
