import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExportFailureLine, classifyExportError } from "./ExportProfilePicker";
import { SignInRequiredError } from "@/auth/authGate";

describe("a SignInRequiredError reads as a plain sign-in line, not a refusal", () => {
  it("draws the sign-in line", () => {
    render(<ExportFailureLine failure={classifyExportError(new SignInRequiredError(401))} />);
    expect(screen.getByRole("status").textContent).toBe("Your sign-in expired — signing you in again.");
    expect(screen.queryByText(/Refused/)).toBeNull();
  });
});
