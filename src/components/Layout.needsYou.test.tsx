/**
 * The header carries "Needs you" BESIDE Tasks (architect 10-22: "a needs-you count next to TASKS in the
 * header, the same way tasks are counted"). The badge's own tests prove what it counts; this proves it
 * is mounted where a person looks, which no badge test can see.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Layout mounts UserMenu, which needs an OIDC context (as in presentationMode.test.tsx).
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { profile: { name: "tester", preferred_username: "tester" } },
    signoutRedirect: () => {},
    removeUser: () => {},
  }),
}));
import { render, cleanup, screen } from "@testing-library/react";
import { Layout } from "./Layout";
import { useCanvasStore } from "@/store/useCanvasStore";
import { ingestToArtifact, type IngestEntry } from "@/lib/ingestArtifact";
import { readIngestStatusRow } from "@/lib/ingestWire";

const T = 1790860800000;
const ID = `sha256:${"ab".padEnd(64, "0")}`;
const waiting = () => {
  const row = readIngestStatusRow({
    ingest_id: ID, sha256: ID.slice(7), kind: "pdf", stage: "awaiting_kind", detail: null, duplicate: null,
    created_at: T, updated_at: T, origin: null, case_id: null,
  })!;
  const e: IngestEntry = {
    key: ID, filename: "ti.pdf", kind: "pdf", droppedAt: T, phase: "status", ingestId: ID, error: null,
    acceptedThisSession: true, duplicate: null, note: null, notFound: false, row,
  };
  return ingestToArtifact(e);
};

beforeEach(() => {
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null } as never);
});
afterEach(cleanup);

describe("the header's Needs you control", () => {
  it("sits immediately after Tasks and counts a drop at awaiting_kind", () => {
    useCanvasStore.setState({ artifacts: [waiting()] } as never);
    render(<Layout stream={<div>STREAM</div>} canvas={<div>CANVAS</div>} hud={<div>HUD</div>} />);
    const tasks = screen.getByText("Tasks").closest("button")!;
    const next = tasks.nextElementSibling as HTMLElement | null;
    expect(next?.getAttribute("data-needs-you-count")).toBe("1");
    expect(next?.textContent).toContain("Needs you");
  });
});
