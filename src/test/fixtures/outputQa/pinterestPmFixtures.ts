import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/** Source resume — Demetri profile for Pinterest PM apprenticeship (canonical dates). */
export const DEMETRI_PINTEREST_RESUME = `
Demetri Simpson
Newark, NJ | demetri@example.com | linkedin.com/in/demetrisimpson

Professional Summary
Product-minded builder with experience shipping Signalyz.ai, operating in regulated service environments, and making analytical decisions under volume.

Experience

Signalyz.ai — Founder | 2024 – Present
- Built Signalyz.ai from concept to production as an AI resume intelligence platform.
- Made product decisions on tiered access, export quality, and evaluation guardrails.
- Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.
- Owned product analytics and output QA for resume and cover letter exports.

New Jersey Department of Labor — Claims Examiner | Jan 2023 – Jun 2024
- Managed 40–70 active Family Leave Insurance and Disability During Unemployment claims with documentation accuracy.
- Drafted customer-facing updates and coordinated escalations across teams.
- Reviewed eligibility documentation and compliance-sensitive processing under high volume.

nThrive — Revenue Cycle & Compliance Support | 2021 – 2023 | Remote
- Supported revenue cycle workflows, documentation checks, and cross-team handoffs.
- Coordinated issue resolution with operations and support stakeholders.

AST Fund Solutions — Team Lead, Proxy Voting Specialist, Client Communications | 2016 – 2020 | Remote
- Led a support team handling proxy voting operations and client communications.
- Worked with financial-services clients on documentation routing and process checklists.

Skills
Product thinking, client communication, documentation, analytical decision-making, React, TypeScript, Supabase, PostgreSQL
`.trim();

export const PINTEREST_PM_APPRENTICE_JD = `
Product Manager Apprenticeship at Pinterest

Pinterest is looking for curious, collaborative apprentices to learn product management while working on real user problems.

Responsibilities
- Partner with mentors on product discovery, user research, and roadmap learning.
- Translate user needs into clear product decisions with cross-functional teams.
- Use data and feedback to evaluate product quality and iterate thoughtfully.
- Communicate clearly with design, engineering, and business partners.

Requirements
- Strong analytical and communication skills.
- Interest in building products users love.
- Comfort learning in a fast-moving product environment.
- Bonus: experience shipping tools, workflows, or user-facing products.
`.trim();

/**
 * Simulates production corruption: merged roles, floating dates/locations,
 * and company/title headers trapped inside bullet arrays.
 */
export function corruptedPinterestPmCalibratedResume(): CalibratedResumeData {
  return {
    header: {
      name: "Demetri Simpson",
      title: "Product Builder",
      email: "demetri@example.com",
      phone: "",
      linkedin: "",
      location: "Newark, NJ",
    },
    summary:
      "Product-minded builder experienced in shipping Signalyz.ai and operating in regulated environments.",
    core_competencies: ["Product thinking", "Client communication", "Analytical decision-making"],
    experience: [
      {
        title: "Founder",
        company: "Signalyz.ai",
        dates: "2022 – Present",
        bullets: [
          "Built Signalyz.ai from concept to production as an AI resume intelligence platform.",
          "Made product decisions on tiered access, export quality, and evaluation guardrails.",
          "Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.",
          "Owned product analytics and output QA for resume and cover letter exports.",
          "New Jersey Department of Labor — Claims Examiner",
          "Managed 40–70 active Family Leave Insurance and Disability During Unemployment claims with documentation accuracy.",
          "Drafted customer-facing updates and coordinated escalations across teams.",
          "Reviewed eligibility documentation and compliance-sensitive processing under high volume.",
        ],
      },
      {
        title: "",
        company: "Remote",
        dates: "2021 – 2023",
        bullets: [
          "Supported revenue cycle workflows, documentation checks, and cross-team handoffs.",
          "Coordinated issue resolution with operations and support stakeholders.",
          "Asted Fund Solutions — Team Lead, Proxy Voting Specialist, Client Communications.",
          "Led a support team handling proxy voting operations and client communications.",
          "Worked with financial-services clients on documentation routing and process checklists.",
        ],
      },
    ],
    independent_projects: [],
    skills: [],
    certifications: [],
    education: [],
    signal_keywords: [],
  };
}

/** @deprecated Use corruptedPinterestPmCalibratedResume for structure regression. */
export function malformedPinterestCalibratedResume(): CalibratedResumeData {
  return corruptedPinterestPmCalibratedResume();
}

export const PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG = [
  "I built Signalyz.ai from concept to production, using AI intentionally to help candidates understand how hiring managers read their experience.",
  "At the New Jersey Department of Labor, I managed documentation-heavy casework that trained my judgment on accuracy and communication.",
  "I have not held a formal product manager title, but I have made product decisions on exports, evaluation quality, and user-facing workflows.",
  "I would welcome a conversation about how this apprenticeship could sharpen the product instincts I have already been building.",
].join(" ");

export const EXPECTED_PINTEREST_PM_ROLES = [
  {
    company: /Signalyz\.ai/i,
    title: /Founder/i,
    dates: /2024\s*[-–—]\s*Present/i,
    bulletHint: /concept to production/i,
  },
  {
    company: /New Jersey Department of Labor/i,
    title: /Claims Examiner/i,
    dates: /Jan\s+2023\s*[-–—]\s*Jun\s+2024/i,
    bulletHint: /Family Leave Insurance/i,
  },
  {
    company: /nThrive/i,
    title: /Revenue Cycle/i,
    dates: /2021\s*[-–—]\s*2023/i,
    bulletHint: /revenue cycle workflows/i,
  },
  {
    company: /AST Fund Solutions/i,
    title: /Team Lead/i,
    dates: /2016\s*[-–—]\s*2020/i,
    bulletHint: /proxy voting/i,
  },
] as const;

export const CANONICAL_PINTEREST_PM_DATES = {
  signalyz: "2024 – Present",
  njdol: "Jan 2023 – Jun 2024",
  nthrive: "2021 – 2023",
  ast: "2016 – 2020",
} as const;
