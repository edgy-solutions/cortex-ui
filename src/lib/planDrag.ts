import { forkPlanScenario, reschedulePlanProject } from "@/api/client";
import { announcePlanChanged } from "./planVersion";

/**
 * A drag, committed against plan state the server owns.
 *
 * ── WHY A DRAG NEEDS A SCENARIO, AND WHY THAT IS NOT AN OBSTACLE ─────────────────────────
 *
 * The seeded canvas asks its five questions through the ordinary chat path, so every card on
 * it is evaluated against `baseline`. Engine P REFUSES a schedule op on baseline — `/baseline/op`
 * takes funding ops only, which is the anti-goal "no editing baseline directly from a drag"
 * expressed as a 400 rather than as a convention.
 *
 * That refusal is the protection working, so this does not try to route around it: it forks a
 * scenario and drags there. A scenario is defined as "the sandbox a drag happens in"; creating
 * one on the first drag is that definition being used, not circumvented. Baseline changes only
 * through the commit ceremony, which is the one path that records WHO decided and WHY.
 *
 * ── ONE SCENARIO PER SESSION, NOT ONE PER DRAG ───────────────────────────────────────────
 *
 * The second drag must land in the same scenario as the first, or the room ends up with N
 * one-op scenarios and a commit ceremony that can only ever record the last of them. So the id
 * is held here and the fork tolerates 409: "it already exists" is the state we wanted.
 */

let activeScenario: string | null = null;

/** Test seam. Production never calls this. */
export function __resetPlanDrag(): void {
  activeScenario = null;
}

/** The scenario a drag should land in, given what the card was evaluated against. */
async function targetScenario(stateRef: string | undefined): Promise<string> {
  // A card already evaluated against a scenario drags THERE — dragging it into a different
  // sandbox would show the person a consequence computed from a plan they were not looking at.
  if (stateRef && stateRef !== "baseline") return stateRef;

  if (!activeScenario) {
    const id = `SC-drag-${Math.random().toString(36).slice(2, 10)}`;
    await forkPlanScenario(id, "Working scenario");
    activeScenario = id;
  }
  return activeScenario;
}

/**
 * Commit a drag: ensure a scenario, reschedule, and tell the app immediately.
 *
 * Returns the ops the SERVER says it appended — named, not counted, so a caller can see that
 * both landed rather than trusting a number. The site-impact op is derived there; this module
 * never names one, because cortex-ui holds no site-impact data to name it with.
 */
export async function commitDrag(args: {
  stateRef?: string;
  projectId: string;
  start: string;
  end: string;
}): Promise<{ scenario_id: string; version: number; ops: string[] }> {
  const scenarioId = await targetScenario(args.stateRef);
  const result = await reschedulePlanProject({
    scenarioId,
    projectId: args.projectId,
    start: args.start,
    end: args.end,
  });
  // Announce what we just caused rather than waiting for the poller's next tick. Making the
  // person who dragged the bar wait a poll interval to see the consequence reads as "the drag
  // did nothing", which is the one interpretation this beat cannot afford.
  announcePlanChanged(scenarioId, result.version);
  return result;
}
