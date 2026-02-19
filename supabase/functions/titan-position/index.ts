import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { experience, jd } = await req.json();

    if (!experience || !jd) {
      return new Response(JSON.stringify({ error: "Missing experience or jd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const prompt = `You are the Titan Positioning Engine V1 for Resumix.

Your function is to strategically reposition a candidate's real experience to align with the employer's business model, mission, and role seniority — without fabrication.

NON-NEGOTIABLE RULES (ANTI-FABRICATION):
1) Use ONLY facts present in EXPERIENCE_INPUT. You may reframe and elevate phrasing but cannot add new facts.
2) Never invent tools, metrics, domain experience, certifications, or outcomes not supported by the input.
3) Bridge domain gaps with transferable language only — no false domain claims.
4) Tone: elite, natural, human. No corporate filler. No hyphen overuse. No robotic phrasing.
5) Output must follow the Titan Positioning Contract EXACTLY. No extra text outside the JSON.

TITAN POSITIONING CONTRACT (STRICT JSON):
Return ONLY this JSON object with EXACT keys:

{
  "professional_summary": "string (4–6 sentences, executive-level, mirrors company mission language, elevates ownership signals, aligns tone to role seniority, bridges industry gaps, outcome and influence framing)",
  "strategic_bridge": {
    "why_it_translates": ["string (bullet 1)", "string (bullet 2)", "string (bullet 3)"],
    "perception_gaps": ["string"],
    "interview_narrative": ["string"],
    "winning_angle": "string (operator | consultant | relationship manager | revenue driver | subject matter expert — pick one and explain briefly)"
  },
  "cover_letter": "string (full cover letter, Pinnacle format: strong opening tied to company mission, paragraph connecting lived experience to their problem, paragraph with quantified examples + ownership, subtle growth and adaptability signal, confident close — NO fabricated claims — formatted with newlines between paragraphs)",
  "positioning_intelligence": "string (2–3 sentences explaining the strategic repositioning choices made and why they increase perceived fit)"
}

No markdown. No code fences. No text outside the JSON.

EXPERIENCE_INPUT: ${experience}

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
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${errText}`);
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const titan = JSON.parse(content);

    return new Response(JSON.stringify(titan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
