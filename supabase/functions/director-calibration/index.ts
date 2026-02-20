import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
];

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

// ─── PROMPT 2: Signal Classifier ────────────────────────────────────────────
const SIGNAL_CLASSIFIER_SYSTEM = `You are a Senior Executive Hiring Manager evaluating seniority signals.
Evaluate across 7 dimensions:
1. Commercial Impact Attribution
2. End-to-End Ownership Scope
3. Decision Authority
4. Cross-Functional Leadership
5. Lifecycle Governance
6. Risk Compression
7. Narrative Cohesion

For each dimension:
- Score 0–25
- Provide deficiency summary (1–2 sentences)
- Identify missing signals

Rules:
- Be strict.
- Assume Staff-level threshold unless otherwise stated.
- Do not rewrite.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.`;

const SIGNAL_CLASSIFIER_SCHEMA = `Return structured JSON with exactly this schema:
{
  "target_level_inferred": string,
  "dimension_scores": {
    "commercial": { "score": number, "gap": string, "missing": [string] },
    "ownership": { "score": number, "gap": string, "missing": [string] },
    "authority": { "score": number, "gap": string, "missing": [string] },
    "cross_functional": { "score": number, "gap": string, "missing": [string] },
    "lifecycle": { "score": number, "gap": string, "missing": [string] },
    "risk": { "score": number, "gap": string, "missing": [string] },
    "narrative": { "score": number, "gap": string, "missing": [string] }
  },
  "overall_seniority_alignment": string,
  "top_3_gaps": [string, string, string]
}`;

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
- priority_order: list dimension keys in order of highest remediation leverage (e.g. ["commercial", "authority", "risk"])`;

// ─── PROMPT 5: Consistency Validator ─────────────────────────────────────────
const CONSISTENCY_VALIDATOR_SYSTEM = `You validate resume consistency. You do not rewrite. You do not coach.

Check for:
1. Metrics alignment — Are quantified claims internally consistent (no conflicting numbers, realistic percentages)?
2. Timeline realism — Do role durations and scope escalations map to plausible career progression?
3. Scope escalation coherence — Does each role demonstrate logical growth from the previous?
4. No fabricated claims — Flag any claims that appear structurally implausible or unverifiable without basis.
5. No internal contradictions — Identify any statements that directly contradict each other.

Rules:
- Be precise. Only flag real issues, not stylistic concerns.
- If rewritten bullets are provided, validate them against the original claims.
- Do not suggest rewrites. Do not encourage. Do not coach.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON:
{
  "status": "pass" | "revise",
  "issues": [string]
}

CONSTRAINTS:
- status: "pass" if no material issues found, "revise" if one or more issues require attention
- issues: empty array [] if status is "pass"; otherwise 1–5 concise issue statements`;

// ─── PROMPT 4: Rewrite Modules ───────────────────────────────────────────────
const REWRITE_MODULE_PROMPTS: Record<string, string> = {
  commercial_injection: `You elevate resume bullets by adding quantified commercial impact without fabricating facts.

Rules:
- Preserve the original claim exactly.
- Add measurable commercial impact only if metrics are provided in context.
- If no metrics are available, insert placeholder: [Insert % or $].
- Do not add fluff, coaching language, or soft qualifiers.
- Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON: { "rewritten_bullet": string }`,

  ownership_elevation: `You reframe resume bullets to reflect end-to-end product ownership and full lifecycle accountability.

Add signals of:
- Full-stack ownership (from discovery through delivery)
- Cross-functional coordination responsibility
- Post-launch stewardship

Do not fabricate. Preserve all original facts.
Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON: { "rewritten_bullet": string }`,

  authority_framing: `You rewrite resume bullets to reflect autonomous decision authority and cross-organizational influence.

Add signals of:
- Escalation resolution
- Executive partnership
- Dependency arbitration
- Decision ownership

Do not fabricate. Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON: { "rewritten_bullet": string }`,

  cross_functional_leadership: `You reframe resume bullets to surface cross-functional leadership scope and organizational influence.

Inject signals of:
- Engineering, design, data, legal, finance, or ops alignment
- Stakeholder mobilization
- Shared accountability across teams

Do not fabricate. Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON: { "rewritten_bullet": string }`,

  lifecycle_governance: `You reframe resume bullets to reflect full product lifecycle governance and operational rigor.

Inject signals of:
- Roadmap ownership
- Production readiness criteria
- Planning through launch governance
- Operational rigor frameworks (e.g., PRDs, OKRs, launch reviews)

Do not fabricate. Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON: { "rewritten_bullet": string }`,

  risk_compression: `You reframe resume bullets to surface risk identification, mitigation, and outcome accountability.

Inject signals of:
- Risk modeling
- Dependency identification
- Mitigation strategy framing
- Consequence-aware decision language

Do not fabricate. Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

Return JSON: { "rewritten_bullet": string }`,
};


const DIRECTOR_PROMPT = `You are an institutional Director-Level Signal Calibration Engine.

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
  rewritten_bullet?: string | null;
}

interface GapAnalyzerOutput {
  priority_order: string[];
  rewrite_targets: RewriteTarget[];
}

// ─── JSON helper ─────────────────────────────────────────────────────────────

function parseJSON<T>(raw: string): T {
  const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(clean) as T;
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

async function runPipeline(
  apiKey: string,
  experience: string,
  jd: string | undefined,
): Promise<Record<string, unknown>> {

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
  } catch (e) {
    console.error("  ✗ Normalizer failed (non-fatal):", e instanceof Error ? e.message : e);
  }

  // ── Shared context for downstream prompts ────────────────────────────────────
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

  // Director Calibration is the primary result container (required — throws on failure)
  let result: Record<string, unknown>;
  try {
    result = parseJSON<Record<string, unknown>>(calibrationRaw);
    console.log("  → Director Calibration: ok");
  } catch {
    throw new Error("Failed to parse Director Calibration response. Please try again.");
  }

  // Signal Classifier (non-fatal)
  let classifierParsed: Record<string, unknown> | null = null;
  try {
    classifierParsed = parseJSON<Record<string, unknown>>(classifierRaw);
    result.signal_classifier = classifierParsed;
    console.log("  → Signal Classifier: ok — inferred:", classifierParsed.target_level_inferred);
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
    } catch {
      console.error("  ✗ Gap Analyzer failed (non-fatal)");
      result.gap_analyzer = null;
    }
  } else {
    result.gap_analyzer = null;
  }

  // ── 4. Rewrite Modules (parallel — one per target) ──────────────────────────
  console.log("[4/6] Rewrite Modules");
  let rewrittenTargets: RewriteTarget[] = gapOutput?.rewrite_targets ?? [];

  if (gapOutput?.rewrite_targets?.length) {
    const jobs = gapOutput.rewrite_targets.map(async (target): Promise<RewriteTarget> => {
      const modulePrompt = REWRITE_MODULE_PROMPTS[target.upgrade_type];
      if (!modulePrompt) {
        console.warn(`  ⚠ No module for upgrade_type="${target.upgrade_type}"`);
        return { ...target, rewritten_bullet: null };
      }
      const userContent = [
        `ORIGINAL BULLET:\n${target.bullet_reference}`,
        `UPGRADE CONTEXT:\n${target.reason}`,
        `RESUME CONTEXT (reference only):\n${experience.slice(0, 1500)}`,
      ].join("\n\n");
      try {
        const raw = await callAI(apiKey, modulePrompt, userContent);
        const parsed = parseJSON<{ rewritten_bullet?: string }>(raw);
        console.log(`  → [${target.upgrade_type}]: ok`);
        return { ...target, rewritten_bullet: parsed.rewritten_bullet ?? null };
      } catch {
        console.error(`  ✗ Rewrite module [${target.upgrade_type}] failed (non-fatal)`);
        return { ...target, rewritten_bullet: null };
      }
    });
    rewrittenTargets = await Promise.all(jobs);
  }

  // ── 5. Replace bullets in gap_analyzer output ───────────────────────────────
  console.log("[5/6] Replacing bullets");
  if (gapOutput && rewrittenTargets.length) {
    (result.gap_analyzer as Record<string, unknown>).rewrite_targets = rewrittenTargets;
  }

  // ── 6. Consistency Validator ─────────────────────────────────────────────────
  console.log("[6/6] Consistency Validator");
  try {
    const rewrittenBullets = rewrittenTargets
      .filter((t) => t.rewritten_bullet)
      .map((t) => `[${t.upgrade_type}] ${t.rewritten_bullet}`);

    const validatorContent = [
      `ORIGINAL RESUME:\n${experience}`,
      jd?.trim() ? `JOB DESCRIPTION:\n${jd.trim()}` : "",
      rewrittenBullets.length
        ? `REWRITTEN BULLETS (validate against originals):\n${rewrittenBullets.join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");

    const raw = await callAI(apiKey, CONSISTENCY_VALIDATOR_SYSTEM, validatorContent);
    result.consistency_validator = parseJSON<{ status: string; issues: string[] }>(raw);
    console.log("  → status:", (result.consistency_validator as { status: string }).status);
  } catch {
    console.error("  ✗ Consistency Validator failed (non-fatal)");
    result.consistency_validator = null;
  }

  // ── Return final package ────────────────────────────────────────────────────
  result._normalized = normalized;
  return result;
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { experience, jd } = await req.json();

    if (!experience?.trim()) {
      return new Response(JSON.stringify({ error: "Missing experience input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const result = await runPipeline(apiKey, experience.trim(), jd);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("director-calibration error:", message);
    const status =
      message.includes("Rate limits") ? 429 :
      message.includes("Usage limit") ? 402 : 500;
    const friendly =
      status === 429 ? "Too many requests. Please wait a moment and try again." :
      status === 402 ? "Usage limit reached. Please add credits to continue." :
      message.includes("unavailable") ? "AI service is temporarily busy. Please try again." :
      message.includes("parse") ? "The AI returned an unexpected response. Please try again." :
      "Something went wrong. Please try again.";
    return new Response(JSON.stringify({ error: friendly, detail: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
