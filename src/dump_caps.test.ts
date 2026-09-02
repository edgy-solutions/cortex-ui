import { test } from "vitest";
import { assembleDerivedCapabilities } from "@/registry/assembleCapabilities";
import { CORTEX_UI_FRONTEND_ID, CORTEX_UI_CAPABILITIES } from "@/registry/frontendCapabilities";
import fs from "node:fs";

test("dump", () => {
  const derived = assembleDerivedCapabilities();
  const legacy = (CORTEX_UI_CAPABILITIES ?? []) as any[];
  const covered = new Set(derived.map((c: any) => c.subject_uri));
  const caps = [...derived, ...legacy.filter((c: any) => !covered.has(c.subject_uri))];
  fs.writeFileSync("caps_dump.json", JSON.stringify({
    frontend_id: CORTEX_UI_FRONTEND_ID, frontend_version: "headless-dump", capabilities: caps
  }, null, 1));
  const fin = caps.filter((c: any) => String(c.subject_uri).startsWith("fin:"));
  console.log("TOTAL", caps.length, "FIN", fin.length,
    fin.map((c: any) => `${c.subject_uri}->${c.archetype}`).join(" | "));
});
