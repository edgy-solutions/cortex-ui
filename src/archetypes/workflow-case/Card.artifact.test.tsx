/** The released artifact opens through the BFF with the bearer, captured at the real axios adapter. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, reply } = vi.hoisted(() => ({
  seen: [] as InternalAxiosRequestConfig[],
  reply: { status: 200, data: undefined as unknown },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    if (reply.status >= 400) {
      throw Object.assign(new Error(`Request failed with status code ${reply.status}`), {
        response: { status: reply.status, data: reply.data },
      });
    }
    return { data: reply.data, status: reply.status, statusText: "OK", headers: {}, config };
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = capture;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});

import { WorkflowCase } from "./Card";
import { WORKFLOW_CASE_FIXTURES } from "./fixtures";
import { config } from "@/config";

type CardProps = React.ComponentProps<typeof WorkflowCase>;
const withArtifact = (uri: string) =>
  ({
    case: { ...WORKFLOW_CASE_FIXTURES[2].payload, output_artifact: { uri, label: "Maintenance action record", released_at: "2026-10-01T00:00:00Z" } },
  }) as unknown as CardProps;

beforeEach(() => {
  seen.length = 0;
  reply.status = 200;
  reply.data = undefined;
});
afterEach(cleanup);

describe("the case artifact", () => {
  it("is a button, never an href", () => {
    const { container } = render(<WorkflowCase {...withArtifact("/cases/X/action")} />);
    expect(container.querySelector("button[data-artifact]")).not.toBeNull();
    expect(container.querySelector("[data-artifact-section] a[href]")).toBeNull();
  });

  it("a click GETs the BFF path with the bearer and renders the record in key order", async () => {
    sessionStorage.setItem(
      `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`,
      JSON.stringify({ access_token: "tok-123" }),
    );
    reply.data = { zeta: "z", alpha: 2, flag: false, nothing: null, nested: { a: [1] } };
    const { container } = render(<WorkflowCase {...withArtifact("/cases/X/action")} />);
    fireEvent.click(container.querySelector("[data-artifact]")!);
    await waitFor(() => expect(container.querySelector("[data-artifact-record]")).not.toBeNull());
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("get");
    expect(`${seen[0].baseURL ?? ""}${seen[0].url}`.endsWith("/cases/X/action")).toBe(true);
    expect(String((seen[0].headers as Record<string, unknown>).Authorization ?? (seen[0].headers as { get?: (k: string) => unknown }).get?.("Authorization"))).toBe("Bearer tok-123");
    const rows = [...container.querySelectorAll("[data-artifact-record] > div")].map((r) => r.textContent);
    expect(rows).toEqual(["zetaz", "alpha2", "flagfalse", "nothingnull", 'nested{"a":[1]}']);
    fireEvent.click(container.querySelector("[data-artifact]")!);
    expect(container.querySelector("[data-artifact-record]")).toBeNull();
  });

  it("a 503 names the status and the refusal code", async () => {
    reply.status = 503;
    reply.data = { detail: { error: "artifact_store_unavailable" } };
    const { container } = render(<WorkflowCase {...withArtifact("/cases/X/action")} />);
    fireEvent.click(container.querySelector("[data-artifact]")!);
    await waitFor(() => expect(container.querySelector("[data-artifact-error]")).not.toBeNull());
    expect(container.querySelector("[data-artifact-error]")!.textContent).toBe(
      "could not open the record: 503 artifact_store_unavailable",
    );
  });

  it("an absolute uri never reaches the adapter and renders the refusal", async () => {
    const { container } = render(<WorkflowCase {...withArtifact("https://evil.example/x")} />);
    fireEvent.click(container.querySelector("[data-artifact]")!);
    await waitFor(() => expect(container.querySelector("[data-artifact-error]")).not.toBeNull());
    expect(container.querySelector("[data-artifact-error]")!.textContent).toBe("the artifact link is not a gateway path");
    expect(seen).toHaveLength(0);
  });
});
