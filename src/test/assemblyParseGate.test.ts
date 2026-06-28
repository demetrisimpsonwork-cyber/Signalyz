import { describe, it, expect } from "vitest";
import { evaluateAssemblyParseGate } from "@/lib/resumeIntake";

const VALID_RESUME = `John Smith
john@example.com | 555-123-4567

EXPERIENCE
Operations Manager | Acme Logistics Inc | 2020 - 2023
- Managed daily warehouse operations across three regional shifts.
- Reduced shipping errors by tracking fulfillment metrics every week.
- Coordinated vendor deliveries and inbound inventory counts.

Warehouse Associate | Beta Supply Co | 2017 - 2020
- Processed inbound shipments and verified packing slips.
- Maintained accurate stock records in the inventory system.
`;

describe("evaluateAssemblyParseGate", () => {
  it("blocks empty input", () => {
    const gate = evaluateAssemblyParseGate("");
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe("too_short");
  });

  it("blocks very short input", () => {
    const gate = evaluateAssemblyParseGate("Hi there, thanks!");
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe("too_short");
  });

  it("allows a well-formed resume with detectable experience", () => {
    const gate = evaluateAssemblyParseGate(VALID_RESUME);
    expect(gate.blocked).toBe(false);
  });

  it("returns a user-facing message when blocked", () => {
    const gate = evaluateAssemblyParseGate("");
    expect(gate.detail).toBeTruthy();
    expect(typeof gate.detail).toBe("string");
  });
});
