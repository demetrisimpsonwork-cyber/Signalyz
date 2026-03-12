import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

async function callAI(prompt: string, maxTokens = 4000, temperature = 0, retries = 1): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
          temperature: attempt > 0 ? Math.min(temperature, 0.5) : temperature,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`AI API error attempt ${attempt}: ${res.status} ${errText}`);
        if (attempt < retries) continue;
        throw new Error(`AI API error: ${res.status}`);
      }
      const data = await res.json();
      return data.content?.[0]?.text ?? "";
    } catch (e) {
      if (attempt < retries) {
        console.warn(`Retry ${attempt + 1} after error: ${e}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error("AI call failed after retries");
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
        const gaps = signalModel.gaps || alignmentResult.gaps || [];

        const gap = gaps[0] || alignmentResult.top_missing_signal || "N/A";
        const strength = execSummary.primary_strength || "N/A";

        const toneTemp = tone === "strategic" ? 0.5 : tone === "direct" ? 0.25 : 0.72;

        const toneDirective = tone === "strategic"
          ? `Write like a senior executive briefing a board member. Commercially precise. Never casual. Imply capability rather than stating it.
STRUCTURAL CONSTRAINT: No paragraph exceeds 3 lines. This is absolute — if a paragraph hits 4 lines, cut it. Every paragraph must open with a business outcome, market context, or organizational impact — never with "I." Sentences average 18-25 words. Use semicolons and subordinate clauses. No contractions. No exclamation marks. The letter should read like a business case, not a personal pitch. Never use "the same" to bridge between past and target roles — no "the same skills," "the same principles," "the same approach," "the same rigor." Assert what you did; never explain that one context is equivalent to another. The closing paragraph must be exactly 1 sentence — a single decisive statement that makes the reader pick up the phone. No summary of conversation topics. No meeting agendas. No "I look forward to discussing." End like a closing argument, not a calendar invite. Total length: 260-280 words.`
          : tone === "direct"
          ? `Write like a field operator. Short declarative sentences. No adjectives unless they carry data. Subject-verb-object. Cut every word that doesn't prove something.
STRUCTURAL CONSTRAINT: No paragraph exceeds 3 lines. Sentences average 8-14 words. No compound sentences joined by "and" — split them. No semicolons. Use periods. Never explain how experience "translates" or "translates directly" — just state what you did and what you will do next. The closing must be a single forward statement of intent — what you are ready to do, not why your past applies. No transferability language. The letter should feel like it was written by someone who bills by the hour. Total length: 200-220 words.`
          : `Write like a confident peer talking to the hiring manager over coffee. Warm, direct, human. Mix sentence lengths — one short punch after a longer thought. No hedging. Show momentum and energy.
STRUCTURAL CONSTRAINT: At least one paragraph must contain a sentence under 6 words. Use one rhetorical question or direct address to the reader. Contractions are allowed. The letter should feel like a real person wrote it in one sitting because they wanted the job. Total length: 240-260 words.`;

        const prompt = `Write a cover letter. You ARE the candidate. First person. You are applying for ${roleTitle}${companyName !== "the company" ? ` at ${companyName}` : ""}.

Your biggest strength: ${strength}
Your biggest gap: ${gap}

Resume (your ONLY source of facts — invent NOTHING): ${experience.slice(0, 2500)}
Job description: ${jd.slice(0, 1500)}

VOICE: ${toneDirective}

MINDSET: You are making a hiring case. You are not explaining your background. You are not analyzing fit. You are telling a hiring manager why they should pick you. Every sentence must either prove you can do the job or make them want to meet you. ASSERT capability. Do not explain how past experience "transfers" or "applies" — just use it as proof.

5 paragraphs.

P1 — THE CLAIM: Open with your single strongest credential for this specific role. A number, a system, a scope. Then one sentence connecting it to why this role. No philosophy. No "I am writing to." Start mid-work.

P2 — OPERATIONAL PROOF: Your hardest relevant work. Volumes, outcomes, problems you fixed. At least one sentence should start with the result, not "I." Prove you do hard work.

P3 — JUDGMENT PROOF: Who you worked across, what you navigated, decisions you made. Different evidence from P2. Show you handle people and complexity.

P4 — THE GAP: Name what you haven't done yet in one short clause. Then immediately say what you've done that makes you ready to figure it out. No apology. No "however the same principles apply."

P5 — THE CLOSE: Make the reader want to schedule the meeting. State what you bring to the conversation — not what you'll do in week one or month one. No onboarding plans. No "my first priority will be." No "I will focus on." End with forward motion that pulls the reader toward a next step, not an employee memo. One sentence maximum that makes them pick up the phone.

RULES:
- Max 1 sentence per paragraph starts with "I"
- Never explain WHY experience transfers or applies — just use it as direct proof
- Never describe what the role requires — the hiring manager knows
- ZERO fabrication
- Do not use "this," "these," or "that" to bridge between past experience and the target role. No "this experience," "these skills," "that background." Just state what you did and what you'll do.
- BANNED: "track record," "track record of," "positioned to," "passionate about," "eager to," "proven ability," "results-driven," "strong foundation," "translates to," "translates directly," "directly translates," "mirrors," "taught me," "aligns with," "prepared me," "transferable," "equipped me," "the fundamentals are," "this role requires," "this position represents," "the same skills," "operate consistently," "directly supports," "natural next step," "what this role needs," "I learned that," "this environment developed," "customer experience lives," "this represents," "it's not about," "what matters is," "natural evolution," "became critical," "comprehensive," "my first month," "my first week," "I will focus on," "my priority will be," "I plan to," "I intend to," "I look forward to discussing"

Return ONLY valid JSON: {"letter": "the full letter body"}`;

        const raw = await callAI(prompt, 2000, toneTemp, 1);
        let cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        // Resilient JSON extraction
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
        }
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
