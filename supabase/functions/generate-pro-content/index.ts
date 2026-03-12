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

        const signalModel = alignmentResult.signal_model || {};
        const execSummary = signalModel.executive_insight_summary || alignmentResult.executive_insight_summary || {};
        const transferable = signalModel.transferable_signal_detection || alignmentResult.transferable_signal_detection || {};
        const interviewGap = signalModel.interview_gap_diagnosis || alignmentResult.interview_gap_diagnosis || {};
        const gaps = signalModel.gaps || alignmentResult.gaps || [];

        const signalContext = `
BACKGROUND (shape your thinking — NEVER dump into the text):
- Your strongest signal: ${execSummary.primary_strength || "N/A"}
- Biggest gap: ${gaps[0] || alignmentResult.top_missing_signal || "N/A"}
- What hiring managers will wonder: ${(interviewGap.what_hiring_managers_see || []).join("; ") || "N/A"}
- What transfers: ${transferable.detected_capability || "N/A"}
- Missing keywords: ${(alignmentResult.missing_keywords || []).join(", ") || "N/A"}`;

        const toneTemp = tone === "strategic" ? 0.55 : tone === "direct" ? 0.35 : 0.9;

        const toneInstruction = tone === "strategic"
          ? `VOICE: You are a senior professional writing to a peer. Measured. Commercially aware. You think in systems and outcomes. Compound sentences with semicolons. Words like "operationalized," "redesigned," "scaled." You imply more than you state. Your confidence is quiet — it comes from knowing you've done the math.

EXAMPLE (match the energy, not the words):
"Over four years running regulated complaint pipelines across three verticals, the throughline became clear: resolution speed is a retention lever, not a compliance checkbox. Redesigning the triage framework meant rebuilding intake logic and retraining two vendor teams — but median response time dropped from 72 to 31 hours, and renewal volume moved with it."`
          : tone === "direct"
          ? `VOICE: Say it plain. Short sentences. No warm-up. Subject-verb-object. You say what you did, what happened, and stop. Two sentences per paragraph when possible. No subordinate clauses unless load-bearing. Every word earns its seat.

EXAMPLE (match the energy, not the words):
"I run a 40-person escalation queue. Last year we closed 11,400 cases at 94% SLA. The job is triage, prioritization, and knowing when to pull a case before it costs a client."`
          : `VOICE: You're a person who's good at what you do and comfortable saying so. Warm but direct. You mix a short punch after a longer setup. You allow a dash mid-thought, a moment of candor. You don't hedge. You don't say "I believe" — you just say it. You sound like someone a hiring manager would want to grab coffee with.

EXAMPLE (match the energy, not the words):
"Regulated environments teach you one thing fast — speed without accuracy is noise. Running 40-70 concurrent escalations a day, you build the kind of judgment that only comes from volume: which cases need a call, which need a process fix, and which need to go up before they cost you a client."`;

        const prompt = `You are ${roleTitle === "this role" ? "a professional" : `a professional applying for ${roleTitle}`}${companyName !== "the company" ? ` at ${companyName}` : ""}. You are writing your own cover letter by hand. You have 250 words to make someone want to interview you.

You are NOT narrating your resume. You are NOT explaining how your background connects. You are making a case: hire me, here's why, here's what I've done, here's what I'll do.

${signalContext}

Your actual work history (the ONLY source of facts — invent nothing): ${experience.slice(0, 3000)}
The job: ${jd.slice(0, 2000)}

${toneInstruction}

THE VOICE TEST — read every sentence aloud. Does it sound like:
(A) Something you'd say to the hiring manager over coffee? → Keep it.
(B) Something a system generated to explain your fit? → Cut it. Rewrite as (A).

CONTRASTIVE PAIRS — internalize the difference:
BAD: "My experience managing cross-functional teams aligns well with the collaborative nature of this role."
GOOD: "I've spent three years keeping legal, ops, and product moving toward the same deadline. It rarely went smoothly — but things shipped."

BAD: "This background has equipped me with the skills necessary to excel in this position."
GOOD: "That's the job, from what I can tell. I've been doing some version of it for four years."

BAD: "I am confident that my track record of success positions me to make an immediate impact."
GOOD: "If you need someone who's already made the mistakes and built the fix, that's the conversation I want to have."

STRUCTURE — 5 paragraphs, separated by blank lines:

P1 (2 sentences): Open mid-action. Drop the reader into your work — a number, a system, a scope, a reality of your day. Then connect it to this role in one sentence. No "I am writing to apply." Start like you're already talking.

P2 (2-3 sentences): Your hardest evidence. Different from P1. Volumes, outcomes, things you built or fixed. Each sentence is a new proof point. No narration — just the work and what happened.

P3 (2 sentences): People proof. Who you worked with, what the stakes were, what call you made. Show judgment and human skill. Different evidence from P2.

P4 (2 sentences): The gap — half a sentence to name it, then show why it doesn't stop you. Sound like you've already thought about this. Not defensive. Not apologetic. Forward.

P5 (1-2 sentences): Land it. Name one specific thing you'll bring. End with momentum. Make them want to call. No "thank you for considering." No "I look forward to." Just a clean finish.

RULES:
- 250 words max. First person.
- Max 1 sentence per paragraph starts with "I." Vary openings: lead with the work, the number, the context.
- No two paragraphs open the same way. No three sentences with the same rhythm.
- Short sentence after a long one. Break up compound "and...and...and" sentences.
- ZERO fabrication. Resume facts only.
- BANNED: "positioned to," "passionate about," "eager to," "I believe," "proven ability," "results-driven," "dynamic environment," "thrilled," "excited to apply," "strong foundation," "Furthermore," "Additionally," "Moreover," "In conclusion," "fast-paced," "go-getter," "leveraging," "I am writing to express," "track record," "well-positioned," "skill set," "I am confident that"
- BANNED patterns: "translates to," "mirrors," "taught me," "required me to," "demonstrates," "aligns with," "prepared me," "directly relevant," "directly applicable," "transferable," "equipped me," "positions me"
- None of those. Zero. Write around them every time.

Return ONLY: {"letter": "..."} — body paragraphs only. No header, date, salutation, or sign-off.`;
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
