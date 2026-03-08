import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel, LevelFormat, TabStopPosition, TabStopType } from "docx";
import { saveAs } from "file-saver";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

export async function exportCalibratedDocx(resume: CalibratedResumeData) {
  const sectionHeader = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" } },
      children: [
        new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: "Calibri" }),
      ],
    });

  const contactParts = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.linkedin,
  ].filter(Boolean);

  const experienceChildren = resume.experience.flatMap((exp, ri) => {
    const roleParts: Paragraph[] = [];

    // Role title + company as a sub-heading
    const titleLine = exp.title || "";
    const companyLine = exp.company || "";
    roleParts.push(
      new Paragraph({
        spacing: { before: 200, after: 20 },
        keepNext: true,
        children: [
          new TextRun({ text: titleLine, italics: true, size: 22, font: "Calibri" }),
          ...(exp.dates
            ? [new TextRun({ text: " ", size: 20, font: "Calibri" }), new TextRun({ text: "\t", size: 20, font: "Calibri" }), new TextRun({ text: exp.dates, size: 20, font: "Calibri", color: "666666" })]
            : []),
        ],
        tabStops: [{ type: "right" as any, position: 9360 }],
      }),
    );
    if (companyLine) {
      roleParts.push(
        new Paragraph({
          spacing: { after: 40 },
          keepNext: true,
          children: [
            new TextRun({ text: companyLine, bold: true, size: 22, font: "Calibri" }),
          ],
        }),
      );
    }

    // Bullets as actual list items — keepNext keeps them grouped with the role header
    roleParts.push(
      ...exp.bullets.map(
        (b, bi) =>
          new Paragraph({
            spacing: { after: 20, line: 264 },
            bullet: { level: 0 },
            keepLines: true,
            keepNext: bi < exp.bullets.length - 1,
            children: [new TextRun({ text: b, size: 21, font: "Calibri" })],
          }),
      ),
    );

    // Spacing between roles
    if (ri < resume.experience.length - 1) {
      roleParts.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    }

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
          run: { bold: true, size: 28, font: "Calibri", color: "000000" },
          paragraph: { spacing: { after: 40 }, alignment: AlignmentType.CENTER },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { bold: true, size: 22, font: "Calibri" },
          paragraph: { spacing: { before: 240, after: 120 } },
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
          page: { margin: { top: 1440, bottom: 1080, left: 1080, right: 1080 } },
        },
        children: [
          // Name — Heading 1 style
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({ text: resume.header.name || "Name", bold: true, size: 28, font: "Calibri", color: "000000" }),
            ],
          }),
          // Title
          ...(resume.header.title
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 40 },
                  children: [
                    new TextRun({ text: resume.header.title, size: 22, font: "Calibri", color: "555555" }),
                  ],
                }),
              ]
            : []),
          // Contact line
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
          // Professional Summary
          ...(resume.summary
            ? [
                sectionHeader("Professional Summary"),
                new Paragraph({
                  spacing: { after: 200, line: 276 },
                  children: [new TextRun({ text: resume.summary, size: 21, font: "Calibri" })],
                }),
              ]
            : []),
          // Core Competencies — merge skills into this section, render after summary
          ...((resume.core_competencies.length > 0 || (resume.skills && resume.skills.length > 0))
            ? [
                sectionHeader("Core Competencies"),
                new Paragraph({
                  spacing: { after: 200, line: 276 },
                  children: [
                    new TextRun({
                      text: [...(resume.core_competencies || []), ...(resume.skills || [])]
                        .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
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
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 160, after: 60 },
                    children: [
                      new TextRun({ text: proj.name, bold: true, size: 22, font: "Calibri" }),
                      ...(proj.description ? [new TextRun({ text: ` — ${proj.description}`, size: 21, font: "Calibri", color: "666666" })] : []),
                    ],
                  }),
                  ...proj.bullets.map(
                    (b) =>
                      new Paragraph({
                        spacing: { after: 80, line: 276 },
                        bullet: { level: 0 },
                        children: [new TextRun({ text: b, size: 21, font: "Calibri" })],
                      }),
                  ),
                ]),
              ]
            : []),
          // Skills merged into Core Competencies above
          // Certifications
          ...(resume.certifications && resume.certifications.length > 0
            ? [
                sectionHeader("Certifications"),
                ...resume.certifications.map(
                  (cert) =>
                    new Paragraph({
                      spacing: { after: 80 },
                      bullet: { level: 0 },
                      children: [new TextRun({ text: cert, size: 21, font: "Calibri" })],
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
