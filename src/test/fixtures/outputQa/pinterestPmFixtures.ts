import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/** Source resume — pipe/hybrid layout (paste + regression baseline). */
export const DEMETRI_PINTEREST_RESUME = `
Demetri Simpson
Phillipsburg, NJ | demetri@example.com | linkedin.com/in/demetrisimpson

Professional Summary
Product-minded builder with experience shipping Signalyz.ai, operating in regulated service environments, and making analytical decisions under volume.

Experience

Signalyz.ai — Founder | 2024 – Present | Phillipsburg, NJ
- Built Signalyz.ai from concept to production as an AI resume intelligence platform.
- Made product decisions on tiered access, export quality, and evaluation guardrails.
- Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.
- Owned product analytics and output QA for resume and cover letter exports.

New Jersey Department of Labor — Claims Examiner | Jan 2023 – Jun 2024 | Trenton, NJ
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

/**
 * Source resume — mammoth-style block layout from uploaded
 * "Demetri Simspon Pinterest PM Resume(4).docx" (title line, company line, location line).
 */
export const DEMETRI_PINTEREST_RESUME_DOCX_SOURCE = `
Demetri Simpson
Phillipsburg, NJ | Demetri.Simpson.work@gmail.com | 908-530-8246

PROFESSIONAL SUMMARY
Product-minded builder with experience shipping Signalyz.ai, operating in regulated service environments, and making analytical decisions under volume.

CORE COMPETENCIES
Team Leadership, Process Improvement, Communication, Training & Development, Data Analysis, Compliance

EXPERIENCE

Founder | 2024 – Present
Signalyz.ai
Phillipsburg, NJ
- Built Signalyz.ai from concept to production as an AI resume intelligence platform.
- Made product decisions on tiered access, export quality, and evaluation guardrails.
- Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.
- Owned product analytics and output QA for resume and cover letter exports.

Claims Examiner | Jan 2023 – Jun 2024
New Jersey Department of Labor
Trenton, NJ
- Managed 40–70 active Family Leave Insurance and Disability During Unemployment claims with documentation accuracy.
- Drafted customer-facing updates and coordinated escalations across teams.
- Reviewed eligibility documentation and compliance-sensitive processing under high volume.

Revenue Cycle & Compliance Support | 2021 – 2023
nThrive
Remote
- Supported revenue cycle workflows, documentation checks, and cross-team handoffs.
- Coordinated issue resolution with operations and support stakeholders.

Team Lead, Proxy Voting Specialist, Client Communications | 2016 – 2020
AST Fund Solutions
Remote
- Led a support team handling proxy voting operations and client communications.
- Worked with financial-services clients on documentation routing and process checklists.

CERTIFICATIONS
Google IT Support Professional Certificate — Coursera
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
      location: "Phillipsburg, NJ",
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

/** Simulates live preview header layout bugs: duplicate company/title, location-only headers. */
export function headerLayoutCorruptedPinterestPmCalibratedResume(): CalibratedResumeData {
  return {
    header: {
      name: "Demetri Simpson",
      title: "Product Builder",
      email: "demetri@example.com",
      phone: "",
      linkedin: "",
      location: "Phillipsburg, NJ",
    },
    summary:
      "Product-minded builder experienced in shipping Signalyz.ai and operating in regulated environments.",
    core_competencies: ["Product thinking", "Client communication", "Analytical decision-making"],
    experience: [
      {
        title: "Founder",
        company: "Signalyz.ai — Founder",
        dates: "2024 – Present",
        bullets: [
          "Built Signalyz.ai from concept to production as an AI resume intelligence platform.",
          "Made product decisions on tiered access, export quality, and evaluation guardrails.",
          "Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.",
          "Owned product analytics and output QA for resume and cover letter exports.",
        ],
      },
      {
        title: "",
        company: "Trenton, NJ",
        dates: "Jan 2023 – Jun 2024",
        bullets: [
          "Managed 40–70 active Family Leave Insurance and Disability During Unemployment claims with documentation accuracy.",
          "Drafted customer-facing updates and coordinated escalations across teams.",
          "Reviewed eligibility documentation and compliance-sensitive processing under high volume.",
        ],
      },
      {
        title: "Remote",
        company: "",
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

/** Simulates assembly output where Trenton, NJ bleeds onto Signalyz.ai from a neighbor role. */
export function locationBleedPinterestPmCalibratedResume(): CalibratedResumeData {
  return {
    header: {
      name: "Demetri Simpson",
      title: "Product Builder",
      email: "demetri@example.com",
      phone: "",
      linkedin: "",
      location: "Phillipsburg, NJ",
    },
    summary:
      "Product-minded builder experienced in shipping Signalyz.ai and operating in regulated environments.",
    core_competencies: ["Product thinking", "Client communication", "Analytical decision-making"],
    experience: [
      {
        title: "Founder",
        company: "Signalyz.ai",
        dates: "2024 – Present",
        location: "Trenton, NJ",
        bullets: [
          "Built Signalyz.ai from concept to production as an AI resume intelligence platform.",
          "Made product decisions on tiered access, export quality, and evaluation guardrails.",
          "Integrated Claude API workflows, Supabase/PostgreSQL, and Stripe checkout with QA observability.",
          "Owned product analytics and output QA for resume and cover letter exports.",
        ],
      },
      {
        title: "Claims Examiner",
        company: "New Jersey Department of Labor",
        dates: "Jan 2023 – Jun 2024",
        location: "Phillipsburg, NJ",
        bullets: [
          "Managed 40–70 active Family Leave Insurance and Disability During Unemployment claims with documentation accuracy.",
          "Drafted customer-facing updates and coordinated escalations across teams.",
          "Reviewed eligibility documentation and compliance-sensitive processing under high volume.",
        ],
      },
      {
        title: "Revenue Cycle & Compliance Support",
        company: "nThrive",
        dates: "2021 – 2023",
        location: "Remote",
        bullets: [
          "Supported revenue cycle workflows, documentation checks, and cross-team handoffs.",
          "Coordinated issue resolution with operations and support stakeholders.",
        ],
      },
      {
        title: "Team Lead, Proxy Voting Specialist, Client Communications",
        company: "AST Fund Solutions",
        dates: "2016 – 2020",
        location: "Remote",
        bullets: [
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

/** Simulates live production NJDOL header corruption: date + duplicate Trenton lines. */
export function njdolDuplicateLocationCalibratedResume(): CalibratedResumeData {
  return {
    header: {
      name: "Demetri Simpson",
      title: "Product Builder",
      email: "demetri@example.com",
      phone: "",
      linkedin: "",
      location: "Phillipsburg, NJ",
    },
    summary:
      "Product-minded builder experienced in shipping Signalyz.ai and operating in regulated environments.",
    core_competencies: ["Product thinking", "Client communication", "Analytical decision-making"],
    experience: [
      {
        title: "Founder",
        company: "Signalyz.ai",
        dates: "2024 – Present",
        location: "Trenton, NJ",
        bullets: [
          "Built Signalyz.ai from concept to production as an AI resume intelligence platform.",
          "Designed structured evaluation logic to independently assess AI-generated outputs.",
          "Built and launched a user-facing AI platform for resume analysis, job matching, and report generation.",
          "Built data flows, persistence, and usage tracking to support multi-step product behavior.",
          "Diagnosed and resolved issues across frontend, backend, AI services, authentication, and payment flows.",
          "Defined end-to-end workflows balancing user experience, output quality, reliability, and trust.",
        ],
      },
      {
        title: "",
        company: "Trenton, NJ",
        dates: "Jan 2023 – Jun 2024",
        location: "Trenton, NJ",
        bullets: [
          "Managed 40–70 active Family Leave Insurance and Disability During Unemployment claims with documentation accuracy.",
          "Drafted customer-facing updates and coordinated escalations across teams.",
          "Reviewed eligibility documentation and compliance-sensitive processing under high volume.",
          "Worked in a HIPAA-regulated environment with strict documentation standards.",
          "Processed claims under high volume with accuracy and compliance requirements.",
        ],
      },
      {
        title: "Revenue Cycle & Compliance Support",
        company: "nThrive",
        dates: "2021 – 2023",
        location: "Remote",
        bullets: [
          "Supported revenue cycle workflows, documentation checks, and cross-team handoffs.",
          "Coordinated issue resolution with operations and support stakeholders.",
        ],
      },
      {
        title: "Team Lead, Proxy Voting Specialist, Client Communications",
        company: "AST Fund Solutions",
        dates: "2016 – 2020",
        location: "Remote",
        bullets: [
          "Led a support team handling proxy voting operations and client communications.",
          "Worked with financial-services clients on documentation routing and process checklists.",
        ],
      },
    ],
    independent_projects: [],
    skills: [],
    certifications: ["Google IT Support Professional Certificate — Coursera"],
    education: [],
    signal_keywords: [],
  };
}

export const PINTEREST_COVER_LETTER_WITH_DANGLING_EMAIL_FRAGMENT =
  "I built Signalyz.ai from concept to production for the Pinterest apprenticeship. I'd genuinely welcome a conversation about whether this apprenticeship is the right fit.Simpson.work@gmail.com At NJDOL I managed documentation-heavy casework that trained my judgment on accuracy.";

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

export const PINTEREST_COVER_LETTER_WITH_MIDBODY_CTA =
  "I built Signalyz.ai from concept to production for the Pinterest apprenticeship. I'd welcome a conversation about how my background fits what you're building in this program — feel free to reach out at 908-530-8246 or demetri@example.com. At NJDOL I managed documentation-heavy casework that trained my judgment on accuracy.";

export const EXPECTED_PINTEREST_PM_ROLES = [
  {
    company: /Signalyz\.ai/i,
    title: /Founder/i,
    dates: /2024\s*[-–—]\s*Present/i,
    location: /Phillipsburg,\s*NJ/i,
    bulletHint: /concept to production/i,
  },
  {
    company: /New Jersey Department of Labor/i,
    title: /Claims Examiner/i,
    dates: /Jan\s+2023\s*[-–—]\s*Jun\s+2024/i,
    location: /Trenton,\s*NJ/i,
    bulletHint: /Family Leave Insurance/i,
  },
  {
    company: /nThrive/i,
    title: /Revenue Cycle/i,
    dates: /2021\s*[-–—]\s*2023/i,
    location: /^Remote$/i,
    bulletHint: /revenue cycle workflows/i,
  },
  {
    company: /AST Fund Solutions/i,
    title: /Team Lead/i,
    dates: /2016\s*[-–—]\s*2020/i,
    location: /^Remote$/i,
    bulletHint: /proxy voting/i,
  },
] as const;

export const CANONICAL_PINTEREST_PM_DATES = {
  signalyz: "2024 – Present",
  njdol: "Jan 2023 – Jun 2024",
  nthrive: "2021 – 2023",
  ast: "2016 – 2020",
} as const;
