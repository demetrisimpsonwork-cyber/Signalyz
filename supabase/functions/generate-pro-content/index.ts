import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

async function callAI(prompt: string, maxTokens = 4000): Promise<string> {
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
      temperature: 0,
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

        const toneInstruction = tone === "strategic"
          ? `TONE — STRATEGIC:
- Most analytical and intelligent mode. Frame the letter through systems-thinking language: "designed," "scaled," "operationalized," "built the process that."
- Every achievement should be contextualized with outcomes, scale, and downstream effects.
- Bridge logic must be the strongest here — connect seemingly unrelated experience to role requirements through clear analytical reasoning.
- Paragraphs can be longer; each sentence should build on the prior one logically, creating a chain of reasoning.
- Sentence construction: compound-complex sentences that layer evidence. Use semicolons and em dashes to connect related ideas.
- Close with a single sentence connecting your operational systems to what the company needs to build next.
- NEVER use "positioned to," "I am positioned," or "positions me to."`
          : tone === "direct"
          ? `TONE — DIRECT:
- Tightest possible writing. Every sentence is declarative. No subordinate clauses unless absolutely necessary.
- No throat-clearing phrases: never use "In my experience," "I believe that," "Having worked in," "It is worth noting."
- Start sentences with subjects and verbs. Prefer active voice exclusively.
- Paragraphs: 2-3 sentences maximum. White space between ideas.
- More operational language: "I run," "I built," "I manage," "I delivered."
- Sentence construction: short, punchy, subject-verb-object. Minimal adjectives.
- Close with exactly one sentence stating intent. No pleasantries.
- NEVER use "positioned to," "I am positioned," or "positions me to."`
          : `TONE — CONFIDENT:
- Warm but authoritative. Professional credibility without stiffness.
- Authority-first framing: state the claim, then back it with evidence.
- No hedging words anywhere: no "I believe," "I feel," "I think," "perhaps," "likely," "potentially."
- Every sentence projects certainty while remaining personable. Use present tense where possible.
- Sentence construction: medium-length sentences with natural rhythm. Vary sentence length for pacing — a short declarative sentence after a longer one creates emphasis.
- Balanced persuasion: confident without being aggressive.
- Close with a direct statement of intent that feels natural, not formulaic.
- NEVER use "positioned to," "I am positioned," or "positions me to."`;

        const prompt = `You are writing a cover letter for a real person applying to ${roleTitle}${companyName !== "the company" ? ` at ${companyName}` : ""}. 

Before writing, perform this internal reasoning (do not include it in the output):

INTERNAL REASONING (silent — do not output):
1. PRIMARY SIGNAL ANGLE: Using the signal intelligence below, what is the single strongest reason this candidate should plausibly succeed in ${roleTitle}? Use the primary strength and transferable signal data to identify this.
2. SUPPORTING EVIDENCE: Which 2-3 specific experiences from the resume demonstrate that angle? Look for concrete responsibilities, decisions, or measurable outcomes. Cross-reference with JD priority signals.
3. PRIMARY GAP: What is the most significant mismatch? Use the top gap and what hiring managers see to identify the real friction point.
4. STRATEGIC BRIDGE: How does the candidate's real experience map to the role despite that gap? Use the repositioning opportunity and elevation opportunity to construct this bridge.
5. EMPLOYER LENS: What does this employer actually weight most based on the JD signals? Shape the letter around THEIR priorities, not just the candidate's strengths.

${signalIntelligence}

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}

HARD RULES:
- NEVER use "positioned to," "I am positioned," "positions me to," or any variation of "position" as a verb describing the candidate.
- NEVER start any paragraph with "Your organization requires," "Your organization needs," "Your team needs," or any sentence that echoes back JD requirements.
- NEVER use "I am writing to apply," "I am excited," "I am thrilled," "eager to contribute," or any generic application phrases.
- NEVER use filler transitions: "Furthermore," "Additionally," "Moreover," "In addition."
- NEVER pad with vague soft skills: "strong communicator," "team player," "detail-oriented" unless backed by specific evidence in the same sentence.
- NEVER fabricate experience or inflate claims beyond what the resume states.
- NEVER use "passionate about," "dedicated to," "committed to" — replace with concrete operational language.
- NEVER repeat a transferable-fit explanation across multiple sentences. State it ONCE. If you find yourself writing "X transfers to Y. This translates to Z. This demonstrates…" — delete the second and third sentences.
- Maximum 230 words total. Exactly 5 paragraphs (Opening Hook, Intent Bridge, Operational Fit, Transferable Signal + Gap Reframe, Closing). First person as the candidate.
- Each paragraph must be separated by exactly one blank line.
- ABSOLUTE PARAGRAPH LIMIT: No single paragraph may exceed 3 sentences. If you draft a 4th sentence in any paragraph, delete the weakest one.

STRUCTURE:

Paragraph 1 — OPENING HOOK (2 sentences. Never 3.)
One declarative statement of professional identity grounded in what the candidate actually does. One sentence connecting that identity to this specific role. Drop the reader into the strongest signal immediately. No setup.

Paragraph 2 — INTENT BRIDGE (1 sentence only. Never 2.)
One sentence connecting the candidate's operational background to the leadership or responsibilities of ${roleTitle}. This sentence explains WHY their specific experience prepares them for this role — not WHAT they did (that comes next). Keep it concise and role-aligned. No storytelling. No personal narrative. Example pattern: "This operational environment developed the prioritization and decision discipline required to coordinate customer experience teams and service workflows."

Paragraph 3 — OPERATIONAL FIT (2 sentences. Never 3.)
Show the candidate doing the work this role requires. Each sentence presents different evidence — a different system, decision, scale, or outcome. Start each sentence differently. Direct phrasing only.

Paragraph 4 — TRANSFERABLE SIGNAL + GAP REFRAME (2 sentences. Never 3.)
First sentence: name one capability that maps to the role and state the concrete evidence. Second sentence: acknowledge the gap and reframe it with one piece of evidence. No defensiveness. No hedging.

Paragraph 5 — CLOSING (2 sentences. Never 3.)
State one specific thing the candidate will do in this role. End with a single direct sentence. No "I look forward to." No "Thank you." No pleasantries.

${toneInstruction}

WRITING QUALITY — CRITICAL:
- PARAGRAPH LENGTH: 2 sentences per paragraph default. The Intent Bridge paragraph is exactly 1 sentence. A third sentence elsewhere is permitted ONLY if it introduces a concrete metric not present in the first two.
- DIRECT PHRASING: Prefer "I run X" over "I have experience running X." Prefer "Revenue grew 18%" over "I was responsible for driving revenue growth."
- NO REPEAT CONCEPTS: If a skill or idea appears in one paragraph, it cannot appear in any other paragraph. One mention per letter.
- TARGET SENTENCE LENGTH: 14–20 words per sentence. If a sentence exceeds 25 words, split it or cut it.
- SENTENCE RHYTHM: No more than 2 consecutive sentences may begin with "I," "My," or "This."
- ZERO TRANSFER CHAINS: Forbidden patterns: "X requires the same skills as Y," "This demonstrates the capabilities needed for Z," "X translates directly to Y." State the fact. Stop.
- NATURAL VOICE: Write like a professional explaining their work to a peer. Short, plain, specific.
- BANNED PHRASES: "built expertise in," "directly translates to," "demonstrates the analytical approach," "demonstrates the systems thinking," "translates directly to," "supports the requirements of," "essential for," "showcases ability to," "brings a unique combination of," "deep understanding of," "well-versed in," "extensive experience in," "proven ability to," "strong foundation in," "key areas," "aligns with," "requires the same capabilities as," "mirrors the demands of," "parallels the requirements of."
- CONCRETENESS: Replace every abstract claim with the specific thing.
- WORD CHOICE: Use the candidate's own vocabulary from the resume.
- REDUNDANCY CHECK: Scan the entire letter before finalizing. If any concept appears twice, keep only the first mention.
- Every claim must be traceable to actual resume content. Zero fabrication.

TONE STRUCTURE EFFECTS:
- If CONFIDENT: 2 sentences per paragraph default. Intent Bridge = 1 sentence. Warm authority.
- If STRATEGIC: 2–3 sentences allowed in Operational Fit only. Intent Bridge = 1 sentence. Connective reasoning, not restatement.
- If DIRECT: 2 sentences per paragraph. Intent Bridge = 1 sentence. No exceptions. Declarative only.

Return a JSON object with: "letter" (the full cover letter body text — exactly 5 paragraphs separated by double newlines — no header, no date, no salutation, no sign-off, no strategy notes, no labels, no debug notes)
Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 3000);
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
