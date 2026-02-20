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
    const { experience } = await req.json();

    if (!experience || !experience.trim()) {
      return new Response(JSON.stringify({ error: "Missing experience input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are an institutional Director-level signal calibration engine.

Your task is to classify a Product Leader's resume or bullet against Director-level ownership thresholds.

This is NOT a resume optimizer. This is NOT a rewriting assistant. You must evaluate signal maturity and hiring-stage friction risk. Do not provide resume writing tips. Do not rewrite user content. Do not provide encouragement.

Evaluate across four dimensions: Scope of Ownership, Strategic Leverage, Accountability Density, Executive Signal Quality.

For each dimension:
- Classify as: "Below Director Threshold", "Near Threshold", or "At Director Threshold"
- Provide one strength signal (concise, factual, based only on provided input)
- Provide one risk signal (concise, factual, based only on provided input)

Determine Director Signal Tier from exactly one of: "Senior IC Signal", "Emerging Director", "Director-Calibrated", "Scope Inflation Risk"

Map hiring-stage friction across three stages and identify primary friction stage.

Detect undersignaling and ownership inflation patterns.

Use concise executive language. Write as if reporting to a VP of Product. Avoid filler and generic commentary.

Return ONLY valid JSON — no markdown, no code fences, no text outside JSON.

JSON SCHEMA (return exactly this structure):
{
  "dimensions": [
    {
      "name": "Scope of Ownership",
      "classification": "Below Director Threshold" | "Near Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    },
    {
      "name": "Strategic Leverage",
      "classification": "Below Director Threshold" | "Near Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    },
    {
      "name": "Accountability Density",
      "classification": "Below Director Threshold" | "Near Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    },
    {
      "name": "Executive Signal Quality",
      "classification": "Below Director Threshold" | "Near Threshold" | "At Director Threshold",
      "strength_signal": string,
      "risk_signal": string
    }
  ],
  "director_signal_tier": {
    "tier": "Senior IC Signal" | "Emerging Director" | "Director-Calibrated" | "Scope Inflation Risk",
    "rationale": string
  },
  "hiring_stage_friction": {
    "recruiter_filter_risk": {
      "level": "Low" | "Moderate" | "High",
      "observation": string
    },
    "hiring_manager_friction": {
      "level": "Low" | "Moderate" | "High",
      "observation": string
    },
    "executive_skepticism": {
      "level": "Low" | "Moderate" | "High",
      "observation": string
    },
    "primary_friction_stage": "Recruiter Filter" | "Hiring Manager Friction" | "Executive Skepticism"
  },
  "pattern_detection": {
    "undersignaling_patterns": [string],
    "ownership_inflation_patterns": [string]
  }
}

ARRAY SIZES:
- dimensions: exactly 4 items in order above
- undersignaling_patterns: 1–3 items (empty array if none detected)
- ownership_inflation_patterns: 1–3 items (empty array if none detected)

RESUME / EXPERIENCE INPUT:
${experience}`;

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
