import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface ResultSectionProps {
  title: string;
  content: string | string[];
}

const ResultSection = ({ title, content }: ResultSectionProps) => {
  const [copied, setCopied] = useState(false);

  const displayText = Array.isArray(content) ? content.join(", ") : content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          onClick={handleCopy}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={`Copy ${title}`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{displayText}</p>
    </div>
  );
};

export default ResultSection;
