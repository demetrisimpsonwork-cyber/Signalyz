/** Export validation run fixtures — Initiative 002 Phase 3B. */
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

const baseFields = {
  core_competencies: [] as string[],
  independent_projects: [] as CalibratedResumeData["independent_projects"],
  skills: [] as string[],
  certifications: [] as string[],
  education: [] as CalibratedResumeData["education"],
  signal_keywords: [] as string[],
};

export const DEMETRI_AI_ENGINEER_EXPORT: CalibratedResumeData = {
  ...baseFields,
  header: {
    name: "Demetri Simpson",
    title: "Full Stack / AI Engineer",
    email: "demetri@example.com",
    phone: "",
    linkedin: "",
    github: "github.com/demetrisimpson",
    website: "",
    location: "Newark, NJ",
  },
  summary:
    "Full stack engineer building Signalyz, a production AI platform that converts resumes and job descriptions into structured hiring outputs.",
  core_competencies: [
    "React",
    "TypeScript",
    "Node.js",
    "Python",
    "PostgreSQL",
    "Supabase",
    "REST APIs",
    "CI/CD",
  ],
  experience: [
    {
      title: "Founding Engineer",
      company: "Signalyz",
      dates: "2022 – Present",
      bullets: [
        "Built a production AI platform using React, TypeScript, Node.js, and Python that converts resumes and JDs into structured outputs for hiring workflows.",
        "Designed REST APIs backed by PostgreSQL and Supabase with OAuth authentication, Stripe billing, and Git-based CI/CD.",
      ],
    },
    {
      title: "Operations Integration Analyst",
      company: "Regional Benefits Services",
      dates: "2021 – 2022",
      bullets: ["Built REST API integrations connecting case tools to Salesforce."],
    },
  ],
};

export const CUSTOMER_SUCCESS_EXPORT: CalibratedResumeData = {
  ...baseFields,
  header: {
    name: "Taylor Morgan",
    title: "Customer Success Manager",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    website: "",
    location: "Chicago, IL",
  },
  summary:
    "CSM with 6+ years driving retention, QBRs, and CRM hygiene for mid-market accounts.",
  core_competencies: ["Salesforce", "Gainsight", "QBR facilitation", "Renewal forecasting"],
  experience: [
    {
      title: "Customer Success Manager",
      company: "Relay SaaS",
      dates: "2021 – Present",
      bullets: [
        "Managed 60 enterprise accounts with 94% gross retention.",
        "Led quarterly business reviews and renewal playbooks with sales partners.",
      ],
    },
  ],
};

export const TECHNICAL_LINKS_EXPORT: CalibratedResumeData = {
  ...baseFields,
  header: {
    name: "Jordan Lee",
    title: "Software Engineer",
    email: "jordan.lee@example.com",
    phone: "",
    linkedin: "linkedin.com/in/jlee-dev",
    github: "github.com/jlee-dev",
    website: "https://jlee.dev",
    location: "Seattle, WA",
  },
  summary: "Backend engineer building reliable APIs and data pipelines.",
  core_competencies: ["Go", "PostgreSQL", "REST APIs", "CI/CD"],
  experience: [
    {
      title: "Senior Software Engineer",
      company: "Northwind Systems",
      dates: "2020 – Present",
      bullets: [
        "Built REST APIs in Go and PostgreSQL serving 2M+ monthly requests.",
        "Led migration to CI/CD with GitHub Actions and reduced deploy time by 35%.",
      ],
    },
  ],
};

export const NON_TECHNICAL_EXPORT: CalibratedResumeData = {
  ...baseFields,
  header: {
    name: "Alex Rivera",
    title: "Operations Coordinator",
    email: "alex.rivera@example.com",
    phone: "",
    linkedin: "",
    github: "",
    website: "",
    location: "Austin, TX",
  },
  summary: "Detail-oriented operations coordinator with 4 years improving workflow accuracy.",
  core_competencies: ["Excel", "Process documentation", "Scheduling"],
  experience: [
    {
      title: "Operations Coordinator",
      company: "BrightPath Logistics",
      dates: "2021 – Present",
      bullets: [
        "Reduced processing errors by 18% through checklist standardization.",
        "Coordinated weekly reporting across three warehouse teams.",
      ],
    },
  ],
};

/** Simulates assembly output where links were dropped before Phase 3A guard. */
export const LINK_DROPPED_EXPORT: CalibratedResumeData = {
  ...baseFields,
  header: {
    name: "Alex Chen",
    title: "Full Stack Engineer",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    website: "",
    location: "Boston, MA",
  },
  summary: "Engineer building web platforms.",
  core_competencies: ["React", "TypeScript", "Node.js"],
  experience: [
    {
      title: "Software Engineer",
      company: "Acme Corp",
      dates: "2020 – Present",
      bullets: ["Built customer-facing dashboards in React."],
    },
  ],
};

export const EXPORT_VALIDATION_FIXTURES = [
  { id: "demetri_ai_engineer", label: "Demetri AI Engineer", resume: DEMETRI_AI_ENGINEER_EXPORT },
  { id: "customer_success", label: "Customer Success", resume: CUSTOMER_SUCCESS_EXPORT },
  { id: "technical_links", label: "Technical with GitHub/portfolio", resume: TECHNICAL_LINKS_EXPORT },
  { id: "non_technical", label: "Non-technical resume", resume: NON_TECHNICAL_EXPORT },
  { id: "link_dropped", label: "Previously link-dropped resume", resume: LINK_DROPPED_EXPORT },
] as const;
