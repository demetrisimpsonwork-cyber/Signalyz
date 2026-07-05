/** Link preservation test fixtures — Initiative 002 Phase 3A. */

export const RESUME_GITHUB_LINKEDIN_EMAIL = `
Alex Chen
Full Stack Engineer | Boston, MA | alex.chen@example.com | github.com/alexchen | linkedin.com/in/alexchen

Summary
Engineer building web platforms.

Experience
Software Engineer | Acme Corp | 2020 – Present
- Built customer-facing dashboards in React.

Skills
React, TypeScript, Node.js
`.trim();

export const RESUME_PORTFOLIO_ONLY = `
Jamie Park
Product Designer | Portland, OR | https://jamiepark.design

Summary
Designer focused on B2B SaaS.

Skills
Figma, UX research
`.trim();

export const RESUME_INLINE_HEADER_LINKS = `
Riley Ortiz | riley.ortiz@example.com | linkedin.com/in/rileyortiz | github.com/rileyo

Summary
DevOps engineer with CI/CD experience.
`.trim();

export const GENERATED_MISSING_LINKS = {
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
  experience: [
    {
      title: "Software Engineer",
      company: "Acme Corp",
      dates: "2020 – Present",
      bullets: ["Built customer-facing dashboards in React."],
    },
  ],
  skills: ["React", "TypeScript"],
};

export const GENERATED_DUPLICATE_LINKS = {
  header: {
    name: "Alex Chen",
    email: "alex.chen@example.com",
    linkedin: "linkedin.com/in/alexchen",
    github: "github.com/alexchen",
    website: "github.com/alexchen",
  },
  summary: "Engineer.",
  experience: [],
  skills: [],
};

export const GENERATED_MALFORMED_LINKS = {
  header: {
    name: "Alex Chen",
    email: "not-an-email",
    linkedin: "linkedin.com/bad",
    github: "ht!tp://broken",
  },
  summary: "Engineer.",
  experience: [],
  skills: [],
};
