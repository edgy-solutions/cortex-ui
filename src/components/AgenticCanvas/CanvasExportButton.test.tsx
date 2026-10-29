import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const fetchExportRecipients = vi.fn();
const startCanvasExport = vi.fn();
const downloadExportArtifact = vi.fn();

vi.mock("@/api/client", () => ({
  fetchExportRecipients: (...a: unknown[]) => fetchExportRecipients(...a),
  startCanvasExport: (...a: unknown[]) => startCanvasExport(...a),
  downloadExportArtifact: (...a: unknown[]) => downloadExportArtifact(...a),
}));

import { CanvasExportButton } from "./CanvasExportButton";
import { useCanvasStore } from "@/store/useCanvasStore";
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";

const FLAG_KEY = "cortex.canvasExport";
const GOOD_SHA = "sha256:" + "b".repeat(64);
const GOOD_URI = "/export/package/artifact/legal-2026-09-30.zip";

function setArtifacts(ids: string[]) {
  useCanvasStore.setState({
    artifacts: ids.map((id) => ({ id }) as never),
    currentArtifactId: null,
  } as never);
}

function axiosError(status: number, detail: unknown) {
  return {
    isAxiosError: true,
    response: { status, data: { detail } },
  };
}

async function openAndPickLegal() {
  fireEvent.click(document.querySelector("[data-canvas-export]")!);
  await waitFor(() => expect(document.querySelector("[data-export-recipient]")).not.toBeNull());
  fireEvent.click(document.querySelector('[data-export-recipient="legal"]')!);
}

async function openAndPick(value: string) {
  fireEvent.click(document.querySelector("[data-canvas-export]")!);
  await waitFor(() => expect(document.querySelector(`[data-export-recipient="${value}"]`)).not.toBeNull());
  fireEvent.click(document.querySelector(`[data-export-recipient="${value}"]`)!);
}

// ── Lane 1's live capture, roll #11 ─────────────────────────────────────────────────────────
// sessions/2026-10-01-payload-export-package-roll-11.json. Loaded, never inlined.

interface ExportExchange {
  request: { method: string; path: string };
  response: { status: number; body: unknown };
}

function loadExportCapture(): { exchanges: ExportExchange[] } {
  const file = path.join(__dirname, "../../../sessions/2026-10-01-payload-export-package-roll-11.json");
  return JSON.parse(readFileSync(file, "utf8")) as { exchanges: ExportExchange[] };
}

beforeEach(() => {
  window.localStorage.removeItem(FLAG_KEY);
  setArtifacts(["a1", "a2"]);
  fetchExportRecipients.mockReset();
  startCanvasExport.mockReset();
  downloadExportArtifact.mockReset();
});
afterEach(cleanup);

describe("flag off", () => {
  it("renders nothing", () => {
    const { container } = render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("flag on", () => {
  beforeEach(() => window.localStorage.setItem(FLAG_KEY, "1"));

  it("zero answers on the canvas → disabled", () => {
    setArtifacts([TASK_ARTIFACT_PREFIX + "t1"]); // no real answers
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    const btn = document.querySelector("[data-canvas-export]");
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("no recipient pre-selected and start disabled", async () => {
    fetchExportRecipients.mockResolvedValue([
      { value: "legal", label: "Legal" },
      { value: "finance", label: "Finance" },
    ]);
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    fireEvent.click(document.querySelector("[data-canvas-export]")!);
    await waitFor(() =>
      expect(document.querySelectorAll("[data-export-recipient]").length).toBe(2),
    );
    const startBtn = screen.getByText("Start export").closest("button")!;
    expect(startBtn.disabled).toBe(true);
  });

  it("picking + start posts exactly {answers, recipient_scope} in canvas order — no template_id", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: null,
      status: "producing",
      recipient_scope: "legal",
    });
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(startCanvasExport).toHaveBeenCalledTimes(1));
    expect(startCanvasExport).toHaveBeenCalledWith({
      answers: [{ artifact_id: "a1" }, { artifact_id: "a2" }],
      recipient_scope: "legal",
    });
  });

  it("THE BOARD, NOT THE STORE: a 3-card board over an 856-answer store posts 3 ids and says 3", async () => {
    // fin's walk (2026-10-16): the picker said "Export 856 answers to…" for a 3-card board.
    setArtifacts(Array.from({ length: 856 }, (_, i) => `s${i}`));
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({ export_id: null, status: "producing", recipient_scope: "legal" });
    const board = [{ id: "s7" }, { id: "task:t1" }, { id: "s3" }, { id: "s500" }];
    render(<CanvasExportButton board={board} />);
    await openAndPickLegal();
    expect(document.body.textContent).toContain("Export 3 answers to…");
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(startCanvasExport).toHaveBeenCalledTimes(1));
    expect(startCanvasExport).toHaveBeenCalledWith({
      answers: [{ artifact_id: "s7" }, { artifact_id: "s3" }, { artifact_id: "s500" }],
      recipient_scope: "legal",
    });
  });

  it("an empty board over a full store is disabled: nothing is on the board to export", () => {
    setArtifacts(["a1", "a2"]);
    render(<CanvasExportButton board={[]} />);
    expect((document.querySelector("[data-canvas-export]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("failed with export_id null reads (not null itself) and shows the reason", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: null,
      status: "failed",
      recipient_scope: "legal",
      reason: "engine returned no verifiable artifact hash",
    });
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-status]")).not.toBeNull());
    expect(document.querySelector("[data-export-status]")?.textContent).toContain(
      "engine returned no verifiable artifact hash",
    );
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
    // ruling: the reason REPLACES the status word; the attribute stays honest
    expect(document.querySelector("[data-export-status]")?.textContent).not.toMatch(/failed/i);
    expect(document.querySelector("[data-export-status]")?.textContent).toBe(
      "engine returned no verifiable artifact hash",
    );
  });

  it("failed with NO reason (no-documents path) shows the fallback, never the word failed", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({ export_id: null, status: "failed", recipient_scope: "legal" });
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-status]")).not.toBeNull());
    expect(document.querySelector("[data-export-status]")?.textContent).toBe(
      "not exported — no reason given",
    );
    expect(document.querySelector("[data-export-status]")?.textContent).not.toMatch(/failed/i);
  });

  it("no polling call is ever made (synchronous route, single POST)", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: null,
      status: "producing",
      recipient_scope: "legal",
    });
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(startCanvasExport).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector("[data-export-status]")).not.toBeNull());

    // The UI has settled — NOW spy, so testing-library's own internal polling (which also
    // uses setInterval) isn't mistaken for the component's. A plain setTimeout wait, not
    // `waitFor`, so nothing else touches setInterval during the window being measured.
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(startCanvasExport).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
  });

  it("exists with good hash → clicking the link downloads via the gateway path and shows the sha", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: GOOD_SHA,
      status: "exists",
      recipient_scope: "legal",
      artifact_uri: GOOD_URI,
      artifact_sha256: GOOD_SHA,
      artifact_filename: "legal-2026-09-30.zip",
    });
    downloadExportArtifact.mockResolvedValue(new Blob(["x"]));
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-artifact]")).not.toBeNull());
    expect(document.querySelector("[data-export-sha]")?.textContent).toBe(GOOD_SHA);

    fireEvent.click(document.querySelector("[data-export-artifact]")!);
    await waitFor(() => expect(downloadExportArtifact).toHaveBeenCalledWith(GOOD_URI));
  });

  it("exists with a uri outside /export/package/artifact/ draws no link", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: GOOD_SHA,
      status: "exists",
      recipient_scope: "legal",
      artifact_uri: "/canvas/export/e1/artifact",
      artifact_sha256: GOOD_SHA,
    });
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-status]")).not.toBeNull());
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
  });

  it("wrapped 409 renders its options", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockRejectedValue(
      axiosError(409, {
        reason: "recipient_required",
        options: [
          { value: "finance", label: "Finance" },
          { value: "ops", label: "Operations" },
        ],
      }),
    );
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() =>
      expect(document.querySelector('[data-export-recipient="finance"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-export-recipient="ops"]')).not.toBeNull();
  });

  it("wrapped 403 shows the recipient scope", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockRejectedValue(
      axiosError(403, {
        reason: "not_a_recipient_you_may_export_to",
        recipient_scope: "legal",
      }),
    );
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-error]")).not.toBeNull());
    expect(document.querySelector("[data-export-error]")?.textContent).toContain("legal");
  });

  it("502 shows the engine-unreachable message", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockRejectedValue(
      axiosError(502, { error: "cost_engine_unreachable", message: "connection refused" }),
    );
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-error]")).not.toBeNull());
    expect(document.querySelector("[data-export-error]")?.textContent).toContain(
      "cost_engine_unreachable",
    );
  });

  it("network error (no axios response) → visible error text, never a link", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockRejectedValue(new Error("network down"));
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-error]")).not.toBeNull());
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
  });

  it("a 409 recipient_required with malformed options (missing label) shows the generic error, NOT a picker", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockRejectedValue(
      axiosError(409, { reason: "recipient_required", options: [{ value: "finance" }] }),
    );
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-error]")).not.toBeNull());
    expect(document.querySelector("[data-export-error]")?.textContent).not.toBe("Pick a recipient.");
    // the picker is untouched by the malformed response — still only "legal", never "finance"
    expect(document.querySelectorAll("[data-export-recipient]").length).toBe(1);
    expect(document.querySelector('[data-export-recipient="finance"]')).toBeNull();
  });

  it("a download failure shows an error and never a downloaded claim", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: GOOD_SHA,
      status: "exists",
      recipient_scope: "legal",
      artifact_uri: GOOD_URI,
      artifact_sha256: GOOD_SHA,
    });
    downloadExportArtifact.mockRejectedValue(new Error("boom"));
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-artifact]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-export-artifact]")!);
    await waitFor(() => expect(document.querySelector("[data-export-error]")).not.toBeNull());
    expect(document.querySelector("[data-export-error]")?.textContent).toContain("Download failed");
  });
});

describe("roll-11 capture — drives the button through the captured bodies", () => {
  beforeEach(() => window.localStorage.setItem(FLAG_KEY, "1"));
  const capture = loadExportCapture();

  it("first start → 409 → the picker shows alpha; pick it, start again → 200 failed, outcome drawn, no link", async () => {
    const recipientsBody = capture.exchanges[0].response.body as {
      recipients: { value: string; label: string }[];
    };
    const conflictDetail = (capture.exchanges[1].response.body as { detail: unknown }).detail;
    const failedBody = capture.exchanges[2].response.body;

    fetchExportRecipients.mockResolvedValue(recipientsBody.recipients);
    startCanvasExport
      .mockRejectedValueOnce(axiosError(409, conflictDetail))
      .mockResolvedValueOnce(failedBody);

    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPick("notional-customer-alpha");
    fireEvent.click(screen.getByText("Start export"));

    // the 409 re-seeds the picker from the server's own options — still alpha
    await waitFor(() =>
      expect(document.querySelector("[data-export-error]")?.textContent).toBe("Pick a recipient."),
    );
    expect(document.querySelector('[data-export-recipient="notional-customer-alpha"]')).not.toBeNull();

    fireEvent.click(document.querySelector('[data-export-recipient="notional-customer-alpha"]')!);
    fireEvent.click(screen.getByText("Start export"));

    await waitFor(() => expect(document.querySelector("[data-export-status]")).not.toBeNull());
    expect(document.querySelector("[data-export-status]")?.textContent).not.toMatch(/failed/i);
    expect(document.querySelector("[data-export-status]")?.textContent).toContain("agent_fleet");
    expect(document.querySelector("[data-export-outcome]")?.textContent).toBe("unavailable");
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
  });
});

// ── Fin's live rev-187 body — a mixed board ────────────────────────────────────────────────
// sessions/2026-10-10-payload-export-mixed-board-rev187.json, verbatim.

function loadMixed(): { documents: Record<string, unknown>[] } & Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      path.join(__dirname, "../../../sessions/2026-10-10-payload-export-mixed-board-rev187.json"),
      "utf8",
    ),
  );
}

describe("mixed board — documents[] (rev 187)", () => {
  beforeEach(() => window.localStorage.setItem(FLAG_KEY, "1"));

  async function runWith(body: unknown) {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue(body);
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-document]")).not.toBeNull());
  }

  it("draws one row per document with the cost link, the fin refusal and the summary", async () => {
    const body = loadMixed();
    await runWith(body);

    expect(document.querySelectorAll("[data-export-document]").length).toBe(body.documents.length);
    expect(document.body.textContent).not.toContain("could not be read");
    expect(document.querySelector("[data-export-error]")).toBeNull();
    expect(document.querySelector("[data-export-summary]")?.textContent).toContain(
      "1 of 2 engines refused",
    );
    expect(
      document.querySelector("[data-export-summary]")?.getAttribute("data-export-top-status"),
    ).toBe("partial");

    const cost = document.querySelector('[data-export-engine="cost"]')!;
    expect(cost.getAttribute("data-export-status")).toBe("exists");
    expect(cost.querySelector("[data-export-lots]")?.textContent).toContain("4");
    expect(cost.querySelector("[data-export-sections]")?.textContent).toContain(
      "labor, sepm, material",
    );
    const costUri = body.documents[0].artifact_uri as string;
    expect(cost.querySelector("[data-export-artifact]")?.getAttribute("data-export-href")).toBe(
      costUri,
    );
    downloadExportArtifact.mockResolvedValue(new Blob(["x"]));
    fireEvent.click(cost.querySelector("[data-export-artifact]")!);
    await waitFor(() => expect(downloadExportArtifact).toHaveBeenCalledWith(costUri));

    const fin = document.querySelector('[data-export-engine="fin"]')!;
    expect(fin.getAttribute("data-export-status")).toBe("failed");
    expect(fin.querySelector("[data-export-reason]")?.textContent).toBe("not a ratified template");
    expect(fin.textContent).not.toMatch(/failed/i);
    expect(fin.querySelector("[data-export-outcome]")?.textContent).toBe("not_in_model");
    expect(fin.querySelector("[data-export-artifact]")).toBeNull();
    expect(document.querySelectorAll("[data-export-artifact]").length).toBe(1);
  });

  it("finance-only: the reason is drawn, the word failed never is; attributes stay failed", async () => {
    // Shape origin: invincible-agent gateway.py export_package (~2185-2210) with
    // _fin_ad_hoc_refusal_section (1884): HTTP 200, top status failed, export_id null, the fin
    // section always carrying outcome not_in_model + reason. Built from the rev187 fin row.
    const mixed = loadMixed();
    const fin = mixed.documents.find((d) => d.engine === "fin")!;
    const body = {
      ...mixed,
      export_id: null,
      status: "failed",
      reason: "1 of 1 engines refused",
      template_id: null,
      documents: [fin],
    };
    await runWith(body);

    const summary = document.querySelector("[data-export-summary]")!;
    expect(summary.textContent).toBe("1 of 1 engines refused");
    expect(summary.getAttribute("data-export-top-status")).toBe("failed");
    const row = document.querySelector('[data-export-engine="fin"]')!;
    expect(row.getAttribute("data-export-status")).toBe("failed");
    expect(row.textContent).toContain("not a ratified template");
    expect(row.querySelector("[data-export-outcome]")?.textContent).toBe("not_in_model");
    expect(summary.parentElement!.textContent).not.toMatch(/failed/i);
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
  });

  it("the link comes from the DOCUMENT, never the top-level fields", async () => {
    const body = loadMixed();
    // A decoy top level: if the component read it, the href would be this one.
    body.artifact_uri = "/export/package/artifact/TOP.html";
    body.artifact_sha256 = GOOD_SHA;
    await runWith(body);
    const hrefs = [...document.querySelectorAll("[data-export-artifact]")].map((a) =>
      a.getAttribute("data-export-href"),
    );
    expect(hrefs).toEqual([body.documents[0].artifact_uri]);
  });

  it("three documents → three rows (cardinality)", async () => {
    const body = loadMixed();
    body.documents.push({ ...body.documents[1], engine: "fin2" });
    await runWith(body);
    expect(document.querySelectorAll("[data-export-document]").length).toBe(3);
  });

  it("a malformed document reads as unreadable, not as a short list", async () => {
    const body = loadMixed();
    delete body.documents[1].engine;
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue(body);
    render(<CanvasExportButton board={useCanvasStore.getState().artifacts} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-error]")).not.toBeNull());
    expect(document.body.textContent).toContain("could not be read");
    expect(document.querySelectorAll("[data-export-document]").length).toBe(0);
  });

  it("re-export of the same canvas with a NEW sha draws the new sha (nothing is keyed on the old one)", async () => {
    await runWith(loadMixed());
    expect(document.querySelector("[data-export-sha]")?.textContent).toBe(
      loadMixed().documents[0].artifact_sha256,
    );
    const second = loadMixed();
    const newSha = "sha256:" + "c".repeat(64);
    second.documents[0].artifact_sha256 = newSha;
    second.documents[0].export_id = newSha;
    cleanup();
    await runWith(second);
    expect(document.querySelector("[data-export-sha]")?.textContent).toBe(newSha);
  });
});

// Refusals as ROWS (directive 2026-10-28): the gateway's _refused_entries groups refused answers
// into one failed document per reason_code; the panel draws one row per answer id.
describe("refused documents — one row per answer", () => {
  beforeEach(() => window.localStorage.setItem(FLAG_KEY, "1"));

  type B = { id: string; summary?: string; question_text?: string };
  const failedDoc = (
    answers: string[],
    extra: Record<string, unknown> = {},
  ) => ({
    engine: "fin",
    answers,
    status: "failed",
    export_id: null,
    recipient_scope: "legal",
    outcome: "not_in_model",
    ...extra,
  });
  const top = (documents: unknown[], reason: string, status = "failed") => ({
    export_id: null,
    status,
    reason,
    recipient_scope: "legal",
    documents,
  });

  async function runBoard(board: B[], body: unknown) {
    fetchExportRecipients.mockResolvedValue([
      { value: "legal", label: "Legal" },
    ]);
    startCanvasExport.mockResolvedValue(body);
    render(<CanvasExportButton board={board} />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() =>
      expect(document.querySelector("[data-export-document]")).not.toBeNull(),
    );
  }
  const rows = () =>
    Array.from(document.querySelectorAll("[data-export-refused-answer]"));
  const txt = (el: Element, sel: string) => el.querySelector(sel)?.textContent;
  const five: B[] = [1, 2, 3, 4, 5].map((n) => ({
    id: `a${n}`,
    summary: `Answer ${n}`,
  }));

  it("A. five refused, one code: five rows in board order, each with the group reason", async () => {
    await runBoard(
      five,
      top(
        [
          failedDoc(["a1", "a2", "a3", "a4", "a5"], {
            reason: "not a ratified template",
            reason_code: "not_a_ratified_template",
          }),
        ],
        "5 of 5 answers refused",
      ),
    );
    const r = rows();
    expect(r.length).toBe(5);
    expect(r.map((e) => e.getAttribute("data-export-refused-answer"))).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
    ]);
    r.forEach((e, i) => {
      expect(txt(e, "[data-export-answer-label]")).toBe(`Answer ${i + 1}`);
      expect(txt(e, "[data-export-reason]")).toBe("not a ratified template");
    });
    expect(document.querySelector("[data-export-summary]")?.textContent).toBe(
      "5 of 5 answers refused",
    );
  });

  it("B. mixed codes: each row carries ITS document's reason and code", async () => {
    await runBoard(
      five,
      top(
        [
          failedDoc(["a1", "a2"], {
            reason: "reason X",
            reason_code: "code_x",
          }),
          failedDoc(["a3", "a4", "a5"], {
            reason: "reason Y",
            reason_code: "code_y",
          }),
        ],
        "5 of 5 answers refused",
      ),
    );
    const r = rows();
    expect(r.length).toBe(5);
    const want = [
      ["reason X", "code_x"],
      ["reason X", "code_x"],
      ["reason Y", "code_y"],
      ["reason Y", "code_y"],
      ["reason Y", "code_y"],
    ];
    r.forEach((e, i) => {
      expect(txt(e, "[data-export-reason]")).toBe(want[i][0]);
      expect(txt(e, "[data-export-reason-code]")).toBe(want[i][1]);
    });
  });

  it("C. partial: the exists link is unchanged and holds no refused rows", async () => {
    const mixed = loadMixed();
    const cost = mixed.documents.find((d) => d.engine === "cost")!;
    await runBoard(
      [
        { id: "c1", summary: "Cost one" },
        { id: "f1", summary: "Fin one" },
        { id: "f2", summary: "Fin two" },
      ],
      top(
        [cost, failedDoc(["f1", "f2"], { reason: "nope", reason_code: "c" })],
        "1 of 2 engines refused",
        "partial",
      ),
    );
    expect(rows().length).toBe(2);
    const exists = document.querySelector('[data-export-status="exists"]')!;
    expect(exists.querySelector("[data-export-refused-answer]")).toBeNull();
    expect(
      exists
        .querySelector("[data-export-artifact]")
        ?.getAttribute("data-export-href"),
    ).toBe(cost.artifact_uri);
    expect(document.querySelectorAll("[data-export-artifact]").length).toBe(1);
  });

  it("D. label fallback: summary, then question_text, then id", async () => {
    await runBoard(
      [
        { id: "x1", summary: "  Sum  " },
        { id: "x2", summary: "", question_text: " Why? " },
        { id: "x3" },
      ],
      top(
        [failedDoc(["x1", "x2", "x3"], { reason: "r" })],
        "3 of 3 answers refused",
      ),
    );
    expect(rows().map((e) => txt(e, "[data-export-answer-label]"))).toEqual([
      "Sum",
      "Why?",
      "x3",
    ]);
  });

  it("E. an id not on the board is still drawn, labelled with the id, and marked unknown", async () => {
    await runBoard(
      [{ id: "k1", summary: "Known" }],
      top(
        [failedDoc(["k1", "ghost"], { reason: "r" })],
        "2 of 2 answers refused",
      ),
    );
    const r = rows();
    expect(r.length).toBe(2);
    expect(r[0].hasAttribute("data-export-answer-unknown")).toBe(false);
    expect(r[1].hasAttribute("data-export-answer-unknown")).toBe(true);
    expect(txt(r[1], "[data-export-answer-label]")).toBe("ghost");
  });

  it("F. missing reason: every row reads the fallback, never the word failed", async () => {
    await runBoard(
      five.slice(0, 2),
      top([failedDoc(["a1", "a2"])], "2 of 2 answers refused"),
    );
    const r = rows();
    expect(r.length).toBe(2);
    r.forEach((e) => {
      expect(txt(e, "[data-export-reason]")).toBe(
        "not exported — no reason given",
      );
      expect(e.textContent).not.toMatch(/failed/i);
    });
  });
});
