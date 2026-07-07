import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/** Source resume — structurally correct Demetri profile for Pinterest PM apprenticeship. */
export const DEMETRI_PINTEREST_RESUME = `
Demetri Simpson
Newark, NJ | demetri@example.com | linkedin.com/in/demetrisimpson

Professional Summary
Product-minded builder with experience shipping Signalyz.ai, operating in regulated service environments, and making analytical decisions under volume.

Experience

Founder / Product Builder | Signalyz | 2022 – Present
- Built Signalyz.ai from concept to production as an AI resume intelligence platform.
- Made product decisions on tiered access, export quality, and evaluation guardrails.
- Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.

Operations Specialist | nThrive | 2021 – 2022 | Remote
- Supported fund operations workflows, documentation checks, and cross-team handoffs.
- Coordinated issue resolution with operations and support stakeholders.

Customer Service Representative | New Jersey Department of Labor (NJDOL) | 2017 – 2021
- Managed high-volume caseloads with eligibility review, documentation accuracy, and compliance-sensitive processing.
- Drafted customer-facing updates and coordinated escalations across teams.

Operations Specialist | AST Fund Solutions | 2019 – 2020 | Remote
- Supported remote fund operations tasks, documentation routing, and process checklists.

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

/** Simulates parser corruption seen in Pinterest PM QA — role headers collapsed into bullets. */
export function malformedPinterestCalibratedResume(): CalibratedResumeData {
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
        title: "",
        company: "",
        dates: "",
        bullets: [
          "Founder / Product Builder | Signalyz | 2022 – Present",
          "Built Signalyz.ai from concept to production with evaluation guardrails.",
          "Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout.",
        ],
      },
      {
        title: "Customer Service Representative",
        company: "New Jersey Department of Labor (NJDOL)",
        dates: "",
        bullets: [
          "2017 – 2021",
          "Managed high-volume caseloads with eligibility review and documentation accuracy.",
          "nThrive — Remote.",
        ],
      },
      {
        title: "Operations Specialist",
        company: "AST Fund Solutions",
        dates: "2019 – 2020",
        bullets: ["Supported remote fund operations tasks and documentation routing."],
      },
    ],
    independent_projects: [],
    skills: [],
    certifications: [],
    education: [],
    signal_keywords: [],
  };
}

export const PINTEREST_COVER_LETTER_WITH_DOMAIN_BUG = [
  "I built Signalyz.ai from concept to production, using AI intentionally to help candidates understand how hiring managers read their experience.",
  "At the New Jersey Department of Labor, I managed documentation-heavy casework that trained my judgment on accuracy and communication.",
  "I have not held a formal product manager title, but I have made product decisions on exports, evaluation quality, and user-facing workflows.",
  "I would welcome a conversation about how this apprenticeship could sharpen the product instincts I have already been building.",
].join(" ");
