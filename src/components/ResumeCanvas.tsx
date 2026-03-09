import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import { X, Plus, Check } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ResumeCanvasProps {
  resume: CalibratedResumeData;
  editMode: boolean;
  onUpdate: (path: string, value: any) => void;
  saved?: boolean;
}

// ─────────────────────────────────────────────────────────────
// SAVE STATUS INDICATOR
// ─────────────────────────────────────────────────────────────

function SaveIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute top-3 right-4 flex items-center gap-1.5 text-xs font-medium animate-fade-in"
      style={{ color: "#0D9488" }}>
      <Check className="h-3 w-3" />
      Calibration saved
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INLINE EDITABLE FIELD
// ─────────────────────────────────────────────────────────────

const EditableField = ({
  value,
  path,
  editMode,
  onUpdate,
  className = "",
  style,
  placeholder = "Click to edit…",
}: {
  value: string;
  path: string;
  editMode: boolean;
  onUpdate: (path: string, value: any) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  if (!editMode) {
    return (
      <div className={className} style={style}>
        {value || <span className="italic" style={{ color: "#9CA3AF" }}>{placeholder}</span>}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={`${className} outline-none rounded px-0.5 -mx-0.5 cursor-text transition-all duration-150 hover:bg-teal-50/40 focus:bg-teal-50/60 focus:ring-1 focus:ring-teal-300/50`}
      style={style}
      onBlur={() => {
        if (ref.current) onUpdate(path, ref.current.textContent || "");
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(value || "") }}
      data-placeholder={placeholder}
    />
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────────────────────

const SectionHeader = ({ children }: { children: string }) => (
  <div className="mb-3" style={{ borderBottom: "1px solid #374151", paddingBottom: "3px" }}>
    <h2 className="font-semibold tracking-[0.15em] whitespace-nowrap" style={{ fontSize: "11px", color: "#374151", textTransform: "uppercase", letterSpacing: "0.15em" }}>
      {children}
    </h2>
  </div>
);

// ─────────────────────────────────────────────────────────────
// COMPETENCY PILLS
// ─────────────────────────────────────────────────────────────

const CompetencyPills = ({
  competencies,
  editMode,
  onUpdate,
}: {
  competencies: string[];
  editMode: boolean;
  onUpdate: (competencies: string[]) => void;
}) => {
  if (editMode) {
    return (
      <div
        contentEditable
        suppressContentEditableWarning
        className="outline-none cursor-text"
        style={{ fontSize: "10px", lineHeight: "1.6", color: "#374151" }}
        onBlur={(e) => {
          const text = e.currentTarget.textContent || "";
          const updated = text.split(/[,•·|]/).map(s => s.trim()).filter(Boolean);
          onUpdate(updated);
        }}
      >
        {competencies.join(",  ")}
      </div>
    );
  }

  return (
    <p style={{ fontSize: "10px", lineHeight: "1.6", color: "#374151" }}>
      {competencies.join(",  ")}
    </p>
  );
};

// ─────────────────────────────────────────────────────────────
// BULLET EDITOR
// ─────────────────────────────────────────────────────────────

const BulletEditor = ({
  bullets,
  expIdx,
  editMode,
  onUpdate,
}: {
  bullets: string[];
  expIdx: number;
  editMode: boolean;
  onUpdate: (path: string, value: any) => void;
}) => {
  const handleKeyDown = (
    e: KeyboardEvent<HTMLLIElement>,
    bulletIdx: number,
  ) => {
    if (!editMode) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const newBullets = [...bullets];
      newBullets.splice(bulletIdx + 1, 0, "");
      onUpdate(`experience.${expIdx}.bullets`, newBullets);
      setTimeout(() => {
        const items = document.querySelectorAll(`[data-bullet-group="${expIdx}"]`);
        (items[bulletIdx + 1] as HTMLElement)?.focus();
      }, 50);
    }
    if (e.key === "Backspace" && (e.currentTarget.textContent || "").trim() === "" && bullets.length > 1) {
      e.preventDefault();
      const newBullets = bullets.filter((_, i) => i !== bulletIdx);
      onUpdate(`experience.${expIdx}.bullets`, newBullets);
    }
  };

  return (
    <ul className="ml-3" style={{ marginTop: "2px" }}>
      {bullets.map((bullet, bi) => (
        <li
          key={bi}
          data-bullet-group={expIdx}
          className={`flex gap-1.5 group ${editMode ? "outline-none rounded px-1 -mx-1 cursor-text hover:bg-teal-50/40 focus:bg-teal-50/60 focus:ring-1 focus:ring-teal-300/50 transition-all duration-150" : ""}`}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) {
              const text = e.currentTarget.textContent || "";
              const updated = [...bullets];
              updated[bi] = text;
              onUpdate(`experience.${expIdx}.bullets`, updated);
            }
          }}
          onKeyDown={(e) => handleKeyDown(e as any, bi)}
          style={{ fontSize: "11px", lineHeight: "1.55", marginBottom: "1px" }}
        >
          <span className="shrink-0 mt-0.5">•</span>
          <span>{bullet}</span>
        </li>
      ))}
      {editMode && (
        <li className="flex items-center gap-1.5 ml-0.5 mt-1">
          <button
            onClick={() => {
              const newBullets = [...bullets, ""];
              onUpdate(`experience.${expIdx}.bullets`, newBullets);
            }}
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: "#0D9488" }}
          >
            <Plus className="h-3 w-3" />
            Add bullet
          </button>
        </li>
      )}
    </ul>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN RESUME CANVAS
// ─────────────────────────────────────────────────────────────

const ResumeCanvas = ({ resume, editMode, onUpdate, saved = false }: ResumeCanvasProps) => {
  return (
    <div
      className="mx-auto bg-white rounded-sm relative px-5 py-8 sm:px-10 sm:py-10 md:px-14 md:py-12"
      style={{
        maxWidth: "720px",
        minWidth: 0,
        boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        color: "#1A1A2E",
      }}
    >
      <SaveIndicator visible={saved} />

      {/* Header */}
      <div className="text-center mb-4">
        <EditableField
          value={resume.header.name}
          path="header.name"
          editMode={editMode}
          onUpdate={onUpdate}
          className="font-bold tracking-tight"
          style={{ fontSize: "24px", color: "#1A1A2E" }}
          placeholder="Full Name"
        />
        {(resume.header.title || editMode) && (
          <EditableField
            value={resume.header.title}
            path="header.title"
            editMode={editMode}
            onUpdate={onUpdate}
            className="mt-1"
            style={{ fontSize: "14px", color: "#4B5563" }}
            placeholder="Professional Title"
          />
        )}
        <div className="flex items-center justify-center gap-x-3 gap-y-1 mt-2 flex-wrap" style={{ fontSize: "11px", color: "#6B7280" }}>
          {editMode
            ? (["email", "phone", "location", "linkedin"] as const).map((field, i, arr) => (
                <span key={field} className="flex items-center gap-1">
                  <EditableField
                    value={resume.header[field]}
                    path={`header.${field}`}
                    editMode={editMode}
                    onUpdate={onUpdate}
                    style={{ fontSize: "11px", color: "#6B7280" }}
                    placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                  />
                  {i < arr.length - 1 && <span className="mx-0.5">·</span>}
                </span>
              ))
            : [resume.header.location, resume.header.email, resume.header.phone, resume.header.linkedin]
                .filter(Boolean)
                .map((item, i, arr) => (
                  <span key={i} className="whitespace-nowrap">
                    {item}
                    {i < arr.length - 1 && <span className="ml-3">|</span>}
                  </span>
                ))}
        </div>
        <hr className="mt-4 border-t" style={{ borderColor: "#D1D5DB" }} />
      </div>

      {/* Summary */}
      {(resume.summary || editMode) && (
        <div className="mb-5">
          <SectionHeader>Professional Summary</SectionHeader>
          <EditableField
            value={resume.summary}
            path="summary"
            editMode={editMode}
            onUpdate={onUpdate}
            style={{ fontSize: "11.5px", lineHeight: "1.7" }}
            placeholder="Click to add a professional summary…"
          />
        </div>
      )}

      {/* Core Competencies */}
      {(resume.core_competencies.length > 0 || editMode) && (
        <div className="mb-5">
          <SectionHeader>Core Competencies</SectionHeader>
          <CompetencyPills
            competencies={resume.core_competencies}
            editMode={editMode}
            onUpdate={(updated) => onUpdate("core_competencies", updated)}
          />
        </div>
      )}

      {/* Experience */}
      {resume.experience.length > 0 && (
        <div className="mb-5">
          <SectionHeader>Experience</SectionHeader>
          <div className="space-y-4">
            {resume.experience.map((exp, ei) => (
              <div key={ei}>
                <div className="mb-1">
                  {/* Line 1: Title (italic) + Dates (right-aligned) */}
                  <div className="flex items-baseline justify-between gap-2">
                    <EditableField
                      value={exp.title}
                      path={`experience.${ei}.title`}
                      editMode={editMode}
                      onUpdate={onUpdate}
                      style={{ fontSize: "12px", lineHeight: "1.4", fontStyle: "italic" }}
                      placeholder="Job Title"
                    />
                    {(exp.dates || editMode) && (
                      <EditableField
                        value={exp.dates}
                        path={`experience.${ei}.dates`}
                        editMode={editMode}
                        onUpdate={onUpdate}
                        className="shrink-0"
                        style={{ fontSize: "10.5px", color: "#6B7280" }}
                        placeholder="Dates"
                      />
                    )}
                  </div>
                  {/* Line 2: Company (bold) */}
                  {(exp.company || editMode) && (
                    <EditableField
                      value={exp.company}
                      path={`experience.${ei}.company`}
                      editMode={editMode}
                      onUpdate={onUpdate}
                      className="font-bold"
                      style={{ fontSize: "11px", color: "#374151", marginTop: "1px" }}
                      placeholder="Company"
                    />
                  )}
                </div>
                <BulletEditor
                  bullets={exp.bullets}
                  expIdx={ei}
                  editMode={editMode}
                  onUpdate={onUpdate}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Independent Projects */}
      {resume.independent_projects && resume.independent_projects.length > 0 && (
        <div className="mb-5">
          <SectionHeader>Independent Projects</SectionHeader>
          <div className="space-y-3">
            {resume.independent_projects.map((proj, pi) => (
              <div key={pi} style={{ fontWeight: 400 }}>
                <div className="mb-1" style={{ fontSize: "11px", lineHeight: "1.55", fontWeight: 400 }}>
                  <span className="font-bold" style={{ fontWeight: 700, fontSize: "12px" }}>{proj.name}</span>
                  {(proj.description || editMode) && (
                    <span className="font-normal text-muted-foreground" style={{ fontWeight: 400 }}>
                      {" — "}
                      {editMode ? (
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          className="font-normal outline-none rounded px-0.5 cursor-text hover:bg-teal-50/40 focus:bg-teal-50/60 focus:ring-1 focus:ring-teal-300/50 transition-all duration-150"
                          style={{ fontWeight: 400 }}
                          onBlur={(e) => {
                            onUpdate(`independent_projects.${pi}.description`, e.currentTarget.textContent || "");
                          }}
                        >
                          {proj.description}
                        </span>
                      ) : (
                        proj.description
                      )}
                    </span>
                  )}
                </div>
                {proj.bullets.length > 0 && (
                  <BulletEditor
                    bullets={proj.bullets}
                    expIdx={1000 + pi}
                    editMode={editMode}
                    onUpdate={onUpdate}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills section removed — Core Competencies already covers this */}

      {/* Certifications */}
      {resume.certifications && resume.certifications.length > 0 && (
        <div className="mb-5">
          <SectionHeader>Certifications</SectionHeader>
          <ul className="space-y-1 ml-3">
            {resume.certifications.map((cert, i) => (
              <li key={i} className="flex gap-1.5" style={{ fontSize: "11px", lineHeight: "1.65" }}>
                <span className="shrink-0 mt-0.5">•</span>
                {editMode ? (
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none rounded px-1 -mx-1 cursor-text hover:bg-teal-50/40 focus:bg-teal-50/60 focus:ring-1 focus:ring-teal-300/50 transition-all duration-150"
                    onBlur={(e) => {
                      const updated = [...resume.certifications];
                      updated[i] = e.currentTarget.textContent || cert;
                      onUpdate("certifications", updated);
                    }}
                  >
                    {cert}
                  </span>
                ) : (
                  <span>{cert}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Education */}
      {resume.education.length > 0 && (
        <div>
          <SectionHeader>Education</SectionHeader>
          <div className="space-y-2">
            {resume.education.map((edu, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1">
                  <EditableField
                    value={edu.degree}
                    path={`education.${i}.degree`}
                    editMode={editMode}
                    onUpdate={onUpdate}
                    className="font-medium"
                    style={{ fontSize: "11px" }}
                    placeholder="Degree"
                  />
                  <span style={{ fontSize: "10.5px", color: "#9CA3AF" }}>·</span>
                  <EditableField
                    value={edu.institution}
                    path={`education.${i}.institution`}
                    editMode={editMode}
                    onUpdate={onUpdate}
                    style={{ fontSize: "10.5px", color: "#6B7280" }}
                    placeholder="Institution"
                  />
                </div>
                {(edu.year || editMode) && (
                  <EditableField
                    value={edu.year}
                    path={`education.${i}.year`}
                    editMode={editMode}
                    onUpdate={onUpdate}
                    className="shrink-0"
                    style={{ fontSize: "10px", color: "#6B7280" }}
                    placeholder="Year"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeCanvas;
