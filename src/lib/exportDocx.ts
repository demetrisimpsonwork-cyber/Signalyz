import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel, LevelFormat } from "docx";
import { saveAs } from "file-saver";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import { bulletToPastTense } from "@/lib/pastTense";

export async function exportCalibratedDocx(resume: CalibratedResumeData) {
  // Preprocess certifications: strip URLs, markdown links, brackets — plain text only
  const cleanedCertifications = (resume.certifications || []).map((cert) => {
    let clean = cert
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // [text](url) → text
      .replace(/https?:\/\/\S+/gi, "")            // bare URLs
      .replace(/www\.\S+/gi, "")                   // www links
      .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")       // <a> tags
      .replace(/\s{2,}/g, " ")
      .trim();
    if (/google\s+it\s+support\s+professional\s+certificate/i.test(clean)) {
      clean = "Google IT Support Professional Certificate — Coursera";
    }
    return clean;
  });

  const sectionHeader = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      pageBreakBefore: false,
      spacing: { before: 300, after: 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "888888" } },
      children: [
        new TextRun({
          text: text.toUpperCase(),
          bold: true,
          size: 21,
          font: "Calibri",
          color: "2d2d2d",
          characterSpacing: 60, // ~0.5pt letter spacing
        }),
      ],
    });

  const contactParts = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.linkedin,
  ].filter(Boolean);

  const experienceChildren = resume.experience.flatMap((exp) => {
    const roleParts: Paragraph[] = [];

    // Role Title — bold, own line
    if (exp.title) {
      roleParts.push(
        new Paragraph({
          spacing: { before: 240, after: 20 },
          keepNext: true,
          children: [
            new TextRun({ text: exp.title, bold: true, size: 22, font: "Calibri", color: "111111" }),
          ],
        }),
      );
    }

    // Company | Dates — second line, lighter color
    const metaParts = [exp.company, exp.dates].filter(Boolean);
    if (metaParts.length) {
      roleParts.push(
        new Paragraph({
          spacing: { before: 0, after: 60 },
          keepNext: true,
          children: [
            new TextRun({ text: metaParts.join("  |  "), size: 20, font: "Calibri", color: "555555" }),
          ],
        }),
      );
    }

    // Bullets — consistent spacing
    roleParts.push(
      ...exp.bullets.map(
        (b) =>
          new Paragraph({
            spacing: { before: 40, after: 40, line: 264 },
            bullet: { level: 0 },
            children: [new TextRun({ text: bulletToPastTense(b), size: 21, font: "Calibri" })],
          }),
      ),
    );

    return roleParts;
  });

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "bullet-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 180 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 36, font: "Calibri", color: "111111" },
          paragraph: { spacing: { after: 40 }, alignment: AlignmentType.CENTER },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 21, font: "Calibri", color: "2d2d2d" },
          paragraph: { spacing: { before: 300, after: 140 } },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 22, font: "Calibri" },
          paragraph: { spacing: { before: 200, after: 40 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1200, left: 1200, right: 1200 } },
        },
        children: [
          // Name — largest element, centered
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: false,
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({ text: resume.header.name || "Name", bold: true, size: 36, font: "Calibri", color: "111111" }),
            ],
          }),
          // Title
          ...(resume.header.title
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 40 },
                  children: [
                    new TextRun({ text: resume.header.title, size: 22, font: "Calibri", color: "444444" }),
                  ],
                }),
              ]
            : []),
          // Contact line — bullet separators
          ...(contactParts.length > 0
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 },
                  children: [
                    new TextRun({ text: contactParts.join("  •  "), size: 19, font: "Calibri", color: "666666" }),
                  ],
                }),
              ]
            : []),
          // Header divider
          new Paragraph({
            spacing: { after: 240 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" } },
            children: [],
          }),
          // Professional Summary
          ...(resume.summary
            ? [
                sectionHeader("Professional Summary"),
                new Paragraph({
                  spacing: { after: 240, line: 276 },
                  children: [new TextRun({ text: resume.summary, size: 21, font: "Calibri" })],
                }),
              ]
            : []),
          // Core Competencies
          ...((resume.core_competencies.length > 0 || (resume.skills && resume.skills.length > 0))
            ? [
                sectionHeader("Core Competencies"),
                new Paragraph({
                  spacing: { after: 240, line: 276 },
                  children: [
                    new TextRun({
                      text: [...(resume.core_competencies || []), ...(resume.skills || [])]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join("  •  "),
                      size: 21,
                      font: "Calibri",
                    }),
                  ],
                }),
              ]
            : []),
          // Experience
          ...(experienceChildren.length > 0
            ? [sectionHeader("Professional Experience"), ...experienceChildren]
            : []),
          // Independent Projects
          ...(resume.independent_projects && resume.independent_projects.length > 0
            ? [
                sectionHeader("Independent Projects"),
                ...resume.independent_projects.flatMap((proj) => [
                  new Paragraph({
                    pageBreakBefore: false,
                    spacing: { before: 180, after: 40 },
                    children: [
                      new TextRun({ text: proj.name, bold: true, size: 22, font: "Calibri", color: "111111" }),
                    ],
                  }),
                  ...(proj.description
                    ? [
                        new Paragraph({
                          spacing: { before: 0, after: 60 },
                          children: [
                            new TextRun({ text: proj.description, size: 20, font: "Calibri", color: "555555" }),
                          ],
                        }),
                      ]
                    : []),
                  ...proj.bullets.map(
                    (b) =>
                      new Paragraph({
                        spacing: { before: 40, after: 40, line: 264 },
                        bullet: { level: 0 },
                        children: [new TextRun({ text: bulletToPastTense(b), size: 21, font: "Calibri" })],
                      }),
                  ),
                ]),
              ]
            : []),
          // Certifications
          ...(cleanedCertifications.length > 0
            ? [
                sectionHeader("Certifications"),
                ...cleanedCertifications.map(
                  (cert) =>
                    new Paragraph({
                      spacing: { before: 40, after: 40 },
                      bullet: { level: 0 },
                      children: [
                        new TextRun({ text: cert, size: 21, font: "Calibri", color: "000000", bold: false }),
                      ],
                    }),
                ),
              ]
            : []),
          // Education
          ...(resume.education.length > 0
            ? [
                sectionHeader("Education"),
                ...resume.education.map(
                  (edu) =>
                    new Paragraph({
                      spacing: { before: 40, after: 60 },
                      children: [
                        new TextRun({
                          text: [edu.degree, edu.institution, edu.year].filter(Boolean).join("  —  "),
                          size: 21,
                          font: "Calibri",
                        }),
                      ],
                    }),
                ),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "Calibrated_Resume_ATS.docx");
}
