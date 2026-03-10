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

        const prompt = `You are writing a cover letter for a real person. Before writing, perform this internal reasoning (do not include it in the output):

INTERNAL REASONING (silent — do not output):
1. PRIMARY SIGNAL ANGLE: What is the single strongest reason this candidate should plausibly succeed in ${roleTitle}? Identify the most compelling transferable signal from their resume.
2. SUPPORTING EVIDENCE: Which 2-3 specific experiences from the resume best demonstrate that signal? Look for concrete responsibilities, decisions, or measurable outcomes.
3. PRIMARY GAP: What is the most obvious mismatch between this candidate's background and the job description? Name it honestly.
4. STRATEGIC BRIDGE: How does the candidate's real experience still map to the role despite that gap? What adjacent capability or transferable pattern makes the gap less significant than it appears?

Now write the letter using that reasoning.

Resume: ${experience.slice(0, 3000)}
Target JD: ${jd.slice(0, 2000)}
Top signal gaps: ${alignmentResult.top_missing_signal || "N/A"}
Missing keywords: ${(alignmentResult.missing_keywords || []).join(", ")}
Score rationale: ${(alignmentResult.score_rationale || []).join("; ")}

HARD RULES:
- NEVER use "positioned to," "I am positioned," "positions me to," or any variation of "position" as a verb describing the candidate.
- NEVER start any paragraph with "Your organization requires," "Your organization needs," "Your team needs," or any sentence that echoes back JD requirements.
- NEVER use "I am writing to apply," "I am excited," "I am thrilled," "eager to contribute," or any generic application phrases.
- NEVER use filler transitions: "Furthermore," "Additionally," "Moreover," "In addition."
- NEVER pad with vague soft skills: "strong communicator," "team player," "detail-oriented" unless backed by specific evidence in the same sentence.
- NEVER fabricate experience or inflate claims beyond what the resume states.
- Maximum 280 words total. Exactly 4 paragraphs. First person as the candidate.

STRUCTURE:

Paragraph 1 — OPENING SIGNAL (2-3 sentences)
Lead with the primary signal angle from your reasoning. Open with a declarative statement of professional identity that names the strongest transferable signal for this specific role. The reader should immediately understand what this candidate brings and why it matters for THIS role. No generic openers.

Paragraph 2 — EVIDENCE OF FIT (3-4 sentences)
Use your supporting evidence. Describe specific experience that directly aligns with the role's requirements. Reference concrete responsibilities, decisions, or outcomes from the resume. Each sentence should deepen the case, not repeat it. Show the candidate operating at the level this role demands.

Paragraph 3 — HONEST GAP ACKNOWLEDGMENT + BRIDGE (2-3 sentences)
Name the primary gap directly in the first sentence (e.g., "My background is in X, not Y."). Then immediately reframe: explain specifically what experience transfers and why it is relevant. Use a concrete example. Do not minimize the gap or pretend it doesn't exist — reframe it as a different kind of qualification.

Paragraph 4 — CLOSING INTENT (1-2 sentences)
State what the candidate will do in this role based on their specific operational strengths. Reference a specific capability. One direct sentence of intent — no "Thank you for your consideration," no "I look forward to hearing from you."

${toneInstruction}

WRITING QUALITY:
- The letter must read as if a thoughtful human wrote it after deeply analyzing both the resume and job description.
- Natural paragraph rhythm — vary sentence length and structure.
- No robotic repetition of sentence patterns.
- Every claim must be traceable to actual resume content.
- The overall effect should be: intelligent, grounded, credible, signal-aware.

Return a JSON object with: "letter" (the full cover letter body text only — no header, no date, no salutation, no sign-off, no strategy notes, no labels, no debug notes)
Return ONLY valid JSON, no markdown.`;
        const raw = await callAI(prompt, 2500);
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
