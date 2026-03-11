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

        const prompt = `You are a professional cover letter writer. Your client is applying to ${roleTitle}${companyName !== "the company" ? ` at ${companyName}` : ""}. Write a letter they would confidently submit — persuasive, human, and grounded in their actual experience.

Before writing, reason silently (do not include any of this in output):

INTERNAL REASONING (silent — do not output):
1. What is the single most compelling reason a hiring manager should consider this candidate for ${roleTitle}? Ground this in real experience, not transferability arguments.
2. Which 2-3 specific achievements or responsibilities from the resume would matter most to THIS employer based on the JD?
3. What is the biggest gap, and what is the honest, non-defensive way to address it?
4. What would make the hiring manager want to meet this person after reading paragraph one?

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
- Maximum 230 words total. Exactly 4 paragraphs. First person as the candidate.
- Each paragraph must be separated by exactly one blank line.
- ABSOLUTE PARAGRAPH LIMIT: No single paragraph may exceed 3 sentences. If you draft a 4th sentence in any paragraph, delete the weakest one.

VOICE AND RHYTHM — THIS IS THE MOST IMPORTANT SECTION:
- Write like a sharp candidate who knows their worth — not like a system explaining why they qualify.
- INVISIBLE TRANSFER LOGIC: Never write a sentence whose job is to explain why skill X is relevant to role Y. Instead, describe the candidate's work using the language and framing of the target role so the fit is felt, not argued. The reader should think "this person already does this work" — without being told so explicitly.
- ZERO SCAFFOLDING PHRASES: Do not use sentences structured as "[experience] demonstrates / supports / translates to / prepares me for [role requirement]." If you catch yourself connecting A to B with a bridge verb, delete the bridge and rewrite A so it already sounds like B.
- VARY SENTENCE OPENINGS: No more than 1 sentence per paragraph may start with "I." Lead with outcomes, environments, scale, or the work itself. Examples: "Managing 40-70 concurrent escalations daily built…" / "That volume required…" / "Revenue grew 18% after…"
- MIX SENTENCE LENGTH: Alternate short (8-12 words) and medium (15-22 words). Never stack 3 sentences of similar length or structure.
- HUMAN CADENCE: Include natural rhythmic variation — an occasional fragment for emphasis, a dash to pivot mid-thought, a sentence that breathes. The writing should feel like someone who drafts well, not like output that was optimized. Read each paragraph aloud mentally: if every sentence has the same beat, rewrite.
- CANDIDATE-SPECIFIC DETAIL: Every middle-paragraph sentence must reference a specific system, volume, process, outcome, or environment from THIS candidate's resume. If a sentence could appear in any operations professional's cover letter unchanged, it is too generic — rewrite with the candidate's actual specifics.
- NO NOUN PHRASE REPETITION: If you use "operational discipline" once, do not use it again. Same for "customer flow," "cross-functional coordination," "stakeholder management," or any operational noun phrase. Find a different, natural way to express the concept each time.
- CONFIDENCE WITHOUT HEDGING: No "I believe," "I feel," "perhaps," "likely," "potentially." State facts and intent directly.
- PERSUASIVE INEVITABILITY: The letter should make the reader feel this candidate has already been doing adjacent work at the required level — not that they could theoretically do it with the right opportunity. Frame the gap as a narrow surface difference, not a fundamental qualification question.

STRUCTURE:

Paragraph 1 — OPENING (2-3 sentences):
Establish professional identity and create immediate interest. The reader should understand WHO this person is, WHAT they do at scale, and WHY this role is a natural next step — all within the first two sentences. Do not restate duties. Frame the candidate's identity so the role feels like an obvious fit, not a stretch. A third sentence is permitted only if it adds a specific metric or achievement.

Paragraph 2 — STRONGEST EVIDENCE (2-3 sentences):
Present the most relevant operational proof using THIS candidate's specific numbers, systems, and outcomes. Each sentence should feature different evidence. Start sentences with the work itself, not with "I." These sentences should sound like they could only have been written by this particular candidate — not any operations professional.

Paragraph 3 — GAP BRIDGE (2 sentences):
Name the gap honestly in half a sentence, then pivot immediately to the strongest transferable evidence. Compress the acknowledgment — spend more words on readiness than on what's missing. The pivot should feel like a professional who has already thought this through, not a candidate defending themselves.

Paragraph 4 — CLOSE (2 sentences):
First sentence: name one specific, concrete contribution the candidate will make. Second sentence: end with conviction. The reader should finish wanting to schedule an interview. No "I look forward to." No pleasantries. No generic closer.

${toneInstruction}

WRITING QUALITY:
- BANNED PHRASES: "built expertise in," "directly translates to," "demonstrates the analytical approach," "demonstrates the systems thinking," "translates directly to," "supports the requirements of," "essential for," "showcases ability to," "brings a unique combination of," "deep understanding of," "well-versed in," "extensive experience in," "proven ability to," "strong foundation in," "key areas," "aligns with," "requires the same capabilities as," "mirrors the demands of," "parallels the requirements of," "this experience transfers," "these skills translate," "which prepared me," "which equipped me," "this demonstrates," "this supports," "this translates," "this prepared me," "operational discipline" (use only once if at all), "cross-functional coordination" (use only once if at all).
- NO REPEAT CONCEPTS: If a skill or idea appears in one paragraph, it cannot appear in any other paragraph.
- WORD CHOICE: Use the candidate's own vocabulary from the resume wherever possible.
- CONCRETENESS: Replace every abstract claim with the specific thing. "I managed compliance" → "I managed FDA audit responses across 3 product lines."
- Every claim must be traceable to actual resume content. Zero fabrication.
- FINAL CHECK: Read the letter as a hiring manager who reads 50 cover letters a week. Does this one sound like a real person with real conviction, or like polished AI output? If any sentence feels system-generated, rewrite it until it sounds like a specific human wrote it about their specific career.

Return a JSON object with: "letter" (the full cover letter body text — exactly 4 paragraphs separated by double newlines — no header, no date, no salutation, no sign-off, no strategy notes, no labels, no debug notes)
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
