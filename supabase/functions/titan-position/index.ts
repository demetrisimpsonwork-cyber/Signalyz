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

    const prompt = `You are the Resumix Strategic Positioning Engine.

Your role is to reposition a candidate's real experience into the strongest commercially relevant narrative possible — without fabrication, exaggeration, or claiming credentials not supported by the input.

You specialize in: career pivots, regulated to SaaS transitions, operations to sales transitions, public sector to commercial positioning, technical-adjacent roles, and high-volume operators reframed as strategic assets.

ANTI-FABRICATION RULE (NON-NEGOTIABLE):
- Use ONLY facts present in RESUME_INPUT. Reframe and elevate phrasing; never add new facts.
- Do NOT invent tools, certifications, revenue numbers, domain expertise, engineering knowledge, or direct industry experience not present in the input.
- If the resume lacks sales, engineering, specific tools, or industry knowledge — do NOT imply it exists.
- Instead: reframe adjacent experience, emphasize structured thinking, highlight transferable complexity, focus on stakeholder management.

TONE STANDARD: Sharp. Structured. Confident. Strategic. Human. Zero fluff. Zero fantasy. High credibility.
- No hyphenated phrases. No filler language. No over-emotional tone. No buzzword stacking. No clichés.

OUTPUT CONTRACT — Return ONLY this JSON object with EXACT keys. No markdown. No code fences. No text outside the JSON.

{
  "professional_summary": "string (120–180 words, executive tone, reflects seniority and ownership signals, emphasizes business impact not task execution, aligns with employer's highest-weighted priorities, avoids fluff and generic phrasing, commercially aware)",
  "winning_angle": "string (2–3 sentences answering: why this candidate makes strategic sense for this role despite domain gaps — highlights translation value, frames experience as an advantage, reduces perceived pivot risk)",
  "cover_letter": "string (Pinnacle format with 4 paragraphs separated by newlines: P1 = strong mission-aligned hook tied to company objectives; P2 = bridge lived experience to employer's key problem or priority; P3 = specific proof with metrics, ownership, structured thinking, cross-functional work; P4 = subtle growth statement on tool/technical deepening without claiming mastery, then confident closing — NO fabricated achievements)",
  "strategic_bridge": {
    "why_it_translates": ["string — bullet explaining logical experience mapping to role"],
    "perception_gaps": ["string — realistic gap a hiring manager may notice"],
    "interview_narrative": ["string — how to verbally frame the pivot in interviews"]
  },
  "interview_script": {
    "pitch_30s": "string (30-second positioning pitch — direct, strategic, controlled, non-defensive)",
    "pivot_90s": "string (90-second pivot explanation — honest, strategic framing of career transition)",
    "why_choose_you": "string (response to 'Why should we choose you?' — confident, evidence-based, non-generic)",
    "biggest_gap": "string (response to 'What is your biggest gap?' — honest, reframed constructively, shows self-awareness and growth mindset)"
  },
  "positioning_intelligence": "string (2–3 sentences explaining the strategic repositioning choices made and why they increase perceived fit)"
}

RESUME_INPUT: ${experience}

JOB_DESCRIPTION_INPUT: ${jd}`;

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
