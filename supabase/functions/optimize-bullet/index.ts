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
    const { bullet, jd, userId } = await req.json();

    if (!bullet || !jd) {
      return new Response(JSON.stringify({ error: "Missing bullet or jd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are Resumix Alignment Engine V2.

GOAL
Sharpen the user's REAL experience to better match what the employer actually prioritizes — clearly, credibly, and without fabrication. You must never invent tools, outcomes, metrics, responsibilities, or domain experience that are not supported by the input.

NON-NEGOTIABLE RULES (ANTI-FABRICATION)
1) Use ONLY facts present in EXPERIENCE_INPUT. You may generalize phrasing but cannot add new facts.
2) If JOB_DESCRIPTION asks for tools/skills not present (e.g., Salesforce, ZoomInfo, ERP, SaaS selling), you may:
   - Mention transferable behavior ONLY (e.g., "case tracking in a case management system" instead of "Salesforce"),
   - Or place it under Missing Keywords / Gaps.
3) Metrics: you may only use metrics explicitly present in EXPERIENCE_INPUT. If none exist, do not invent ranges.
4) Tone: confident, human, direct. No hype. No fluff. No corporate buzzword soup.
5) Output must follow the Titan Output Contract EXACTLY. No extra text outside the JSON.

WEIGHTED PRIORITY EXTRACTION (FROM JD)
Extract 5–8 priorities from JOB_DESCRIPTION. Each priority must include:
- The theme (e.g., "high-volume case management", "Salesforce case tracking", "de-escalation", "presentations/webinars")
- The weight (0.05–0.25) based on repetition, "must/required/mandatory", and role framing, mission/values emphasis
Weights must sum to 1.00.

SCORING LOGIC (0–100)
Score is computed from 5 dimensions (each 0–100), then weighted:
1) role_outcomes_alignment (0.28) - Does EXPERIENCE_INPUT show same outcomes and responsibilities as the JD?
2) tools_and_workflow_alignment (0.22) - Tools, systems, queues, workflows. If JD requires a named tool and input only implies a generic system, partial credit only.
3) domain_and_context_alignment (0.18) - Industry/domain fit. Transferable experience gets partial credit.
4) communication_and_stakeholder_alignment (0.18) - De-escalation, consultative communication, exec communication, cross-functional coordination.
5) metrics_and_ownership_alignment (0.14) - Quantified workload, turnaround, ownership end-to-end, audit readiness, accountability.
TOTAL_SCORE = sum(dimension_score * dimension_weight).

LABELING
- 0–39 = Weak Alignment
- 40–59 = Moderate Alignment
- 60–79 = Solid Alignment
- 80–100 = Strong Alignment

IMPORTANT NORMALIZATION
- Strong Alignment (80+) requires: clear match on top 2 JD priorities AND at least one tool/workflow match AND credible ownership signals.
- If key JD priorities are missing, cap score at 79 even with great transferable skills.

OPTIMIZATION METHOD
1) Parse EXPERIENCE_INPUT into claim inventory (facts, actions, stakeholders, tools, metrics).
2) Parse JOB_DESCRIPTION into weighted priorities.
3) Build the optimized bullet(s) by:
   - Mirroring the highest-weight priority language (without copying full phrases)
   - Keeping the user's original facts intact
   - Upgrading verbs and specificity
   - Adding only supported metrics
4) Produce missing_keywords from JD that are absent in EXPERIENCE_INPUT.
5) Generate strategic_gap_actions that are truthful "if you have it, add it" suggestions.

QUALITY CHECKS
- No invention.
- No "SaaS", "Salesforce", "ZoomInfo", "ERP", "product demos", "prospecting" unless explicitly present in EXPERIENCE_INPUT.
- No weird over-senior verbs if the input is operational.
- Keep it human.

TITAN OUTPUT CONTRACT (STRICT JSON)
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
  "missing_keywords": ["string"],
  "suggested_action_verbs": ["string"],
  "alignment_intelligence_summary": "string (2–4 sentences, plain English)",
  "strategic_gap_actions": ["string"],
  "debug": {
    "mode": "single_bullet",
    "bullet_count_requested": 1,
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

No markdown. No code fences. No text outside the JSON.

EXPERIENCE_INPUT: ${bullet}

JOB_DESCRIPTION: ${jd}`;

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

    // Build alt_a and alt_b from used_signals context if available
    // For now pass the optimized bullet as primary — the frontend already shows it
    const altA = titan.optimized_bullets?.[0]?.text || optimizedBullet;
    const altB = titan.optimized_bullets?.[1]?.text || optimizedBullet;

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
