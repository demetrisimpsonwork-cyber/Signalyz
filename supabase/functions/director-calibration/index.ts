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

// ─── PROMPT 3: Director Calibration Engine ───────────────────────────────────
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { experience, jd } = await req.json();

    if (!experience || !experience.trim()) {
      return new Response(JSON.stringify({ error: "Missing experience input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    // ── STEP 1: Normalizer ──────────────────────────────────────────────────
    console.log("Step 1: Running Normalizer");
    const normalizerUserContent = jd?.trim()
      ? `JOB DESCRIPTION:\n${jd.trim()}\n\nRESUME:\n${experience}`
      : `RESUME:\n${experience}`;

    const normalizerPrompt = `${NORMALIZER_SYSTEM}\n\n${NORMALIZER_SCHEMA}`;

    let normalizedRaw = await callAI(apiKey, normalizerPrompt, normalizerUserContent);
    normalizedRaw = normalizedRaw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let normalized: Record<string, unknown>;
    try {
      normalized = JSON.parse(normalizedRaw);
      console.log("Normalizer success. Target role:", normalized.target_role_title);
    } catch {
      console.error("Normalizer JSON parse failed. Preview:", normalizedRaw.slice(0, 300));
      // Non-fatal: fall back to raw input for Step 2
      normalized = {};
    }

    // ── STEPS 2 & 3: Signal Classifier + Director Calibration (parallel) ──────
    console.log("Steps 2 & 3: Running Signal Classifier and Director Calibration in parallel");

    const sharedContext = Object.keys(normalized).length > 0
      ? `STRUCTURED INPUT (extracted by pre-processor):\n${JSON.stringify(normalized, null, 2)}\n\nRAW RESUME / EXPERIENCE:\n${experience}${jd?.trim() ? `\n\nTARGET JOB DESCRIPTION:\n${jd.trim()}` : ""}`
      : jd?.trim()
        ? `RESUME / EXPERIENCE INPUT:\n${experience}\n\nTARGET JOB DESCRIPTION:\n${jd.trim()}`
        : `RESUME / EXPERIENCE INPUT:\n${experience}`;

    const classifierSystem = `${SIGNAL_CLASSIFIER_SYSTEM}\n\n${SIGNAL_CLASSIFIER_SCHEMA}`;

    const [calibrationRaw, classifierRaw] = await Promise.all([
      callAI(apiKey, DIRECTOR_PROMPT, sharedContext),
      callAI(apiKey, classifierSystem, sharedContext),
    ]);

    // Parse calibration result (required)
    const calibrationClean = calibrationRaw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(calibrationClean);
    } catch {
      console.error("Calibration JSON parse failed. Preview:", calibrationClean.slice(0, 300));
      throw new Error("Failed to parse AI response. Please try again.");
    }

    // Parse signal classifier result (non-fatal)
    const classifierClean = classifierRaw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try {
      result.signal_classifier = JSON.parse(classifierClean);
      console.log("Signal Classifier success. Inferred level:", (result.signal_classifier as Record<string, unknown>).target_level_inferred);
    } catch {
      console.error("Signal Classifier JSON parse failed. Preview:", classifierClean.slice(0, 300));
      result.signal_classifier = null;
    }

    // Attach normalized metadata
    result._normalized = normalized;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("director-calibration error:", message);
    const status = message.includes("Rate limits") ? 429 : message.includes("Usage limit") ? 402 : 500;
    const friendly =
      status === 429 ? "Too many requests. Please wait a moment and try again." :
      status === 402 ? "Usage limit reached. Please add credits to continue." :
      message.includes("unavailable") ? "AI service is temporarily busy. Please try again." :
      message.includes("parse") ? "The AI returned an unexpected response. Please try again." :
      "Something went wrong. Please try again.";
    return new Response(JSON.stringify({ error: friendly, detail: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
