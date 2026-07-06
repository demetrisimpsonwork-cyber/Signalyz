/** Signalyzed Standard™ — Canonical Resume AST (Phase 1). Pure types, no I/O. */

export const RESUME_AST_PARSE_VERSION = "1.1.0";

export type AstLinkType =
  | "email"
  | "phone"
  | "linkedin"
  | "github"
  | "portfolio"
  | "website"
  | "other";

export type BulletSource =
  | "experience"
  | "project"
  | "education"
  | "summary"
  | "custom"
  | "other";

export type AstConfidence = "high" | "medium" | "low";

export type CanonicalSectionKind =
  | "header"
  | "professional_summary"
  | "experience"
  | "projects"
  | "education"
  | "skills"
  | "certifications"
  | "links"
  | "awards"
  | "custom";

export interface AstBullet {
  id: string;
  source: BulletSource;
  role?: string;
  company?: string;
  section: string;
  text: string;
  metrics: string[];
  technologies: string[];
  ownershipSignals: string[];
  aiSignals: string[];
  leadershipSignals: string[];
  confidence: AstConfidence;
  fingerprint?: string;
}

export interface ResumeMetadata {
  parseVersion: string;
  sourceFormat: "plain_text";
  lineCount: number;
  fingerprint?: string;
}

export interface ResumeHeader {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  /** Unparsed header lines preserved for round-trip fidelity. */
  rawLines: string[];
}

export interface ProfessionalSummary {
  text: string;
  bullets: AstBullet[];
  fingerprint?: string;
}

export interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  location?: string;
  dates: string;
  bullets: AstBullet[];
  fingerprint?: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  description?: string;
  dates?: string;
  bullets: AstBullet[];
  fingerprint?: string;
}

export interface EducationEntry {
  id: string;
  degree?: string;
  institution: string;
  year?: string;
  bullets: AstBullet[];
  fingerprint?: string;
}

export interface SkillEntry {
  id: string;
  name: string;
  category?: string;
}

export interface CertificationEntry {
  id: string;
  name: string;
  issuer?: string;
  year?: string;
}

export interface LinkEntry {
  id: string;
  type: AstLinkType;
  label: string;
  value: string;
  normalizedValue: string;
  sourceSection: string;
  confidence: AstConfidence;
  /** @deprecated use type/value — kept for validator compatibility */
  url: string;
  valid: boolean;
}

export interface ResumeLinkPreservationReport {
  event: "resume_link_preservation_report";
  request_id?: string;
  source_link_count: number;
  generated_link_count_before: number;
  generated_link_count_after: number;
  restored_link_count: number;
  link_types_restored: AstLinkType[];
  duplicate_link_count: number;
  broken_link_count: number;
  preservation_ok: boolean;
  run_time_ms: number;
}

export interface ResumeBulletPreservationReport {
  event: "resume_bullet_preservation_report";
  request_id?: string;
  protected_bullet_count: number;
  weakened_bullet_count: number;
  restored_bullet_count: number;
  duplicate_bullet_count: number;
  hallucination_guard_passed: boolean;
  preservation_ok: boolean;
  affected_sections: string[];
  run_time_ms: number;
}

export interface AwardEntry {
  id: string;
  title: string;
  issuer?: string;
  year?: string;
}

export interface CustomSection {
  id: string;
  title: string;
  kind: CanonicalSectionKind;
  lines: string[];
  bullets: AstBullet[];
  fingerprint?: string;
}

export interface ResumeAst {
  metadata: ResumeMetadata;
  header: ResumeHeader;
  professionalSummary: ProfessionalSummary;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
  certifications: CertificationEntry[];
  links: LinkEntry[];
  awards: AwardEntry[];
  customSections: CustomSection[];
  /** Flat index of every bullet in document order. */
  bullets: AstBullet[];
}

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationDiagnostic {
  code: string;
  severity: ValidationSeverity;
  message: string;
  section?: string;
  bulletId?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
}

export interface ParseResumeAstResult {
  ast: ResumeAst;
  diagnostics: ValidationDiagnostic[];
  parseTimeMs: number;
}

export interface ResumeAstObservabilitySummary {
  resume_sections: string[];
  bullet_count: number;
  experience_count: number;
  project_count: number;
  skill_count: number;
  validation_errors: number;
  fingerprint: string;
  parse_time_ms: number;
}
