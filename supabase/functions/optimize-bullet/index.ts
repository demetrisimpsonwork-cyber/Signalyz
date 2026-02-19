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

    const userPlan = mode === "multi_bullet" ? "pro" : "free";

    const prompt = `You are Alignment Engine V2 (Titan).

Your function is to analyze resume experience against a job description and generate structured alignment output without fabrication.

YOU MUST:
- Never invent tools, metrics, certifications, or domain experience.
- Only elevate, reframe, and optimize based on provided input.
- Preserve factual integrity at all times.

INPUTS:
- EXPERIENCE_INPUT
- JOB_DESCRIPTION
- USER_PLAN: ${userPlan}

-------------------------------------
SCORING MODEL
-------------------------------------

Score across 5 weighted dimensions:
1) Role Outcomes & Deliverables (30%) → role_outcomes_alignment
2) Tools & Workflow Signals (20%) → tools_and_workflow_alignment
3) Domain Alignment (20%) → domain_and_context_alignment
4) Context & Scale (15%) → context_and_scale_alignment
5) Communication & Leadership Signals (15%) → communication_and_leadership_alignment

Alignment Levels:
- 0–49 = Weak
- 50–64 = Moderate
- 65–79 = Solid
- 80+ = Strong

Do NOT inflate score. Score must reflect realistic fit based on provided experience.
Strong Alignment (80+) requires clear match on top 2 JD priorities AND at least one tool/workflow match AND credible ownership signals.

-------------------------------------
BULLET GENERATION RULES
-------------------------------------

Bullets must:
- Be 1–2 lines, not exceed 35 words
- Use high-signal verbs
- Avoid exaggeration
- Reflect only given experience
- Be ATS-safe (no semicolons, no em dashes)

IF USER_PLAN = "free":
  optimized_bullets must contain EXACTLY 1 object (primary: direct, ATS-weighted to top JD priorities).

IF USER_PLAN = "pro":
  optimized_bullets must contain EXACTLY 3 objects:
  [0] Impact-Focused — metric-forward tone, outcome-driven, emphasize ownership/delivery/revenue
  [1] Human-Natural — interview-ready, natural professional tone, strong clarity, slightly less formal
  [2] Keyword-Maximized — ATS-aligned, dense with role-relevant terminology, keyword-optimized

-------------------------------------
WEIGHTED PRIORITY EXTRACTION
-------------------------------------

Extract 5–8 priorities from JOB_DESCRIPTION. Each must include:
- priority theme
- weight (0.05–0.25) based on repetition, must/required/mandatory signals, role framing
Weights must sum to 1.00.

-------------------------------------
TITAN OUTPUT CONTRACT (STRICT JSON)
-------------------------------------

Return ONLY this JSON object with EXACT keys:
{
  "optimized_bullets": [
    {
      "text": "string",
      "variant": "primary" | "impact_focused" | "human_natural" | "keyword_maximized",
      "used_signals": ["string"],
      "removed_or_softened": ["string"]
    }
  ],
  "match_score": {
    "score": number,
    "label": "Weak" | "Moderate" | "Solid" | "Strong",
    "score_rationale": ["string"]
  },
  "missing_keywords": ["string (3–10 items max, ranked by importance)"],
  "suggested_action_verbs": ["string (5 items max, aligned to JD tone and ownership level)"],
  "alignment_intelligence_summary": "string (pro: 4–6 sentences; free: 2–3 sentences — what was elevated, what gaps remain, how transferable skills were repositioned)",
  "strategic_gap_actions": ["string (2–3 for free, up to 5 for pro — actionable, truthful, behavior-based)"],
  "weighted_priority_commentary": ${userPlan === "pro" ? '"string (pro only: 3–5 sentences explaining how JD priorities were weighted and which signals drove the score)"' : 'null'},
  "strategic_bridge_analysis": ${userPlan === "pro" ? '{ "why_it_translates": "string", "perception_gaps": ["string"], "interview_narrative": "string" }' : 'null'},
  "debug": {
    "mode": "${mode}",
    "user_plan": "${userPlan}",
    "bullet_count_requested": ${userPlan === "pro" ? 3 : 1},
    "extracted_jd_priorities": [
      { "priority": "string", "weight": number, "evidence": "string" }
    ],
    "scoring_breakdown": {
      "role_outcomes_alignment": number,
      "tools_and_workflow_alignment": number,
      "domain_and_context_alignment": number,
      "context_and_scale_alignment": number,
      "communication_and_leadership_alignment": number
    }
  }
}

RULES:
- No markdown. No code fences. No text outside the JSON.
- weighted_priority_commentary and strategic_bridge_analysis must be null for free plan.

EXPERIENCE_INPUT: ${bullet}

JOB_DESCRIPTION: ${jd}

USER_PLAN: ${userPlan}`;

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

    // Pro plan: [0]=impact_focused, [1]=human_natural, [2]=keyword_maximized
    const altA = titan.optimized_bullets?.[1]?.text || optimizedBullet;
    const altB = titan.optimized_bullets?.[2]?.text || optimizedBullet;

    const priorities = titan.debug?.extracted_jd_priorities || [];
    const topMatchedSignal = priorities.length > 0 ? priorities[0].priority : null;
    const topMissingSignal = missingKeywords.length > 0 ? missingKeywords[0] : null;

    const breakdown = titan.debug?.scoring_breakdown || {};
    const scoreRationale = titan.match_score?.score_rationale || [];

    // Pro-only fields
    const weightedPriorityCommentary = titan.weighted_priority_commentary || null;
    const strategicBridgeAnalysis = titan.strategic_bridge_analysis || null;

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
      score_rationale: scoreRationale,
      scoring_breakdown: breakdown,
      extracted_jd_priorities: priorities,
      used_signals: titan.optimized_bullets?.[0]?.used_signals || [],
      removed_or_softened: titan.optimized_bullets?.[0]?.removed_or_softened || [],
      // Pro-only
      weighted_priority_commentary: weightedPriorityCommentary,
      strategic_bridge_analysis: strategicBridgeAnalysis,
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
