/**
 * INTERVAL_TIMELINE — nested intervals on a shared time axis. Phase 1's anchor timeline.
 *
 * A LIVE VIEW (ADR-0042). Content is a function of mutable plan state, replaced wholesale on
 * re-evaluation, and its freshness stamp is per evaluation — never inherited from mint time.
 *
 * DRAG IS OPTIMISTIC, THE DROP IS REFUSED HERE AND DISPOSED SERVER-SIDE. During a drag the bar
 * moves and nothing else happens: arrangement is UI-master (§4). On drop the library would
 * commit the new dates to its own store, and this component INTERCEPTS that commit and returns
 * false — the store is left untouched and `onMoveProject` is raised instead. The bars only
 * change when new rows arrive from the server. So what a reader sees after a move is the
 * substrate's answer, not the gesture's.
 *
 * The action names were established by PROTOTYPE, not by reading the docs, and the docs' name
 * is the wrong one:
 *     drag-task    the pixel drag        — allowed to proceed
 *     update-task  the DATA COMMIT       — intercepted, refused
 *     move-task    TREE REORDER          — what the docs' example shows; not our commit
 *
 * IT KNOWS NO DOMAIN. "Initiative", "project", "funding" appear in no branch: the payload
 * carries `group_name`, `phase_name`, `project_name` and a `risk_flag` whose VALUE is
 * vocabulary this component never interprets — it styles an unknown string and stops.
 * GENERIC-AT-BIRTH, the INSTANCES_BY_PROPERTY precedent.
 *
 * ITS ACCEPTANCE RULES LIVE IN ITS CONTRACT. `validateIntervalTimeline` and `intervalRowKey`
 * are imported rather than reimplemented — this component cannot enforce a rule the contract
 * does not state, because it reads the rule from there.
 */
import { useCallback, useMemo, useRef } from "react";
import { Gantt } from "@svar-ui/react-gantt";
// THE FULL SHEET, not `style.css`. The package exports two:
//
//   ./style.css   dist/index.css        32 KB   236 selectors   theme vars + grid/table
//   ./all.css     dist-full/index.css  150 KB   926 selectors   everything, incl. the bars
//
// Importing the partial one produced a gantt that looked BROKEN rather than unstyled: the
// left task table rendered correctly, labels sat at date-correct x positions and tracked
// scroll — so the layout engine was computing geometry fine — but no bars drew, and the
// scale read its literal format string (`MMM yyyy`). Four symptoms, one cause: the bar and
// scale-cell rules live in the 690 selectors the partial sheet omits.
//
// Worth keeping because of what it ISN'T: this looked like a SIZING failure, and a
// `minHeight` on the wrapper below was proposed twice. Nothing here is collapsed — the
// elements are unstyled. That change would have papered over a stylesheet import, left the
// bars invisible, and looked like progress.
import "@svar-ui/react-gantt/all.css";
import {
  intervalRowKey,
  validateIntervalTimeline,
  type IntervalRow,
} from "./IntervalTimeline.contract";

export interface IntervalTimelineProps {
  rows: unknown;
  /** What this schedule is OF. Supplied by the payload — never invented here. */
  scope_label?: string;
  /** The substrate sample-time THIS evaluation was true against, and the state version. */
  valid_as_of?: string;
  state_version?: number;
  /**
   * Raised on DROP instead of committing. The caller turns it into a governed write; the
   * timeline never applies it. Absent in read-only contexts, where the drop is simply refused
   * and nothing is raised — which is the correct behaviour, not a degraded one.
   */
  onMoveProject?: (move: { group_id: string; project_id: string; start: string }) => void;
}

function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-slate-600/30">
      <div className="space-y-1">
        <p className="text-sm text-slate-400">
          {scope ? `${scope} — nothing to draw` : "nothing to draw"}
        </p>
        <p className="font-mono text-[9px] text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

/** Schedule rows -> a three-level tree. Ids are DERIVED FROM THE ROW KEY so the capability
 *  fan-out (same project under several groups) produces distinct nodes rather than collisions. */
function toTasks(rows: IntervalRow[]) {
  const tasks: Record<string, unknown>[] = [];
  const seenGroup = new Set<string>();
  const seenPhase = new Set<string>();

  for (const r of rows) {
    const gid = `g:${r.group_id}`;
    if (!seenGroup.has(gid)) {
      seenGroup.add(gid);
      tasks.push({ id: gid, text: r.group_name, type: "summary", open: true });
    }
    // Phase ids are scoped BY GROUP for the same reason as the row key: under a many-to-many
    // pivot one phase is reachable through several groups and must not be one shared node.
    const pid = `p:${r.group_id}:${r.phase_id}`;
    if (!seenPhase.has(pid)) {
      seenPhase.add(pid);
      tasks.push({ id: pid, text: r.phase_name, type: "summary", parent: gid, open: true });
    }
    tasks.push({
      id: `t:${intervalRowKey(r)}`,
      text: r.project_name,
      start: new Date(r.planned_start),
      end: new Date(r.planned_end),
      parent: pid,
      type: "task",
      // Carried so the drop handler can name what moved without re-parsing the id.
      $group_id: r.group_id,
      $project_id: r.project_id,
      $risk_flag: r.risk_flag,
    });
  }
  return tasks;
}

const SCALES = [
  { unit: "month" as const, step: 1, format: "MMM yyyy" },
  { unit: "day" as const, step: 7, format: "d" },
];

export function IntervalTimeline({
  rows, scope_label, valid_as_of, state_version, onMoveProject,
}: IntervalTimelineProps) {
  const result = validateIntervalTimeline(rows);
  const parsed = result.kind === "ok" ? result.rows : [];
  const tasks = useMemo(() => toTasks(parsed), [parsed]);
  const moveRef = useRef(onMoveProject);
  moveRef.current = onMoveProject;

  const init = useCallback((api: { intercept: (a: string, cb: (c: unknown) => unknown) => void }) => {
    // THE COMMIT IS REFUSED. Returning false leaves the library's store untouched, so the bar
    // snaps back to the server's rows rather than sitting at the dragged position asserting a
    // move nobody governed. Verified by prototype + negative control.
    api.intercept("update-task", (config: unknown) => {
      const c = (config ?? {}) as { id?: string; task?: { start?: Date }; inProgress?: boolean };
      // In-progress updates are the drag itself — let them through so the bar follows the
      // cursor. Only the FINAL commit is refused.
      if (c.inProgress) return true;

      const id = String(c.id ?? "");
      const node = tasks.find((t) => t.id === id) as
        | { $group_id?: string; $project_id?: string }
        | undefined;
      const start = c.task?.start;
      if (node?.$group_id && node?.$project_id && start instanceof Date) {
        moveRef.current?.({
          group_id: node.$group_id,
          project_id: node.$project_id,
          start: start.toISOString().slice(0, 10),
        });
      }
      return false;
    });
  }, [tasks]);

  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }

  const groups = new Set(parsed.map((r) => r.group_id)).size;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Schedule"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {parsed.length} {parsed.length === 1 ? "row" : "rows"} · {groups}{" "}
          {groups === 1 ? "group" : "groups"}
        </p>
      </div>

      <div style={{ height: 420 }}>
        <Gantt tasks={tasks} links={[]} scales={SCALES} init={init} />
      </div>

      {(valid_as_of || state_version !== undefined) && (
        <p className="mt-3 font-mono text-[9px] text-slate-500">
          {valid_as_of && <>valid as of {valid_as_of}</>}
          {valid_as_of && state_version !== undefined && " · "}
          {state_version !== undefined && <>state v{state_version}</>}
        </p>
      )}
    </div>
  );
}
