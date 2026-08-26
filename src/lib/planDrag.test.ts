/**
 * The drag's commit path. Four properties, each one a way the beat can silently do the wrong
 * thing while looking like it worked.
 *
 *  1. A BASELINE-EVALUATED CARD FORKS FIRST. Every card on the seeded canvas is evaluated
 *     against `baseline`, and Engine P refuses a schedule op there by design. Without the fork
 *     the drag returns a 400 that the UI has nowhere to show, and the bar snaps back with no
 *     explanation.
 *  2. A SCENARIO-EVALUATED CARD DRAGS WHERE IT WAS EVALUATED. Dragging it into a different
 *     sandbox would show a consequence computed from a plan the person was not looking at.
 *  3. THE SECOND DRAG REUSES THE FIRST'S SCENARIO. One-op scenarios per drag would leave the
 *     commit ceremony able to record only the last of them — the decision that reaches baseline
 *     would be a fragment of the decision that was made.
 *  4. THE CHANGE IS ANNOUNCED. A drag whose consequence waits for the next 15s poll reads as
 *     "the drag did nothing", which is the one interpretation this beat cannot afford.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const forkPlanScenario = vi.fn();
const reschedulePlanProject = vi.fn();
const announcePlanChanged = vi.fn();

vi.mock("@/api/client", () => ({
  forkPlanScenario: (id: string, name: string) => forkPlanScenario(id, name),
  reschedulePlanProject: (a: unknown) => reschedulePlanProject(a),
}));
vi.mock("./planVersion", () => ({
  announcePlanChanged: (ref: string, v: number) => announcePlanChanged(ref, v),
}));

import { commitDrag, __resetPlanDrag } from "./planDrag";

const DRAG = { projectId: "P12", start: "2026-03-18", end: "2026-06-16" };

beforeEach(() => {
  forkPlanScenario.mockReset().mockResolvedValue(undefined);
  reschedulePlanProject.mockReset().mockImplementation((a: { scenarioId: string }) =>
    Promise.resolve({ scenario_id: a.scenarioId, version: 1, ops: ["MoveProject", "MoveSiteImpact"] }),
  );
  announcePlanChanged.mockReset();
  __resetPlanDrag();
});

describe("commitDrag", () => {
  it("forks a scenario when the card was evaluated against baseline", async () => {
    await commitDrag({ stateRef: "baseline", ...DRAG });
    expect(forkPlanScenario).toHaveBeenCalledTimes(1);
    const [id] = forkPlanScenario.mock.calls[0];
    expect(id).not.toBe("baseline");
    expect(reschedulePlanProject).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: id, projectId: "P12" }),
    );
  });

  it("forks when the card carries no state_ref at all", async () => {
    // An older projection, or a producer that stamped none. Falling through to baseline would
    // be the one case that reaches the engine and is refused.
    await commitDrag({ ...DRAG });
    expect(forkPlanScenario).toHaveBeenCalledTimes(1);
  });

  it("drags a scenario-evaluated card into THAT scenario and forks nothing", async () => {
    await commitDrag({ stateRef: "SC-DEMO", ...DRAG });
    expect(forkPlanScenario).not.toHaveBeenCalled();
    expect(reschedulePlanProject).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: "SC-DEMO" }),
    );
  });

  it("puts the second drag in the same scenario as the first", async () => {
    await commitDrag({ stateRef: "baseline", ...DRAG });
    await commitDrag({ stateRef: "baseline", ...DRAG, start: "2026-04-01" });
    expect(forkPlanScenario).toHaveBeenCalledTimes(1);
    const first = reschedulePlanProject.mock.calls[0][0].scenarioId;
    const second = reschedulePlanProject.mock.calls[1][0].scenarioId;
    expect(second).toBe(first);
  });

  it("sends BOTH ends of the interval", async () => {
    // A reschedule is an interval, not a point. Sending only `start` pushes the duration guess
    // to the server, whose only honest guess is "the same length" — an assumption the client
    // has no standing to make on the plan's behalf.
    await commitDrag({ stateRef: "SC-DEMO", ...DRAG });
    const sent = reschedulePlanProject.mock.calls[0][0];
    expect(sent.start).toBe("2026-03-18");
    expect(sent.end).toBe("2026-06-16");
  });

  it("announces the new version against the scenario it wrote", async () => {
    reschedulePlanProject.mockResolvedValueOnce({
      scenario_id: "SC-DEMO", version: 7, ops: ["MoveProject", "MoveSiteImpact"],
    });
    await commitDrag({ stateRef: "SC-DEMO", ...DRAG });
    expect(announcePlanChanged).toHaveBeenCalledWith("SC-DEMO", 7);
  });

  it("returns the ops the SERVER says it appended, named not counted", async () => {
    const out = await commitDrag({ stateRef: "SC-DEMO", ...DRAG });
    expect(out.ops).toEqual(["MoveProject", "MoveSiteImpact"]);
  });

  it("does not announce when the reschedule fails", async () => {
    // A refused op changed nothing. Announcing anyway would make every card re-request and
    // redraw identical content, which reads as a successful drag that did not move the bar.
    reschedulePlanProject.mockRejectedValueOnce(new Error("400"));
    await expect(commitDrag({ stateRef: "SC-DEMO", ...DRAG })).rejects.toThrow();
    expect(announcePlanChanged).not.toHaveBeenCalled();
  });
});
