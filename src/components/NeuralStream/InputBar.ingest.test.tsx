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
  // Never answers: the entry tests only need the rail entry and its opened body, not a status.
  fetchIngestStatus: () => new Promise(() => {}),
}));
// The status card polls the network on its own; the turn tests only need to know it mounted.
vi.mock("@/components/ingest/IngestStatusCard", () => ({
  IngestStatusCard: ({ ingestId, onBehalfOf }: { ingestId: string; onBehalfOf?: string | null }) => (
    <div data-testid="status-card" data-on-behalf-of={onBehalfOf ?? ""}>{ingestId}</div>
  ),
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
import { IngestEntryBody } from "@/components/ingest/IngestEntryBody";
import { useIngestArtifactSync } from "@/lib/useIngestArtifactSync";
import { ingestComponentFrom } from "@/lib/ingestArtifact";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { HUD } from "@/components/HUD/HUD";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import { INGEST_ACCEPT } from "@/lib/ingestAccept";
import { DRAG_IDLE_MS } from "@/lib/fileDropGuard";
import { usePersonaStore } from "@/store/usePersonaStore";
import { NO_DROP_IDENTITY } from "@/lib/dropIdentity";
import type { Entitlements } from "@/api/types";
import type { IngestComponent } from "@/lib/ingestArtifact";

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
  useIngestComposerStore.setState({ file: null, kind: null, inferred: null, turns: [] });
  usePersonaStore.setState({ entitlements: null });
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

  it("a drop on the composer lands a chip with the filename; a PDF shows its detected kind, no picker", async () => {
    render(<InputBar />);
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [pdf()] }));
    });
    expect(document.querySelector("[data-ingest-chip]")).not.toBeNull();
    expect(document.querySelector("[data-ingest-chip-name]")?.textContent).toBe("PCN26-117.pdf");
    await waitFor(() => expect(document.querySelector("[data-ingest-kind-inferred]")).not.toBeNull());
    expect(document.querySelector("[data-ingest-kind-inferred]")?.getAttribute("data-ingest-kind-inferred")).toBe("pdf");
    expect(document.querySelector("[data-ingest-kind-inferred]")?.textContent).toMatch(/pdf · detected/i);
    expect(document.querySelector("[data-ingest-kind]")).toBeNull();
    expect(document.querySelector("[data-kind-picker]")).toBeNull();
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

  it("accepts the whole table: pdf, xml and the cad set", () => {
    render(<InputBar />);
    const accept = (document.querySelector("[data-ingest-file-input]") as HTMLInputElement).accept;
    for (const e of [".pdf", ".xml", ".step", ".stp", ".dwg", ".dxf", ".igs", ".iges", ".stl"]) expect(accept).toContain(e);
  });
});

describe("send", () => {
  /** Drop a file and wait for the kind inference to settle (the chip shows a kind or a picker). */
  async function attach(r: ReturnType<typeof render>, file: File = pdf()) {
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [file] }));
    });
    await waitFor(() => expect(useIngestComposerStore.getState().inferred).not.toBeNull());
    return r.getByRole("button", { name: "Send" }) as HTMLButtonElement;
  }

  it("a real-looking PDF shows no kind picker and Send is enabled at once", async () => {
    const r = render(<InputBar />);
    const send = await attach(r);
    expect(document.querySelector("[data-ingest-kind]")).toBeNull();
    expect(document.querySelector("[data-ingest-kind-reason]")).toBeNull();
    expect(document.querySelector('[data-ingest-kind-inferred="pdf"]')).not.toBeNull();
    expect(send.disabled).toBe(false);
  });

  it("a .pdf whose bytes are <?xml ASKS: reason shown, xml hinted but NOT selected, no kind in the store, Send disabled", async () => {
    const r = render(<InputBar />);
    await attach(r, new File(["<?xml version=\"1.0\"?><a/>"], "mislabelled.pdf"));
    expect(document.querySelector("[data-ingest-kind-inferred]")).toBeNull();
    expect(document.querySelector("[data-ingest-kind-reason]")?.textContent).toMatch(/.pdf.*xml/);
    expect(document.querySelectorAll("[data-ingest-kind] input:checked").length).toBe(0);
    expect(document.querySelector('[data-ingest-kind="xml"] [data-ingest-kind-sniffed]')).not.toBeNull();
    expect(document.querySelectorAll("[data-ingest-kind-sniffed]").length).toBe(1);
    expect(useIngestComposerStore.getState().kind).toBeNull();
    expect((r.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    // xml is accepted (lifted 2026-10-17): picking it is the person's choice, never a pre-selection.
    expect((document.querySelector('[data-ingest-kind="xml"] input') as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(document.querySelector('[data-ingest-kind="xml"] input')!);
    expect(useIngestComposerStore.getState().kind).toBe("xml");
    expect((r.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(document.querySelector('[data-ingest-kind="pdf"] input')!);
    expect(useIngestComposerStore.getState().kind).toBe("pdf");
    expect((r.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("an ambiguous file with nothing to pre-select keeps Send disabled until a kind is picked", async () => {
    const r = render(<InputBar />);
    const send = await attach(r, new File(["plain text"], "notes.bin"));
    expect(document.querySelector("[data-ingest-kind-reason]")).not.toBeNull();
    expect(document.querySelectorAll("[data-ingest-kind] input:checked").length).toBe(0);
    expect(send.disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-ingest-kind="pdf"] input')!);
    expect(send.disabled).toBe(false);
  });

  it("with chip + kind calls uploadIngest once with (file, kind, email, content_kind) and starts no interview", async () => {
    uploadIngest.mockResolvedValue({ ingest_id: "ing-1", stage: "received", duplicate: null });
    const r = render(<InputBar />);
    const send = await attach(r);
    fireEvent.change(r.getByPlaceholderText(/Add a note/), { target: { value: "for the PCN review" } });
    fireEvent.click(send);
    expect(uploadIngest).toHaveBeenCalledTimes(1);
    const [file, kind, email, contentKind] = uploadIngest.mock.calls[0];
    expect((file as File).name).toBe("PCN26-117.pdf");
    expect(kind).toBe("pdf");
    expect(email).toBe("steward@example.com");
    expect(contentKind, "a dropped .pdf must post content_kind=pdf").toBe("pdf");
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

/** The rail's drop entries, opened: sync hook + entry body (the status card is mocked above). */
function Entries() {
  useIngestArtifactSync();
  const artifacts = useCanvasStore((s) => s.artifacts);
  return (
    <>
      {artifacts.map((a) => {
        const c = ingestComponentFrom(a);
        return c ? <IngestEntryBody key={a.id} ingest={c} /> : null;
      })}
    </>
  );
}

describe("ingest turns as rail entries", () => {
  afterEach(() => {
    useIngestStatusStore.getState().reset();
    useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  });

  async function sendOne(resp: unknown) {
    if (resp instanceof Error) uploadIngest.mockRejectedValue(resp);
    else uploadIngest.mockResolvedValue(resp);
    useIngestComposerStore.getState().attach(pdf());
    useIngestComposerStore.getState().setKind("pdf");
    await useIngestComposerStore.getState().submit("steward@example.com", "note text");
  }

  it("renders a header (filename, kind, note) with the status card under it", async () => {
    await sendOne({ ingest_id: "ing-9", stage: "received", duplicate: null });
    const r = render(<Entries />);
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
    const r = render(<Entries />);
    const res = r.container.querySelector("[data-ingest-turn-result='duplicate']")!;
    expect(res.textContent).toBe("already processed on 2026-09-29 from work-instruction.pdf");
    expect(((r.container.querySelector("[data-ingest-entry]")!.textContent ?? "").match(/already processed/gi) ?? []).length).toBe(1);
    expect(res.className).not.toMatch(/rose|red|amber/);
    expect(r.container.querySelector("[data-ingest-upload-error]")).toBeNull();
  });

  it("a 4xx detail renders verbatim in the turn, as a refusal (not the rose upload error)", async () => {
    await sendOne(
      Object.assign(new Error("x"), {
        response: { status: 413, data: { detail: "file exceeds INGEST_MAX_BYTES (25 MB)" } },
      }),
    );
    const r = render(<Entries />);
    expect(r.container.querySelector("[data-ingest-refusal]")?.textContent).toBe(
      "file exceeds INGEST_MAX_BYTES (25 MB)",
    );
    expect(r.container.querySelector("[data-ingest-upload-error]")).toBeNull();
    expect(r.queryByTestId("status-card")).toBeNull();
  });

  it("a 5xx detail stays an upload error, verbatim", async () => {
    await sendOne(Object.assign(new Error("x"), { response: { status: 500, data: { detail: "boom" } } }));
    const r = render(<Entries />);
    expect(r.container.querySelector("[data-ingest-upload-error]")?.textContent).toBe("boom");
    expect(r.container.querySelector("[data-ingest-refusal]")).toBeNull();
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

describe("a drag can never leave the composer or overlay stuck open", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const active = () => composer().getAttribute("data-drag-active");
  const enter = () =>
    act(() => {
      fireEvent(composer(), dragEvent("dragenter", composer(), { files: [pdf()] }));
    });

  it("clears by itself once dragovers stop (the stuck case)", () => {
    render(<InputBar />);
    enter();
    expect(active()).toBe("true");
    act(() => {
      vi.advanceTimersByTime(DRAG_IDLE_MS + 1);
    });
    expect(active()).toBe("false");
  });

  it("stays active while dragover keeps arriving every 50 ms for 2 s", () => {
    render(<InputBar />);
    enter();
    for (let t = 0; t < 2000; t += 50) {
      act(() => {
        vi.advanceTimersByTime(50);
      });
      // Checked BEFORE the next dragover: a dragover that re-sets the flag but not the timer
      // would otherwise flap off between events and be masked by the re-set.
      expect(active(), "before dragover at " + t + "ms").toBe("true");
      act(() => {
        fireEvent(composer(), dragEvent("dragover", composer(), { files: [pdf()] }));
      });
      expect(active(), "at " + t + "ms").toBe("true");
    }
  });

  it.each([
    ["a window drop elsewhere", () => dragEvent("drop", document.body, { files: [pdf()] })],
    ["a window dragend", () => createEvent.dragEnd(document.body)],
    ["a window dragleave with relatedTarget null", () => dragEvent("dragleave", document.body, { files: [pdf()] })],
  ])("clears immediately on %s", (_n, make) => {
    render(<InputBar />);
    enter();
    expect(active()).toBe("true");
    act(() => {
      fireEvent(document.body, make());
    });
    expect(active()).toBe("false");
  });

  it("never activates for a text/plain drag, even with time passing", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(composer(), dragEvent("dragenter", composer(), { types: ["text/plain"] }));
      vi.advanceTimersByTime(DRAG_IDLE_MS + 1);
    });
    expect(active()).toBe("false");
  });

  it("the window overlay hides by itself once drag events stop", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(document.body, dragEvent("dragenter", document.body, { files: [pdf()] }));
    });
    expect(overlay()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(DRAG_IDLE_MS + 1);
    });
    expect(overlay()).toBeNull();
  });

  it("the window overlay stays up while dragover keeps arriving", () => {
    render(<InputBar />);
    act(() => {
      fireEvent(document.body, dragEvent("dragenter", document.body, { files: [pdf()] }));
    });
    for (let t = 0; t < 2000; t += 50) {
      act(() => {
        vi.advanceTimersByTime(50);
        fireEvent(document.body, dragEvent("dragover", document.body, { files: [pdf()] }));
      });
      expect(overlay(), "at " + t + "ms").not.toBeNull();
    }
  });
});

/**
 * Lane 1, 2026-10-21: at work every drop was refused `not_a_delegate`. The gateway reads an
 * `on_behalf_of` that is not the caller's `authz_id` as a delegation, and the UI sent the OIDC
 * email, which equals `authz_id` only while USER_ENTITLEMENT_CLAIM is "email". Every fixture
 * above has them equal-by-construction (no entitlements, so the email), which passes with either
 * value — these arms make them DIFFER.
 */
describe("the drop identity is authz_id, not the email (not_a_delegate at work)", () => {
  const ENT = (extra: Partial<Entitlements>): Entitlements =>
    ({ user_id: "sub-e12345", email: "steward@example.com", cells: [], default: null, source: "topaz", ...extra }) as Entitlements;

  async function attachPdf(r: ReturnType<typeof render>) {
    act(() => {
      fireEvent(composer(), dragEvent("drop", composer(), { files: [pdf()] }));
    });
    await waitFor(() => expect(useIngestComposerStore.getState().inferred).not.toBeNull());
    return r.getByRole("button", { name: "Send" }) as HTMLButtonElement;
  }

  it("the upload's on_behalf_of is /me/entitlements' authz_id when it differs from the token's email", async () => {
    usePersonaStore.setState({ entitlements: ENT({ authz_id: "E12345" }) });
    uploadIngest.mockResolvedValue({ ingest_id: "ing-w", stage: "received", duplicate: null });
    const r = render(<InputBar />);
    const send = await attachPdf(r);
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(uploadIngest).toHaveBeenCalledTimes(1);
    expect(uploadIngest.mock.calls[0][2], "on_behalf_of must be authz_id, never the email").toBe("E12345");
    await waitFor(() => expect(useIngestComposerStore.getState().turns[0].phase).toBe("status"));
  });

  it("the dispute route gets the same authz_id, threaded from the entry body", () => {
    usePersonaStore.setState({ entitlements: ENT({ authz_id: "E12345" }) });
    const ingest = {
      ingest_id: "ing-w", filename: "PCN26-117.pdf", kind: "pdf", note: null, badge: "received", duplicate_of: null,
      error: null, reason: null, duplicate_message: null,
    } as unknown as IngestComponent;
    const r = render(<IngestEntryBody ingest={ingest} />);
    expect(r.getByTestId("status-card").getAttribute("data-on-behalf-of")).toBe("E12345");
  });

  it("a BFF older than 7a98f7bd (no authz_id key) falls back to the email: today's behaviour", async () => {
    usePersonaStore.setState({ entitlements: ENT({}) });
    uploadIngest.mockResolvedValue({ ingest_id: "ing-s", stage: "received", duplicate: null });
    const r = render(<InputBar />);
    fireEvent.click(await attachPdf(r));
    expect(uploadIngest.mock.calls[0][2]).toBe("steward@example.com");
    await waitFor(() => expect(useIngestComposerStore.getState().turns[0].phase).toBe("status"));
  });

  it("a blank authz_id disables the upload with its reason, even though an email is present", async () => {
    usePersonaStore.setState({ entitlements: ENT({ authz_id: "  " }) });
    const r = render(<InputBar />);
    const send = await attachPdf(r);
    expect(send.disabled).toBe(true);
    expect(document.querySelector("[data-ingest-kind-blocked]")?.textContent).toBe(NO_DROP_IDENTITY);
    fireEvent.click(send);
    expect(uploadIngest).not.toHaveBeenCalled();
  });
});
