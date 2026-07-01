import { describe, it, expect } from "vitest";
import {
  resolveHiringReportRoleLabel,
  targetRoleImpliesLeadership,
} from "@/lib/hiringReportRoleLabel";

describe("hiringReportRoleLabel", () => {
  it("CSR is not a leadership target role", () => {
    expect(targetRoleImpliesLeadership("Customer Service Representative")).toBe(false);
  });

  it("manager roles imply leadership", () => {
    expect(targetRoleImpliesLeadership("Operations Manager")).toBe(true);
  });

  it("uses Candidate label for CSR even when backend says Supervisor", () => {
    expect(
      resolveHiringReportRoleLabel("Supervisor", "Customer Service Representative"),
    ).toBe("Candidate");
  });

  it("keeps backend label for leadership targets", () => {
    expect(resolveHiringReportRoleLabel("Director", "Director of Operations")).toBe("Director");
  });
});
