import { useState, useCallback, useRef, useEffect } from "react";
import type { CalibratedResumeData } from "./useResumeAssembly";

interface UseResumeEditorReturn {
  editedResume: CalibratedResumeData | null;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  saved: boolean;
  updateField: (path: string, value: any) => void;
}

export function useResumeEditor(initial: CalibratedResumeData | null): UseResumeEditorReturn {
  const [editedResume, setEditedResume] = useState<CalibratedResumeData | null>(initial);
  const [editMode, setEditMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync when initial changes (new assembly)
  useEffect(() => {
    if (initial) setEditedResume(initial);
  }, [initial]);

  const persistEdit = useCallback((data: CalibratedResumeData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem("resumix_calibrated_resume_data_edited", JSON.stringify(data));
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch {}
    }, 500);
  }, []);

  const updateField = useCallback((path: string, value: any) => {
    setEditedResume((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (/^\d+$/.test(k)) obj = obj[parseInt(k)];
        else obj = obj[k];
      }
      const lastKey = keys[keys.length - 1];
      if (/^\d+$/.test(lastKey)) obj[parseInt(lastKey)] = value;
      else obj[lastKey] = value;
      persistEdit(next);
      return next;
    });
  }, [persistEdit]);

  return { editedResume, editMode, setEditMode, saved, updateField };
}
