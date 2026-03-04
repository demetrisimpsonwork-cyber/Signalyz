import { useRef, useState, type KeyboardEvent } from "react";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";
import { X, Plus } from "lucide-react";

interface ResumeCanvasProps {
  resume: CalibratedResumeData;
  editMode: boolean;
  onUpdate: (path: string, value: any) => void;
}

const EditableText = ({
  value,
  path,
  editMode,
  onUpdate,
  className = "",
  style,
}: {
  value: string;
  path: string;
  editMode: boolean;
  onUpdate: (path: string, value: any) => void;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  if (!editMode) {
    return <div className={className} style={style}>{value || "\u00A0"}</div>;
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={`${className} outline-none ring-1 ring-transparent hover:ring-blue-300 focus:ring-blue-400 rounded px-0.5 transition-all cursor-text`}
      style={style}
      onBlur={() => {
        if (ref.current) onUpdate(path, ref.current.textContent || "");
      }}
      dangerouslySetInnerHTML={{ __html: value || "&nbsp;" }}
    />
  );
};

const SectionHeader = ({ children }: { children: string }) => (
  <div className="border-b pb-1 mb-3" style={{ borderColor: "hsl(38, 92%, 50%, 0.4)" }}>
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "#374151" }}>
      {children}
    </h2>
  </div>
);

const ResumeCanvas = ({ resume, editMode, onUpdate }: ResumeCanvasProps) => {
  const [newCompetency, setNewCompetency] = useState("");

  const handleBulletKeyDown = (
    e: KeyboardEvent<HTMLLIElement>,
    expIdx: number,
    bulletIdx: number,
    bullets: string[],
  ) => {
    if (!editMode) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const newBullets = [...bullets];
      newBullets.splice(bulletIdx + 1, 0, "");
      onUpdate(`experience.${expIdx}.bullets`, newBullets);
    }
    if (e.key === "Backspace" && (e.currentTarget.textContent || "").trim() === "" && bullets.length > 1) {
      e.preventDefault();
      const newBullets = bullets.filter((_, i) => i !== bulletIdx);
      onUpdate(`experience.${expIdx}.bullets`, newBullets);
    }
  };

  const addCompetency = () => {
    if (!newCompetency.trim()) return;
    onUpdate("core_competencies", [...resume.core_competencies, newCompetency.trim()]);
    setNewCompetency("");
  };

  const removeCompetency = (idx: number) => {
    onUpdate("core_competencies", resume.core_competencies.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="mx-auto bg-white rounded-sm relative"
      style={{
        maxWidth: "720px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
        padding: "48px 56px",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        color: "#1A1A2E",
      }}
    >
      {/* Header */}
      <div className="text-center mb-4">
        <EditableText
          value={resume.header.name}
          path="header.name"
          editMode={editMode}
          onUpdate={onUpdate}
          className="font-bold tracking-tight"
          style={{ fontSize: "24px", color: "#1A1A2E" }}
        />
        {resume.header.title && (
          <EditableText
            value={resume.header.title}
            path="header.title"
            editMode={editMode}
            onUpdate={onUpdate}
            className="mt-1"
            style={{ fontSize: "14px", color: "#4B5563" }}
          />
        )}
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap" style={{ fontSize: "11px", color: "#6B7280" }}>
          {[resume.header.location, resume.header.email, resume.header.phone, resume.header.linkedin]
            .filter(Boolean)
            .map((item, i, arr) => (
              <span key={i}>
                {item}
                {i < arr.length - 1 && <span className="mx-1.5">|</span>}
              </span>
            ))}
        </div>
        <hr className="mt-4 border-t" style={{ borderColor: "#D1D5DB" }} />
      </div>

      {/* Summary */}
      {resume.summary && (
        <div className="mb-5">
          <SectionHeader>Professional Summary</SectionHeader>
          <EditableText
            value={resume.summary}
            path="summary"
            editMode={editMode}
            onUpdate={onUpdate}
            style={{ fontSize: "11.5px", lineHeight: "1.7" }}
          />
        </div>
      )}

      {/* Core Competencies */}
      {resume.core_competencies.length > 0 && (
        <div className="mb-5">
          <SectionHeader>Core Competencies</SectionHeader>
          <div className="flex flex-wrap gap-1.5">
            {resume.core_competencies.map((comp, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5"
                style={{ borderColor: "#D1D5DB", color: "#374151", fontSize: "10px", fontWeight: 500 }}
              >
                {editMode ? (
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none"
                    onBlur={(e) => {
                      const updated = [...resume.core_competencies];
                      updated[i] = e.currentTarget.textContent || comp;
                      onUpdate("core_competencies", updated);
                    }}
                  >
                    {comp}
                  </span>
                ) : (
                  comp
                )}
                {editMode && (
                  <button onClick={() => removeCompetency(i)} className="hover:text-red-500 transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            ))}
            {editMode && (
              <span className="inline-flex items-center gap-1">
                <input
                  value={newCompetency}
                  onChange={(e) => setNewCompetency(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCompetency()}
                  placeholder="Add..."
                  className="border rounded-full px-2 py-0.5 w-20 outline-none"
                  style={{ fontSize: "10px" }}
                />
                <button onClick={addCompetency} style={{ color: "hsl(174, 62%, 40%)" }}>
                  <Plus className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Experience */}
      {resume.experience.length > 0 && (
        <div className="mb-5">
          <SectionHeader>Experience</SectionHeader>
          <div className="space-y-4">
            {resume.experience.map((exp, ei) => (
              <div key={ei}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div>
                    <EditableText
                      value={exp.title}
                      path={`experience.${ei}.title`}
                      editMode={editMode}
                      onUpdate={onUpdate}
                      className="font-bold"
                      style={{ fontSize: "12px" }}
                    />
                    {exp.company && (
                      <EditableText
                        value={exp.company}
                        path={`experience.${ei}.company`}
                        editMode={editMode}
                        onUpdate={onUpdate}
                        style={{ fontSize: "11px", color: "#4B5563" }}
                      />
                    )}
                  </div>
                  {exp.dates && (
                    <EditableText
                      value={exp.dates}
                      path={`experience.${ei}.dates`}
                      editMode={editMode}
                      onUpdate={onUpdate}
                      className="shrink-0"
                      style={{ fontSize: "10px", color: "#6B7280" }}
                    />
                  )}
                </div>
                <ul className="space-y-1 ml-3">
                  {exp.bullets.map((bullet, bi) => (
                    <li
                      key={bi}
                      className={`flex gap-1.5 ${editMode ? "outline-none rounded px-1 -mx-1 cursor-text" : ""}`}
                      contentEditable={editMode}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (editMode) {
                          const text = e.currentTarget.textContent || "";
                          const updated = [...exp.bullets];
                          updated[bi] = text;
                          onUpdate(`experience.${ei}.bullets`, updated);
                        }
                      }}
                      onKeyDown={(e) => handleBulletKeyDown(e as any, ei, bi, exp.bullets)}
                      style={{ fontSize: "11px", lineHeight: "1.65" }}
                    >
                      <span className="shrink-0 mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {resume.education.length > 0 && (
        <div>
          <SectionHeader>Education</SectionHeader>
          <div className="space-y-2">
            {resume.education.map((edu, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <div>
                  <EditableText
                    value={edu.degree}
                    path={`education.${i}.degree`}
                    editMode={editMode}
                    onUpdate={onUpdate}
                    className="font-medium"
                    style={{ fontSize: "11px" }}
                  />
                  <EditableText
                    value={edu.institution}
                    path={`education.${i}.institution`}
                    editMode={editMode}
                    onUpdate={onUpdate}
                    style={{ fontSize: "10.5px", color: "#6B7280" }}
                  />
                </div>
                {edu.year && (
                  <span className="shrink-0" style={{ fontSize: "10px", color: "#6B7280" }}>
                    {edu.year}
                  </span>
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
