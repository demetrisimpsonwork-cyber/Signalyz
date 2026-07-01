import { describe, it, expect } from "vitest";
import {
  buildCoverLetterAddressee,
  isValidPersonName,
  inferCompanyNameFromJd,
} from "@/lib/coverLetterSalutation";

const GRAYBAR_JD_SNIPPET = `As a Customer Service Representative, you will serve as a key contact and liaison for customers to ensure their total satisfaction.

At Graybar, we are known for our comprehensive benefits.`;

describe("coverLetterSalutation", () => {
  it("rejects JD boilerplate like 'and liaison' as a person name", () => {
    expect(isValidPersonName("and liaison")).toBe(false);
    expect(isValidPersonName("key contact")).toBe(false);
  });

  it("accepts a real hiring manager name", () => {
    expect(isValidPersonName("Jane Smith")).toBe(true);
  });

  it("does not emit 'Dear and liaison,' for Graybar CSR JD", () => {
    const { salutation, addresseeLine } = buildCoverLetterAddressee(GRAYBAR_JD_SNIPPET);
    expect(salutation).not.toContain("liaison");
    expect(salutation).toBe("Dear Graybar Hiring Team,");
    expect(addresseeLine).toBe("Hiring Team, Graybar");
  });

  it("falls back to Dear Hiring Team when no company is detected", () => {
    const { salutation } = buildCoverLetterAddressee(
      "Customer service role. Handle inbound calls professionally.",
    );
    expect(salutation).toBe("Dear Hiring Team,");
  });

  it("extracts Graybar as the company name", () => {
    expect(inferCompanyNameFromJd(GRAYBAR_JD_SNIPPET)).toBe("Graybar");
  });
});
