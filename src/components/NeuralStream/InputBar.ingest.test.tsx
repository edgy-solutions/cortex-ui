/**
 * Architect ruling 2026-10-09 — "the drop is the prompt". One arm per ruling test line, plus the
 * P0 2026-10-08 guarantees (cancel AND stop every drag event) ported from the retired HUD pill.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, createEvent, act, waitFor } from "@testing-library/react";

const sendMessage = vi.fn();
const uploadIngest = vi.fn();

vi.mock("@/hooks/useAgent", () => ({
  useAgent: () => ({ sendMessage, isConnected: true, isProcessing: false }),
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
vi.mock("@/components/PersonaPicker", () => ({ PersonaPicker: () => null }));
vi.mock("@/store/useInterviewStore", () => ({
  useInterviewStore: (sel: (s: { phase: string }) => unknown) => sel({ phase: "active" }),
}));
vi.mock("@/lib/ingestFlag", () => ({ isIngestUiEnabled: () => true }));
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: { profile: { email: "steward@example.com" } } }),
}));
vi.mock("@/lib/ingestTransport", () => ({
  uploadIngest: (...a: unknown[]) => uploadIngest(...a),
}));
// The status card polls the network on its own; the turn tests only need to know it mounted.
vi.mock("@/components/ingest/IngestStatusCard", () => ({
  IngestStatusCard: ({ ingestId }: { ingestId: string }) => <div data-testid="status-card">{ingestId}</div>,
}));
// The HUD arm needs the HUD to mount without its stores' network side.
vi.mock("@/components/HUD/OntologyMap", () => ({ OntologyMap: () => null }));
vi.mock("@/components/HUD/RoutingDecision", () => ({ RoutingDecision: () => null }));
vi.mock("@/components/HUD/SourcesTrail", () => ({ SourcesTrail: () => null }));
vi.mock("@/components/HUD/DecisionPathDiagram", () => ({ DecisionPathDiagram: () => null }));
vi.mock("@/components/HUD/GraphTrace", () => ({ GraphTrace: () => null }));
vi.mock("@/components/HUD/UnreadFields", () => ({ UnreadFields: () => null }));
vi.mock("@/components/HUD/TaskContextCard", () => ({ TaskContextCard: () => null }));
vi.mock("@/components/Compilation/CompileButton", () => ({ CompileButton: () => null }));

import { InputBar } from "./InputBar";
import { IngestTurns } from "@/components/ingest/IngestTurns";
import { HUD } from "@/components/HUD/HUD";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import { INGEST_ACCEPT } from "@/lib/ingestAccept";

const pdf = () => new File(["%PDF-1.4\n"], "PCN26-117.pdf", { type: "application/pdf" });

const EVENT_FACTORY = {
  dragenter: "dragEnter",
  dragover: "dragOver",
  dragleave: "dragLeave",
  drop: "drop",
} as const;

/** A drag event carrying `types` (and optionally files), the way a browser builds one. */
function dragEvent(
  type: keyof typeof EVENT_FACTORY,
  target: Element,
  opts: { files?: File[]; types?: string[]; relatedTarget?: Element | null } = {},
) {
  const files = opts.files ?? [];
  const types = opts.types ?? (files.length ? ["Files"] : ["text/plain"]);
  return createEvent[EVENT_FACTORY[type]](target, {
    dataTransfer: { types, files },
    relatedTarget: opts.relatedTarget ?? null,
  });
}

const composer = () => document.querySelector("[data-ingest-composer]") as HTMLElement;
const overlay = () => document.querySelector("[data-ingest-drag-overlay]");

beforeEach(() => {
  sendMessage.mockReset();
  uploadIngest.mockReset();
  useIngestComposerStore.setState({ file: null, kind: null, turns: [] });
});
afterEach(cleanup);

describe("window drag surface", () => {
  it("shows the overlay on a Files dragenter anywhere, and hides it on leave", () => {
    render(<InputBar />);
    expect(overlay()).toBeNull();
    act(() => {
      fireEvent(document.body, dragEvent("dragenter", document.body, { files: [pdf()] }));
    });
    expect(overlay()).not.toBeNull();
    expect(overlay()!.textContent).toMatch(/Drop to ingest/);
    act(() => {
      fireEvent(document.body, dragEvent("dragleave", document.body, { files: [pdf()] }));
    });
    expect(overlay()).toBeNull();
  });

  it("does not flicker between children (enter child before leave parent)", () => {
    render(<InputBar />);
    const child = composer();
    act(() => {
      fireEvent(document.body, dragEvent("dragenter", document.body, { files: [pdf()] }));
      fireEvent(child, dragEvent("dragenter", child, { files: [pdf()] }));
      fireEvent(
        document.body,
        dragEvent("dragleave", document.body, { files: [pdf()], relatedTarget: child }),
      );
    });
    expect(overlay()).not.toBeNull();
  });

  it("shows nothing for a text/plain (canvas chip) drag", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(document.body, dragEvent("dragenter", document.body, { types: ["text/plain"] }));
    });
    expect(overlay()).toBeNull();
  });

  it("a drop that misses the composer lands the chip, is cancelled, and hides the overlay", () => {
    render(<InputBar />);
    const f = pdf();
    act(() => {
      fireEvent(document.body, dragEvent("dragenter", document.body, { files: [f] }));
    });
    const drop = dragEvent("drop", document.body, { files: [f] });
    act(() => {
      fireEvent(document.body, drop);
    });
    expect(drop.defaultPrevented).toBe(true);
    expect(overlay()).toBeNull();
    expect(document.querySelector("[data-ingest-chip-name]")?.textContent).toBe("PCN26-117.pdf");
  });
});

describe("the composer as drop target", () => {
  it("enlarges on Files dragover (data-drag-active) and returns on dragleave", () => {
    render(<InputBar />);
    expect(composer().getAttribute("data-drag-active")).toBe("false");
    act(() => {
      fireEvent(composer(), dragEvent("dragover", composer(), { files: [pdf()] }));
    });
    expect(composer().getAttribute("data-drag-active")).toBe("true");
    expect(composer().className).toMatch(/min-h-\[9rem\]/);
    act(() => {
      fireEvent(composer(), dragEvent("dragleave", composer(), { files: [pdf()] }));
    });
    expect(composer().getAttribute("data-drag-active")).toBe("false");
  });

  it("does not enlarge for a text/plain drag", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(composer(), dragEvent("dragover", composer(), { types: ["text/plain"] }));
    });
    expect(composer().getAttribute("data-drag-active")).toBe("false");
  });

  it("every drag handler cancels AND stops the event (P0 guarantee)", () => {
    render(<InputBar />);
    for (const t of ["dragenter", "dragover", "dragleave", "drop"] as const) {
      const ev = dragEvent(t, composer(), { files: [pdf()] });
      const stop = vi.spyOn(ev, "stopPropagation");
      act(() => {
        fireEvent(composer(), ev);
      });
      // dragleave is not a cancelable event in any browser (nor in DOM testing): stop only.
      if (t !== "dragleave") expect(ev.defaultPrevented, `${t} must be cancelled`).toBe(true);
      expect(stop, `${t} must stop propagation`).toHaveBeenCalled();
    }
  });

  it("a drop on the composer lands a chip with the filename and the inline kind picker", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [pdf()] }));
    });
    expect(document.querySelector("[data-ingest-chip]")).not.toBeNull();
    expect(document.querySelector("[data-ingest-chip-name]")?.textContent).toBe("PCN26-117.pdf");
    expect(document.querySelector("[data-kind-picker]")).not.toBeNull();
  });

  it("the chip's remove button clears it", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [pdf()] }));
    });
    fireEvent.click(document.querySelector("[data-ingest-chip-remove]")!);
    expect(document.querySelector("[data-ingest-chip]")).toBeNull();
  });
});

describe("the paperclip", () => {
  it("is a labelled, focusable button that clicks the hidden PDF/XML input", () => {
    const { getByLabelText } = render(<InputBar />);
    const btn = getByLabelText("Attach a document") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.tabIndex).toBe(0);
    const input = document.querySelector("[data-ingest-file-input]") as HTMLInputElement;
    expect(input.accept).toBe(INGEST_ACCEPT);
    expect(input.accept).toMatch(/application\/pdf/);
    expect(input.accept).toMatch(/\.xml/);
    const spy = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a chosen file lands a chip", () => {
    render(<InputBar />);
    const input = document.querySelector("[data-ingest-file-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(document.querySelector("[data-ingest-chip-name]")?.textContent).toBe("PCN26-117.pdf");
  });
});

describe("send", () => {
  function attach(r: ReturnType<typeof render>) {
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [pdf()] }));
    });
    return r.getByRole("button", { name: "Send" }) as HTMLButtonElement;
  }

  it("is disabled until a kind is picked (no preselect)", () => {
    const r = render(<InputBar />);
    const send = attach(r);
    expect(send.disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-ingest-kind="pdf"] input')!);
    expect(send.disabled).toBe(false);
  });

  it("with chip + kind calls uploadIngest once with (file, kind, email) and starts no interview", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: "ing-1", stage: "received", duplicate: null });
    const r = render(<InputBar />);
    const send = attach(r);
    fireEvent.change(r.getByPlaceholderText(/Add a note/), { target: { value: "for the PCN review" } });
    fireEvent.click(document.querySelector('[data-ingest-kind="pdf"] input')!);
    fireEvent.click(send);
    expect(uploadIngest).toHaveBeenCalledTimes(1);
    const [file, kind, email] = uploadIngest.mock.calls[0];
    expect((file as File).name).toBe("PCN26-117.pdf");
    expect(kind).toBe("pdf");
    expect(email).toBe("steward@example.com");
    expect(sendMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(useIngestComposerStore.getState().turns[0].phase).toBe("status"));
    expect(useIngestComposerStore.getState().turns[0].text).toBe("for the PCN review");
    expect(document.querySelector("[data-ingest-chip]")).toBeNull();
  });

  it("text with no chip behaves as today: an interview question, no upload", () => {
    const r = render(<InputBar />);
    fireEvent.change(r.getByPlaceholderText(/begin interrogation/), { target: { value: "why?" } });
    fireEvent.click(r.getByRole("button", { name: "Send" }));
    expect(sendMessage).toHaveBeenCalledWith("why?");
    expect(uploadIngest).not.toHaveBeenCalled();
  });
});

describe("ingest turns in the transcript", () => {
  async function sendOne(resp: unknown) {
    if (resp instanceof Error) uploadIngest.mockRejectedValue(resp);
    else uploadIngest.mockResolvedValue(resp);
    useIngestComposerStore.getState().attach(pdf());
    useIngestComposerStore.getState().setKind("pdf");
    await useIngestComposerStore.getState().submit("steward@example.com", "note text");
  }

  it("renders a header (filename, kind, note) with the status card under it", async () => {
    await sendOne({ ingest_id: "ing-9", stage: "received", duplicate: null });
    const r = render(<IngestTurns />);
    expect(r.container.querySelector("[data-ingest-turn-file]")?.textContent).toBe("PCN26-117.pdf");
    expect(r.container.querySelector("[data-ingest-turn-kind]")?.textContent).toBe("pdf");
    expect(r.container.querySelector("[data-ingest-turn-text]")?.textContent).toBe("note text");
    expect(r.getByTestId("status-card").textContent).toBe("ing-9");
  });

  it("a duplicate response renders 'Already processed' as a result, not an error", async () => {
    await sendOne({
      ingest_id: "ing-2",
      stage: "received",
      duplicate: { of_ingest_id: "ing-1", message: "already processed on 2026-09-29 from work-instruction.pdf" },
    });
    const r = render(<IngestTurns />);
    const res = r.container.querySelector("[data-ingest-turn-result='duplicate']")!;
    expect(res.textContent).toBe("already processed on 2026-09-29 from work-instruction.pdf");
    expect(((r.container.querySelector("[data-ingest-turn]")!.textContent ?? "").match(/already processed/gi) ?? []).length).toBe(1);
    expect(res.className).not.toMatch(/rose|red|amber/);
    expect(r.container.querySelector("[data-ingest-upload-error]")).toBeNull();
  });

  it("an HTTP error detail renders verbatim in the turn", async () => {
    await sendOne(
      Object.assign(new Error("x"), {
        response: { status: 413, data: { detail: "file exceeds INGEST_MAX_BYTES (25 MB)" } },
      }),
    );
    const r = render(<IngestTurns />);
    expect(r.container.querySelector("[data-ingest-upload-error]")?.textContent).toBe(
      "file exceeds INGEST_MAX_BYTES (25 MB)",
    );
    expect(r.queryByTestId("status-card")).toBeNull();
  });
});

describe("the no-origin seal, ported", () => {
  it("the chip row has no origin/program/domain/owner input", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [pdf()] }));
    });
    for (const el of composer().querySelectorAll("input, select, textarea")) {
      const hay = [
        el.getAttribute("name"),
        el.getAttribute("placeholder"),
        el.getAttribute("aria-label"),
        el.closest("label")?.textContent,
      ].join(" ");
      expect(hay, el.outerHTML).not.toMatch(/origin|program|domain|owner/i);
    }
  });
});

describe("HUD is output only", () => {
  it("renders no ingest trigger or slide-in with the flag ON", () => {
    const { container } = render(<HUD />);
    expect(container.querySelector("[data-ingest-trigger]")).toBeNull();
    expect(container.querySelector("[data-ingest-slide-in]")).toBeNull();
  });
});
