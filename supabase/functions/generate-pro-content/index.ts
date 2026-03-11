import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

async function callAI(prompt: string, maxTokens = 4000, temperature = 0): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`AI API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

function sanitize(input: string): string {
  return input
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "")
    .replace(/you\s+are\s+now/gi, "")
    .replace(/system\s*:/gi, "")
    .slice(0, 15000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const type = body.type as string;
    const experience = sanitize(body.experience || "");
    const jd = sanitize(body.jd || "");
    const alignmentResult = body.alignmentResult || {};
    const currentHeadline = sanitize(body.currentHeadline || "");
    const currentAbout = sanitize(body.currentAbout || "");
    const inferredRole = sanitize(body.inferredRole || "");

    let result: unknown;

    switch (type) {
      case "gap_actions": {
        const gaps = alignmentResult.missing_keywords || [];
        const topGap = alignmentResult.top_missing_signal || "";
        const scoreRationale = alignmentResult.score_rationale || [];
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

You are a hiring signal analyst. Given these signal gaps from a resume-to-JD alignment analysis, produce actionable fix cards.

Resume experience: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}
Top missing signal: ${topGap}
Missing keywords: ${gaps.join(", ")}
Score rationale: ${scoreRationale.join("; ")}

For the top 3 signal gaps, produce a JSON array of exactly 3 objects with:
- "gap_name": short name of the gap
- "why_it_hurts": one sentence explaining why this gap reduces match score
- "action": one specific resume action — a keyword to add, a bullet to reframe, or a section to restructure — written as a direct instruction the user can execute immediately. Start with a verb.
- "impact": "High", "Medium", or "Low" based on how much closing this gap would affect hiring stage outcomes

Order by highest impact first. Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "calibrated_summary": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively. Never use the candidate's name or third-person pronouns.

Generate professional summary variants for this candidate targeting this specific role. Use only experience that exists in the resume — zero fabrication, zero inflation.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

Each variant must reposition the same experience through a different strategic lens:

Variant A — Ownership Emphasis: Open with scope of responsibility and end-to-end ownership language. Lead with what the candidate ran, not what they did.

Variant B — Client Impact Emphasis: Open with client-facing outcomes and relationship language. Lead with who the candidate served and what changed for them.

Variant C — Cross-Functional Emphasis: Open with coordination scope and stakeholder complexity. Lead with the breadth of teams and parties the candidate operated across.

Each variant: 3 sentences maximum. No variant should sound like the others. Every sentence must be traceable to actual resume content. Third person, institutional voice.

Return a JSON object with:
- "variants": [{"name": "Ownership Emphasis", "text": "...", "why_this_works": "one-liner explaining which signal dimension it strengthens"}, ...]

Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 2000);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "interview_intelligence": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

You are a hiring manager for this specific role. Based on the signal gaps and risks identified in this alignment analysis, generate exactly 5 interview questions you would ask this candidate.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}
Match score: ${alignmentResult.match_score || "N/A"}
Top missing signal: ${alignmentResult.top_missing_signal || "N/A"}
Score rationale: ${(alignmentResult.score_rationale || []).join("; ")}
Missing keywords: ${(alignmentResult.missing_keywords || []).join(", ")}

Each question must: (1) directly probe a specific gap or risk from the analysis — not a generic interview question, (2) be written exactly as a hiring manager would ask it in a real interview, first person, direct, (3) include a "why_asking" note in one sentence tied to the specific gap it probes, (4) include a "signal_angle" coaching note in one sentence telling the user what their answer must demonstrate to pass this question. Zero generic questions.

Return a JSON array of 5 objects with: "question", "why_asking", "signal_angle"
Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 2000);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "ats_panel": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

Identify keywords and phrases from this job description that are absent or under-represented in the resume, and keywords that match well.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

Return a JSON object with:
- "missing_keywords": array of up to 10 specific, meaningful keywords/phrases from the JD absent from the resume. Not generic words like "experience" or "strong." Each as a string.
- "matched_keywords": array of up to 10 keywords/phrases present in both JD and resume. Each as a string.
- "ats_risk": "High" (6+ missing), "Moderate" (3-5 missing), or "Low" (0-2 missing)
- "ats_risk_explanation": one sentence explaining the risk score

Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "linkedin_headline": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

Generate 3 LinkedIn headline variants for this candidate targeting roles similar to ${inferredRole}. 

Resume: ${experience.slice(0, 3000)}
Current headline: ${currentHeadline || "(none)"}

Each variant must: signal the specific role they are targeting, use language a recruiter scanning for this role type would pattern-match on, be under 220 characters, and take a meaningfully different strategic angle:

Variant A — lead with role title and domain
Variant B — lead with the outcome or value delivered
Variant C — lead with the specific capability that differentiates this candidate

Return a JSON array of 3 objects with: "label", "text" (the headline)
Return ONLY valid JSON array, no markdown.`;
        const raw = await callAI(prompt, 1000);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "linkedin_summary": {
        const prompt = `Address the user directly in second person throughout. Use 'you' and 'your' exclusively.

Rewrite this LinkedIn About section for a candidate targeting ${inferredRole}. Use only experience from the resume — zero fabrication.

Resume: ${experience.slice(0, 3000)}
Current About: ${currentAbout || "(none — build from scratch)"}

The summary must: open with a hook that names their specific professional identity in one sentence, spend the middle section connecting their cross-environment experience to the target role's core requirements, and close with a forward-looking statement about what kind of role and organization they're seeking. Tone: confident, direct, first person, no buzzwords. 3 paragraphs maximum.

Return a JSON object with: "summary" (the full About section text)
Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 1500);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      case "cover_letter": {
        const companyName = sanitize(body.companyName || "the company");
        const roleTitle = inferredRole || "this role";
        const tone = sanitize(body.tone || "confident");

        // Extract signal intelligence from alignment result
        const signalModel = alignmentResult.signal_model || {};
        const execSummary = signalModel.executive_insight_summary || alignmentResult.executive_insight_summary || {};
        const transferable = signalModel.transferable_signal_detection || alignmentResult.transferable_signal_detection || {};
        const interviewGap = signalModel.interview_gap_diagnosis || alignmentResult.interview_gap_diagnosis || {};
        const riskProjection = signalModel.risk_projection || {};
        const signalAlignment = signalModel.signal_alignment_analysis || alignmentResult.signal_alignment_analysis || [];
        const resumeProfile = signalModel.resume_signal_profile || alignmentResult.resume_signal_profile || {};
        const jdSignals = signalModel.jd_signal_extraction || alignmentResult.jd_signal_extraction || {};
        const strengths = signalModel.strengths || alignmentResult.strengths || [];
        const gaps = signalModel.gaps || alignmentResult.gaps || [];

        // Build signal intelligence block for the prompt
        const signalIntelligence = `
SIGNAL INTELLIGENCE (use to shape the letter — do NOT dump these diagnostics into the text):
- Primary Strength: ${execSummary.primary_strength || "N/A"}
- Top Gap: ${gaps[0] || alignmentResult.top_missing_signal || "N/A"}
- Strategic Repositioning Opportunity: ${execSummary.strategic_repositioning_opportunity || "N/A"}
- What Hiring Managers See: ${(interviewGap.what_hiring_managers_see || []).join("; ") || "N/A"}
- Transferable Signal: ${transferable.detected_capability || "N/A"} — ${transferable.why_it_transfers || ""}
- Elevation Opportunity: ${transferable.elevation_opportunity || "N/A"}
- Key Strengths: ${(Array.isArray(strengths) ? strengths.slice(0, 4) : []).join("; ") || "N/A"}
- Risk Areas: ${(riskProjection.stages || []).filter((s: any) => s.status !== "PASS").map((s: any) => `${s.stage}: ${s.explanation}`).join("; ") || "None identified"}
- JD Priority Summary: ${jdSignals.priority_summary || "N/A"}
- JD Role Identity Signals: ${(jdSignals.role_identity_signals || []).slice(0, 5).join(", ") || "N/A"}
- Alignment Weak Spots: ${(Array.isArray(signalAlignment) ? signalAlignment.filter((a: any) => a.alignment_level === "Weak" || a.alignment_level === "Missing").map((a: any) => `${a.category}: ${a.perception_gap}`).slice(0, 3) : []).join("; ") || "None"}
- Resume Signal Strengths: ${Object.entries(resumeProfile).filter(([_, v]: any) => v?.strength === "Strong").map(([k]: any) => k.replace(/_/g, " ")).join(", ") || "N/A"}
- Missing Keywords: ${(alignmentResult.missing_keywords || []).join(", ") || "N/A"}
- Score Rationale: ${(alignmentResult.score_rationale || []).join("; ") || "N/A"}`;

        const toneTemp = tone === "strategic" ? 0.6 : tone === "direct" ? 0.4 : 0.85;

        const toneBlock = tone === "strategic"
          ? `TONE: STRATEGIC — Think management consultant. Layer evidence into compound sentences. Use semicolons and dashes to connect ideas. Vocabulary skews analytical: "operationalized," "designed," "restructured," "scaled." Every sentence implies commercial awareness.

EXAMPLE of Strategic tone (do NOT copy — match the style):
"Over four years managing regulated complaint pipelines across three product verticals, the pattern became clear: resolution speed is a retention lever, not just a compliance metric. Designing the triage framework that cut median response time from 72 to 31 hours meant rebuilding intake logic, retraining two vendor teams, and proving to leadership that faster close rates drove a measurable lift in renewal volume."`
          : tone === "direct"
          ? `TONE: DIRECT — Short sentences. Plain words. Subject-verb-object. Say it and stop. Paragraphs are 2 sentences max when possible. No subordinate clauses unless essential. No warm-up phrases.

EXAMPLE of Direct tone (do NOT copy — match the style):
"I run a 40-person escalation queue across regulated and unregulated products. Last year my team closed 11,400 cases with a 94% SLA hit rate. The job was triage, prioritization, and knowing when to pull a case before it became a complaint."`
          : `TONE: CONFIDENT — Warm authority. You know your worth and you're comfortable saying so. Mix sentence lengths — a short punch after a longer setup. Allow personality: a dash mid-thought, a moment of self-awareness. No hedging, no "I believe" — just earned confidence with warmth behind it.

EXAMPLE of Confident tone (do NOT copy — match the style):
"Regulated environments taught me something most operations professionals learn the hard way — speed without accuracy is just noise. Managing 40-70 concurrent escalations daily, I built the kind of judgment that only comes from volume: which cases need a call, which need a process fix, and which need to be escalated before they cost the company a client."`;

        const prompt = `Ghostwrite a cover letter. The candidate is applying to ${roleTitle}${companyName !== "the company" ? ` at ${companyName}` : ""}. They are sending this today.

DO NOT explain why their experience is relevant. Instead, DESCRIBE their work using the language of ${roleTitle} so the reader naturally sees the fit.

${signalIntelligence}

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

${toneBlock}

Write exactly 5 paragraphs, separated by blank lines:

P1 — HOOK (2 sentences): Who they are + one striking proof point. The reader should want to keep reading. Not "I am writing to apply." Open with something specific.

P2 — PROOF (2-3 sentences): Their strongest real evidence — numbers, systems, outcomes from THEIR resume. Each sentence = different evidence. Start sentences with the work, not "I."

P3 — FIT (2 sentences): Show how their work connects to what this role needs. Do this by describing their work in the role's language — never by explaining the connection. If you write "translates to" or "mirrors" or "demonstrates," delete it and rewrite.

P4 — GAP (2 sentences): Half a sentence acknowledging what's missing, then pivot hard to what they bring that matters more. Sound like someone who's already thought this through.

P5 — CLOSE (1-2 sentences): One specific thing they'll contribute. End with conviction. No pleasantries.

CONSTRAINTS:
- 250 words max. First person.
- Zero fabrication. No invented employers, metrics, systems, titles, or supervisory scope.
- Max 1 "I" sentence start per paragraph.
- Never use: "positioned to," "passionate about," "eager to," "I believe," "strong foundation," "proven ability," "this translates," "this mirrors," "this demonstrates," "Furthermore," "Additionally," "Moreover."
- No noun phrase used twice in the letter.

Return ONLY a JSON object: {"letter": "..."} — body text only, no header/date/salutation/sign-off/labels.`;
        const raw = await callAI(prompt, 3000, toneTemp);
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        result = JSON.parse(cleaned);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown content type" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
