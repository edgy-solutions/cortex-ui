/**
 * P0 2026-10-08 — what `uploadIngest` hands the ADAPTER, through the REAL axios pipeline.
 *
 * `uploadIngest.test.ts` mocks `api.post` wholesale, so it saw the FormData `uploadIngest` built
 * and never what axios did to it next. What axios did: the instance's default
 * `Content-Type: application/json` sent the FormData through `JSON.stringify(formDataToJSON(...))`
 * in `transformRequest`, and the File went out as `{}`. Every upload from the UI carried no file,
 * and that test stayed green throughout.
 *
 * Here the real `axios.create` and the real `transformRequest` run; only the adapter (the network)
 * is swapped for a capture. The adapter receives `config.data` AFTER transformRequest, so this is
 * the body a browser adapter would have sent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen } = vi.hoisted(() => ({ seen: [] as InternalAxiosRequestConfig[] }));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data: { ingest_id: "sha256:abc" }, status: 201, statusText: "Created", headers: {}, config };
  };
  // A wrapper object, not a mutation of `real`: only `create` differs, everything else is axios.
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = capture;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});

import { uploadIngest } from "./client";

beforeEach(() => {
  seen.length = 0;
});

describe("uploadIngest — the body that reaches the adapter", () => {
  it("is still a FormData, carrying the File itself (not its JSON `{}`)", async () => {
    const file = new File(["%PDF-1.4\n"], "PCN26-117.pdf", { type: "application/pdf" });
    await uploadIngest(file, "pdf", "alice@example.com");

    expect(seen).toHaveLength(1);
    const body = seen[0].data;
    expect(typeof body, "transformRequest stringified the FormData — the File was sent as {}").not.toBe("string");
    expect(body).toBeInstanceOf(FormData);
    const sent = (body as FormData).get("file");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("PCN26-117.pdf");
    expect((body as FormData).get("kind")).toBe("pdf");
    expect((body as FormData).get("on_behalf_of")).toBe("alice@example.com");
  });

  it("does not leave the instance's application/json on the request", async () => {
    await uploadIngest(new File(["x"], "a.xml", { type: "application/xml" }), "xml", "alice@example.com");
    const ct = String(seen[0].headers.get("Content-Type") ?? "");
    expect(ct).not.toMatch(/application\/json/);
  });
});
