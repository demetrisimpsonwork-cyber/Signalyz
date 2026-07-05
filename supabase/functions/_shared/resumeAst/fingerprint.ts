/** Deterministic UTF-8 content fingerprint (FNV-1a dual-lane hex). Stable across runtimes. */
export function hashContent(text: string): string {
  const normalized = text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    h1 ^= normalized.charCodeAt(i);
    h1 = Math.imul(h1, h2);
  }
  let h3 = 0x811c9dc5;
  for (let i = normalized.length - 1; i >= 0; i--) {
    h3 ^= normalized.charCodeAt(i);
    h3 = Math.imul(h3, h2);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h3 >>> 0).toString(16).padStart(8, "0")}`;
}

export function fingerprintBullet(text: string, context?: { role?: string; company?: string; section?: string }): string {
  const payload = [
    context?.section ?? "",
    context?.role ?? "",
    context?.company ?? "",
    text,
  ].join("|");
  return `bullet_${hashContent(payload)}`;
}

export function fingerprintSection(kind: string, payload: string): string {
  return `section_${kind}_${hashContent(payload)}`;
}

export function fingerprintResume(astPayload: string): string {
  return `resume_${hashContent(astPayload)}`;
}

/** Canonical serialization payload for resume-level fingerprinting. */
export function buildResumeFingerprintPayload(ast: {
  header: { name?: string; title?: string; location?: string; rawLines: string[] };
  professionalSummary: { text: string };
  experience: Array<{ title: string; company: string; dates: string; bullets: Array<{ text: string }> }>;
  projects: Array<{ name: string; bullets: Array<{ text: string }> }>;
  education: Array<{ degree?: string; institution: string; year?: string }>;
  skills: Array<{ name: string }>;
  certifications: Array<{ name: string }>;
  awards: Array<{ title: string }>;
  customSections: Array<{ title: string; lines: string[]; bullets: Array<{ text: string }> }>;
}): string {
  const parts: string[] = [];
  parts.push(ast.header.name ?? "");
  parts.push(ast.header.title ?? "");
  parts.push(ast.professionalSummary.text);
  for (const exp of ast.experience) {
    parts.push(`${exp.title}|${exp.company}|${exp.dates}`);
    for (const b of exp.bullets) parts.push(b.text);
  }
  for (const proj of ast.projects) {
    parts.push(proj.name);
    for (const b of proj.bullets) parts.push(b.text);
  }
  for (const edu of ast.education) {
    parts.push(`${edu.degree ?? ""}|${edu.institution}|${edu.year ?? ""}`);
  }
  parts.push(ast.skills.map((s) => s.name).join(","));
  parts.push(ast.certifications.map((c) => c.name).join(","));
  for (const sec of ast.customSections) {
    parts.push(sec.title);
    parts.push(...sec.lines);
    for (const b of sec.bullets) parts.push(b.text);
  }
  return parts.join("\n");
}
