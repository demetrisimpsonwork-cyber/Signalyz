import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const OnboardingModal = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

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

  const steps = [
    {
      headline: "This isn't resume tailoring.",
      body: "Resumix diagnoses how hiring managers actually read your signal — and repositions your experience to close the gap. Without making anything up.",
      visual: (
        <div className="space-y-3 mt-4">
          <div className="rounded-lg bg-[#2A2A2A] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">BEFORE</p>
            <p className="text-xs text-gray-300 mt-1">Managed customer inquiries and helped resolve issues for business clients while maintaining documentation.</p>
          </div>
          <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-primary" /></div>
          <div className="rounded-lg border-l-4 border-l-primary bg-white/5 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-primary">AFTER RESUMIX</p>
            <p className="text-xs text-white/90 mt-1">Served as primary resolution contact for 40-70 concurrent B2B cases under strict SLA requirements.</p>
          </div>
        </div>
      ),
      cta: "Got it — next →",
    },
    {
      headline: "Paste your full resume.",
      body: "The more context you give, the more precise the diagnosis. Paste your entire resume or upload your PDF/DOCX — then paste the full job description you're targeting.",
      visual: (
        <div className="mt-4 space-y-2">
          <div className="rounded-md border border-white/10 bg-white/5 p-3 h-8" />
          <div className="rounded-md border border-white/10 bg-white/5 p-3 h-12" />
          <div className="rounded-md bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">Run Alignment</div>
        </div>
      ),
      cta: "Got it — one more →",
    },
    {
      headline: "Your Signal Diagnosis is ready.",
      body: "A score, your top gap, calibrated bullets, and — on Pro — a full Identity Strength Index, Signal Risk Projection, and Interview Intelligence.",
      visual: (
        <div className="mt-4 rounded-lg bg-white/5 border border-white/10 p-4 space-y-2 blur-[1px]">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">72%</span>
            <span className="text-xs text-white/50">At Threshold</span>
          </div>
          <div className="h-4 bg-white/5 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
      ),
      cta: "Run My First Alignment →",
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-[480px] mx-4 rounded-xl bg-[#0F1C2E] p-8 shadow-2xl">
        <button
          onClick={() => dismiss("onboarding_skipped")}
          className="absolute top-4 right-4 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Skip intro
        </button>

        <h2 className="text-2xl font-bold text-white">{current.headline}</h2>
        <p className="mt-3 text-base text-white/60 leading-relaxed">{current.body}</p>
        {current.visual}

        <Button
          className="w-full mt-6"
          onClick={() => {
            if (step < 2) {
              setStep(step + 1);
            } else {
              dismiss("onboarding_completed");
              document.getElementById("alignment-tool")?.scrollIntoView({ behavior: "smooth" });
              // Focus resume input
              setTimeout(() => {
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="resume"]');
                textarea?.focus();
              }, 500);
            }
          }}
        >
          {current.cta}
        </Button>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {[0, 1, 2].map((s) => (
            <div key={s} className={`h-2 w-2 rounded-full transition-colors ${s === step ? "bg-primary" : "bg-white/20"}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
