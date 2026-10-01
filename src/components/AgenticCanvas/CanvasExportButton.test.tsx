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
    const { container } = render(<CanvasExportButton />);
    expect(container.innerHTML).toBe("");
  });
});

describe("flag on", () => {
  beforeEach(() => window.localStorage.setItem(FLAG_KEY, "1"));

  it("zero answers on the canvas → disabled", () => {
    setArtifacts([TASK_ARTIFACT_PREFIX + "t1"]); // no real answers
    render(<CanvasExportButton />);
    const btn = document.querySelector("[data-canvas-export]");
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("no recipient pre-selected and start disabled", async () => {
    fetchExportRecipients.mockResolvedValue([
      { value: "legal", label: "Legal" },
      { value: "finance", label: "Finance" },
    ]);
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(startCanvasExport).toHaveBeenCalledTimes(1));
    expect(startCanvasExport).toHaveBeenCalledWith({
      answers: [{ artifact_id: "a1" }, { artifact_id: "a2" }],
      recipient_scope: "legal",
    });
  });

  it("failed with export_id null reads (not null itself) and shows the reason", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: null,
      status: "failed",
      recipient_scope: "legal",
      reason: "engine returned no verifiable artifact hash",
    });
    render(<CanvasExportButton />);
    await openAndPickLegal();
    fireEvent.click(screen.getByText("Start export"));
    await waitFor(() => expect(document.querySelector("[data-export-status]")).not.toBeNull());
    expect(document.querySelector("[data-export-status]")?.textContent).toContain(
      "engine returned no verifiable artifact hash",
    );
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
  });

  it("no polling call is ever made (synchronous route, single POST)", async () => {
    fetchExportRecipients.mockResolvedValue([{ value: "legal", label: "Legal" }]);
    startCanvasExport.mockResolvedValue({
      export_id: null,
      status: "producing",
      recipient_scope: "legal",
    });
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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
    render(<CanvasExportButton />);
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

    render(<CanvasExportButton />);
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
    expect(document.querySelector("[data-export-status]")?.textContent).toContain("failed");
    expect(document.querySelector("[data-export-status]")?.textContent).toContain("agent_fleet");
    expect(document.querySelector("[data-export-outcome]")?.textContent).toBe("unavailable");
    expect(document.querySelector("[data-export-artifact]")).toBeNull();
  });
});
