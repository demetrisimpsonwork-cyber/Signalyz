import { describe, it, expect } from "vitest";
import { evaluateCredentialGate, isCredentialMismatch } from "@/lib/credentialGate";

const LIVEOPS_JD = `Customer Service Agent – Independent Contractor
Requirements:
- At least 1 year of phone-based customer support experience
- Complete an application and pass a background check
- Complete program-specific certifications
Liveops is currently accepting applications in the following states: AL, AK, AZ, DC, DE, FL, GA, IA, ID, IN, KS, KY, MD, ME, MI, MO, MS, MT, NC, ND, NE, NM, NV, OH, OK, PA, RI, SC, SD, TN, TX, UT, VA, WV, WY
Onboarding`;

const DEMETRI_RESUME = `Demetri Simpson
Operations & Customer Experience Leader
- Managed customer support operations and remote team workflows
- Led onboarding programs and training for support staff
Bachelor of Science in Business Administration`;

describe("credentialGate", () => {
  it("does not block LiveOps CSR JD against a customer-experience resume (MD state list false positive)", () => {
    const result = evaluateCredentialGate(DEMETRI_RESUME, LIVEOPS_JD);
    expect(result.blocked).toBe(false);
    expect(isCredentialMismatch(DEMETRI_RESUME, LIVEOPS_JD)).toBe(false);
  });

  it("does not treat onboarding / background-check lines as credentials", () => {
    const jd = `Requirements:
- Complete an application and pass a background check
- Complete program-specific certifications
- Onboarding training required after hire`;
    const result = evaluateCredentialGate(DEMETRI_RESUME, jd);
    expect(result.blocked).toBe(false);
  });

  it("does not match bare English 'do' as Doctor of Osteopathic Medicine", () => {
    const jd = `What you'll do:
- Handle customer calls and solve problems
- You will do great work every day`;
    expect(evaluateCredentialGate(DEMETRI_RESUME, jd).blocked).toBe(false);
  });

  it("blocks when RN is explicitly required and absent from resume", () => {
    const jd = `Registered Nurse (RN) required. Active nursing license required. Must have RN credential.`;
    const result = evaluateCredentialGate(DEMETRI_RESUME, jd);
    expect(result.blocked).toBe(true);
    expect(result.matches[0]?.label).toMatch(/RN/i);
    expect(result.matches[0]?.jdExcerpt).toBeTruthy();
  });

  it("allows run when required CPA appears on resume", () => {
    const jd = `CPA required. Must hold active CPA certification.`;
    const resume = `Jane Doe\nCertified Public Accountant (CPA)\n- Prepared tax returns`;
    expect(evaluateCredentialGate(resume, jd).blocked).toBe(false);
  });

  it("blocks when M.D. appears in medical context without resume credential", () => {
    const jd = `Seeking a licensed physician. M.D. required. Medical license must be active.`;
    expect(evaluateCredentialGate(DEMETRI_RESUME, jd).blocked).toBe(true);
  });

  it("does not block bare MD without medical context (e.g. stray abbreviation)", () => {
    const jd = `Our office is located near MD campus. Great team culture.`;
    expect(evaluateCredentialGate(DEMETRI_RESUME, jd).blocked).toBe(false);
  });

  it("returns structured match details when blocked", () => {
    const jd = `PMP certification required. Must hold valid PMP.`;
    const result = evaluateCredentialGate(DEMETRI_RESUME, jd);
    expect(result.blocked).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((m) => m.label && m.matchedText && m.jdExcerpt)).toBe(true);
  });
});
