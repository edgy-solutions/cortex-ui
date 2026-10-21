import { describe, it, expect } from "vitest";
import { dropIdentity } from "./dropIdentity";
import type { Entitlements } from "@/api/types";

const ENT = (extra: Record<string, unknown>): Entitlements =>
  ({ user_id: "sub-1", email: "a@example.com", cells: [], default: null, source: "topaz", ...extra }) as Entitlements;

// One row per branch, near side included: every row where the answer is the email is a row the
// broken behaviour (always the email) also passes, so the authz_id rows carry the proof.
describe("dropIdentity", () => {
  it.each([
    ["authz_id present and different from the email → authz_id", ENT({ authz_id: "E12345" }), "a@example.com", "E12345"],
    ["authz_id present, no email at all → authz_id", ENT({ authz_id: "E12345" }), null, "E12345"],
    ["authz_id equal to the email (the sandbox) → that value", ENT({ authz_id: "a@example.com" }), "a@example.com", "a@example.com"],
    ["authz_id blank → null, NOT the email", ENT({ authz_id: "   " }), "a@example.com", null],
    ["authz_id empty → null, NOT the email", ENT({ authz_id: "" }), "a@example.com", null],
    ["authz_id null → null, NOT the email", ENT({ authz_id: null }), "a@example.com", null],
    ["authz_id not a string → null, NOT the email", ENT({ authz_id: 12345 }), "a@example.com", null],
    ["no authz_id key (BFF older than 7a98f7bd) → the email", ENT({}), "a@example.com", "a@example.com"],
    ["no authz_id key and no email → null", ENT({}), null, null],
    ["entitlements not loaded → the email", null, "a@example.com", "a@example.com"],
    ["entitlements not loaded, empty email → null", null, "", null],
    ["entitlements not loaded, no email → null", null, undefined, null],
  ] as const)("%s", (_label, ent, email, expected) => {
    expect(dropIdentity(ent, email)).toBe(expected);
  });
});
