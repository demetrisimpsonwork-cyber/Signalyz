/** Resume QA Engine v1 regression fixtures — Demetri AI Engineer scenario. */

export const DEMETRI_AI_ENGINEER_SOURCE_RESUME = `
Demetri Simpson
Full Stack / AI Engineer | Newark, NJ | demetri@example.com | github.com/demetrisimpson

Summary
Full stack engineer building Signalyz, a production AI platform that converts resumes and job descriptions into structured hiring outputs.

Experience

Founding Engineer | Signalyz | 2022 – Present
- Built a production AI platform using React, TypeScript, Node.js, and Python that converts resumes and JDs into structured outputs for hiring workflows.
- Designed REST APIs backed by PostgreSQL and Supabase with OAuth authentication, Stripe billing, and Git-based CI/CD.
- Deployed services on Vercel and Cloudflare with observability for inference latency and regression alerts.

Operations Integration Analyst | Regional Benefits Services | 2021 – 2022
- Built REST API integrations connecting case tools to Salesforce with authentication and error handling.
- Developed Python scripts and SQL reporting pipelines.

Customer Service Representative | New Jersey Department of Labor (NJDOL) | 2017 – 2021
- Managed customer escalation calls and coordinated tier-2 escalations within SLA targets.
- Tracked outcomes in Salesforce and maintained accurate case documentation.

Skills
React, TypeScript, Node.js, Python, PostgreSQL, Supabase, REST APIs, Git, OAuth, Stripe, Vercel, Cloudflare, CI/CD, cloud deployment
`.trim();

export const FULL_STACK_AI_ENGINEER_JD = `
Full Stack / AI Engineer

Build production AI applications with React, TypeScript, Node.js, Python, REST APIs, PostgreSQL, and Supabase.
Integrate OAuth, Stripe, and CI/CD on Vercel/Cloudflare. Experience with LLM workflows and structured resume parsing a plus.
Deploy cloud services with Git-based workflows and production monitoring.
`.trim();

/** Calibrated output with known QA failures for regression testing. */
export const DEMETRI_CONTAMINATED_GENERATED_RESUME = `
Demetri Simpson
Full Stack / AI Engineer | Newark, NJ

Summary
AI engineer shipping hiring intelligence products.

Experience

Founding Engineer | Signalyz | 2022 – Present
- Built a production AI platform that parses resumes for hiring workflows.
- Led the AI Sandbox initiative for rapid prompt iteration across customer pilots.
- Integrated billing and authentication for production users.

Customer Service Representative | New Jersey Department of Labor (NJDOL) | 2017 – 2021
- Managed customer escalation calls and coordinated tier-2 escalations within SLA targets.
- Improved model outputs for claimant routing scripts and documentation quality.
- Tracked outcomes in Salesforce and maintained accurate case documentation.

Skills
Python, Salesforce, customer escalation, documentation
`.trim();

export const TARGET_ROLE_LABEL = "Full Stack / AI Engineer";
