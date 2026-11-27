/**
 * No card shows the old "Refused (401)" wording (ruled 2026-11-26). The rendered and stateful sites; the pure ones sit
 * in `signInWording.pure.test.ts`. Every site has a 401 arm (the SignInRequiredError the interceptor rejects with, or
 * an axios 401) that shows the sentence, and a 403 / other arm that still shows the old line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import { SignInRequiredError } from "./authGate";

const SENTENCE = "Your sign-in expired — signing you in again.";
const signIn = () => new SignInRequiredError(401);
const http = (status: number, detail: unknown = "x") => ({ isAxiosError: true, response: { status, data: { detail } } });

const { c, t } = vi.hoisted(() => ({
  c: {
    actOnHumanTask: vi.fn(),
    fetchFederatedImage: vi.fn(),
    fetchDataModuleFigures: vi.fn(),
    fetchGraphNode: vi.fn(),
    fetchBffVersion: vi.fn(),
    fetchIllustrationContent: vi.fn(),
    fetchAskableMeasures: vi.fn(),
  },
  t: { fetchIngestSource: vi.fn(), uploadIngest: vi.fn(), fetchIngestStatus: vi.fn(), retryIngest: vi.fn(), fetchReviewShapes: vi.fn() },
}));
vi.mock("@/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/client")>()), ...c }));
vi.mock("@/lib/ingestTransport", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ingestTransport")>()), ...t }));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ isAuthenticated: true, user: { access_token: "tok" } }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { useTaskAct } from "@/components/ApprovalTask/useTaskAct";
import { TriageTaskCard } from "@/components/TriageTask/TriageTaskCard";
import { FederatedImage } from "@/components/mesh/FederatedImage";
import { InlineFigures } from "@/components/AgenticCanvas/InlineFigures";
import { FiguresSlideIn } from "@/components/HUD/FiguresSlideIn";
import { NodeInspector } from "@/components/AgenticCanvas/NodeInspector";
import { BuildStamp } from "@/components/BuildStamp";
import { AskableTrigger } from "@/components/NeuralStream/AskableMeasures";
import { useCanvasStore } from "@/store/useCanvasStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { useReviewShapes, resetReviewShapesCache } from "@/components/ApprovalTask/useReviewShapes";
import { PdfEvidencePane } from "@/components/ApprovalTask/PdfEvidencePane";
import { archetypePackage } from "@/archetypes/registry";
import { ILLUSTRATION_FIXTURES } from "@/archetypes/illustration/fixtures";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeEach(() => {
  for (const f of [...Object.values(c), ...Object.values(t)]) f.mockReset();
  toastError.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useTaskAct (toast)", () => {
  const task = { task_id: "t1", kind: "k", task_state: "pending", title: "T", summary: "", audience: "a", requested_by: "r", subject_ref: null } as never;
  const run = async (err: unknown) => {
    c.actOnHumanTask.mockRejectedValue(err);
    const { result } = renderHook(() => useTaskAct(task));
    await act(async () => {
      await result.current.act("promoted", "ok");
    });
  };
  it("a 401 toasts the sentence, never 'Action failed'", async () => {
    await run(signIn());
    expect(toastError).toHaveBeenCalledWith(SENTENCE);
  });
  it("a 403 keeps its toast", async () => {
    await run(http(403));
    expect(toastError).toHaveBeenCalledWith("Not authorized to act on this task");
  });
});

describe("TriageTaskCard (toast)", () => {
  const task = { task_id: "t1", kind: "k", title: "T", summary: "s", audience: "a", requested_by: "r", subject_ref: null, warnings: [] } as never;
  const redrive = async (err: unknown) => {
    c.actOnHumanTask.mockRejectedValue(err);
    const { container } = render(<TriageTaskCard task={task} />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) => /Re-drive/.test(b.textContent ?? ""))!;
    fireEvent.click(btn);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  };
  it("a 401 toasts the sentence", async () => {
    await redrive(signIn());
    expect(toastError).toHaveBeenCalledWith(SENTENCE);
  });
  it("a 403 keeps its toast", async () => {
    await redrive(http(403));
    expect(toastError).toHaveBeenCalledWith("Not authorized to act on this task");
  });
});

describe("FederatedImage", () => {
  const draw = async (err: unknown) => {
    c.fetchFederatedImage.mockRejectedValue(err);
    const { container } = render(<FederatedImage src="s3://b/k.png" />);
    await waitFor(() => expect(container.querySelector("span.text-xs")).not.toBeNull());
    return container.querySelector("span.text-xs")!;
  };
  it("a 401 reads as sign-in with data-signin, not 'Image Unavailable'", async () => {
    const el = await draw(signIn());
    expect(el.textContent).toBe(SENTENCE);
    expect(el.hasAttribute("data-signin")).toBe(true);
  });
  it("a 403 is still 'Not Entitled'", async () => {
    const el = await draw(http(403));
    expect(el.textContent).toBe("Not Entitled");
    expect(el.hasAttribute("data-signin")).toBe(false);
  });
});

describe("InlineFigures and FiguresSlideIn (shared status line)", () => {
  const artifact = { id: "a", sources: [{ type: "document", label: "https://x/dm/1", uri: "https://x/dm/1" }] } as never;
  const line = (r: ReturnType<typeof render>) => r.container.querySelector("p.text-rose-300");
  it("InlineFigures: a 401 is the sentence with data-signin", async () => {
    c.fetchDataModuleFigures.mockRejectedValue(signIn());
    const r = render(<InlineFigures artifact={artifact} />);
    await waitFor(() => expect(line(r)).not.toBeNull());
    expect(line(r)!.textContent).toBe(SENTENCE);
    expect(line(r)!.hasAttribute("data-signin")).toBe(true);
  });
  it("InlineFigures: a 403 keeps 'Could not load figures: 403 Forbidden'", async () => {
    c.fetchDataModuleFigures.mockRejectedValue(new Error("403 Forbidden"));
    const r = render(<InlineFigures artifact={artifact} />);
    await waitFor(() => expect(line(r)).not.toBeNull());
    expect(line(r)!.textContent).toBe("Could not load figures: 403 Forbidden");
    expect(line(r)!.hasAttribute("data-signin")).toBe(false);
  });
  it("FiguresSlideIn: a 401 is the sentence with data-signin", async () => {
    c.fetchDataModuleFigures.mockRejectedValue(signIn());
    const r = render(<FiguresSlideIn sourceUri="https://x/dm/1" onClose={() => {}} />);
    await waitFor(() => expect(line(r)).not.toBeNull());
    expect(line(r)!.textContent).toBe(SENTENCE);
    expect(line(r)!.hasAttribute("data-signin")).toBe(true);
  });
  it("FiguresSlideIn: a 403 keeps its line", async () => {
    c.fetchDataModuleFigures.mockRejectedValue(new Error("403 Forbidden"));
    const r = render(<FiguresSlideIn sourceUri="https://x/dm/1" onClose={() => {}} />);
    await waitFor(() => expect(line(r)).not.toBeNull());
    expect(line(r)!.textContent).toBe("Could not load figures: 403 Forbidden");
  });
});

describe("NodeInspector", () => {
  const open = async (err: unknown) => {
    c.fetchGraphNode.mockRejectedValue(err);
    useCanvasStore.setState({ inspectedNodeId: "n1", isInspectorOpen: true } as never);
    const { container } = render(<NodeInspector />);
    await waitFor(() => expect(container.textContent).toMatch(/error/));
    return container.textContent ?? "";
  };
  it("a 401 shows the sentence, not 'Failed to connect to backend'", async () => {
    const text = await open(signIn());
    expect(text).toContain(SENTENCE);
    expect(text).not.toContain("Failed to connect to backend");
  });
  it("any other failure keeps 'Failed to connect to backend'", async () => {
    expect(await open(new Error("boom"))).toContain("Failed to connect to backend");
  });
});

describe("BuildStamp", () => {
  const slot = async (r: unknown) => {
    c.fetchBffVersion.mockResolvedValue(r);
    render(<BuildStamp />);
    await waitFor(() => expect(document.querySelector("[data-build-stamp-bff]")?.textContent).not.toBe("bff …"));
    await waitFor(() => expect(document.querySelector("[data-build-stamp-bff]")?.textContent).toMatch(/bff (signing|\/version|unreachable)/));
    return document.querySelector("[data-build-stamp-bff]")!;
  };
  it("a 401 reads 'signing in' with data-signin, not '/version 401'", async () => {
    const el = await slot({ kind: "signin" });
    expect(el.textContent).toBe("bff signing in");
    expect(el.hasAttribute("data-signin")).toBe(true);
  });
  it("a 500 keeps '/version 500'", async () => {
    const el = await slot({ kind: "error", status: 500 });
    expect(el.textContent).toBe("bff /version 500");
    expect(el.hasAttribute("data-signin")).toBe(false);
  });
});

describe("AskableMeasures panel", () => {
  const show = async (reason: string, status: number) => {
    c.fetchAskableMeasures.mockResolvedValue({ kind: "refused", refusal: { status, code: null, reason } });
    usePersonaStore.setState({ entitlements: { user_id: "u", source: "topaz", default: null, cells: [] }, entitlementsError: null, entitlementsLoading: false } as never);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AskableTrigger sendAsk={(() => true) as never} />
      </QueryClientProvider>,
    );
    fireEvent.click(document.querySelector("[data-askable-trigger]")!);
    await waitFor(() => expect(document.querySelector('[data-askable-state="refused"]')).not.toBeNull());
    return document.querySelector('[data-askable-state="refused"]')!;
  };
  it("the sign-in refusal carries data-signin and the sentence", async () => {
    const el = await show(SENTENCE, 401);
    expect(el.textContent).toBe(SENTENCE);
    expect(el.hasAttribute("data-signin")).toBe(true);
  });
  it("a served 403 refusal carries no marker", async () => {
    const el = await show("You do not hold that persona.", 403);
    expect(el.hasAttribute("data-signin")).toBe(false);
  });
});

describe("illustration card", () => {
  const Card = archetypePackage("ILLUSTRATION")!.Card;
  const failed = async (err: unknown) => {
    c.fetchIllustrationContent.mockRejectedValue(err);
    const { container } = render(<Card illustration={ILLUSTRATION_FIXTURES[0].payload} />);
    await waitFor(() => expect(container.querySelector('[data-illustration-state="fetch-failed"]')).not.toBeNull());
    return container.querySelector('[data-illustration-state="fetch-failed"]')!;
  };
  it("a 401 shows the sentence, not 'Failed to fetch ... content'", async () => {
    const el = await failed(signIn());
    expect(el.textContent).toContain(SENTENCE);
    expect(el.textContent).not.toContain("Failed to fetch");
    expect(el.querySelector("[data-signin]")).not.toBeNull();
  });
  it("a 404 keeps the status line", async () => {
    const el = await failed({ response: { status: 404 } });
    expect(el.textContent).toMatch(/Failed to fetch .* content \(HTTP 404\)\./);
  });
});

describe("useReviewShapes", () => {
  beforeEach(() => resetReviewShapesCache());
  const why = async (err: unknown) => {
    t.fetchReviewShapes.mockRejectedValue(err);
    const { result } = renderHook(() => useReviewShapes());
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    return (result.current as { why: string }).why;
  };
  it("a 401 is the sentence, not 'could not be loaded (undefined)'", async () => {
    expect(await why(signIn())).toBe(SENTENCE);
  });
  it("a 403 keeps its status line", async () => {
    expect(await why(http(403))).toBe("The review shapes could not be loaded (403).");
  });
});

describe("ingest composer store (a failed drop)", () => {
  const send = async (err: unknown) => {
    t.uploadIngest.mockRejectedValue(err);
    useIngestComposerStore.setState({ file: new File(["%PDF-1.4\n"], "a.pdf"), kind: "pdf", leaf: "unsure", turns: [] } as never);
    await useIngestComposerStore.getState().submit("a@example.com", "");
    return useIngestComposerStore.getState().turns[0];
  };
  it("a 401 is an error turn carrying the sentence, never a refusal", async () => {
    const turn = await send(signIn());
    expect(turn.phase).toBe("error");
    expect(turn.error).toBe(SENTENCE);
    expect(turn.refusal ?? null).toBeNull();
  });
  it("an axios 401 with a readable body is still the sentence", async () => {
    expect((await send(http(401, { error: "x", message: "nope" }))).error).toBe(SENTENCE);
  });
  it("a 403 with a body is still a refused turn", async () => {
    const turn = await send(http(403, { error: "not_entitled", message: "no" }));
    expect(turn.phase).toBe("refused");
    expect(turn.error).toBe("no");
  });
});

describe("ingest status store (retry)", () => {
  const A = `sha256:${"a".repeat(64)}`;
  const wire = {
    ingest_id: A, sha256: A.slice(7), kind: "pdf", stage: "failed", detail: "d", duplicate: null,
    created_at: 1, updated_at: 1, origin: null, case_id: null, attempt: 1,
    failure: { reason_code: "kind_unregistered", reason: "r", step: null, run_id: null, pin_digest: null, failed_at: 1 },
  };
  const retry = async (err: unknown) => {
    useIngestStatusStore.getState().reset();
    t.fetchIngestStatus.mockResolvedValue(wire);
    useIngestStatusStore.getState().pollDue([A]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    t.retryIngest.mockRejectedValue(err);
    return useIngestStatusStore.getState().retry(A);
  };
  it("a 401 says the sentence, not 'Retry failed.'", async () => {
    expect(await retry(signIn())).toEqual({ ok: false, message: SENTENCE });
  });
  it("a 403 keeps its line", async () => {
    expect(await retry(http(403, { error: "x" }))).toEqual({ ok: false, message: "This drop can’t be retried from here." });
  });
});

describe("PdfEvidencePane (source fetch)", () => {
  const failed = async (err: unknown) => {
    t.fetchIngestSource.mockRejectedValue(err);
    const { container } = render(<PdfEvidencePane ingestId={"sha256:" + "a".repeat(64)} target={null} />);
    await waitFor(() => expect(container.querySelector("[data-pdf-failed]")).not.toBeNull());
    return container.querySelector("[data-pdf-failed]")!;
  };
  it("a 401 is the sentence alone with data-signin, no 'rows on the left' tail", async () => {
    const el = await failed(signIn());
    expect(el.textContent).toBe(SENTENCE);
    expect(el.hasAttribute("data-signin")).toBe(true);
  });
  it("a 403 keeps the entitlement line and its tail", async () => {
    const el = await failed(http(403, { error: "x" }));
    expect(el.textContent).toMatch(/not entitled to this task's source/);
    expect(el.textContent).toContain("The rows on the left are still the extraction to vet.");
    expect(el.hasAttribute("data-signin")).toBe(false);
  });
});
