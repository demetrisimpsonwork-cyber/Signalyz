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

        const toneTemp = tone === "strategic" ? 0.5 : tone === "direct" ? 0.3 : 0.8;

        const toneInstruction = tone === "strategic"
          ? `TONE — STRATEGIC:
Write like a management consultant making a business case. Frame everything through systems, scale, and commercial impact. Use compound sentences that layer evidence logically. Semicolons and em dashes connect related ideas. The reader should feel they're reading someone who thinks in architectures and outcomes — someone who sees the whole board. Vocabulary: "designed," "operationalized," "scaled," "restructured." Closing should connect the candidate's operational systems to what the organization needs to build next. This tone should feel noticeably more cerebral, analytical, and commercially framed than the other modes.`
          : tone === "direct"
          ? `TONE — DIRECT:
Write like someone who respects the reader's time. Every sentence is declarative, subject-verb-object. No subordinate clauses unless essential. No warming-up phrases. Paragraphs are tight — 2 sentences preferred. More white space between ideas. Sentence length: 8-15 words typical. The letter should feel like a confident professional who says what they mean and stops. Vocabulary: plain, operational, concrete. "I run." "I built." "I delivered." Closing is one sentence. Period. This tone should feel noticeably shorter, sharper, and more plainspoken than the other modes.`
          : `TONE — CONFIDENT:
Write like a candidate who knows they belong in this conversation. Warm authority — professional credibility with personal weight behind it. The reader should feel the candidate's presence, not just their resume. Mix medium and short sentences for natural rhythm. Allow a touch of personality — a well-placed dash, a sentence that shows self-awareness, a moment of directness that breaks the professional veneer just enough to feel real. No hedging. No "I believe" or "I feel." State things as facts with the warmth of someone who earned the right to. This tone should feel noticeably more personable and assertive than the other modes.`;

        const prompt = `You are ghostwriting a cover letter for a real person applying to ${roleTitle}${companyName !== "the company" ? ` at ${companyName}` : ""}. They need to send this today.

Your job is NOT to explain why their experience transfers. Your job is to write a letter so grounded in their actual work that the hiring manager thinks: "This person already does what we need."

BEFORE WRITING — think silently (do not output any of this):
- What is ONE thing about this candidate that would make a hiring manager pause and read more carefully?
- What specific number, system, or outcome from their resume is most impressive for THIS role?
- If this candidate were sitting across from the hiring manager, what would they say in the first 30 seconds?

${signalIntelligence}

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

STRUCTURE — exactly 5 paragraphs separated by blank lines:

Paragraph 1 — THE HOOK (2 sentences):
Open with who this person is and what they do — stated in a way that immediately sounds relevant to ${roleTitle}. Not "I am writing to apply." Not a duty restatement. The reader should think "tell me more" after sentence one. Sentence two adds one specific proof point — a number, a scale, a system — that earns credibility instantly.

Paragraph 2 — THE CASE (2-3 sentences):
The strongest evidence from their actual background. Specific systems, volumes, outcomes, environments. Each sentence should feature DIFFERENT evidence. These sentences should sound like they could only come from THIS person's career — not any operations professional. Start sentences with the work, not with "I."

Paragraph 3 — THE CROSSWALK (2 sentences):
Connect their background to what the role actually needs. But do it NATURALLY — describe their work using the role's language so the fit is self-evident. Do NOT write "this translates to" or "this mirrors" or "this demonstrates." If you find yourself explaining WHY something is relevant, you've failed. Just describe the work in a way that makes relevance obvious.

Paragraph 4 — THE GAP (2 sentences):
Name what's missing honestly — half a sentence, no more. Then immediately pivot to what they DO bring that matters more. This should sound like a professional who has already thought this through and isn't worried about it. Confident, not defensive. Not inflated.

Paragraph 5 — THE CLOSE (1-2 sentences):
One concrete thing they will do or bring. End with conviction. The reader should want to schedule an interview. No "I look forward to discussing." No pleasantries. Just a clear, forward statement.

${toneInstruction}

RULES:
- 250 words maximum. First person as the candidate.
- Zero fabrication. Every claim traceable to the resume.
- Do not invent employers, systems, metrics, titles, or supervisory scope.
- BANNED PHRASES: "positioned to," "I am writing to apply," "excited to," "thrilled to," "passionate about," "dedicated to," "committed to," "eager to contribute," "I believe that," "strong foundation in," "proven ability to," "extensive experience in," "well-versed in," "deep understanding of," "Furthermore," "Additionally," "Moreover," "In addition," "this translates to," "this mirrors," "this demonstrates," "this supports," "which prepared me," "which equipped me," "aligns with."
- Max 1 sentence starting with "I" per paragraph. Vary openings: lead with outcomes, scale, environments, the work itself.
- No repeated operational noun phrases across the letter.
- FINAL TEST: Read each paragraph. Does it sound like a real person wrote it about their real career? Or does it sound like a system generated it? If any sentence sounds generated, rewrite it.

Return a JSON object with: "letter" (the full cover letter body text — exactly 5 paragraphs separated by double newlines — no header, no date, no salutation, no sign-off, no labels)
Return ONLY valid JSON, no markdown.`;
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
