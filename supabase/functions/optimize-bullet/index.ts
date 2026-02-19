import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, jd, userId, mode = "single_bullet" } = await req.json();

    if (!bullet || !jd) {
      return new Response(JSON.stringify({ error: "Missing bullet or jd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are Alignment Engine Titan V2.

Your role:
Analyze a user's experience against a job description and produce strategically aligned resume bullet rewrites without fabrication.

CRITICAL RULES:
- Do not invent tools, metrics, software, or experience.
- Do not add outcomes not supported by the input.
- You may reframe, elevate, and strategically reposition transferable skills.
- You may translate domain language (public sector → SaaS, operations → sales, compliance → pipeline, etc.).
- Preserve factual integrity at all times.

INPUTS (provided by the app each run):
- EXPERIENCE_INPUT
- JOB_DESCRIPTION
- MODE ("single_bullet" or "multi_bullet")

-------------------------------------
ALIGNMENT FRAMEWORK (Weighted Internally)
-------------------------------------

Evaluate alignment across 5 dimensions:
1) Role Outcomes & Core Responsibilities (40%) → maps to role_outcomes_alignment
2) Tools / Workflow / Systems (20%) → maps to tools_and_workflow_alignment
3) Domain / Industry Signals (15%) → maps to domain_and_context_alignment
4) Ownership / Seniority Signals (15%) → maps to metrics_and_ownership_alignment
5) Communication / Collaboration Signals (10%) → maps to communication_and_stakeholder_alignment

Use these dimensions to determine which signals to elevate.

-------------------------------------
BULLET STYLE RULES
-------------------------------------

optimized_bullets[0] (primary):
- Direct, weighted to highest employer priorities
- ATS-safe language
- No fluff

optimized_bullets[1] (alternate_impact, only if MODE="multi_bullet"):
- More outcome-driven
- Emphasize ownership, metrics, delivery, pipeline, revenue, etc.
- Still factually grounded

optimized_bullets[2] (alternate_human, only if MODE="multi_bullet"):
- More recruiter-friendly
- Natural tone
- Strong clarity
- Slightly less formal but professional

-------------------------------------
SCORING RULES
-------------------------------------

match_score must reflect weighted alignment strength:
80–100 = Strong Alignment
60–79 = Solid Alignment
40–59 = Moderate Alignment
Below 40 = Low Alignment

Do NOT inflate score. Score must reflect realistic fit based on provided experience.

Strong Alignment (80+) requires: clear match on top 2 JD priorities AND at least one tool/workflow match AND credible ownership signals. If key JD priorities are missing, cap score at 79 even with great transferable skills.

-------------------------------------
WEIGHTED PRIORITY EXTRACTION (FROM JD)
-------------------------------------

Extract 5–8 priorities from JOB_DESCRIPTION. Each must include:
- priority theme (e.g., "high-volume case management", "CRM pipeline management", "de-escalation")
- weight (0.05–0.25) based on repetition, "must/required/mandatory", role framing, and mission emphasis
Weights must sum to 1.00.

-------------------------------------
TITAN OUTPUT CONTRACT (STRICT JSON)
-------------------------------------

Return ONLY this JSON object with EXACT keys:
{
  "optimized_bullets": [
    {
      "text": "string (1 bullet, 18–32 words, ATS-safe, no semicolons, no em dashes)",
      "used_signals": ["string"],
      "removed_or_softened": ["string"]
    }
  ],
  "match_score": {
    "score": number,
    "label": "Weak Alignment" | "Moderate Alignment" | "Solid Alignment" | "Strong Alignment",
    "score_rationale": ["string"]
  },
  "missing_keywords": ["string (de-duplicated, 3–10 items max, ranked by importance)"],
  "suggested_action_verbs": ["string (5 items max, aligned to JD tone and ownership level)"],
  "alignment_intelligence_summary": "string (2–4 sentences: what was elevated, what gaps remain, how transferable skills were repositioned)",
  "strategic_gap_actions": ["string (actionable, truthful, behavior-based additions)"],
  "debug": {
    "mode": "single_bullet" | "multi_bullet",
    "bullet_count_requested": number,
    "extracted_jd_priorities": [
      { "priority": "string", "weight": number, "evidence": "string" }
    ],
    "scoring_breakdown": {
      "role_outcomes_alignment": number,
      "tools_and_workflow_alignment": number,
      "domain_and_context_alignment": number,
      "communication_and_stakeholder_alignment": number,
      "metrics_and_ownership_alignment": number
    }
  }
}

RULES:
- If MODE="single_bullet": optimized_bullets must contain exactly 1 object.
- If MODE="multi_bullet": optimized_bullets must contain exactly 3 objects (primary, impact, human).
- No markdown. No code fences. No text outside the JSON.

EXPERIENCE_INPUT: ${bullet}

JOB_DESCRIPTION: ${jd}

MODE: ${mode}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI API error: ${errText}`);
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const titan = JSON.parse(content);

    // Map Titan contract to the shape the frontend expects
    const optimizedBullet = titan.optimized_bullets?.[0]?.text || "";
    const matchScore = titan.match_score?.score ?? 0;
    const confidenceLevel = titan.match_score?.label || "";
    const missingKeywords = titan.missing_keywords || [];
    const suggestedVerbs = titan.suggested_action_verbs || [];
    const alignmentNotes = titan.alignment_intelligence_summary || "";
    const gapSuggestions = titan.strategic_gap_actions?.length
      ? titan.strategic_gap_actions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")
      : null;

    // In multi_bullet mode: [0]=primary, [1]=impact, [2]=human
    const altA = titan.optimized_bullets?.[1]?.text || optimizedBullet;
    const altB = titan.optimized_bullets?.[2]?.text || optimizedBullet;

    // Derive top signals from debug data
    const priorities = titan.debug?.extracted_jd_priorities || [];
    const topMatchedSignal = priorities.length > 0 ? priorities[0].priority : null;
    const topMissingSignal = missingKeywords.length > 0 ? missingKeywords[0] : null;

    const breakdown = titan.debug?.scoring_breakdown || {};
    const scoreRationale = titan.match_score?.score_rationale || [];

    const result = {
      optimized_bullet: optimizedBullet,
      match_score: matchScore,
      alignment_confidence_level: confidenceLevel,
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
      alignment_notes: alignmentNotes,
      gap_suggestions: gapSuggestions,
      top_matched_signal: topMatchedSignal,
      top_missing_signal: topMissingSignal,
      // New Titan V2 fields
      score_rationale: scoreRationale,
      scoring_breakdown: breakdown,
      extracted_jd_priorities: priorities,
      used_signals: titan.optimized_bullets?.[0]?.used_signals || [],
      removed_or_softened: titan.optimized_bullets?.[0]?.removed_or_softened || [],
    };

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    await sb.from("optimizations").insert({
      user_id: userId || null,
      input_bullet: bullet,
      input_jd: jd,
      optimized_bullet: optimizedBullet,
      match_score: matchScore,
      missing_keywords: missingKeywords,
      suggested_verbs: suggestedVerbs,
      alt_a: altA,
      alt_b: altB,
    }).throwOnError();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
