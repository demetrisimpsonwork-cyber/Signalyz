import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const OnboardingModal = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("onboarding_completed, onboarding_skipped")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !data.onboarding_completed && !data.onboarding_skipped) {
          setShow(true);
        }
      });
  }, [user]);

  const dismiss = async (field: "onboarding_completed" | "onboarding_skipped") => {
    if (user) {
      await supabase.from("profiles").update({ [field]: true }).eq("user_id", user.id);
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-[480px] mx-4 rounded-xl bg-[#0F1C2E] p-8 shadow-2xl">
        <button
          onClick={() => dismiss("onboarding_skipped")}
          className="absolute top-4 right-4 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Skip intro
        </button>

        <h2 className="text-2xl font-bold text-white">This isn't resume tailoring.</h2>
        <p className="mt-3 text-base text-white/60 leading-relaxed">
          Signalyz diagnoses how hiring managers actually read your signal — and repositions your experience to close the gap. Without making anything up.
        </p>

        <div className="space-y-3 mt-4">
          <div className="rounded-lg bg-[#2A2A2A] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">BEFORE</p>
            <p className="text-xs text-gray-300 mt-1">Managed customer inquiries and helped resolve issues for business clients while maintaining documentation.</p>
          </div>
          <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-primary" /></div>
          <div className="rounded-lg border-l-4 border-l-primary bg-white/5 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-primary">AFTER SIGNALYZ</p>
            <p className="text-xs text-white/90 mt-1">Served as primary resolution contact for 40-70 concurrent B2B cases under strict SLA requirements.</p>
          </div>
        </div>

        <Button
          className="w-full mt-6"
          onClick={() => {
            dismiss("onboarding_completed");
            document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
            setTimeout(() => {
              const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="resume"]');
              textarea?.focus();
            }, 500);
          }}
        >
          Run My First Alignment →
        </Button>
      </div>
    </div>
  );
};

export default OnboardingModal;
