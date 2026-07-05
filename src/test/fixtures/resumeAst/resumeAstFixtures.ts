/** Resume AST fixtures — Initiative 002 Phase 1. */

export const SIMPLE_RESUME = `
Alex Rivera
alex.rivera@example.com | Austin, TX

Summary
Detail-oriented operations coordinator with 4 years improving workflow accuracy.

Experience

Operations Coordinator | BrightPath Logistics | 2021 – Present
- Reduced processing errors by 18% through checklist standardization.
- Coordinated weekly reporting across three warehouse teams.

Skills
Excel, process documentation, scheduling
`.trim();

export const ENGINEERING_RESUME = `
Jordan Lee
Software Engineer | Seattle, WA | jordan.lee@example.com | github.com/jlee-dev

Summary
Backend engineer building reliable APIs and data pipelines.

Experience

Senior Software Engineer | Northwind Systems | 2020 – Present
- Built REST APIs in Go and PostgreSQL serving 2M+ monthly requests.
- Led migration to CI/CD with GitHub Actions and reduced deploy time by 35%.
- Mentored 3 junior engineers on code review and testing practices.

Software Engineer | Lakeview Apps | 2017 – 2020
- Implemented authentication and billing integrations for B2B customers.
- Designed monitoring dashboards for production incident response.

Skills
Go, PostgreSQL, REST APIs, Git, CI/CD, Docker, AWS
`.trim();

export const CUSTOMER_SUCCESS_RESUME = `
Taylor Morgan
Customer Success Manager | Chicago, IL

Professional Summary
CSM with 6+ years driving retention, QBRs, and CRM hygiene for mid-market accounts.

Experience

Customer Success Manager | Relay SaaS | 2021 – Present
- Managed 60 enterprise accounts with 94% gross retention.
- Led quarterly business reviews and renewal playbooks with sales partners.

Account Manager | Horizon Tools | 2018 – 2021
- Owned onboarding and adoption metrics for 40 SMB customers.
- Coordinated support escalations and documented root-cause trends.

Skills
Salesforce, Gainsight, QBR facilitation, renewal forecasting, stakeholder management
`.trim();

export const MALFORMED_RESUME = `
Summary
Summary
Experience

Built things quickly
- 
- Led stuff

Skills
React, React, TypeScript
Skills

Education
B.A. | Unknown College
`.trim();

export { DEMETRI_AI_ENGINEER_SOURCE_RESUME as AI_ENGINEER_RESUME } from "../resumeQa/demetriAiEngineerFixtures";

export const TWO_PAGE_RESUME = `
Priya Nair
Staff Platform Engineer | San Francisco, CA | priya.nair@example.com

Summary
Platform engineer specializing in distributed systems, observability, and developer productivity.

Experience

Staff Platform Engineer | Atlas Cloud | 2021 – Present
- Owned internal developer platform supporting 120+ microservices across AWS and GCP.
- Built self-service deployment pipelines with GitHub Actions, Terraform, and Kubernetes.
- Reduced mean time to recovery by 42% through SLO dashboards and automated rollback.
- Led cross-functional initiative to standardize service templates and golden paths.
- Partnered with security on SSO, secrets rotation, and compliance automation.

Senior Platform Engineer | Vertex Data | 2017 – 2021
- Designed event-driven ingestion platform processing 8M events/day with Kafka and Python.
- Implemented cost optimization program saving $1.2M annually in cloud spend.
- Mentored platform guild and authored internal RFC process for architecture changes.

Platform Engineer | Loop Commerce | 2014 – 2017
- Built CI/CD systems and container orchestration for e-commerce peak traffic.
- Introduced feature flagging and canary deploy patterns to reduce release risk.

Projects

OpenTelemetry Workshop Series | 2022
- Authored internal workshop materials on tracing, metrics, and structured logging.

Skills
Kubernetes, Terraform, AWS, GCP, Python, Go, Kafka, PostgreSQL, CI/CD, observability, SRE

Certifications
AWS Solutions Architect Professional | 2023

Education
B.S. Computer Science | UC Davis | 2014
`.trim();
