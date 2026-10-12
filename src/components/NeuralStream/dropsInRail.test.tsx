/**
 * A drop is a TURN on the answers rail (ruling 2026-10-12): it appears as an `ingest` entry (time,
 * filename, stage badge), updates in place as the one poller reads the status, is filterable under
 * TYPE (the composer badge applies the filter), searchable, and opens as the status card. "My drops"
 * is gone. The composer row is exactly [wifi][bolt][clip.n] prompt [send].
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import type { Artifact } from "@/api/types";

const uploadIngest = vi.fn();
const fetchIngestStatus = vi.fn();
const retryIngest = vi.fn();

vi.mock("@/hooks/useAgent", () => ({
  useAgent: () => ({ sendMessage: vi.fn(), isConnected: true, isProcessing: false }),
}));
vi.mock("@/hooks/useComposerDraft", async () => {
  const React = await import("react");
  return {
    useComposerDraft: () => {
      const [value, setValue] = React.useState("");
      return { value, setValue, clearDraft: () => setValue("") };
    },
  };
});
vi.mock("@/components/PersonaPicker", () => ({ PersonaPicker: () => <span data-persona-picker /> }));
vi.mock("@/store/useInterviewStore", () => ({
  useInterviewStore: (sel: (s: { phase: string; accessDenial: null }) => unknown) =>
    sel({ phase: "active", accessDenial: null }),
}));
vi.mock("@/lib/ingestFlag", () => ({ isIngestUiEnabled: () => true }));
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { profile: { sub: "user-a", email: "a@example.com" } } }),
}));
vi.mock("@/lib/ingestTransport", () => ({
  uploadIngest: (...a: unknown[]) => uploadIngest(...a),
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  retryIngest: (...a: unknown[]) => retryIngest(...a),
  disputeIngestOrigin: vi.fn(),
  confirmIngestContentKind: vi.fn(),
}));
vi.mock("./LiveAnswerStrip", () => ({ LiveAnswerStrip: () => null }));
vi.mock("./useLiveStages", () => ({ useLiveStages: () => ({ active: false }) }));
vi.mock("./AccessDeniedCard", () => ({ AccessDeniedCard: () => null }));

import { InputBar } from "./InputBar";
import { AnswersPanel } from "./AnswersPanel";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { turnKeys, useIngestArtifactSync } from "@/lib/useIngestArtifactSync";
import { ingestArtifactId } from "@/lib/ingestArtifact";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import { useIngestStatusStore, INGEST_POLL_MS } from "@/store/useIngestStatusStore";
import { recordMyDrop } from "@/lib/myDrops";
import { INGEST_STAGES } from "@/lib/ingestWire";

const ID = `sha256:${"3f9a2b".padEnd(64, "0")}`;
const OLD = `sha256:${"0ld".padEnd(64, "0")}`;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

const wire = (id: string, stage: string, over: Record<string, unknown> = {}) => ({
  ingest_id: id, sha256: id.slice(7), kind: "pdf", stage, detail: "d", duplicate: null,
  created_at: NOW, updated_at: NOW, origin: null, case_id: null, ...over,
});

const answer = (i: number): Artifact =>
  ({
    id: `ans-${i}`,
    status: "complete",
    created_at: NOW - i * 3_600_000,
    watermark: 0,
    question_text: `question ${i}`,
    summary: `summary ${i}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: true, instance_identifier: `urn:s:${i}`, label: `Topic ${i}` } },
  }) as unknown as Artifact;

/** Composer + rail + the sync hook + the opened body, as the app wires them. */
function Harness() {
  useIngestArtifactSync();
  const cur = useCanvasStore((s) => s.artifacts.find((a) => a.id === s.currentArtifactId));
  return (
    <>
      <InputBar />
      <AnswersPanel />
      {cur && <SemanticInterpreter payload={cur.rendered_output as never} artifactId={cur.id} />}
    </>
  );
}

const pdf = () => new File(["%PDF-1.4\n"], "PCN26-117.pdf", { type: "application/pdf" });
const rail = () => document.querySelector("[data-answers-scroll]") as HTMLElement;
// Rows only: the day markers are virtual items too.
const railItems = () =>
  [...document.querySelectorAll("[data-virtual-item]")].filter(
    (e) => e.querySelector("[data-ingest-stage]") || /summary d/.test(e.textContent ?? ""),
  );
const ingestRow = () => railItems().find((e) => e.querySelector("[data-ingest-stage]")) ?? null;
const stageText = () => ingestRow()?.querySelector("[data-ingest-stage]")?.textContent;
const badgeEl = () => document.querySelector("[data-ingest-inflight-badge]") as HTMLElement | null;

async function sendOne() {
  useIngestComposerStore.getState().attach(pdf());
  useIngestComposerStore.getState().setKind("pdf");
  await act(async () => {
    await useIngestComposerStore.getState().submit("a@example.com", "", "user-a");
  });
}
const tick = (ms = INGEST_POLL_MS) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  window.localStorage.clear();
  uploadIngest.mockReset();
  fetchIngestStatus.mockReset();
  retryIngest.mockReset();
  useIngestComposerStore.setState({ file: null, kind: null, inferred: null, turns: [] });
  useIngestStatusStore.getState().reset();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  useAnswerPanelStore.setState({ sortMode: "TIME", search: "", typeFilter: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a drop is a turn on the rail", () => {
  it("shows uploading first, then received, as an entry with the filename", async () => {
    let accept!: (v: unknown) => void;
    uploadIngest.mockReturnValue(new Promise((r) => (accept = r)));
    fetchIngestStatus.mockReturnValue(new Promise(() => {}));
    render(<Harness />);
    useIngestComposerStore.getState().attach(pdf());
    useIngestComposerStore.getState().setKind("pdf");
    let done!: Promise<void>;
    await act(async () => {
      done = useIngestComposerStore.getState().submit("a@example.com", "", "user-a");
    });
    expect(stageText()).toBe("uploading");
    expect(ingestRow()!.textContent).toContain("PCN26-117.pdf");
    expect(badgeEl()?.textContent).toBe("1");
    await act(async () => {
      accept({ ingest_id: ID, stage: "received", duplicate: null });
      await done;
    });
    expect(stageText()).toBe("received");
  });

  it("updates in place through the stages (same DOM row), and stops polling after promoted", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    const stages = ["received", "extracting", "review", "promoted"];
    let n = 0;
    fetchIngestStatus.mockImplementation(() => Promise.resolve(wire(ID, stages[Math.min(n++, stages.length - 1)])));
    render(<Harness />);
    await sendOne();
    await tick(0);
    const row = ingestRow();
    expect(row).not.toBeNull();
    const seen = [stageText()];
    for (let i = 0; i < 3; i++) {
      await tick();
      expect(ingestRow(), "the entry was re-created, not updated in place").toBe(row);
      seen.push(stageText());
    }
    expect(seen).toEqual(["received", "extracting", "review", "promoted"]);
    const calls = fetchIngestStatus.mock.calls.length;
    await tick(INGEST_POLL_MS * 5);
    expect(fetchIngestStatus.mock.calls.length, "polled after promoted").toBe(calls);
  });

  it("a remembered terminal drop is fetched once and never again", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW - 86_400_000 });
    fetchIngestStatus.mockResolvedValue(wire(OLD, "promoted"));
    render(<Harness />);
    await tick(0);
    await tick(INGEST_POLL_MS * 4);
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
    expect(stageText()).toBe("promoted");
    expect(badgeEl(), "a terminal drop is not in flight").toBeNull();
  });

  it("is found by search on filename and on ingest id", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW });
    fetchIngestStatus.mockResolvedValue(wire(OLD, "promoted"));
    useCanvasStore.setState({ artifacts: [answer(1), answer(2)] });
    render(<Harness />);
    await tick(0);
    const input = document.querySelector('input[placeholder="Search answers…"]') as HTMLInputElement;
    for (const q of ["old.pdf", OLD.slice(0, 20)]) {
      fireEvent.change(input, { target: { value: q } });
      expect(railItems().map((e) => e.textContent).join("|")).toContain("old.pdf");
      expect(railItems()).toHaveLength(1);
    }
  });

  it("opens as the status card, read from the one poller", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    fetchIngestStatus.mockResolvedValue(wire(ID, "review"));
    render(<Harness />);
    await sendOne();
    await tick(0);
    act(() => useCanvasStore.getState().setCurrentArtifact(useCanvasStore.getState().artifacts[0].id));
    expect(document.querySelector(`[data-ingest-id="${ID}"] [data-ingest-ladder]`)).not.toBeNull();
    const before = fetchIngestStatus.mock.calls.length;
    await tick(INGEST_POLL_MS * 3);
    // review keeps polling, once per tick: the open card adds NO second poller.
    expect(fetchIngestStatus.mock.calls.length - before).toBe(3);
  });

  it("keeps one id across a reload (the ingest id, not the turn id)", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    fetchIngestStatus.mockResolvedValue(wire(ID, "review"));
    render(<Harness />);
    await sendOne();
    await tick(0);
    const ids = () => useCanvasStore.getState().artifacts.map((a) => a.id).filter((id) => id.startsWith("ingest:"));
    expect(ids()).toEqual([ingestArtifactId(ID)]);
    // A reload keeps only the stored list: the composer's turns are gone.
    act(() => useIngestComposerStore.setState({ turns: [] }));
    await tick(0);
    expect(ids(), "the reloaded entry has a different id").toEqual([ingestArtifactId(ID)]);
  });

  it("an entry opened while uploading stays open once the upload is accepted", async () => {
    let accept!: (v: unknown) => void;
    uploadIngest.mockReturnValue(new Promise((r) => (accept = r)));
    fetchIngestStatus.mockReturnValue(new Promise(() => {}));
    render(<Harness />);
    useIngestComposerStore.getState().attach(pdf());
    useIngestComposerStore.getState().setKind("pdf");
    let done!: Promise<void>;
    await act(async () => {
      done = useIngestComposerStore.getState().submit("a@example.com", "", "user-a");
    });
    const uploadingId = useCanvasStore.getState().artifacts.find((a) => a.id.startsWith("ingest:"))!.id;
    expect(uploadingId).not.toBe(ingestArtifactId(ID));
    act(() => useCanvasStore.getState().setCurrentArtifact(uploadingId));
    await act(async () => {
      accept({ ingest_id: ID, stage: "received", duplicate: null });
      await done;
    });
    expect(useCanvasStore.getState().currentArtifactId).toBe(ingestArtifactId(ID));
  });

  it("turnKeys: the ingest id when accepted; the turn id while uploading, for a duplicate, and on a collision", () => {
    const keys = turnKeys([
      { id: "t1", ingestId: null, duplicate: null },
      { id: "t2", ingestId: "ing-a", duplicate: null },
      { id: "t3", ingestId: "ing-a", duplicate: { message: "already processed", ofIngestId: "ing-a" } },
      { id: "t4", ingestId: "ing-a", duplicate: null },
    ]);
    expect([...keys.entries()]).toEqual([["t1", "t1"], ["t2", "ing-a"], ["t3", "t3"], ["t4", "t4"]]);
  });
});

describe("the opened card and extraction_defect", () => {
  const open = async (extra: Record<string, unknown>) => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    fetchIngestStatus.mockResolvedValue({ ...wire(ID, "promoted"), ...extra });
    render(<Harness />);
    await sendOne();
    await tick(0);
    act(() => useCanvasStore.getState().setCurrentArtifact(useCanvasStore.getState().artifacts[0].id));
  };

  it("an object defect is drawn on the card and marked on the rail row", async () => {
    await open({ extraction_defect: { task_id: "task-9", edits: 3 } });
    expect(document.querySelector("[data-ingest-id] [data-ingest-extraction-defect]")?.textContent).toContain("3 rows");
    expect(ingestRow()?.querySelector("[data-ingest-extraction-defect]")).not.toBeNull();
  });

  it.each([["null", { extraction_defect: null }], ["absent", {}]])("%s draws no defect", async (_n, extra) => {
    await open(extra);
    expect(document.querySelector("[data-ingest-extraction-defect]")).toBeNull();
  });
});

describe("TYPE filter and the composer badge", () => {
  it("badge click filters the rail to ingest entries, shows the chip, and clearing restores", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    fetchIngestStatus.mockResolvedValue(wire(ID, "extracting"));
    useCanvasStore.setState({ artifacts: [answer(1), answer(2), answer(3)] });
    render(<Harness />);
    await sendOne();
    await tick(0);
    // jsdom renders only a window of the virtualised rail: assert presence, not the count.
    expect(rail().textContent).toContain("summary 1");
    expect(ingestRow()).not.toBeNull();
    expect(document.querySelector("[data-type-filter]")).toBeNull();
    const picker = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(badgeEl()!);
    expect(picker, "the badge click opened the file picker").not.toHaveBeenCalled();
    expect(useAnswerPanelStore.getState().typeFilter).toBe("INGEST");
    expect(document.querySelector('[data-type-filter="INGEST"]')).not.toBeNull();
    expect(railItems()).toHaveLength(1);
    expect(railItems()[0].textContent).toContain("PCN26-117.pdf");
    fireEvent.click(document.querySelector('[data-type-filter="INGEST"]')!);
    expect(document.querySelector("[data-type-filter]")).toBeNull();
    expect(rail().textContent).toContain("summary 1");
  });

  it("the filter holds in TYPE mode too", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW });
    fetchIngestStatus.mockResolvedValue(wire(OLD, "promoted"));
    useCanvasStore.setState({ artifacts: [answer(1)] });
    useAnswerPanelStore.setState({ sortMode: "TYPE", typeFilter: "INGEST" });
    render(<Harness />);
    await tick(0);
    const text = rail().textContent ?? "";
    expect(text).toContain("old.pdf");
    expect(text).not.toContain("summary 1");
  });

  it("the badge counts uploading + non-terminal drops, hides at 0, and drops as a drop goes terminal", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW - 1000 });
    fetchIngestStatus.mockImplementation((id: string) =>
      Promise.resolve(id === OLD ? wire(OLD, "promoted") : wire(ID, flip ? "promoted" : "extracting")),
    );
    let flip = false;
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    render(<Harness />);
    await tick(0);
    expect(badgeEl(), "a terminal remembered drop must not count").toBeNull();
    await sendOne();
    await tick(0);
    expect(badgeEl()?.textContent).toBe("1");
    flip = true;
    await tick();
    expect(badgeEl()).toBeNull();
  });
});

describe("no My drops", () => {
  it("nothing in the composer or rail says or marks My drops, with drops present", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW });
    fetchIngestStatus.mockResolvedValue(wire(OLD, "review"));
    render(<Harness />);
    await tick(0);
    expect(document.body.textContent).not.toMatch(/my drops/i);
    expect(document.body.innerHTML).not.toMatch(/my[-_ ]?drops/i);
    expect(document.querySelector("[data-my-drops]")).toBeNull();
  });
});

describe("the composer row", () => {
  it("is exactly wifi, bolt, clip, input, send -- nothing else", () => {
    render(<InputBar />);
    const row = document.querySelector("[data-ingest-composer] input[type='text']")!.parentElement!;
    const kids = [...row.children];
    expect(kids).toHaveLength(4);
    const [group, input, hiddenFile, send] = kids;
    expect(input.tagName).toBe("INPUT");
    expect((hiddenFile as HTMLInputElement).type).toBe("file");
    expect(send.getAttribute("aria-label")).toBe("Send");
    const inner = [...group.children];
    expect(inner).toHaveLength(3);
    expect(inner[0].tagName.toLowerCase()).toBe("svg"); // wifi
    expect(inner[1].hasAttribute("data-persona-picker")).toBe(true); // bolt
    expect(inner[2].querySelector("[data-ingest-attach]")).not.toBeNull(); // clip
    expect(group.className).toMatch(/flex items-center gap-2/);
  });

  it("the clip is a plain icon: no border or box", () => {
    render(<InputBar />);
    const clip = document.querySelector("[data-ingest-attach]") as HTMLElement;
    expect(clip.className).not.toMatch(/border|w-9|h-9|rounded/);
    expect(clip.className).toMatch(/text-slate-400 hover:text-neon-cyan/);
  });
});

describe("extraction_defect on the rail", () => {
  it("draws the marker only for the object; absent and null draw nothing", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW });
    const marker = () => document.querySelector("[data-ingest-extraction-defect]");
    for (const [over, drawn] of [
      [{}, false],
      [{ extraction_defect: null }, false],
      [{ extraction_defect: { task_id: "t-1", edits: 4 } }, true],
      [{ extraction_defect: { task_id: "", edits: 4 } }, false],
    ] as const) {
      cleanup();
      useIngestStatusStore.getState().reset();
      useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
      fetchIngestStatus.mockResolvedValue(wire(OLD, "promoted", over));
      render(<Harness />);
      await tick(0);
      expect(!!marker(), JSON.stringify(over)).toBe(drawn);
      if (drawn) expect(marker()!.getAttribute("title")).toBe("extraction corrected: 4 rows");
    }
  });
});

describe("a failed drop's reason and the notice id on the rail", () => {
  const setup = async (stage: string, over: Record<string, unknown> = {}) => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    fetchIngestStatus.mockResolvedValue(wire(ID, stage, over));
    render(<Harness />);
    await sendOne();
    await tick(0);
  };
  const reasonEl = () => ingestRow()?.querySelector("[data-ingest-reason]") ?? null;
  const badgeClass = () => ingestRow()!.querySelector("[data-ingest-stage]")!.className;

  it("a failed row shows the reason verbatim, and a badge distinct from review's", async () => {
    await setup("failed", { detail: "no registered content_kind" });
    expect(stageText()).toBe("failed");
    expect(reasonEl()?.textContent).toBe("no registered content_kind");
    expect(reasonEl()?.getAttribute("title")).toBe("no registered content_kind");
    const failedClass = badgeClass();
    cleanup();
    useIngestStatusStore.getState().reset();
    useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
    await setup("review");
    expect(badgeClass()).not.toBe(failedClass);
  });

  it("a rejected row with detail shows no reason", async () => {
    await setup("rejected", { detail: "not a PCN" });
    expect(stageText()).toBe("rejected");
    expect(document.querySelector("[data-ingest-reason]")).toBeNull();
  });

  it("a review row shows no reason", async () => {
    await setup("review");
    expect(document.querySelector("[data-ingest-reason]")).toBeNull();
  });

  it("an entry going extracting -> failed updates in place and gains the reason", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    let n = 0;
    fetchIngestStatus.mockImplementation(() =>
      Promise.resolve(n++ === 0 ? wire(ID, "extracting") : wire(ID, "failed", { detail: "boom" })),
    );
    render(<Harness />);
    await sendOne();
    await tick(0);
    const row = ingestRow();
    expect(stageText()).toBe("extracting");
    expect(reasonEl()).toBeNull();
    await tick();
    expect(ingestRow(), "the entry was re-created, not updated in place").toBe(row);
    expect(stageText()).toBe("failed");
    expect(reasonEl()?.textContent).toBe("boom");
  });

  it("notice_id is on the rail entry and the opened card, and the rail finds the entry by it", async () => {
    recordMyDrop("user-a", { ingestId: OLD, filename: "old.pdf", droppedAt: NOW });
    fetchIngestStatus.mockResolvedValue(wire(OLD, "promoted", { notice_id: "PCN26-184" }));
    useCanvasStore.setState({ artifacts: [answer(1), answer(2)] });
    render(<Harness />);
    await tick(0);
    expect(ingestRow()?.querySelector("[data-ingest-notice-id]")?.textContent).toBe("PCN26-184");
    const input = document.querySelector('input[placeholder="Search answers…"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "PCN26-184" } });
    expect(railItems()).toHaveLength(1);
    expect(railItems()[0].textContent).toContain("old.pdf");
    fireEvent.change(input, { target: { value: "" } });
    act(() => useCanvasStore.getState().setCurrentArtifact(useCanvasStore.getState().artifacts.find((a) => a.id.startsWith("ingest:"))!.id));
    expect(document.querySelector("[data-ingest-id] [data-ingest-notice-id]")?.textContent).toBe("notice PCN26-184");
  });

  it.each([["null", { notice_id: null }], ["absent", {}]])("%s notice_id draws nothing and no placeholder", async (_n, extra) => {
    await setup("promoted", extra);
    act(() => useCanvasStore.getState().setCurrentArtifact(useCanvasStore.getState().artifacts[0].id));
    expect(document.querySelector("[data-ingest-notice-id]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/unclassified/i);
  });
});

describe("a failed drop on the rail — failure, attempt, Retry", () => {
  const failure = (over: Record<string, unknown> = {}) => ({
    reason_code: "kind_unregistered", reason: "kind x is not registered: a, b", step: null, run_id: null, pin_digest: null, failed_at: 1, ...over,
  });
  const setup = async (stage: string, over: Record<string, unknown> = {}) => {
    uploadIngest.mockResolvedValue({ ingest_id: ID, stage: "received", duplicate: null });
    fetchIngestStatus.mockResolvedValue(wire(ID, stage, over));
    render(<Harness />);
    await sendOne();
    await tick(0);
  };
  const q = (sel: string) => ingestRow()?.querySelector(sel) ?? null;

  it("draws failure.reason over detail, its code verbatim, and attempt above 1", async () => {
    await setup("failed", { detail: "old detail", failure: failure(), attempt: 2 });
    expect(q("[data-ingest-reason]")?.textContent).toBe("kind x is not registered: a, b");
    expect(q("[data-ingest-reason-code]")?.textContent).toBe("kind_unregistered");
    expect(q("[data-ingest-attempt]")?.textContent).toBe("attempt 2");
  });

  it("falls back to detail when the fleet sends no failure; no code, no attempt", async () => {
    await setup("failed", { detail: "old detail" });
    expect(q("[data-ingest-reason]")?.textContent).toBe("old detail");
    expect(q("[data-ingest-reason-code]")).toBeNull();
    expect(q("[data-ingest-attempt]")).toBeNull();
  });

  it("timeout draws the muted note", async () => {
    await setup("failed", { failure: failure({ reason_code: "timeout" }) });
    expect(q("[data-ingest-timeout-note]")?.textContent).toBe("No stage was reported in time. It can still advance on its own.");
  });

  it.each(INGEST_STAGES.map((st) => [st]))("Retry on the rail for stage %s", async (stage) => {
    await setup(stage, stage === "failed" ? { failure: failure() } : {});
    expect(q("[data-ingest-retry]") !== null).toBe(stage === "failed");
  });

  it("clicking Retry calls the transport once, does not open the row, and the entry goes back to received", async () => {
    retryIngest.mockResolvedValue({ ingest_id: ID, stage: "received", attempt: 2 });
    await setup("failed", { failure: failure({ reason_code: "timeout" }), attempt: 1 });
    expect(useCanvasStore.getState().currentArtifactId).toBeNull();
    await act(async () => {
      fireEvent.click(q("[data-ingest-retry]")!);
    });
    expect(retryIngest).toHaveBeenCalledTimes(1);
    expect(retryIngest).toHaveBeenCalledWith(ID);
    expect(useCanvasStore.getState().currentArtifactId, "the click reached the row").toBeNull();
    expect(stageText()).toBe("received");
    expect(q("[data-ingest-retry]")).toBeNull();
    expect(q("[data-ingest-attempt]")?.textContent).toBe("attempt 2");
  });

  it("a refusal is shown inline on the entry", async () => {
    retryIngest.mockRejectedValue({ response: { status: 403, data: { detail: { error: "retry_is_pin_driven" } } } });
    await setup("failed", { failure: failure() });
    await act(async () => {
      fireEvent.click(q("[data-ingest-retry]")!);
    });
    expect(q("[data-ingest-retry-message]")?.textContent).toBe("This drop can’t be retried from here.");
    expect(stageText()).toBe("failed");
  });
});
