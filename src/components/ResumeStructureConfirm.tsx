import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { CalibratedResumeData } from "@/hooks/useResumeAssembly";

interface ResumeStructureConfirmProps {
  resume: CalibratedResumeData;
  issues: string[];
  onConfirm: (corrected: CalibratedResumeData) => void;
  onSkip: () => void;
}

export default function ResumeStructureConfirm({
  resume,
  issues,
  onConfirm,
  onSkip,
}: ResumeStructureConfirmProps) {
  const [header, setHeader] = useState({ ...resume.header });
  const [experience, setExperience] = useState(
    resume.experience.map((e) => ({ ...e, bullets: [...e.bullets] }))
  );
  const [education, setEducation] = useState(
    resume.education.map((e) => ({ ...e }))
  );

  const updateExp = (idx: number, field: string, value: string) => {
    setExperience((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const removeExp = (idx: number) => {
    setExperience((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEdu = (idx: number, field: string, value: string) => {
    setEducation((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const removeEdu = (idx: number) => {
    setEducation((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEdu = () => {
    setEducation((prev) => [...prev, { institution: "", degree: "", year: "" }]);
  };

  const handleConfirm = () => {
    const corrected: CalibratedResumeData = {
      ...resume,
      header,
      experience,
      education,
    };
    onConfirm(corrected);
  };

  const hasNameIssue = issues.some((i) => i.startsWith("name_"));
  const hasContactIssue = issues.includes("contact_in_experience") || issues.includes("artifact_in_experience");
  const hasEduIssue = issues.some((i) => i.startsWith("education_"));
  const hasLocationIssue = issues.includes("location_contaminated");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Confirm Resume Structure
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We detected potential parsing issues with your uploaded PDF. Please verify
            the fields below before we assemble your Calibrated Resume.
          </p>
        </div>
      </div>

      {/* Header fields */}
      <FieldSection
        title="Personal Information"
        flagged={hasNameIssue || hasLocationIssue}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldInput
            label="Full Name"
            value={header.name}
            onChange={(v) => setHeader((h) => ({ ...h, name: v }))}
            flagged={hasNameIssue}
            placeholder="Your full name"
          />
          <FieldInput
            label="Professional Title"
            value={header.title}
            onChange={(v) => setHeader((h) => ({ ...h, title: v }))}
            placeholder="e.g. Senior Software Engineer"
          />
          <FieldInput
            label="Email"
            value={header.email}
            onChange={(v) => setHeader((h) => ({ ...h, email: v }))}
            placeholder="you@email.com"
          />
          <FieldInput
            label="Phone"
            value={header.phone}
            onChange={(v) => setHeader((h) => ({ ...h, phone: v }))}
            placeholder="(555) 123-4567"
          />
          <FieldInput
            label="Location"
            value={header.location}
            onChange={(v) => setHeader((h) => ({ ...h, location: v }))}
            flagged={hasLocationIssue}
            placeholder="City, ST"
          />
          <FieldInput
            label="LinkedIn"
            value={header.linkedin}
            onChange={(v) => setHeader((h) => ({ ...h, linkedin: v }))}
            placeholder="linkedin.com/in/yourname"
          />
        </div>
      </FieldSection>

      {/* Experience */}
      <FieldSection
        title={`Experience (${experience.length} entries)`}
        flagged={hasContactIssue}
      >
        {experience.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No experience entries detected.</p>
        )}
        {experience.map((exp, idx) => (
          <div
            key={idx}
            className="relative rounded-md border border-border bg-background p-3 space-y-2"
          >
            <button
              onClick={() => removeExp(idx)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              aria-label="Remove entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <FieldInput
                label="Company"
                value={exp.company}
                onChange={(v) => updateExp(idx, "company", v)}
                placeholder="Company name"
                small
              />
              <FieldInput
                label="Title"
                value={exp.title}
                onChange={(v) => updateExp(idx, "title", v)}
                placeholder="Job title"
                small
              />
              <FieldInput
                label="Dates"
                value={exp.dates}
                onChange={(v) => updateExp(idx, "dates", v)}
                placeholder="2020 – Present"
                small
              />
            </div>
          </div>
        ))}
      </FieldSection>

      {/* Education */}
      <FieldSection
        title={`Education (${education.length} entries)`}
        flagged={hasEduIssue}
      >
        {education.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No education entries detected.</p>
        )}
        {education.map((edu, idx) => (
          <div
            key={idx}
            className="relative rounded-md border border-border bg-background p-3 space-y-2"
          >
            <button
              onClick={() => removeEdu(idx)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              aria-label="Remove entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <FieldInput
                label="Institution"
                value={edu.institution}
                onChange={(v) => updateEdu(idx, "institution", v)}
                placeholder="University name"
                small
              />
              <FieldInput
                label="Degree"
                value={edu.degree}
                onChange={(v) => updateEdu(idx, "degree", v)}
                placeholder="B.S. Computer Science"
                small
              />
              <FieldInput
                label="Year"
                value={edu.year}
                onChange={(v) => updateEdu(idx, "year", v)}
                placeholder="2020"
                small
              />
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 mt-1"
          onClick={addEdu}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Education
        </Button>
      </FieldSection>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button onClick={handleConfirm} className="gap-2 flex-1">
          <CheckCircle className="h-4 w-4" />
          Confirm &amp; Generate Resume
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
          Skip — use as-is
        </Button>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function FieldSection({
  title,
  flagged,
  children,
}: {
  title: string;
  flagged?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {flagged && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">
            Needs review
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  flagged,
  small,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  flagged?: boolean;
  small?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className={`text-xs ${flagged ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
        {label}
        {flagged && " ⚠"}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${small ? "h-8 text-xs" : ""} ${flagged ? "border-amber-500/50 focus-visible:ring-amber-500/30" : ""}`}
      />
    </div>
  );
}
