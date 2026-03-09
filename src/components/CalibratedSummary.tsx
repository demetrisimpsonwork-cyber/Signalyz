import { useState, useEffect } from "react";
import { Copy, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Variant {
  name: string;
  text: string;
  why_this_works: string;
}

interface CalibratedSummaryProps {
  experience: string;
  jd: string;
  isPro: boolean;
  onUpgrade: () => void;
}

const CalibratedSummary = ({ experience, jd, isPro, onUpgrade }: CalibratedSummaryProps) => {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!experience || !jd) return;
    setLoading(true);
    supabase.functions
      .invoke("generate-pro-content", {
        body: { type: "calibrated_summary", experience, jd },
      })
      .then(({ data, error }) => {
        if (error) throw error;
        if (data?.variants) setVariants(data.variants);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [experience, jd]);

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="section-label">Calibrated Summary</p>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  if (variants.length === 0) return null;

  if (!isPro) {
    return (
      <div className="space-y-4">
        <div className="section-header">
          <p className="section-label">Calibrated Summary</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 text-center space-y-3">
          <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
           <p className="text-sm font-semibold text-foreground">Unlock Calibrated Summary — Full Signal Intelligence</p>
           <p className="text-xs text-muted-foreground">Your professional identity, repositioned for this role.</p>
           {user ? (
             <Button size="sm" onClick={onUpgrade}>Unlock Full Signal Intelligence — $19/month</Button>
          ) : (
            <Button size="sm" asChild><a href="/auth">Get Started Free</a></Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="section-header">
        <p className="section-label">Calibrated Summary</p>
        <p className="text-xs text-muted-foreground mt-1">Your professional identity, repositioned for this role</p>
      </div>
      <div className="space-y-4">
        {variants.map((v, i) => (
          <div key={i} style={{ animationDelay: `${i * 200}ms` }}>
            <div className="rounded-lg border-l-4 border-l-primary border bg-card p-5 space-y-2">
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">{v.name}</p>
                <button onClick={() => handleCopy(v.text, i)} className="shrink-0 p-1 rounded hover:bg-secondary transition-colors">
                  {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{v.text}</p>
              <p className="context-text">{v.why_this_works}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center">Zero fabrication — rebuilt from your actual experience</p>
    </div>
  );
};

export default CalibratedSummary;
