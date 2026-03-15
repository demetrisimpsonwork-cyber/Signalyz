import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

/* ── Register fonts ── */
Font.register({
  family: "Calibri",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/nicholasgasior/gfonts@master/dist/Carlito/Carlito-Regular.ttf",
      fontWeight: "normal",
      fontStyle: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/gh/nicholasgasior/gfonts@master/dist/Carlito/Carlito-Bold.ttf",
      fontWeight: "bold",
      fontStyle: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/gh/nicholasgasior/gfonts@master/dist/Carlito/Carlito-Italic.ttf",
      fontWeight: "normal",
      fontStyle: "italic",
    },
    {
      src: "https://cdn.jsdelivr.net/gh/nicholasgasior/gfonts@master/dist/Carlito/Carlito-BoldItalic.ttf",
      fontWeight: "bold",
      fontStyle: "italic",
    },
  ],
});

/* ── Styles (mirrors DOCX layout) ── */
const s = StyleSheet.create({
  page: {
    fontFamily: "Calibri",
    paddingTop: 50,
    paddingBottom: 38,
    paddingHorizontal: 38,
    fontSize: 10.5,
    color: "#1a1a2e",
    lineHeight: 1.35,
  },
  /* Header */
  name: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 11,
    textAlign: "center",
    color: "#555555",
    marginBottom: 2,
  },
  contactLine: {
    fontSize: 10,
    textAlign: "center",
    color: "#666666",
    marginBottom: 4,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCCCCC",
    marginBottom: 10,
    marginTop: 4,
  },
  /* Section */
  sectionWrap: {
    marginBottom: 6,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#374151",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
    paddingBottom: 2,
    marginBottom: 5,
    marginTop: 10,
  },
  /* Summary / competencies */
  bodyText: {
    fontSize: 10.5,
    lineHeight: 1.38,
    marginBottom: 4,
  },
  /* Experience */
  roleTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
    marginBottom: 0,
  },
  roleTitle: {
    fontSize: 11,
    fontStyle: "italic",
  },
  roleDates: {
    fontSize: 10,
    color: "#666666",
  },
  companyName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 2,
  },
  /* Bullets */
  bulletRow: {
    flexDirection: "row",
    marginBottom: 1,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 12,
    fontSize: 10.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 1.32,
  },
  /* Independent projects */
  projectName: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 6,
  },
  projectDesc: {
    fontSize: 10.5,
    color: "#666666",
    marginBottom: 2,
  },
  /* Education */
  eduLine: {
    fontSize: 10.5,
    marginBottom: 3,
  },
});

/* ── Helpers ── */

function cleanCert(cert: string): string {
  return cert
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Sub-components ── */

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title.toUpperCase()}</Text>;
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

/* ── Main Document ── */

interface CalibratedResumePDFProps {
  resume: CalibratedResumeData;
}

const CalibratedResumePDF: React.FC<CalibratedResumePDFProps> = ({ resume }) => {
  const contactParts = [
    resume.header.location,
    resume.header.email,
    resume.header.phone,
    resume.header.linkedin,
  ].filter(Boolean);

  const competencies = [
    ...(resume.core_competencies || []),
    ...(resume.skills || []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const cleanedCerts = (resume.certifications || []).map(cleanCert);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View wrap={false}>
          <Text style={s.name}>{resume.header.name || "Name"}</Text>
          {resume.header.title ? (
            <Text style={s.headerTitle}>{resume.header.title}</Text>
          ) : null}
          {contactParts.length > 0 && (
            <Text style={s.contactLine}>{contactParts.join("  |  ")}</Text>
          )}
          <View style={s.hr} />
        </View>

        {/* ── Professional Summary ── */}
        {resume.summary ? (
          <View style={s.sectionWrap} wrap={false}>
            <SectionHeader title="Professional Summary" />
            <Text style={s.bodyText}>{resume.summary}</Text>
          </View>
        ) : null}

        {/* ── Core Competencies ── */}
        {competencies.length > 0 && (
          <View style={s.sectionWrap} wrap={false}>
            <SectionHeader title="Core Competencies" />
            <Text style={s.bodyText}>{competencies.join("  •  ")}</Text>
          </View>
        )}

        {/* ── Professional Experience ── */}
        {resume.experience.length > 0 && (
          <View style={s.sectionWrap}>
            <SectionHeader title="Professional Experience" />
            {resume.experience.map((exp, i) => (
              <View key={`exp-${i}`} wrap={false} style={{ marginBottom: 4 }}>
                <View style={s.roleTitleRow}>
                  <Text style={s.roleTitle}>{exp.title || ""}</Text>
                  {exp.dates ? <Text style={s.roleDates}>{exp.dates}</Text> : null}
                </View>
                {exp.company ? (
                  <Text style={s.companyName}>{exp.company}</Text>
                ) : null}
                {exp.bullets.map((b, bi) => (
                  <BulletItem key={`eb-${i}-${bi}`} text={b} />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ── Independent Projects ── */}
        {resume.independent_projects?.length > 0 && (
          <View style={s.sectionWrap}>
            <SectionHeader title="Independent Projects" />
            {resume.independent_projects.map((proj, i) => (
              <View key={`proj-${i}`} wrap={false} style={{ marginBottom: 4 }}>
                <Text style={s.projectName}>{proj.name}</Text>
                {proj.description?.trim() ? (
                  <Text style={s.projectDesc}>— {proj.description.trim()}</Text>
                ) : null}
                {proj.bullets.map((b, bi) => (
                  <BulletItem key={`pb-${i}-${bi}`} text={b} />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ── Certifications ── */}
        {cleanedCerts.length > 0 && (
          <View style={s.sectionWrap}>
            <SectionHeader title="Certifications" />
            {cleanedCerts.map((cert, i) => (
              <BulletItem key={`cert-${i}`} text={cert} />
            ))}
          </View>
        )}

        {/* ── Education ── */}
        {resume.education?.length > 0 && (
          <View style={s.sectionWrap}>
            <SectionHeader title="Education" />
            {resume.education.map((edu, i) => (
              <Text key={`edu-${i}`} style={s.eduLine}>
                {[edu.degree, edu.institution, edu.year].filter(Boolean).join(" — ")}
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};

export default CalibratedResumePDF;
