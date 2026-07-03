import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DAILY_FREE_RUN_LIMIT,
  getDailyRunCount,
  getUserIdFromRequest,
  incrementDailyRunCount,
  loadUserEntitlements,
} from "../_shared/entitlements.ts";
import {
  extractCanonicalRunContext,
  reportRunAccessJsonResponse,
  resolveReportRunAccess,
} from "../_shared/reportRunAccess.ts";
import { ANTHROPIC_SONNET_MODEL } from "../_shared/anthropicModel.ts";
import { RECRUITER_PSYCHOLOGY } from "../_shared/humanWritingEngine.ts";
import { applyHiringReportIntegrityGate } from "../_shared/hiringReportIntegrity.ts";
import { compactJdForHiringReport } from "../_shared/hiringReportJdCompaction.ts";
import { shouldConsumeOneTimeCredit } from "../_shared/entitlementGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPELINE_VERSION = "1.2";

// ─── Input limits ────────────────────────────────────────────────────────────
const MAX_RESUME_CHARS = 10000;
/** Per-call Anthropic budget for director-calibration only (multi-step pipeline). */
const DIRECTOR_AI_CALL_TIMEOUT_MS = 180_000;

function logPipelinePhase(requestId: string | undefined, phase: string, startedAt: number): void {
  console.log(JSON.stringify({
    event: "pipeline_phase",
    request_id: requestId ?? null,
    phase,
    duration_ms: Date.now() - startedAt,
  }));
}

function classifyPipelineErrorCode(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("timed out") || lower.includes("aborted") || lower.includes("too long")) {
    return "TIMEOUT";
  }
  if (lower.includes("parse") || lower.includes("unexpected response")) {
    return "PARSE_VALIDATION";
  }
  if (lower.includes("anthropic") || lower.includes("ai call failed")) {
    return "MODEL_ERROR";
  }
  return "EDGE_EXCEPTION";
}

function normalizeText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripResumeHeader(text: string): string {
  const lines = text.split("\n");
  let skipUntil = 0;
  const headerPatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,
    /\b[\w.-]+@[\w.-]+\.\w{2,}\b/,
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
    /^\d+\s+\w+\s+(street|st|ave|avenue|blvd|rd|dr)/i,
    /^(linkedin|github|portfolio)/i,
    /^(http|www\.)/i,
  ];
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (!line) { skipUntil = i + 1; continue; }
    if (headerPatterns.some(p => p.test(line))) { skipUntil = i + 1; continue; }
    break;
  }
  return skipUntil > 0 ? lines.slice(skipUntil).join("\n").trim() : text;
}

const MODELS = [ANTHROPIC_SONNET_MODEL];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function parseJSON<T>(raw: string): T {
  const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(clean) as T;
}

// ─── PROMPT 1: Normalizer ────────────────────────────────────────────────────
const NORMALIZER_SYSTEM = `You extract structured data from resumes and job descriptions.
Do not interpret. Do not score. Extract only.
Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.`;

const NORMALIZER_SCHEMA = `Return structured JSON with exactly this schema:
{
  "target_role_title": string,
  "target_seniority_level": string,
  "core_requirements": [string],
  "leadership_requirements": [string],
  "technical_requirements": [string],
  "commercial_requirements": [string],
  "resume_roles": [
    {
      "company": string,
      "title": string,
      "duration_years": string,
      "bullets": [string]
    }
  ]
}`;

// ─── Role Tier Detection ─────────────────────────────────────────────────────

type RoleTier = "supervisor" | "manager" | "senior_manager" | "director";

interface RoleTierConfig {
  tier: RoleTier;
  label: string;               // e.g. "Supervisor", "Director"
  thresholdLabel: string;       // e.g. "Supervisor Threshold", "Director Threshold"
  signalTiers: string[];        // tier classifications
  dimensions: { name: string; description: string }[];
  levelAnchors: string;
}

const ROLE_TIER_CONFIGS: Record<RoleTier, RoleTierConfig> = {
  supervisor: {
    tier: "supervisor",
    label: "Supervisor",
    thresholdLabel: "Supervisor Threshold",
    signalTiers: ["Individual Contributor Signal", "Emerging Supervisor", "Supervisor-Calibrated", "Scope Inflation Risk"],
    dimensions: [
      { name: "Team Leadership Evidence", description: "Evaluate direct team oversight, scheduling, coaching, performance management, and frontline accountability." },
      { name: "Operational Execution Scope", description: "Evaluate daily operations ownership, process adherence, workflow optimization, and throughput management." },
      { name: "Customer Experience Ownership", description: "Evaluate customer-facing accountability, complaint resolution, service quality metrics, and NPS/CSAT ownership." },
      { name: "Process & Compliance Discipline", description: "Evaluate SOP adherence, safety compliance, audit readiness, and procedural rigor." },
    ],
    levelAnchors: `Supervisor requires ALL of:
- Direct oversight of frontline team (scheduling, coaching, performance reviews)
- Operational process ownership (throughput, quality, compliance)
- Customer escalation handling and service quality accountability
- Demonstrated adherence to SOPs, safety standards, and audit requirements`,
  },
  manager: {
    tier: "manager",
    label: "Manager",
    thresholdLabel: "Manager Threshold",
    signalTiers: ["Individual Contributor Signal", "Emerging Manager", "Manager-Calibrated", "Scope Inflation Risk"],
    dimensions: [
      { name: "Scope of Ownership", description: "Evaluate breadth of functional area, team size, budget scope, and cross-team coordination." },
      { name: "Strategic Contribution", description: "Evaluate planning horizon, goal-setting authority, process improvement leadership, and upward influence." },
      { name: "Accountability Density", description: "Evaluate outcome ownership, KPI anchoring, decision consequence framing, and team performance accountability." },
      { name: "Stakeholder Communication", description: "Evaluate reporting cadence, cross-functional coordination, escalation handling, and leadership communication." },
    ],
    levelAnchors: `Manager requires ALL of:
- Functional area ownership with direct reports and budget responsibility
- Goal-setting and planning authority within defined scope
- KPI-driven accountability for team and functional outcomes
- Regular stakeholder communication and cross-functional coordination`,
  },
  senior_manager: {
    tier: "senior_manager",
    label: "Senior Manager",
    thresholdLabel: "Senior Manager Threshold",
    signalTiers: ["Manager Signal", "Emerging Senior Manager", "Senior Manager-Calibrated", "Scope Inflation Risk"],
    dimensions: [
      { name: "Scope of Ownership", description: "Evaluate multi-team or multi-function scope, organizational impact, and business unit influence." },
      { name: "Strategic Leverage", description: "Evaluate roadmap influence, resource allocation authority, trade-off articulation, and medium-horizon planning." },
      { name: "Accountability Density", description: "Evaluate outcome ownership, KPI anchoring, decision consequence framing, and organizational performance accountability." },
      { name: "Executive Signal Quality", description: "Evaluate financial awareness, risk identification, senior leadership communication, and organizational alignment." },
    ],
    levelAnchors: `Senior Manager requires ALL of:
- Multi-team or multi-function scope with organizational impact
- Resource allocation authority and roadmap influence
- KPI-driven accountability for business outcomes
- Regular communication with senior leadership on strategy and risks`,
  },
  director: {
    tier: "director",
    label: "Director",
    thresholdLabel: "Director Threshold",
    signalTiers: ["Senior IC Signal", "Emerging Director", "Director-Calibrated", "Scope Inflation Risk"],
    dimensions: [
      { name: "Scope of Ownership", description: "Evaluate breadth of product surface area, cross-functional span, org-level exposure, and business impact scope." },
      { name: "Strategic Leverage", description: "Evaluate roadmap authority, long-horizon thinking, tradeoff articulation, portfolio influence, and directional shaping." },
      { name: "Accountability Density", description: "Evaluate outcome ownership, KPI anchoring, decision consequence framing, and post-launch accountability." },
      { name: "Executive Signal Quality", description: "Evaluate financial fluency, risk modeling language, board/VP-level communication cues, and organizational alignment framing." },
    ],
    levelAnchors: `Director requires ALL of:
- Portfolio governance across multiple product lines
- Cross-org dependency orchestration
- Trade-off arbitration between competing priorities
- Measurable business impact attribution (revenue, cost, retention)`,
  },
};

function detectRoleTier(normalizedData: Record<string, unknown>, rawJd?: string): RoleTier {
  const title = String(normalizedData.target_role_title ?? "").toLowerCase();
  const level = String(normalizedData.target_seniority_level ?? "").toLowerCase();
  // Also scan the raw JD text for keywords the normalizer might miss
  const rawJdLower = (rawJd ?? "").toLowerCase();
  const combined = `${title} ${level} ${rawJdLower}`;

  // Supervisor-level keywords (check first — most specific non-leadership tier)
  if (/\b(supervisor|team\s*lead|shift\s*lead|floor\s*manager|crew\s*lead|frontline|retail\s*manager|store\s*manager|assistant\s*manager|coordinator|operations\s*lead)\b/.test(combined)) {
    return "supervisor";
  }
  // Director+ keywords
  if (/\b(director|vp|vice\s*president|head\s+of|chief|c-suite|svp|evp)\b/.test(combined)) {
    return "director";
  }
  // Senior Manager keywords
  if (/\b(senior\s*manager|sr\.?\s*manager|group\s*manager|principal)\b/.test(combined)) {
    return "senior_manager";
  }
  // Manager keywords
  if (/\b(manager|lead)\b/.test(combined) && !/\bsenior\b/.test(combined)) {
    return "manager";
  }
  // Fallback: check seniority level field
  if (/\b(entry|junior|associate|individual\s*contributor|ic)\b/.test(combined)) {
    return "supervisor";
  }
  // Default to supervisor — never assume Director without evidence
  return "supervisor";
}

function buildCalibrationPrompt(config: RoleTierConfig): string {
  const dimJson = config.dimensions.map(d => `    {
      "name": "${d.name}",
      "classification": "Below ${config.thresholdLabel}" | "Near ${config.thresholdLabel}" | "At ${config.thresholdLabel}",
      "strength_signal": string,
      "risk_signal": string
    }`).join(",\n");

  return `You are an institutional ${config.label}-Level Signal Calibration Engine.

Address the user directly in second person throughout all output. Use 'you' and 'your' exclusively. Never use the candidate's name or third-person pronouns (he/his/she/her/they/their) when referring to the candidate or their experience. The product speaks to the user, never about them.

Your task is to evaluate experience against ${config.label}-level ownership thresholds.

This is NOT a resume optimization tool.
This is NOT a rewriting assistant.
This is NOT a keyword matcher.

You must classify signal maturity, hiring-stage friction risk, and ownership integrity at ${config.label} scope.

Do NOT:
- Rewrite content
- Provide resume tips
- Offer encouragement
- Suggest formatting edits
- Use motivational tone

Your role is to deliver a structured executive assessment.

------------------------------------------------------------

EVALUATION FRAMEWORK

Assess across four institutional dimensions relative to ${config.label}-level expectations:

${config.dimensions.map((d, i) => `${i + 1}. ${d.name}
   ${d.description}`).join("\n\n")}

For EACH dimension:
- Classify as: "Below ${config.thresholdLabel}", "Near ${config.thresholdLabel}", or "At ${config.thresholdLabel}"
- Provide one concise strength signal and one concise risk signal.

Use controlled executive language.

------------------------------------------------------------

${config.label.toUpperCase()} SIGNAL TIER CLASSIFICATION

Based on holistic evaluation, assign ONE tier:
${config.signalTiers.map(t => `• ${t}`).join("\n")}

Provide one sharp executive explanation sentence beneath the classification.

------------------------------------------------------------

HIRING STAGE RISK MAPPING

Classify risk at each hiring stage:
• Recruiter Filter Risk: Low / Moderate / Elevated
• Hiring Manager Friction: Low / Moderate / Elevated
• ${config.tier === "supervisor" ? "Senior Reviewer" : "Executive"} Skepticism: Low / Moderate / Elevated

Then identify Primary Friction Stage with a brief explanation (2–3 sentences maximum).

------------------------------------------------------------

SIGNAL INTEGRITY ANALYSIS

Explicitly detect:

Undersignaling Patterns:
- Identify where ownership is minimized or scope is understated.

Ownership Inflation Risk:
- Identify where claims exceed structural proof or impact anchoring.

If none detected, state "No material undersignaling detected." or "No inflation risk detected."

Be precise. Avoid speculation.

------------------------------------------------------------

${config.label.toUpperCase()} RECALIBRATION DIRECTIVES

Provide exactly three strategic recalibration directives. These must focus on ownership framing, leverage positioning, and ${config.tier === "supervisor" ? "operational" : "executive"} consequence anchoring.

Do NOT rewrite the resume. Do NOT provide line edits. Deliver strategic reframing mandates only.

------------------------------------------------------------

Tone requirements:
- Institutional, Analytical, Concise, Executive-grade
- No filler language, no coaching tone, no emojis, no casual phrasing
- Write as if delivering a confidential ${config.tier === "supervisor" ? "hiring review" : "executive report"}.

------------------------------------------------------------

${RECRUITER_PSYCHOLOGY}

------------------------------------------------------------

Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

JSON SCHEMA (return exactly this structure):
{
  "dimensions": [
${dimJson}
  ],
  "director_signal_tier": {
    "tier": ${JSON.stringify(config.signalTiers.join('" | "'))},
    "rationale": string
  },
  "hiring_stage_friction": {
    "recruiter_filter_risk": { "level": "Low" | "Moderate" | "Elevated", "observation": string },
    "hiring_manager_friction": { "level": "Low" | "Moderate" | "Elevated", "observation": string },
    "executive_skepticism": { "level": "Low" | "Moderate" | "Elevated", "observation": string },
    "primary_friction_stage": "Recruiter Filter" | "Hiring Manager Friction" | "${config.tier === "supervisor" ? "Senior Reviewer" : "Executive"} Skepticism",
    "primary_friction_explanation": string
  },
  "pattern_detection": {
    "undersignaling_patterns": [string],
    "ownership_inflation_patterns": [string]
  },
  "recalibration_directives": [string, string, string]
}

ARRAY SIZES:
- dimensions: exactly 4 items in order above
- recalibration_directives: exactly 3 items
- undersignaling_patterns: 1–3 items (use ["No material undersignaling detected."] if none)
- ownership_inflation_patterns: 1–3 items (use ["No inflation risk detected."] if none)`;
}

function buildSignalClassifierSystem(config: RoleTierConfig): string {
  return `You are a Senior Hiring Manager evaluating seniority signals for a ${config.label}-level role.
You MUST return STRICT JSON only. No prose, no markdown, no explanation — only valid JSON.

Evaluate across exactly 7 dimensions:
1. Commercial Impact Attribution
2. End-to-End Ownership Scope
3. Decision Authority
4. Cross-Functional Leadership
5. Lifecycle Governance
6. Risk Compression
7. Narrative Cohesion

For each dimension you MUST provide:
- score: integer 0–25 (no decimals)
- gap_label: one of: ${GAP_LABEL_ENUM.map(g => `"${g}"`).join(", ")}
- evidence_quotes: array of 1–3 SHORT direct quotes from the resume text that support the score
- rationale: string, max 240 characters, explaining the score

LEVEL ANCHORS (${config.label}-level threshold):
${config.levelAnchors}

SCORING CONSTRAINTS:
- If evidence is missing for a dimension, score MUST be <= 12.
- If the resume shows only execution (not strategy/ownership), cap at 15.
- Score 20+ only with clear evidence of ${config.label}-level anchors.

Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.`;
}

// ─── PROMPT 2: Signal Classifier (STRICT v2) ────────────────────────────────
const GAP_LABEL_ENUM = [
  "no_commercial_attribution",
  "limited_ownership_scope",
  "weak_decision_authority",
  "missing_cross_functional_leadership",
  "incomplete_lifecycle_governance",
  "absent_risk_framing",
  "fragmented_narrative",
] as const;

const SIGNAL_CLASSIFIER_SCHEMA = `Return structured JSON with exactly this schema:
{
  "target_level_inferred": string,
  "dimension_scores": {
    "commercial": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string },
    "ownership": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string },
    "authority": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string },
    "cross_functional": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string },
    "lifecycle": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string },
    "risk": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string },
    "narrative": { "score": number, "gap_label": string, "evidence_quotes": [string], "rationale": string }
  }
}

CONSTRAINTS:
- score: integer 0–25
- gap_label: must be one of the fixed enum values provided
- evidence_quotes: 1–3 items, each a short direct quote from resume
- rationale: max 240 characters
- Do NOT include overall_seniority_alignment or top_3_gaps — these are computed server-side`;

// ─── PROMPT 3: Gap Analyzer ──────────────────────────────────────────────────
const GAP_ANALYZER_SYSTEM = `You are a program portfolio strategist evaluating hiring readiness gaps.

Input you will receive:
- dimension_scores: scored seniority signals across 7 dimensions (0–25 each)
- target_role_requirements: structured requirements extracted from the job description and resume

Your task:
1. Determine the priority order of dimensions to address (highest leverage first).
2. Identify up to 4 specific resume bullets or experience areas to upgrade.

Upgrade types allowed (use exact keys):
- commercial_injection
- ownership_elevation
- authority_framing
- cross_functional_leadership
- lifecycle_governance
- risk_compression

Rules:
- Choose maximum 4 rewrite_targets.
- Prioritize highest leverage gaps relative to the target role.
- Do not rewrite content.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.`;

const GAP_ANALYZER_SCHEMA = `Return structured JSON with exactly this schema:
{
  "priority_order": [string],
  "rewrite_targets": [
    {
      "bullet_reference": string,
      "upgrade_type": "commercial_injection" | "ownership_elevation" | "authority_framing" | "cross_functional_leadership" | "lifecycle_governance" | "risk_compression",
      "reason": string
    }
  ]
}

CONSTRAINTS:
- rewrite_targets: 1–4 items maximum
- priority_order: list dimension keys in order of highest remediation leverage`;

// ─── PROMPT 5: Consistency Validator ─────────────────────────────────────────
const CONSISTENCY_VALIDATOR_SYSTEM = `You validate resume consistency. You do not rewrite. You do not coach.

Check for:
1. Metrics alignment — Are quantified claims internally consistent?
2. Timeline realism — Do role durations and scope escalations map to plausible career progression?
3. Scope escalation coherence — Does each role demonstrate logical growth?
4. No fabricated claims — Flag structurally implausible claims.
5. No internal contradictions.

Rules:
- Be precise. Only flag real issues, not stylistic concerns.
- If rewritten bullets are provided, validate them against the original claims.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON:
{
  "status": "pass" | "revise",
  "issues": [string]
}`;

// ─── PROMPT 7: Export Builder ────────────────────────────────────────────────
const EXPORT_BUILDER_SYSTEM = `You build an ATS-safe plain text resume from structured data.

You will receive:
- Original resume text
- Rewritten bullets with their original versions
- Normalizer output (structured roles, skills, etc.)

Your task:
1. Reconstruct a clean, ATS-safe plain text resume with this structure:
   [Name]
   [Contact line]
   Summary
   Skills
   Experience (with rewritten bullets inserted in place of originals)
   Education

2. Build a changes_diff array showing each bullet replacement.

Rules:
- Preserve all original content that was NOT rewritten.
- Insert rewritten bullets (version_b / Conservative Truth by default) in place of originals.
- If you cannot identify the name/contact/education from the resume, use placeholder "[Not provided]".
- Do not add any content not in the original resume or rewrites.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON:
{
  "final_resume_text": string,
  "changes_diff": [
    {
      "original_bullet": string,
      "revised_bullet": string,
      "gap_fixed": string
    }
  ]
}`;

// ─── PROMPT 4: Rewrite Modules (Dual A/B) ───────────────────────────────────
const B_BULLET_RULES = `
VERSION B MANDATORY RULES (Conservative Truth):
1. PRESERVE ALL ORIGINAL METRICS EXACTLY. If the original says "8–15 resolved daily", the B bullet MUST contain "8–15 resolved daily" verbatim. Never round, estimate, or rephrase any number.
2. NEVER introduce placeholder metrics like "[Insert #]", "[Insert %]", "[Insert $]", or any bracketed placeholder. If the original has no metric, the B bullet has no metric.
3. NEVER downgrade ownership level. If the original says "Handled", do NOT rewrite to "participated in", "assisted with", or "supported". Ownership level must stay equal or elevate.
4. ONLY change framing words and context positioning — not facts, numbers, scope, or role. The B bullet describes the SAME experience with stronger signal language, not a different experience.
5. A hiring manager reading the B bullet should recognize the same work described with clearer professional framing.

BOTH VERSIONS — ZERO METRIC FABRICATION:
Do NOT invent percentages, dollar amounts, timeframes, accuracy rates, team sizes, or any quantitative claim not explicitly stated in the original bullet. If the original has no metric, neither version has a metric. Never insert placeholder metrics.`;

const REWRITE_MODULE_PROMPTS: Record<string, string> = {
  commercial_injection: `You elevate resume bullets by adding quantified commercial impact.

Produce TWO versions:
Version A ("Upper-bound Truth"): The strongest credible phrasing assuming the person owned the decision and drove the outcome. Maximize commercial attribution.
Version B ("Conservative Truth"): Reframe the original bullet with stronger signal language while preserving every original fact, metric, and ownership claim exactly.

${B_BULLET_RULES}

Rules for BOTH versions:
- ZERO METRIC FABRICATION: Do NOT invent percentages, dollar amounts, timeframes, accuracy rates, team sizes, or any quantitative claim not explicitly stated in the original bullet. If the original has no metric, the rewritten bullet has no metric.
- NEVER insert placeholder metrics like "[Insert #]", "[Insert %]", "[Insert $]", or any bracketed placeholder.
- No generic phrases like "proactively identified" or "led initiatives".
- Keep bullets scope-specific.
- BANNED VERBS (NEVER USE): leveraged, spearheaded, championed, pioneered, mobilized, orchestrated. Use direct alternatives: led, directed, built, drove, managed, coordinated.
- Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment", or any generic job application phrasing.
- Never write symmetrical bullet structures — vary sentence length and cadence deliberately.
- Lead with evidence before claims — numbers, systems, ownership, outcomes first.
- Use operational language describing what was built, owned, fixed, or decided.
- Write like a capable professional explaining work to a peer, not a resume template.
- Remove adjective stacking and motivational tone entirely.
- Every bullet must sound like a specific human wrote it about a specific job, specific system, and specific outcome.
- Return ONLY valid JSON — no markdown, no code fences.

Return JSON:
{
  "version_a": string,
  "version_b": string,
  "chooser_line": "Use A if you owned the commercial decision or drove the revenue outcome; use B if you supported execution within a broader initiative."
}`,

  ownership_elevation: `You reframe resume bullets to reflect end-to-end product ownership.

Produce TWO versions:
Version A ("Upper-bound Truth"): Strongest credible phrasing — full-stack ownership from discovery through delivery, cross-functional coordination, post-launch stewardship.
Version B ("Conservative Truth"): Reframe the original bullet with stronger ownership signal while preserving every original fact, metric, and ownership claim exactly.

${B_BULLET_RULES}

No generic phrases. Keep scope-specific. Do not fabricate.
Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment".
Never write symmetrical bullet structures — vary sentence length and cadence deliberately.
Lead with evidence before claims. Use operational language. Write like a peer, not a template.
Remove adjective stacking and motivational tone entirely. Every bullet must sound specific.
Return ONLY valid JSON.

Return JSON:
{
  "version_a": string,
  "version_b": string,
  "chooser_line": "Use A if you owned the product end-to-end across discovery, delivery, and post-launch; use B if you contributed to specific lifecycle phases."
}`,

  authority_framing: `You rewrite resume bullets to reflect autonomous decision authority.

Produce TWO versions:
Version A ("Upper-bound Truth"): Strongest credible phrasing — escalation resolution, executive partnership, dependency arbitration, decision ownership.
Version B ("Conservative Truth"): Reframe the original bullet with stronger authority signal while preserving every original fact, metric, and ownership claim exactly.

${B_BULLET_RULES}

No generic phrases. Keep scope-specific. Do not fabricate.
Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment".
Never write symmetrical bullet structures — vary sentence length and cadence deliberately.
Lead with evidence before claims. Use operational language. Write like a peer, not a template.
Remove adjective stacking and motivational tone entirely. Every bullet must sound specific.
Return ONLY valid JSON.

Return JSON:
{
  "version_a": string,
  "version_b": string,
  "chooser_line": "Use A if you made the final call or arbitrated the tradeoff; use B if you influenced the decision through analysis or recommendation."
}`,

  cross_functional_leadership: `You reframe resume bullets to surface cross-functional leadership scope.

Produce TWO versions:
Version A ("Upper-bound Truth"): Led alignment across engineering, design, data, legal, finance, ops. Coordinated stakeholders. Shared accountability.
Version B ("Conservative Truth"): Reframe the original bullet with stronger cross-functional signal while preserving every original fact, metric, and ownership claim exactly.

${B_BULLET_RULES}

No generic phrases. Keep scope-specific. Do not fabricate.
Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment".
Never write symmetrical bullet structures — vary sentence length and cadence deliberately.
Lead with evidence before claims. Use operational language. Write like a peer, not a template.
Remove adjective stacking and motivational tone entirely. Every bullet must sound specific.
Return ONLY valid JSON.

Return JSON:
{
  "version_a": string,
  "version_b": string,
  "chooser_line": "Use A if you led the cross-functional alignment and were accountable for the outcome; use B if you coordinated with partners in a supporting capacity."
}`,

  lifecycle_governance: `You reframe resume bullets to reflect full product lifecycle governance.

Produce TWO versions:
Version A ("Upper-bound Truth"): Owned roadmap, production readiness, planning-through-launch governance, operational rigor frameworks.
Version B ("Conservative Truth"): Reframe the original bullet with stronger lifecycle signal while preserving every original fact, metric, and ownership claim exactly.

${B_BULLET_RULES}

No generic phrases. Keep scope-specific. Do not fabricate.
Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment".
Never write symmetrical bullet structures — vary sentence length and cadence deliberately.
Lead with evidence before claims. Use operational language. Write like a peer, not a template.
Remove adjective stacking and motivational tone entirely. Every bullet must sound specific.
Return ONLY valid JSON.

Return JSON:
{
  "version_a": string,
  "version_b": string,
  "chooser_line": "Use A if you owned the roadmap and governed the full planning-to-launch cycle; use B if you contributed inputs and supported governance processes."
}`,

  risk_compression: `You reframe resume bullets to surface risk identification and mitigation.

Produce TWO versions:
Version A ("Upper-bound Truth"): Risk modeling, dependency identification, mitigation strategy ownership, consequence-aware decision language.
Version B ("Conservative Truth"): Reframe the original bullet with stronger risk signal while preserving every original fact, metric, and ownership claim exactly.

${B_BULLET_RULES}

No generic phrases. Keep scope-specific. Do not fabricate.
Never use: "results-driven", "leveraging synergies", "passionate about", "thrilled to", "dynamic environment", "fast-paced team", "cross-functional alignment".
Never write symmetrical bullet structures — vary sentence length and cadence deliberately.
Lead with evidence before claims. Use operational language. Write like a peer, not a template.
Remove adjective stacking and motivational tone entirely. Every bullet must sound specific.
Return ONLY valid JSON.

Return JSON:
{
  "version_a": string,
  "version_b": string,
  "chooser_line": "Use A if you owned the risk model and drove mitigation decisions; use B if you identified risks and supported the mitigation process."
}`,
};

// DIRECTOR_PROMPT is now built dynamically via buildCalibrationPrompt(config)
// SIGNAL_CLASSIFIER_SYSTEM is now built dynamically via buildSignalClassifierSystem(config)
// ─── QA Fixtures ─────────────────────────────────────────────────────────────
const QA_FIXTURES = [
  {
    name: "Strong Director",
    experience: `VP Product, Acme Corp (2020–2024)
• Owned $45M product portfolio spanning 3 product lines, 4 engineering teams (28 engineers), design, and data science.
• Drove 32% YoY revenue growth by restructuring pricing tiers and launching enterprise self-serve; reduced CAC by 18%.
• Arbitrated cross-org trade-offs between platform reliability and feature velocity, aligning CTO and CFO on quarterly investment priorities.
• Governed full product lifecycle from discovery through post-launch, including production readiness reviews and OKR-driven roadmap planning.
• Modeled and mitigated churn risk across SMB segment, compressing 90-day churn from 14% to 8.5% through targeted intervention framework.`,
    jd: `Director of Product Management — Enterprise Platform. Requires: portfolio governance, cross-org stakeholder management, P&L ownership, staff-level leadership.`,
  },
  {
    name: "Senior IC",
    experience: `Senior Product Manager, Beta Inc (2021–2024)
• Managed backlog for mobile payments feature, collaborating with 1 engineering squad of 6.
• Wrote PRDs and user stories for checkout flow redesign.
• Participated in sprint planning and retrospectives.
• Supported QA testing and helped triage production bugs.
• Presented feature demos to product leadership during monthly reviews.`,
    jd: `Director of Product — Payments Platform. Requires: P&L accountability, multi-team leadership, executive stakeholder management, strategic roadmap ownership.`,
  },
  {
    name: "Emerging Director",
    experience: `Senior Product Manager → Product Lead, Gamma Tech (2019–2024)
• Led 2 cross-functional squads (12 people) delivering marketplace matching platform; increased GMV 22% in 12 months.
• Owned roadmap for seller experience vertical, presenting quarterly plans to VP Product and CEO.
• Coordinated with legal, finance, and ops on regulatory compliance for 3 new market launches.
• Introduced production readiness checklist adopted across product org (8 teams).
• Identified and escalated platform scalability risk; partnered with CTO to secure $2M infrastructure investment.`,
    jd: `Director of Product — Marketplace. Requires: multi-squad leadership, roadmap authority, executive communication, commercial impact ownership.`,
  },
];

// ─── AI caller ───────────────────────────────────────────────────────────────
async function callAI(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs = DIRECTOR_AI_CALL_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_SONNET_MODEL,
        max_tokens: 8192,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    clearTimeout(timeout);
    if (aiRes.ok) {
      const data = await aiRes.json();
      const content = data.content?.[0]?.text || "";
      if (content) return content;
      throw new Error("Anthropic returned empty content.");
    }
    const errBody = await aiRes.text();
    console.error("Anthropic error:", aiRes.status, errBody);
    try {
      const parsed = JSON.parse(errBody);
      throw new Error(`Anthropic ${aiRes.status}: ${parsed.error?.message || errBody}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message.startsWith("Anthropic")) throw parseErr;
      throw new Error(`Anthropic ${aiRes.status}: ${errBody.slice(0, 300)}`);
    }
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.message.startsWith("Anthropic")) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("aborted")) {
      throw new Error(`Anthropic request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw new Error(`AI call failed: ${msg}`);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface RewriteTarget {
  bullet_reference: string;
  upgrade_type: string;
  reason: string;
  version_a?: string | null;
  version_b?: string | null;
  chooser_line?: string | null;
  // Legacy compat
  rewritten_bullet?: string | null;
}

interface GapAnalyzerOutput {
  priority_order: string[];
  rewrite_targets: RewriteTarget[];
}

// ─── Artifact storage helper ─────────────────────────────────────────────────

async function storeArtifact(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  stepName: string,
  payload: unknown,
) {
  try {
    await supabase.from("run_artifacts").insert({
      run_id: runId,
      step_name: stepName,
      payload_json: payload,
    });
  } catch (e) {
    console.error(`Failed to store artifact ${stepName}:`, e);
  }
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

async function runPipeline(
  apiKey: string,
  experience: string,
  jd: string | undefined,
  deterministic: boolean = true,
  requestId?: string,
): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const inputHash = await sha256(
    (experience || "") + "|" + (jd || "") + "|" + PIPELINE_VERSION
  );

  // ── Deterministic replay check ──────────────────────────────────────────────
  if (deterministic) {
    const { data: cached } = await supabase
      .from("runs")
      .select("id, final_package")
      .eq("input_hash", inputHash)
      .eq("status", "completed")
      .eq("deterministic", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.final_package) {
      console.log("Deterministic replay: returning cached run", cached.id);
      return { ...(cached.final_package as Record<string, unknown>), run_id: cached.id, _replay: true };
    }
  }

  // ── Create run record ───────────────────────────────────────────────────────
  const { data: runRow } = await supabase
    .from("runs")
    .insert({
      input_hash: inputHash,
      deterministic,
      pipeline_version: PIPELINE_VERSION,
      status: "running",
    })
    .select("id")
    .single();

  const runId = runRow?.id ?? crypto.randomUUID();
  const pipelineStartedAt = Date.now();

  // ── 1. Normalizer ───────────────────────────────────────────────────────────
  console.log("[1/6] Normalizer");
  let normalized: Record<string, unknown> = {};
  const normalizerStartedAt = Date.now();
  try {
    const normInput = jd?.trim()
      ? `JOB DESCRIPTION:\n${jd.trim()}\n\nRESUME:\n${experience}`
      : `RESUME:\n${experience}`;
    const raw = await callAI(apiKey, `${NORMALIZER_SYSTEM}\n\n${NORMALIZER_SCHEMA}`, normInput);
    normalized = parseJSON<Record<string, unknown>>(raw);
    console.log("  → target_role_title:", normalized.target_role_title);
    await storeArtifact(supabase, runId, "step_1_normalizer", { raw, parsed: normalized });
  } catch (e) {
    console.error("  ✗ Normalizer failed (non-fatal):", e instanceof Error ? e.message : e);
  } finally {
    logPipelinePhase(requestId, "normalizer", normalizerStartedAt);
  }

  // ── Shared context ──────────────────────────────────────────────────────────
  const sharedContext = Object.keys(normalized).length > 0
    ? `STRUCTURED INPUT (pre-processed):\n${JSON.stringify(normalized, null, 2)}\n\nRESUME:\n${experience}${jd?.trim() ? `\n\nJOB DESCRIPTION:\n${jd.trim()}` : ""}`
    : jd?.trim()
      ? `RESUME:\n${experience}\n\nJOB DESCRIPTION:\n${jd.trim()}`
      : `RESUME:\n${experience}`;

  // ── Detect role tier from normalizer output ─────────────────────────────────
  const detectedTier = detectRoleTier(normalized, jd);
  const tierConfig = ROLE_TIER_CONFIGS[detectedTier];
  console.log(`  → Detected role tier: ${detectedTier} (${tierConfig.label})`);
  await storeArtifact(supabase, runId, "step_1b_role_tier", { detected_tier: detectedTier, label: tierConfig.label, target_role_title: normalized.target_role_title, target_seniority_level: normalized.target_seniority_level });

  const calibrationPrompt = buildCalibrationPrompt(tierConfig);
  const classifierSystem = buildSignalClassifierSystem(tierConfig);

  // ── 2. Signal Classifier + Calibration (parallel) ──────────────────────────
  console.log("[2/6] Signal Classifier + Calibration (parallel)");
  const parallelStartedAt = Date.now();
  const [calibrationRaw, classifierRaw] = await Promise.all([
    callAI(apiKey, calibrationPrompt, sharedContext),
    callAI(apiKey, `${classifierSystem}\n\n${SIGNAL_CLASSIFIER_SCHEMA}`, sharedContext),
  ]);
  logPipelinePhase(requestId, "calibration_and_classifier", parallelStartedAt);

  // Calibration (required)
  let result: Record<string, unknown>;
  try {
    result = parseJSON<Record<string, unknown>>(calibrationRaw);
    result._detected_role_tier = detectedTier;
    result._role_tier_label = tierConfig.label;
    console.log(`  → ${tierConfig.label} Calibration: ok`);
    await storeArtifact(supabase, runId, "step_2_calibration", { raw: calibrationRaw, parsed: result, role_tier: detectedTier });
  } catch {
    throw new Error(`Failed to parse ${tierConfig.label} Calibration response. Please try again.`);
  }

  // Signal Classifier (non-fatal)
  let classifierParsed: Record<string, unknown> | null = null;
  try {
    classifierParsed = parseJSON<Record<string, unknown>>(classifierRaw);

    // ── Deterministic override: overall alignment + top 3 gaps ──
    if (classifierParsed?.dimension_scores) {
      const scores = classifierParsed.dimension_scores as Record<string, { score: number; gap_label: string; evidence_quotes?: string[]; rationale?: string }>;
      const total = Object.values(scores).reduce((sum, d) => sum + d.score, 0);
      const pct = (total / 175) * 100;

      classifierParsed.overall_seniority_alignment =
        pct >= 80 ? "Strong Alignment" :
        pct >= 60 ? "Moderate Alignment" :
        pct >= 40 ? "Partial Alignment" : "Weak Alignment";
      classifierParsed.total_score = total;

      classifierParsed.top_3_gaps = Object.entries(scores)
        .sort(([, a], [, b]) => a.score - b.score)
        .slice(0, 3)
        .map(([, d]) => d.gap_label || "unknown");

      console.log(`  → Deterministic scoring: ${total}/175 (${pct.toFixed(1)}%) → ${classifierParsed.overall_seniority_alignment}`);
    }

    result.signal_classifier = classifierParsed;
    console.log("  → Signal Classifier: ok — inferred:", classifierParsed.target_level_inferred);
    await storeArtifact(supabase, runId, "step_2_classifier", { raw: classifierRaw, parsed: classifierParsed });
  } catch {
    console.error("  ✗ Signal Classifier parse failed (non-fatal)");
    result.signal_classifier = null;
  }

  // ── 3. Gap Analyzer ─────────────────────────────────────────────────────────
  console.log("[3/6] Gap Analyzer");
  let gapOutput: GapAnalyzerOutput | null = null;
  const gapAnalyzerStartedAt = Date.now();
  if (classifierParsed) {
    const gapInput = {
      dimension_scores: classifierParsed.dimension_scores,
      target_role_requirements: {
        target_role_title: normalized.target_role_title ?? null,
        target_seniority_level: normalized.target_seniority_level ?? null,
        core_requirements: normalized.core_requirements ?? [],
        leadership_requirements: normalized.leadership_requirements ?? [],
        commercial_requirements: normalized.commercial_requirements ?? [],
      },
    };
    try {
      const raw = await callAI(
        apiKey,
        `${GAP_ANALYZER_SYSTEM}\n\n${GAP_ANALYZER_SCHEMA}`,
        `INPUT DATA:\n${JSON.stringify(gapInput, null, 2)}`,
      );
      gapOutput = parseJSON<GapAnalyzerOutput>(raw);
      result.gap_analyzer = gapOutput;
      console.log(`  → Gap Analyzer: ok — ${gapOutput.rewrite_targets.length} targets`);
      await storeArtifact(supabase, runId, "step_3_gap_analyzer", { raw, parsed: gapOutput });
    } catch {
      console.error("  ✗ Gap Analyzer failed (non-fatal)");
      result.gap_analyzer = null;
    }
  } else {
    result.gap_analyzer = null;
  }
  logPipelinePhase(requestId, "gap_analyzer", gapAnalyzerStartedAt);

  // ── 4. Rewrite Modules (parallel, dual A/B) ────────────────────────────────
  console.log("[4/6] Rewrite Modules (dual A/B)");
  const rewritesStartedAt = Date.now();
  let rewrittenTargets: RewriteTarget[] = gapOutput?.rewrite_targets ?? [];

  if (gapOutput?.rewrite_targets?.length) {
    const jobs = gapOutput.rewrite_targets.map(async (target): Promise<RewriteTarget> => {
      const modulePrompt = REWRITE_MODULE_PROMPTS[target.upgrade_type];
      if (!modulePrompt) {
        console.warn(`  ⚠ No module for upgrade_type="${target.upgrade_type}"`);
        return { ...target, version_a: null, version_b: null, chooser_line: null };
      }
      const userContent = [
        `ORIGINAL BULLET:\n${target.bullet_reference}`,
        `UPGRADE CONTEXT:\n${target.reason}`,
        `RESUME CONTEXT (reference only):\n${experience.slice(0, 1500)}`,
      ].join("\n\n");
      try {
        const raw = await callAI(apiKey, modulePrompt, userContent);
        const parsed = parseJSON<{ version_a?: string; version_b?: string; chooser_line?: string; rewritten_bullet?: string }>(raw);
        console.log(`  → [${target.upgrade_type}]: ok (A/B)`);
        return {
          ...target,
          version_a: parsed.version_a ?? parsed.rewritten_bullet ?? null,
          version_b: parsed.version_b ?? null,
          chooser_line: parsed.chooser_line ?? null,
          rewritten_bullet: parsed.version_a ?? parsed.rewritten_bullet ?? null,
        };
      } catch {
        console.error(`  ✗ Rewrite module [${target.upgrade_type}] failed (non-fatal)`);
        return { ...target, version_a: null, version_b: null, chooser_line: null };
      }
    });
    rewrittenTargets = await Promise.all(jobs);
    await storeArtifact(supabase, runId, "step_4_rewrites", rewrittenTargets);
  }
  logPipelinePhase(requestId, "rewrite_modules", rewritesStartedAt);

  // ── 5. Replace bullets ──────────────────────────────────────────────────────
  console.log("[5/6] Replacing bullets");
  if (gapOutput && rewrittenTargets.length) {
    (result.gap_analyzer as Record<string, unknown>).rewrite_targets = rewrittenTargets;
  }
  await storeArtifact(supabase, runId, "step_5_bullet_replacement", { rewrite_targets: rewrittenTargets });

  // ── 6. Consistency Validator ────────────────────────────────────────────────
  console.log("[6/7] Consistency Validator");
  const validatorStartedAt = Date.now();
  try {
    const rewrittenBullets = rewrittenTargets
      .filter((t) => t.version_b || t.version_a || t.rewritten_bullet)
      .map((t) => `[${t.upgrade_type}] ${t.version_b || t.version_a || t.rewritten_bullet}`);

    const validatorContent = [
      `ORIGINAL RESUME:\n${experience}`,
      jd?.trim() ? `JOB DESCRIPTION:\n${jd.trim()}` : "",
      rewrittenBullets.length
        ? `REWRITTEN BULLETS (validate against originals):\n${rewrittenBullets.join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");

    const raw = await callAI(apiKey, CONSISTENCY_VALIDATOR_SYSTEM, validatorContent);
    const cvParsed = parseJSON<{ status: string; issues: string[] }>(raw);
    // Convert internal variable names to plain English in issue descriptions
    const upgradeTypeLabels: Record<string, string> = {
      authority_framing: "Authority Framing",
      commercial_injection: "Commercial Impact",
      ownership_elevation: "Ownership Elevation",
      cross_functional_leadership: "Cross-Functional Leadership",
      lifecycle_governance: "Lifecycle Governance",
      risk_compression: "Risk Compression",
    };
    if (cvParsed.issues?.length) {
      cvParsed.issues = cvParsed.issues.map((issue) =>
        issue.replace(/\[([a-z_]+)\]/g, (match, key) => upgradeTypeLabels[key] ? `[${upgradeTypeLabels[key]}]` : match)
      );
    }
    result.consistency_validator = cvParsed;
    console.log("  → status:", cvParsed.status);
    await storeArtifact(supabase, runId, "step_6_consistency_validator", { raw, parsed: cvParsed });
  } catch {
    console.error("  ✗ Consistency Validator failed (non-fatal)");
    result.consistency_validator = null;
  } finally {
    logPipelinePhase(requestId, "consistency_validator", validatorStartedAt);
  }

  // ── 7. Export Builder ──────────────────────────────────────────────────────
  console.log("[7/7] Export Builder");
  const exportStartedAt = Date.now();
  let exportReady = false;
  try {
    const rewriteContext = rewrittenTargets
      .filter((t) => t.version_b || t.version_a || t.rewritten_bullet)
      .map((t) => JSON.stringify({
        original: t.bullet_reference,
        rewritten: t.version_b || t.version_a || t.rewritten_bullet,
        upgrade_type: t.upgrade_type,
      }))
      .join("\n");

    const exportInput = [
      `ORIGINAL RESUME:\n${experience}`,
      Object.keys(normalized).length > 0
        ? `NORMALIZER OUTPUT:\n${JSON.stringify(normalized, null, 2)}`
        : "",
      rewriteContext
        ? `REWRITTEN BULLETS:\n${rewriteContext}`
        : "",
    ].filter(Boolean).join("\n\n");

    const raw = await callAI(apiKey, EXPORT_BUILDER_SYSTEM, exportInput);
    const exportParsed = parseJSON<{ final_resume_text: string; changes_diff: Array<{ original_bullet: string; revised_bullet: string; gap_fixed: string }> }>(raw);
    result.export_builder = exportParsed;
    exportReady = true;
    console.log(`  → Export Builder: ok — ${exportParsed.changes_diff.length} changes`);
    await storeArtifact(supabase, runId, "step_7_export_builder", { raw, parsed: exportParsed });
  } catch {
    console.error("  ✗ Export Builder failed (non-fatal)");
    result.export_builder = null;
  } finally {
    logPipelinePhase(requestId, "export_builder", exportStartedAt);
  }

  // ── Finalize run record ─────────────────────────────────────────────────────
  const sc = classifierParsed as Record<string, unknown> | null;
  const totalScore = (sc?.total_score as number) ?? null;
  const pctVal = totalScore !== null ? Number(((totalScore / 175) * 100).toFixed(1)) : null;

  const exportData = result.export_builder as { final_resume_text?: string; changes_diff?: unknown[] } | null;

  await supabase.from("runs").update({
    status: "completed",
    final_package: result,
    total_score: totalScore,
    pct: pctVal,
    overall_seniority_alignment: (sc?.overall_seniority_alignment as string) ?? null,
    top_3_gaps: (sc?.top_3_gaps as string[]) ?? null,
    model_name: MODELS[0],
    final_resume_text: exportData?.final_resume_text ?? null,
    changes_diff: exportData?.changes_diff ?? null,
    export_ready: exportReady,
  }).eq("id", runId);

  result._normalized = normalized;
  result.run_id = runId;
  result.pipeline_version = PIPELINE_VERSION;
  applyHiringReportIntegrityGate(result, experience, jd?.trim() ?? "");
  logPipelinePhase(requestId, "pipeline_total", pipelineStartedAt);
  return result;
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const authenticatedUserId = await getUserIdFromRequest(req);
    const body = await req.json();
    const { experience, jd, deterministic = true, qa_mode = false } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    if (qa_mode) {
      if (!authenticatedUserId) {
        return new Response(JSON.stringify({
          status: "error",
          request_id: requestId,
          error_code: "AUTH_REQUIRED",
          message: "Sign in is required to run director QA mode.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const qaEntitlements = await loadUserEntitlements(sb, authenticatedUserId);
      if (!qaEntitlements.isAdmin) {
        return new Response(JSON.stringify({
          status: "error",
          request_id: requestId,
          error_code: "FORBIDDEN",
          message: "Director QA mode is restricted to administrators.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!authenticatedUserId) {
      return new Response(JSON.stringify({
        status: "error",
        request_id: requestId,
        error_code: "AUTH_REQUIRED",
        message: "Sign in to generate your Signal Positioning Report.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let entitlements = null;
    let reportRunAccess = false;
    if (authenticatedUserId) {
      entitlements = await loadUserEntitlements(sb, authenticatedUserId);
      if (!qa_mode) {
        const runAccess = await resolveReportRunAccess(
          sb,
          authenticatedUserId,
          entitlements,
          extractCanonicalRunContext(body as Record<string, unknown>),
          { requireCanonical: shouldConsumeOneTimeCredit(entitlements) },
        );
        if (!runAccess.ok) {
          return reportRunAccessJsonResponse(runAccess, corsHeaders, requestId);
        }
        reportRunAccess = runAccess.reportRunAccess;
        const proOrReportAccess =
          entitlements.isProSubscriber ||
          entitlements.isAdmin ||
          entitlements.isProEntitled ||
          reportRunAccess;
        if (!proOrReportAccess) {
          const dailyRuns = await getDailyRunCount(sb, authenticatedUserId);
          if (dailyRuns >= DAILY_FREE_RUN_LIMIT) {
            return new Response(JSON.stringify({
              status: "error",
              request_id: requestId,
              error_code: "RATE_LIMIT",
              message: `Daily free limit reached (${DAILY_FREE_RUN_LIMIT} runs per day). Upgrade to Signalyz Pro for unlimited access.`,
              limit_reached: true,
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else if (
          shouldConsumeOneTimeCredit(entitlements) &&
          !reportRunAccess
        ) {
          return new Response(JSON.stringify({
            status: "error",
            request_id: requestId,
            error_code: "PRO_REQUIRED",
            message: "Signalyz Pro or an active report credit is required.",
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // --- Structured logging ---
    console.log(JSON.stringify({
      event: "request_start",
      request_id: requestId,
      function: "director-calibration",
      timestamp: new Date().toISOString(),
      resume_text_length: typeof experience === "string" ? experience.length : 0,
      jd_text_length: typeof jd === "string" ? jd.length : 0,
      total_payload_length: (typeof experience === "string" ? experience.length : 0) + (typeof jd === "string" ? jd.length : 0),
      authenticated: !!authenticatedUserId,
      entitlement_source: entitlements?.entitlementSource ?? null,
      qa_mode,
    }));

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    // ── QA Mode: run all 3 fixtures ──────────────────────────────────────────
    if (qa_mode) {
      console.log("=== QA MODE: Running 3 fixtures ===");
      const results = [];
      for (const fixture of QA_FIXTURES) {
        try {
          const r = await runPipeline(apiKey, fixture.experience, fixture.jd, true, requestId);
          results.push({
            name: fixture.name,
            run_id: r.run_id,
            total_score: (r.signal_classifier as Record<string, unknown>)?.total_score ?? null,
            top_3_gaps: (r.signal_classifier as Record<string, unknown>)?.top_3_gaps ?? [],
            replay: r._replay ?? false,
            status: "ok",
          });
        } catch (e) {
          results.push({
            name: fixture.name,
            run_id: null,
            total_score: null,
            top_3_gaps: [],
            replay: false,
            status: e instanceof Error ? e.message : "error",
          });
        }
      }
      return new Response(JSON.stringify({ qa_results: results, request_id: requestId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Normal mode ──────────────────────────────────────────────────────────
    if (!experience?.trim()) {
      console.log(JSON.stringify({ event: "validation_error", request_id: requestId, reason: "empty_experience" }));
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INVALID_INPUT", message: "Please paste more of your Experience section so Signalyz can analyze your signal.", details: { resume_len: 0 } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize and enforce limits
    let cleanExperience = normalizeText(stripResumeHeader(experience.trim()));
    if (cleanExperience.length > MAX_RESUME_CHARS) {
      cleanExperience = cleanExperience.slice(0, MAX_RESUME_CHARS);
    }

    if (cleanExperience.length < 100) {
      return new Response(JSON.stringify({ status: "error", request_id: requestId, error_code: "INPUT_TOO_SHORT", message: "Please paste more of your resume or experience section so Signalyz can analyze your signal.", details: { resume_len: cleanExperience.length } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleanJd = typeof jd === "string" ? jd.trim() : "";
    if (cleanJd) {
      const compaction = compactJdForHiringReport(cleanJd);
      cleanJd = compaction.compacted;
      console.log(JSON.stringify({
        event: "jd_compaction",
        request_id: requestId,
        original_length: compaction.originalLength,
        compacted_length: compaction.compactedLength,
        removed_block_count: compaction.removedBlockCount,
      }));
    }

    console.log(JSON.stringify({ event: "pipeline_start", request_id: requestId, experience_length: cleanExperience.length, jd_length: cleanJd.length }));
    const result = await runPipeline(apiKey, cleanExperience, cleanJd || undefined, deterministic, requestId);
    console.log(JSON.stringify({ event: "pipeline_complete", request_id: requestId }));

    if (authenticatedUserId && entitlements && !qa_mode && !entitlements.isProEntitled) {
      await incrementDailyRunCount(sb, authenticatedUserId);
    }

    return new Response(JSON.stringify({ status: "success", request_id: requestId, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack || "" : "";
    const errorCode = classifyPipelineErrorCode(message);
    console.error(JSON.stringify({
      event: "request_error",
      request_id: requestId,
      function: "director-calibration",
      error_code: errorCode,
      error_message: message,
      error_stack: stack.slice(0, 500),
      timestamp: new Date().toISOString(),
    }));
    const friendly =
      errorCode === "TIMEOUT" ? "Analysis took too long. Please retry." :
      message.includes("Rate limits") ? "Too many requests. Please wait a moment and try again." :
      message.includes("unavailable") ? "AI service is temporarily busy. Please try again." :
      errorCode === "PARSE_VALIDATION" ? "The AI returned an unexpected response. Please try again." :
      errorCode === "MODEL_ERROR" ? "Analysis engine temporarily unavailable. Please try again." :
      "Analysis engine temporarily unavailable. Please try again.";
    return new Response(JSON.stringify({
      status: "error",
      request_id: requestId,
      error_code: errorCode,
      message: friendly,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
