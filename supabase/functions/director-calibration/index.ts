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

async function callAI(apiKey: string, prompt: string): Promise<string> {
  for (const model of MODELS) {
    console.log(`Trying model: ${model}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
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

    const userContent = jd?.trim()
      ? `RESUME / EXPERIENCE INPUT:\n${experience}\n\nTARGET JOB DESCRIPTION:\n${jd.trim()}`
      : `RESUME / EXPERIENCE INPUT:\n${experience}`;

    const prompt = `${DIRECTOR_PROMPT}\n\n${userContent}`;

    let content = await callAI(apiKey, prompt);
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(content);
    } catch {
      console.error("JSON parse failed. Preview:", content.slice(0, 300));
      throw new Error("Failed to parse AI response. Please try again.");
    }

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
