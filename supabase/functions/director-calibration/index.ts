import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPELINE_VERSION = "1.2";

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
];

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

const SIGNAL_CLASSIFIER_SYSTEM = `You are a Senior Executive Hiring Manager evaluating seniority signals.
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

LEVEL ANCHORS (Staff-level threshold):
Staff requires ALL of:
- Portfolio governance across multiple product lines
- Cross-org dependency orchestration
- Trade-off arbitration between competing priorities
- Measurable business impact attribution (revenue, cost, retention)

SCORING CONSTRAINTS:
- If evidence is missing for a dimension, score MUST be <= 12.
- If the resume shows only execution (not strategy/ownership), cap at 15.
- Score 20+ only with clear evidence of Staff-level anchors.

Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.`;

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
- Insert rewritten bullets (version_a by default) in place of originals.
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
const REWRITE_MODULE_PROMPTS: Record<string, string> = {
  commercial_injection: `You elevate resume bullets by adding quantified commercial impact.

Produce TWO versions:
Version A ("Upper-bound Truth"): The strongest credible phrasing assuming the person owned the decision and drove the outcome. Maximize commercial attribution.
Version B ("Conservative Truth"): A careful phrasing assuming the person supported execution rather than owning authority. Still metric-forward but scope-limited.

Rules:
- Preserve original claim facts exactly.
- No generic phrases like "proactively identified" or "spearheaded initiatives".
- Keep bullets metric-forward and scope-specific.
- If no metrics available, insert placeholder: [Insert % or $].
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
Version B ("Conservative Truth"): Careful phrasing — contributed to lifecycle phases but did not solely own.

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
Version B ("Conservative Truth"): Careful phrasing — influenced decisions, provided recommendations, supported executive review.

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
Version A ("Upper-bound Truth"): Led alignment across engineering, design, data, legal, finance, ops. Mobilized stakeholders. Shared accountability.
Version B ("Conservative Truth"): Coordinated with cross-functional partners. Participated in alignment. Supported stakeholder communication.

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
Version B ("Conservative Truth"): Contributed to roadmap inputs, participated in launch reviews, supported operational processes.

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
Version B ("Conservative Truth"): Flagged risks, contributed to mitigation plans, supported risk review processes.

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

const DIRECTOR_PROMPT = `You are an institutional Director-Level Signal Calibration Engine.

Address the user directly in second person throughout all output. Use 'you' and 'your' exclusively. Never use the candidate's name or third-person pronouns (he/his/she/her/they/their) when referring to the candidate or their experience. The product speaks to the user, never about them.

Your task is to evaluate a Product Leader's resume, experience section, or bullet against Director-level ownership thresholds.

This is NOT a resume optimization tool.
This is NOT a rewriting assistant.
This is NOT a keyword matcher.

You must classify signal maturity, hiring-stage friction risk, and ownership integrity at Director scope.

Do NOT:
- Rewrite content
- Provide resume tips
- Offer encouragement
- Suggest formatting edits
- Use motivational tone

Your role is to deliver a structured executive assessment.

------------------------------------------------------------

EVALUATION FRAMEWORK

Assess across four institutional dimensions relative to Director-level expectations:

1. Scope of Ownership
   Evaluate breadth of product surface area, cross-functional span, org-level exposure, and business impact scope.

2. Strategic Leverage
   Evaluate roadmap authority, long-horizon thinking, tradeoff articulation, portfolio influence, and directional shaping.

3. Accountability Density
   Evaluate outcome ownership, KPI anchoring, decision consequence framing, and post-launch accountability.

4. Executive Signal Quality
   Evaluate financial fluency, risk modeling language, board/VP-level communication cues, and organizational alignment framing.

For EACH dimension:
- Classify as: "Below Director Threshold", "Near Director Threshold", or "At Director Threshold"
- Provide one concise strength signal and one concise risk signal.

Use controlled executive language.

------------------------------------------------------------

DIRECTOR SIGNAL TIER CLASSIFICATION

Based on holistic evaluation, assign ONE tier:
• Senior IC Signal
• Emerging Director
• Director-Calibrated
• Scope Inflation Risk

Provide one sharp executive explanation sentence beneath the classification.

------------------------------------------------------------

HIRING STAGE RISK MAPPING

Classify risk at each hiring stage:
• Recruiter Filter Risk: Low / Moderate / Elevated
• Hiring Manager Friction: Low / Moderate / Elevated
• Executive Skepticism: Low / Moderate / Elevated

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

DIRECTOR RECALIBRATION DIRECTIVES

Provide exactly three strategic recalibration directives. These must focus on ownership framing, leverage positioning, and executive consequence anchoring.

Do NOT rewrite the resume. Do NOT provide line edits. Deliver strategic reframing mandates only.

------------------------------------------------------------

Tone requirements:
- Institutional, Analytical, Concise, Executive-grade
- No filler language, no coaching tone, no emojis, no casual phrasing
- Write as if delivering a confidential executive report to a VP of Product.

------------------------------------------------------------

Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

JSON SCHEMA (return exactly this structure):
{
  "dimensions": [
    {
      "name": "Scope of Ownership",
      "classification": "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    },
    {
      "name": "Strategic Leverage",
      "classification": "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    },
    {
      "name": "Accountability Density",
      "classification": "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    },
    {
      "name": "Executive Signal Quality",
      "classification": "Below Director Threshold" | "Near Director Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    }
  ],
  "director_signal_tier": {
    "tier": "Senior IC Signal" | "Emerging Director" | "Director-Calibrated" | "Scope Inflation Risk",
    "rationale": string
  },
  "hiring_stage_friction": {
    "recruiter_filter_risk": { "level": "Low" | "Moderate" | "Elevated", "observation": string },
    "hiring_manager_friction": { "level": "Low" | "Moderate" | "Elevated", "observation": string },
    "executive_skepticism": { "level": "Low" | "Moderate" | "Elevated", "observation": string },
    "primary_friction_stage": "Recruiter Filter" | "Hiring Manager Friction" | "Executive Skepticism",
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
): Promise<string> {
  for (const model of MODELS) {
    console.log(`Trying model: ${model}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
      clearTimeout(timeout);
      console.log(`${model} status:`, aiRes.status);
      if (aiRes.ok) {
        const data = await aiRes.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (content) { console.log(`Success: ${model}`); return content; }
      } else {
        const err = await aiRes.text();
        console.error(`${model} error:`, err);
        if (aiRes.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (aiRes.status === 402) throw new Error("Usage limit reached. Please add credits to your workspace.");
      }
    } catch (e) {
      clearTimeout(timeout);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Rate limits") || msg.includes("Usage limit")) throw e;
      console.error(`${model} threw:`, msg);
    }
  }
  throw new Error("Service temporarily unavailable. Please try again in a moment.");
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

  // ── 1. Normalizer ───────────────────────────────────────────────────────────
  console.log("[1/6] Normalizer");
  let normalized: Record<string, unknown> = {};
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
  }

  // ── Shared context ──────────────────────────────────────────────────────────
  const sharedContext = Object.keys(normalized).length > 0
    ? `STRUCTURED INPUT (pre-processed):\n${JSON.stringify(normalized, null, 2)}\n\nRESUME:\n${experience}${jd?.trim() ? `\n\nJOB DESCRIPTION:\n${jd.trim()}` : ""}`
    : jd?.trim()
      ? `RESUME:\n${experience}\n\nJOB DESCRIPTION:\n${jd.trim()}`
      : `RESUME:\n${experience}`;

  // ── 2. Signal Classifier + Director Calibration (parallel) ──────────────────
  console.log("[2/6] Signal Classifier + Director Calibration (parallel)");
  const [calibrationRaw, classifierRaw] = await Promise.all([
    callAI(apiKey, DIRECTOR_PROMPT, sharedContext),
    callAI(apiKey, `${SIGNAL_CLASSIFIER_SYSTEM}\n\n${SIGNAL_CLASSIFIER_SCHEMA}`, sharedContext),
  ]);

  // Director Calibration (required)
  let result: Record<string, unknown>;
  try {
    result = parseJSON<Record<string, unknown>>(calibrationRaw);
    console.log("  → Director Calibration: ok");
    await storeArtifact(supabase, runId, "step_2_calibration", { raw: calibrationRaw, parsed: result });
  } catch {
    throw new Error("Failed to parse Director Calibration response. Please try again.");
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

  // ── 4. Rewrite Modules (parallel, dual A/B) ────────────────────────────────
  console.log("[4/6] Rewrite Modules (dual A/B)");
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

  // ── 5. Replace bullets ──────────────────────────────────────────────────────
  console.log("[5/6] Replacing bullets");
  if (gapOutput && rewrittenTargets.length) {
    (result.gap_analyzer as Record<string, unknown>).rewrite_targets = rewrittenTargets;
  }
  await storeArtifact(supabase, runId, "step_5_bullet_replacement", { rewrite_targets: rewrittenTargets });

  // ── 6. Consistency Validator ────────────────────────────────────────────────
  console.log("[6/7] Consistency Validator");
  try {
    const rewrittenBullets = rewrittenTargets
      .filter((t) => t.version_a || t.rewritten_bullet)
      .map((t) => `[${t.upgrade_type}] A: ${t.version_a || t.rewritten_bullet}${t.version_b ? ` | B: ${t.version_b}` : ""}`);

    const validatorContent = [
      `ORIGINAL RESUME:\n${experience}`,
      jd?.trim() ? `JOB DESCRIPTION:\n${jd.trim()}` : "",
      rewrittenBullets.length
        ? `REWRITTEN BULLETS (validate against originals):\n${rewrittenBullets.join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");

    const raw = await callAI(apiKey, CONSISTENCY_VALIDATOR_SYSTEM, validatorContent);
    const cvParsed = parseJSON<{ status: string; issues: string[] }>(raw);
    result.consistency_validator = cvParsed;
    console.log("  → status:", cvParsed.status);
    await storeArtifact(supabase, runId, "step_6_consistency_validator", { raw, parsed: cvParsed });
  } catch {
    console.error("  ✗ Consistency Validator failed (non-fatal)");
    result.consistency_validator = null;
  }

  // ── 7. Export Builder ──────────────────────────────────────────────────────
  console.log("[7/7] Export Builder");
  let exportReady = false;
  try {
    const rewriteContext = rewrittenTargets
      .filter((t) => t.version_a || t.rewritten_bullet)
      .map((t) => JSON.stringify({
        original: t.bullet_reference,
        rewritten: t.version_a || t.rewritten_bullet,
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
  return result;
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { experience, jd, deterministic = true, qa_mode = false } = body;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    // ── QA Mode: run all 3 fixtures ──────────────────────────────────────────
    if (qa_mode) {
      console.log("=== QA MODE: Running 3 fixtures ===");
      const results = [];
      for (const fixture of QA_FIXTURES) {
        try {
          const r = await runPipeline(apiKey, fixture.experience, fixture.jd, true);
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
      return new Response(JSON.stringify({ qa_results: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Normal mode ──────────────────────────────────────────────────────────
    if (!experience?.trim()) {
      console.log("Resumix request rejected: empty experience input");
      return new Response(JSON.stringify({ status: "error", error: "Insufficient input provided for analysis." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Resumix request length:", experience.trim().length);
    const result = await runPipeline(apiKey, experience.trim(), jd, deterministic);
    console.log("Resumix director-calibration: pipeline complete");

    return new Response(JSON.stringify({ status: "success", ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Resumix engine error:", message);
    const friendly =
      message.includes("Rate limits") ? "Too many requests. Please wait a moment and try again." :
      message.includes("Usage limit") ? "Usage limit reached. Please add credits to continue." :
      message.includes("unavailable") ? "AI service is temporarily busy. Please try again." :
      message.includes("parse") ? "The AI returned an unexpected response. Please try again." :
      message.includes("aborted") ? "Analysis took too long. Please retry." :
      "Analysis engine temporarily unavailable. Please try again.";
    return new Response(JSON.stringify({ status: "error", error: friendly, detail: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
