import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  LevelFormat,
  Tab,
  TabStopType,
  TabStopPosition,
} from "docx";
import { saveAs } from "file-saver";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import {
  normalizeResumeForExport,
  RESUME_SECTION_LABELS,
} from "@/lib/resumeExportModel";
import type { CalibratedResumeSanitizeOptions } from "@/lib/calibratedResumeSanitizer";

const BULLET_NUMBERING = "resume-bullet-list";

function sectionHeader(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore: false,
    spacing: { before: 300, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "374151" } },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22,
        font: "Calibri",
        color: "374151",
        characterSpacing: 60,
      }),
    ],
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    spacing: { before: 20, after: 20, line: 264 },
    numbering: { reference: BULLET_NUMBERING, level: 0 },
    children: [new TextRun({ text, size: 22, font: "Calibri", color: "1A1A2E" })],
  });
}

function experienceRoleParagraphs(exp: {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}) {
  const blocks: Paragraph[] = [];

  if (exp.title || exp.dates) {
    blocks.push(
      new Paragraph({
        spacing: { before: 200, after: 20 },
        keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          ...(exp.title
            ? [new TextRun({ text: exp.title, italics: true, size: 24, font: "Calibri", color: "1A1A2E" })]
            : []),
          ...(exp.dates
            ? [
                new TextRun({
                  children: [new Tab()],
                  size: 21,
                  font: "Calibri",
                  color: "6B7280",
                }),
                new TextRun({ text: exp.dates, size: 21, font: "Calibri", color: "6B7280" }),
              ]
            : []),
        ],
      }),
    );
  }

  if (exp.company) {
    blocks.push(
      new Paragraph({
        spacing: { before: 0, after: 40 },
        keepNext: true,
        children: [
          new TextRun({ text: exp.company, bold: true, size: 22, font: "Calibri", color: "374151" }),
        ],
      }),
    );
  }

  blocks.push(...exp.bullets.map((b) => bulletParagraph(b)));
  return blocks;
}

function educationParagraph(edu: { degree: string; institution: string; year: string }) {
  const left = [edu.degree, edu.institution].filter(Boolean).join(" · ");
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      ...(left ? [new TextRun({ text: left, size: 22, font: "Calibri", color: "1A1A2E" })] : []),
      ...(edu.year
        ? [
            new TextRun({ children: [new Tab()], size: 20, font: "Calibri", color: "6B7280" }),
            new TextRun({ text: edu.year, size: 20, font: "Calibri", color: "6B7280" }),
          ]
        : []),
    ],
  });
}

export async function buildCalibratedDocxBlob(
  resume: CalibratedResumeData,
  sanitizeOptions?: CalibratedResumeSanitizeOptions,
): Promise<{ blob: Blob; model: ReturnType<typeof normalizeResumeForExport>; renderMs: number }> {
  const started = performance.now();
  const model = normalizeResumeForExport(resume, sanitizeOptions);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET_NUMBERING,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
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
          run: { bold: true, size: 48, font: "Calibri", color: "1A1A2E" },
          paragraph: { spacing: { after: 40 }, alignment: AlignmentType.CENTER },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1200, left: 1200, right: 1200 } },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: model.header.name,
                bold: true,
                size: 48,
                font: "Calibri",
                color: "1A1A2E",
              }),
            ],
          }),
          ...(model.header.title
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 40 },
                  children: [
                    new TextRun({
                      text: model.header.title,
                      size: 28,
                      font: "Calibri",
                      color: "4B5563",
                    }),
                  ],
                }),
              ]
            : []),
          ...(model.header.contactLine
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 120 },
                  children: [
                    new TextRun({
                      text: model.header.contactLine,
                      size: 22,
                      font: "Calibri",
                      color: "6B7280",
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({
            spacing: { after: 240 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "D1D5DB" } },
            children: [],
          }),
          ...(model.summary
            ? [
                sectionHeader(RESUME_SECTION_LABELS.summary),
                new Paragraph({
                  spacing: { after: 200, line: 288 },
                  children: [new TextRun({ text: model.summary, size: 23, font: "Calibri", color: "1A1A2E" })],
                }),
              ]
            : []),
          ...(model.competencies.length > 0
            ? [
                sectionHeader(RESUME_SECTION_LABELS.competencies),
                new Paragraph({
                  spacing: { after: 200, line: 288 },
                  children: [
                    new TextRun({
                      text: model.competenciesText,
                      size: 20,
                      font: "Calibri",
                      color: "374151",
                    }),
                  ],
                }),
              ]
            : []),
          ...(model.experience.length > 0
            ? [
                sectionHeader(RESUME_SECTION_LABELS.experience),
                ...model.experience.flatMap((exp) => experienceRoleParagraphs(exp)),
              ]
            : []),
          ...(model.projects.length > 0
            ? [
                sectionHeader(RESUME_SECTION_LABELS.projects),
                ...model.projects.flatMap((proj) => {
                  const lines: Paragraph[] = [
                    new Paragraph({
                      spacing: { before: 120, after: 40 },
                      keepNext: proj.bullets.length > 0,
                      children: [
                        new TextRun({
                          text: proj.name,
                          bold: true,
                          size: 24,
                          font: "Calibri",
                          color: "1A1A2E",
                        }),
                        ...(proj.description
                          ? [
                              new TextRun({
                                text: ` — ${proj.description}`,
                                size: 22,
                                font: "Calibri",
                                color: "6B7280",
                              }),
                            ]
                          : []),
                      ],
                    }),
                  ];
                  lines.push(...proj.bullets.map((b) => bulletParagraph(b)));
                  return lines;
                }),
              ]
            : []),
          ...(model.certifications.length > 0
            ? [
                sectionHeader(RESUME_SECTION_LABELS.certifications),
                ...model.certifications.map((cert) => bulletParagraph(cert)),
              ]
            : []),
          ...(model.education.length > 0
            ? [
                sectionHeader(RESUME_SECTION_LABELS.education),
                ...model.education.map((edu) => educationParagraph(edu)),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return { blob, model, renderMs: Math.round(performance.now() - started) };
}

export async function exportCalibratedDocx(
  resume: CalibratedResumeData,
  sanitizeOptions?: CalibratedResumeSanitizeOptions,
) {
  const { blob, model, renderMs } = await buildCalibratedDocxBlob(resume, sanitizeOptions);
  const arrayBuffer = await blob.arrayBuffer();
  void import("@/lib/exportValidationShadow").then(({ runExportValidationShadow }) =>
    runExportValidationShadow({
      exportType: "docx",
      bytes: arrayBuffer,
      model,
      renderMs,
    }),
  );
  saveAs(blob, "Calibrated_Resume_ATS.docx");
}
