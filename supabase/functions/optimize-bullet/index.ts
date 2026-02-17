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

    const prompt = `You are an expert resume writer who creates results-driven, professional resume bullets. Given a resume bullet and a job description, rewrite and analyze the bullet following these strict rules:

REWRITING RULES (apply to optimized_bullet, alt_a, and alt_b):
- Always start with a strong action verb (e.g. Led, Drove, Delivered, Accelerated, Reduced, Built, Launched, Designed, Optimized, Streamlined)
- Prioritize impact and outcomes over task descriptions
- Add realistic metrics or ranges when none are present, inferred from context (e.g. "20+ stakeholders", "3x improvement", "$500K+ pipeline")
- Keep each bullet to 1–2 lines maximum
- Never use filler phrases like "responsible for", "helped with", "assisted in", "was tasked with", "played a role in"
- Never use buzzwords like "synergy", "dynamic", "leveraged", "utilized", "spearheaded" (unless truly accurate)
- Never use hyphens (–, —, -) in bullet text
- Mirror key language from the job description naturally without keyword stuffing
- Use plain, professional language suitable for everyday job seekers — not corporate jargon or generic AI writing
- The result should read like a polished, human-written resume bullet

SPECIFIC OUTPUT REQUIREMENTS:
- optimized_bullet: The best single rewrite following all rules above
- match_score: Integer 0–100. Be honest — score based on how well the bullet's skills and experience genuinely align with the JD requirements
- missing_keywords: Return ONLY the top 5 most relevant skills, tools, or qualifications from the JD that are absent from the bullet. Do not list generic soft skills
- suggested_verbs: 5 strong action verbs relevant to the bullet's domain that could start the bullet
- alt_a: A metric-heavy alternate version. Must contain at least 2 quantified results (numbers, percentages, dollar amounts, timeframes). Push harder on measurable impact than the optimized_bullet
- alt_b: A natural-sounding alternate version that still emphasizes results and outcomes but reads more conversationally. Should feel human-written, not templated

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
