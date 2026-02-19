import { useState, useCallback } from "react";

const TRIAL_STARTED_KEY = "resumix_trial_started";
const TRIAL_RUNS_KEY = "resumix_trial_runs";
const TRIAL_LIMIT = 3;

export const useReverseTrial = () => {
  const [trialStarted, setTrialStarted] = useState<boolean>(() => {
    return localStorage.getItem(TRIAL_STARTED_KEY) === "true";
  });

  const [trialRunsUsed, setTrialRunsUsed] = useState<number>(() => {
    return parseInt(localStorage.getItem(TRIAL_RUNS_KEY) ?? "0", 10);
  });

  const startTrial = useCallback(() => {
    localStorage.setItem(TRIAL_STARTED_KEY, "true");
    setTrialStarted(true);
  }, []);

  const incrementTrialRun = useCallback(() => {
    setTrialRunsUsed((prev) => {
      const next = prev + 1;
      localStorage.setItem(TRIAL_RUNS_KEY, String(next));
      return next;
    });
  }, []);

  const trialExhausted = trialStarted && trialRunsUsed >= TRIAL_LIMIT;
  const isTrialPro = trialStarted && !trialExhausted;
  const trialRunsRemaining = Math.max(0, TRIAL_LIMIT - trialRunsUsed);

  return {
    trialStarted,
    trialRunsUsed,
    trialRunsRemaining,
    trialExhausted,
    isTrialPro,
    startTrial,
    incrementTrialRun,
    TRIAL_LIMIT,
  };
};
