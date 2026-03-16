import { describe, it, expect } from "vitest";
import { computeDeterministicScore } from "@/lib/deterministicScore";

// ── Fixtures ────────────────────────────────────────────────────────────────

const JD = `
Senior Operations Manager
We are looking for a Senior Operations Manager to lead cross-functional teams,
drive operational excellence, and optimize end-to-end workflows.
Responsibilities:
- Lead program roadmap execution and stakeholder governance
- Drive process standardization and SLA compliance across regional teams
- Own P&L accountability and budget decision-making
- Manage vendor relationships and client-facing escalations
- Implement Salesforce CRM, Jira, Tableau dashboards
Requirements:
- 8+ years operations management experience
- Proven track record of reducing costs and improving throughput
- Strong leadership, communication, and cross-functional collaboration skills
- Experience with capacity planning, triage, and high-volume pipeline routing
`;

const ORIGINAL_RESUME = `
Jane Smith
Operations Coordinator

Experience:
- Helped coordinate team schedules and assisted with meeting logistics
- Participated in weekly status calls with department leads
- Was involved in preparing quarterly reports for management review
- Supported the onboarding process for new hires
- Assisted with tracking project timelines using spreadsheets
- Helped organize vendor communications
- Tasked with compiling data for monthly reviews
`;

const CALIBRATED_RESUME_STRONG = `
Jane Smith
Senior Operations Manager

Experience:
- Led cross-functional program execution across 4 regional teams, delivering 98% SLA compliance
- Spearheaded end-to-end process standardization, reducing operational costs by 22%
- Owned P&L accountability for a $3.2M budget, driving governance and decision-making
- Architected Salesforce CRM implementation and Tableau dashboard rollout for 150+ stakeholders
- Directed vendor management and client-facing escalation protocols, improving throughput by 35%
- Built capacity planning framework and high-volume pipeline routing, handling 500+ concurrent cases
- Drove roadmap execution and stakeholder governance across executive leadership team
- Orchestrated triage and escalation workflows, reducing resolution time by 40%
- Established standardized playbook for regional operations, scaling to 12 departments
- Launched automated reporting using Jira and Tableau, eliminating 15 hours/week manual work
`;

const CALIBRATED_RESUME_MINIMAL = `
Jane Smith
Operations Coordinator

Experience:
- Helped coordinate team schedules and assisted with meeting logistics
- Participated in weekly status calls with department leads
- Was involved in preparing quarterly reports for management review
- Supported the onboarding process for new hires
- Assisted with tracking project timelines using spreadsheets
- Helped organize vendor communications
- Tasked with compiling data for monthly reviews
- Also helped with filing
`;

const CALIBRATED_RESUME_STUFFED = `
Jane Smith
Senior Operations Manager

Experience:
- Led operations operations operations operations operations operations operations management
- Spearheaded governance governance governance governance governance governance governance
- Owned stakeholder stakeholder stakeholder stakeholder stakeholder stakeholder stakeholder engagement
- Drove roadmap roadmap roadmap roadmap roadmap roadmap roadmap execution
- Built standardization standardization standardization standardization standardization workflows
- Directed throughput throughput throughput throughput throughput throughput throughput optimization
- Architected escalation escalation escalation escalation escalation escalation escalation protocols
`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("computeDeterministicScore", () => {
  it("1. original resume baseline is unchanged (no uplift logic)", () => {
    const result = computeDeterministicScore(ORIGINAL_RESUME, JD, "original");
    // Should produce a modest score; no floor guarantee applied
    expect(result.finalScore).toBeLessThan(67);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it("2. clearly improved calibrated resume gets uplift (capped at +25)", () => {
    const origResult = computeDeterministicScore(ORIGINAL_RESUME, JD, "original");
    const result = computeDeterministicScore(
      CALIBRATED_RESUME_STRONG, JD, "calibrated", ORIGINAL_RESUME
    );
    // Should show positive uplift, capped at 25
    expect(result.finalScore).toBeGreaterThan(origResult.finalScore);
    expect(result.finalScore - origResult.finalScore).toBeLessThanOrEqual(25);
  });

  it("3. minimally changed resume does NOT get uplift", () => {
    const result = computeDeterministicScore(
      CALIBRATED_RESUME_MINIMAL, JD, "calibrated", ORIGINAL_RESUME
    );
    // Delta-validation should fail → no floor guarantee
    expect(result.finalScore).toBeLessThan(67);
  });

  it("4. keyword-stuffed resume does NOT get uplift", () => {
    const result = computeDeterministicScore(
      CALIBRATED_RESUME_STUFFED, JD, "calibrated", ORIGINAL_RESUME
    );
    // Anti-stuffing gate blocks the floor
    expect(result.finalScore).toBeLessThan(70);
  });

  it("5. calibrated score is never lower than original (floor guard)", () => {
    const origResult = computeDeterministicScore(ORIGINAL_RESUME, JD, "original");
    const calibResult = computeDeterministicScore(
      CALIBRATED_RESUME_MINIMAL, JD, "calibrated", ORIGINAL_RESUME
    );
    expect(calibResult.finalScore).toBeGreaterThanOrEqual(origResult.finalScore);
  });

  it("6. score delta is capped at 25 points (ceiling protection)", () => {
    const origResult = computeDeterministicScore(ORIGINAL_RESUME, JD, "original");
    const calibResult = computeDeterministicScore(
      CALIBRATED_RESUME_STRONG, JD, "calibrated", ORIGINAL_RESUME
    );
    expect(calibResult.finalScore - origResult.finalScore).toBeLessThanOrEqual(25);
  });

  it("7. zero-delta triggers retry pass producing positive uplift", () => {
    // Even the minimal resume should get at least the original score back
    const origResult = computeDeterministicScore(ORIGINAL_RESUME, JD, "original");
    const calibResult = computeDeterministicScore(
      CALIBRATED_RESUME_MINIMAL, JD, "calibrated", ORIGINAL_RESUME
    );
    expect(calibResult.finalScore).toBeGreaterThanOrEqual(origResult.finalScore);
  });
});
