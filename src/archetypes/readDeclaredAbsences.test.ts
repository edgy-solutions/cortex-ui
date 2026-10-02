/**
 * ADR-0055 §2's collision rule, sealed: a declared absence is a fact about ONE card's subtree,
 * never about the document. Two cards on the same page must not see each other's refusals — the
 * failure mode this exists to catch is a scoped-looking reader that actually falls back to
 * `document` the moment its own subtree comes up empty.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { readDeclaredAbsences } from "./defineArchetype";

afterEach(cleanup);

describe("readDeclaredAbsences", () => {
  it("does not see an absence attribute on an unrelated sibling container", () => {
    document.body.innerHTML = "";
    const cmContainer = document.createElement("div");
    cmContainer.innerHTML = '<div data-competing-measures><span data-spread>spread 1</span></div>';
    const sibling = document.createElement("div");
    sibling.innerHTML = "<div data-refused>unrelated refusal</div>";
    document.body.appendChild(cmContainer);
    document.body.appendChild(sibling);

    const absences = ["data-refused", "data-spread"] as const;
    const scoped = readDeclaredAbsences(cmContainer, absences);
    expect(scoped).not.toContain("data-refused");
    expect(scoped).toContain("data-spread");

    // Control: the same read against document.body DOES see the sibling's attribute — proving
    // the scoping, not an accident of the selector, is what kept it out above.
    const wholeDocument = readDeclaredAbsences(document.body, absences);
    expect(wholeDocument).toContain("data-refused");

    document.body.innerHTML = "";
  });

  it("sees an absence attribute on the root element itself, not only its descendants", () => {
    document.body.innerHTML = "";
    const root = document.createElement("div");
    root.setAttribute("data-refused", "");
    document.body.appendChild(root);

    expect(readDeclaredAbsences(root, ["data-refused"])).toContain("data-refused");

    document.body.innerHTML = "";
  });
});
