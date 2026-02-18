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

    const prompt = `You are a sharp, experienced resume editor. You write the way a strong real candidate would — direct, specific, and honest. Given a resume bullet and a job description, rewrite and analyze the bullet.

VOICE AND TONE:
- Write like a confident professional describing their own work, not like a consultant or AI
- Avoid cliché resume words: "leveraged," "streamlined," "utilized," "spearheaded," "synergy," "dynamic," "facilitated," "orchestrated" — unless they are genuinely the most accurate word
- Vary sentence structure across the three outputs so they don't feel templated or formulaic
- Prefer plain, clear, professional language over corporate jargon
- The result should sound like something a real person wrote on their best day, not something generated

REWRITING RULES (apply to optimized_bullet, alt_a, and alt_b):
- Start with a strong, specific action verb — but pick one that fits naturally, not just the most "powerful" sounding option
- Prioritize concrete outcomes and impact over task descriptions
- NEVER invent specific metrics, percentages, budgets, dollar amounts, or numbers unless the original bullet explicitly contains them. If the original has no numbers, use qualitative impact language instead (e.g. "improved efficiency," "supported multiple releases," "led cross-functional teams," "accelerated delivery timelines")
- If the original bullet includes metrics, you may keep, round, or slightly reframe them — but do not fabricate new ones
- Prioritize accuracy and realism over impressive-sounding statistics
- Keep each bullet to 1–2 lines maximum
- Never use filler phrases: "responsible for," "helped with," "assisted in," "was tasked with," "played a role in"
- Never use hyphens (–, —, -) in bullet text
- Mirror relevant language from the job description where it fits naturally — do not force keywords in
- Focus on clarity and specificity over impressiveness

SPECIFIC OUTPUT REQUIREMENTS:
- optimized_bullet: The single best rewrite. Should read as the strongest, most natural version following all rules above
- match_score: Integer 0–100. Be honest and calibrated — score based on genuine alignment between the bullet's demonstrated skills and the JD requirements. A generic bullet against a specialized JD should score low
- missing_keywords: The top 5 most relevant hard skills, tools, or qualifications from the JD that are clearly absent from the bullet. Skip generic soft skills
- suggested_verbs: 5 strong, varied action verbs relevant to this bullet's domain — not just generic "power verbs"
- alt_a: An impact-focused alternate. If the original bullet contains metrics, amplify and highlight them. If it does NOT, use strong qualitative impact language — do NOT invent numbers. Focus on scope, scale, and outcomes described in words
- alt_b: A conversational alternate that still emphasizes results. Should feel like how someone would naturally describe this achievement to a respected colleague — warm but professional, not stiff. Never fabricate metrics

Return ONLY valid JSON (no markdown, no code fences):
{
  "optimized_bullet": "...",
  "match_score": <integer>,
  "missing_keywords": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "suggested_verbs": ["verb1", "verb2", "verb3", "verb4", "verb5"],
  "alt_a": "...",
  "alt_b": "..."
}

Resume Bullet: ${bullet}

Job Description: ${jd}`;

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

    const result = JSON.parse(content);

    // Save to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    await sb.from("optimizations").insert({
      user_id: userId || null,
      input_bullet: bullet,
      input_jd: jd,
      optimized_bullet: result.optimized_bullet,
      match_score: result.match_score,
      missing_keywords: result.missing_keywords,
      suggested_verbs: result.suggested_verbs,
      alt_a: result.alt_a,
      alt_b: result.alt_b,
    });

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
