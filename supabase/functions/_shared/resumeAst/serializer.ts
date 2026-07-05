import type { ResumeAst } from "./types.ts";

/** Serialize AST back to plain text for round-trip fidelity. */
export function serializeResumeAst(ast: ResumeAst): string {
  const lines: string[] = [];

  if (ast.header.rawLines.length > 0) {
    lines.push(...ast.header.rawLines);
  } else {
    if (ast.header.name) lines.push(ast.header.name);
    if (ast.header.title) lines.push(ast.header.title);
    const contact = [ast.header.email, ast.header.phone, ast.header.location].filter(Boolean);
    if (contact.length) lines.push(contact.join(" | "));
  }

  if (ast.professionalSummary.text || ast.professionalSummary.bullets.length > 0) {
    lines.push("");
    lines.push("Professional Summary");
    if (ast.professionalSummary.text) lines.push(ast.professionalSummary.text);
    for (const bullet of ast.professionalSummary.bullets) {
      lines.push(`- ${bullet.text}`);
    }
  }

  if (ast.experience.length > 0) {
    lines.push("");
    lines.push("Experience");
    for (const exp of ast.experience) {
      if (exp.title || exp.company || exp.dates) {
        lines.push(`${exp.title} | ${exp.company} | ${exp.dates}`);
      }
      for (const bullet of exp.bullets) {
        lines.push(`- ${bullet.text}`);
      }
    }
  }

  if (ast.projects.length > 0) {
    lines.push("");
    lines.push("Projects");
    for (const proj of ast.projects) {
      lines.push(proj.name);
      if (proj.description) lines.push(proj.description);
      if (proj.dates) lines.push(proj.dates);
      for (const bullet of proj.bullets) {
        lines.push(`- ${bullet.text}`);
      }
    }
  }

  if (ast.education.length > 0) {
    lines.push("");
    lines.push("Education");
    for (const edu of ast.education) {
      const parts = [edu.degree, edu.institution, edu.year].filter(Boolean);
      lines.push(parts.join(" | "));
      for (const bullet of edu.bullets) {
        lines.push(`- ${bullet.text}`);
      }
    }
  }

  if (ast.skills.length > 0) {
    lines.push("");
    lines.push("Skills");
    lines.push(ast.skills.map((s) => s.name).join(", "));
  }

  if (ast.certifications.length > 0) {
    lines.push("");
    lines.push("Certifications");
    for (const cert of ast.certifications) {
      lines.push([cert.name, cert.issuer, cert.year].filter(Boolean).join(" | "));
    }
  }

  if (ast.awards.length > 0) {
    lines.push("");
    lines.push("Awards");
    for (const award of ast.awards) {
      lines.push([award.title, award.issuer, award.year].filter(Boolean).join(" | "));
    }
  }

  for (const section of ast.customSections) {
    if (section.title === "Preamble") {
      for (const line of section.lines) lines.push(line);
      for (const bullet of section.bullets) lines.push(`- ${bullet.text}`);
      continue;
    }
    lines.push("");
    lines.push(section.title);
    for (const line of section.lines) lines.push(line);
    for (const bullet of section.bullets) lines.push(`- ${bullet.text}`);
  }

  return lines.join("\n").trim();
}
