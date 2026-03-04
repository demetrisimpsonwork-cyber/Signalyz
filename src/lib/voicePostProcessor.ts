/**
 * Post-processes AI-generated text to ensure second-person voice.
 * Replaces third-person references with "you/your".
 */
export function toSecondPerson(text: string, firstName?: string): string {
  if (!text) return text;
  let result = text;

  // Name-specific replacements (if we know the user's first name)
  if (firstName && firstName.length > 1) {
    const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePatterns: [RegExp, string][] = [
      [new RegExp(`${escaped}'s\\s+`, "gi"), "Your "],
      [new RegExp(`${escaped}\\s+has\\b`, "gi"), "You have"],
      [new RegExp(`${escaped}\\s+demonstrates?\\b`, "gi"), "You demonstrate"],
      [new RegExp(`${escaped}\\s+shows?\\b`, "gi"), "You show"],
      [new RegExp(`${escaped}\\s+lacks?\\b`, "gi"), "You lack"],
      [new RegExp(`${escaped}\\s+needs?\\b`, "gi"), "You need"],
      [new RegExp(`${escaped}\\s+displays?\\b`, "gi"), "You display"],
      [new RegExp(`\\b${escaped}\\b`, "gi"), "you"],
    ];
    for (const [pattern, replacement] of namePatterns) {
      result = result.replace(pattern, replacement);
    }
  }

  // Generic third-person → second-person replacements
  const genericPatterns: [RegExp, string][] = [
    [/\bThe candidate's\b/g, "Your"],
    [/\bthe candidate's\b/g, "your"],
    [/\bThe candidate\s+has\b/g, "You have"],
    [/\bthe candidate\s+has\b/g, "you have"],
    [/\bThe candidate\s+is\b/g, "You are"],
    [/\bthe candidate\s+is\b/g, "you are"],
    [/\bThe candidate\s+demonstrates?\b/g, "You demonstrate"],
    [/\bthe candidate\s+demonstrates?\b/g, "you demonstrate"],
    [/\bThe candidate\s+shows?\b/g, "You show"],
    [/\bthe candidate\s+shows?\b/g, "you show"],
    [/\bThe candidate\s+lacks?\b/g, "You lack"],
    [/\bthe candidate\s+lacks?\b/g, "you lack"],
    [/\bThe candidate\b/g, "You"],
    [/\bthe candidate\b/g, "you"],
    [/\bHis experience\b/g, "Your experience"],
    [/\bhis experience\b/g, "your experience"],
    [/\bHer experience\b/g, "Your experience"],
    [/\bher experience\b/g, "your experience"],
    [/\bTheir experience\b/g, "Your experience"],
    [/\btheir experience\b/g, "your experience"],
    [/\bHis background\b/g, "Your background"],
    [/\bhis background\b/g, "your background"],
    [/\bHer background\b/g, "Your background"],
    [/\bher background\b/g, "your background"],
    [/\bHis previous roles?\b/g, "Your previous roles"],
    [/\bhis previous roles?\b/g, "your previous roles"],
    [/\bHer previous roles?\b/g, "Your previous roles"],
    [/\bher previous roles?\b/g, "your previous roles"],
    [/\bHe demonstrates?\b/g, "You demonstrate"],
    [/\bhe demonstrates?\b/g, "you demonstrate"],
    [/\bShe demonstrates?\b/g, "You demonstrate"],
    [/\bshe demonstrates?\b/g, "you demonstrate"],
    [/\bHis resume\b/g, "Your resume"],
    [/\bhis resume\b/g, "your resume"],
    [/\bHer resume\b/g, "Your resume"],
    [/\bher resume\b/g, "your resume"],
    [/\bTheir resume\b/g, "Your resume"],
    [/\btheir resume\b/g, "your resume"],
    [/\bHis signal\b/g, "Your signal"],
    [/\bhis signal\b/g, "your signal"],
    [/\bHer signal\b/g, "Your signal"],
    [/\bher signal\b/g, "your signal"],
    [/\bTheir signal\b/g, "Your signal"],
    [/\btheir signal\b/g, "your signal"],
    [/\bCandidate signal\b/g, "Your signal"],
    [/\bcandidate signal\b/g, "your signal"],
    [/\bCandidate demonstrates?\b/g, "You demonstrate"],
    [/\bcandidate demonstrates?\b/g, "you demonstrate"],
  ];

  for (const [pattern, replacement] of genericPatterns) {
    result = result.replace(pattern, replacement);
  }

  return result;
}
