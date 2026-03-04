import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

export async function exportCalibratedDocx(resume: CalibratedResumeData) {
  const sectionHeader = (text: string) =>
    new Paragraph({
      spacing: { before: 160, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
      children: [
        new TextRun({ text: text.toUpperCase(), bold: true, size: 24, font: "Calibri", allCaps: true }),
      ],
    });

  const contactParts = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.linkedin,
  ].filter(Boolean);

  const experienceChildren = resume.experience.flatMap((exp, ri) => {
    const header = [exp.title, exp.company, exp.dates].filter(Boolean).join(" | ");
    return [
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [new TextRun({ text: header, bold: true, size: 22, font: "Calibri" })],
      }),
      ...exp.bullets.map(
        (b) =>
          new Paragraph({
            spacing: { after: 120, line: 276 },
            bullet: { level: 0 },
            children: [new TextRun({ text: b, size: 21, font: "Calibri" })],
          }),
      ),
      ...(ri < resume.experience.length - 1
        ? [new Paragraph({ spacing: { after: 80 }, children: [] })]
        : []),
    ];
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1080, left: 1080, right: 1080 } },
        },
        children: [
          // Name
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({ text: resume.header.name || "Name", bold: true, size: 28, font: "Calibri" }),
            ],
          }),
          // Title
          ...(resume.header.title
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 40 },
                  children: [
                    new TextRun({ text: resume.header.title, size: 22, font: "Calibri", color: "666666" }),
                  ],
                }),
              ]
            : []),
          // Contact
          ...(contactParts.length > 0
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [
                    new TextRun({ text: contactParts.join("  |  "), size: 20, font: "Calibri", color: "666666" }),
                  ],
                }),
              ]
            : []),
          // HR
          new Paragraph({
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
            children: [],
          }),
          // Summary
          ...(resume.summary
            ? [
                sectionHeader("Professional Summary"),
                new Paragraph({
                  spacing: { after: 200, line: 276 },
                  children: [new TextRun({ text: resume.summary, size: 21, font: "Calibri" })],
                }),
              ]
            : []),
          // Core Competencies
          ...(resume.core_competencies.length > 0
            ? [
                sectionHeader("Core Competencies"),
                new Paragraph({
                  spacing: { after: 200, line: 276 },
                  children: [
                    new TextRun({ text: resume.core_competencies.join("  •  "), size: 21, font: "Calibri" }),
                  ],
                }),
              ]
            : []),
          // Experience
          sectionHeader("Experience"),
          ...experienceChildren,
          // Education
          ...(resume.education.length > 0
            ? [
                sectionHeader("Education"),
                ...resume.education.map(
                  (edu) =>
                    new Paragraph({
                      spacing: { after: 80 },
                      children: [
                        new TextRun({
                          text: [edu.degree, edu.institution, edu.year].filter(Boolean).join(" — "),
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
