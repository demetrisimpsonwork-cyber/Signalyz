import { RefreshCw, Edit3, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResumeToolbarProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onReassemble: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
  loading: boolean;
  saved: boolean;
}

const ResumeToolbar = ({
  editMode,
  onToggleEdit,
  onReassemble,
  onExportDocx,
  onExportPdf,
  loading,
  saved,
}: ResumeToolbarProps) => {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 flex-wrap">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReassemble}
          disabled={loading}
          className="gap-1.5 text-xs whitespace-nowrap"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Re-Assemble
        </Button>
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={onToggleEdit}
          className="gap-1.5 text-xs whitespace-nowrap"
        >
          {editMode ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
          {editMode ? "Preview" : "Edit Mode"}
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-col w-full md:w-auto md:flex-row">
        {saved && (
          <span className="text-[10px] font-medium text-primary animate-fade-in">Calibration saved</span>
        )}
        <Button variant="outline" size="sm" onClick={onExportDocx} className="gap-1.5 text-xs whitespace-nowrap w-full md:w-auto">
          <Download className="h-3 w-3" />
          <span className="hidden md:inline">Export ATS (.docx)</span>
          <span className="md:hidden">ATS (.docx)</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onExportPdf} className="gap-1.5 text-xs whitespace-nowrap w-full md:w-auto">
          <Download className="h-3 w-3" />
          <span className="hidden md:inline">Export Designed (.pdf)</span>
          <span className="md:hidden">PDF (.pdf)</span>
        </Button>
      </div>
    </div>
  );
};

export default ResumeToolbar;
