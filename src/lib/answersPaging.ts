/**
 * The `answerSummaries` flag's fetch side: `/answers` pages, a server search, and the body read for
 * the ONE answer the reader opened. The store holds the state (`useCanvasStore`); this module only
 * decides when to ask. Nothing in the rail calls `ensureBody`: a list row reads what its stub carries.
 */
import { fetchAnswerBody, fetchAnswersPage } from "@/api/client";
import { useCanvasStore } from "@/store/useCanvasStore";
import { isIngestArtifact } from "@/lib/ingestArtifact";
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";
import { ANSWERS_PAGE_SIZE, readAnswerBody, readAnswersPage } from "@/lib/answersWire";
import type { Artifact } from "@/api/types";
import type { AnswerPaging } from "@/lib/electricApply";

/** Bumped when the paging is dropped (reset, new search): a response that left before it must not land after. */
let generation = 0;
/** Bumped by a reset only (it clears `bodies`); a search does not strand a body read. */
let bodyGeneration = 0;

/** More pages to load: something has been read, and fewer rows are held than the server counts. */
export function answerPagesHaveMore(p: Pick<AnswerPaging, "status" | "loaded" | "total">): boolean {
  return p.status !== "idle" && p.total !== null && p.loaded < p.total;
}

async function fetchPage(page: number, q: string | null): Promise<ReturnType<typeof readAnswersPage>> {
  try {
    return readAnswersPage(await fetchAnswersPage(q ? { page, size: ANSWERS_PAGE_SIZE, q } : { page, size: ANSWERS_PAGE_SIZE }));
  } catch {
    return null;
  }
}

/** Page 1 of the unfiltered list. Called where the Electric subscription starts, and again after `must-refetch`. */
export async function loadFirstAnswersPage(): Promise<void> {
  const gen = ++generation;
  bodyGeneration++;
  const st = useCanvasStore.getState();
  st.setAnswerPaging({ status: "loading" });
  const page = await fetchPage(1, null);
  if (gen !== generation) return;
  if (!page) {
    useCanvasStore.getState().setAnswerPaging({ status: "failed" });
    return;
  }
  useCanvasStore.getState().applyAnswersPage(page, null);
}

/** The next page of whichever view the rail is on (the search when one is set, else the unfiltered list). */
export async function loadOlderAnswers(): Promise<void> {
  const st = useCanvasStore.getState();
  const view = st.answerSearch ?? st.answerPaging;
  if (view.status === "loading" || !answerPagesHaveMore(view)) return;
  const q = st.answerSearch ? st.answerSearch.q : null;
  const gen = generation;
  if (q === null) st.setAnswerPaging({ status: "loading" });
  else st.setAnswerSearch({ ...st.answerSearch!, status: "loading" });
  const page = await fetchPage(view.nextPage, q);
  if (gen !== generation) return;
  const now = useCanvasStore.getState();
  if (!page) {
    // Keep what was read; the control offers the page again.
    if (q === null) now.setAnswerPaging({ status: "failed" });
    else if (now.answerSearch?.q === q) now.setAnswerSearch({ ...now.answerSearch, status: "failed" });
    return;
  }
  if (q !== null && now.answerSearch?.q !== q) return;
  now.applyAnswersPage(page, q);
}

/** Page 1 of a server search for `q`; a blank `q` clears the search and the rail returns to the unfiltered pages. */
export async function runAnswerSearch(q: string): Promise<void> {
  const text = q.trim();
  const gen = ++generation;
  if (!text) {
    useCanvasStore.getState().setAnswerSearch(null);
    return;
  }
  useCanvasStore.getState().setAnswerSearch({ status: "loading", loaded: 0, total: null, nextPage: 1, frontier: null, q: text, ids: [] });
  const page = await fetchPage(1, text);
  if (gen !== generation) return;
  const now = useCanvasStore.getState();
  if (!page) {
    now.setAnswerSearch({ status: "failed", loaded: 0, total: null, nextPage: 1, frontier: null, q: text, ids: [] });
    return;
  }
  now.applyAnswersPage(page, text);
}

/** An answer (not a task, not a drop) that is finished and carries no body: the only kind a body read can fill. */
export function wantsBody(a: Artifact): boolean {
  if (a.task_ref || a.id.startsWith(TASK_ARTIFACT_PREFIX) || isIngestArtifact(a)) return false;
  return a.status !== "pending" && a.rendered_output === null && a.routing === null;
}

const inFlight = new Set<string>();

/** Read the body of ONE answer. De-duplicated while in flight; a no-op once loaded. */
export async function ensureBody(id: string): Promise<void> {
  const st = useCanvasStore.getState();
  const a = st.artifacts.find((x) => x.id === id);
  const state = st.bodies[id] ?? "absent";
  if (!a || !wantsBody(a) || inFlight.has(id) || (state !== "absent" && state !== "failed")) return;
  inFlight.add(id);
  const gen = bodyGeneration;
  st.setBodyState(id, "loading");
  try {
    const body = readAnswerBody(await fetchAnswerBody(id), id);
    const now = useCanvasStore.getState();
    // Dropped by a reset while the read was out: the row (or its `loading` mark) is gone.
    if (gen !== bodyGeneration || now.bodies[id] !== "loading") return;
    if (body) now.applyAnswerBody(id, body);
    else now.setBodyState(id, "failed");
  } catch {
    if (gen === bodyGeneration && useCanvasStore.getState().bodies[id] === "loading") useCanvasStore.getState().setBodyState(id, "failed");
  } finally {
    inFlight.delete(id);
  }
}
