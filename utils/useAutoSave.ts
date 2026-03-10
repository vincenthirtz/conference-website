// utils/useAutoSave.ts
// Hook to auto-save form drafts to localStorage with debounce.

import { useEffect, useRef, useState, useCallback } from 'react';

type AutoSaveOptions = {
  /** localStorage key (should be unique per form/page) */
  key: string;
  /** Debounce delay in ms (default: 2000) */
  delay?: number;
  /** Whether the form data has been loaded from the server (skip restore if false) */
  ready?: boolean;
};

type AutoSaveReturn<T> = {
  /** Whether a draft was restored on mount */
  draftRestored: boolean;
  /** Timestamp of last save (ISO string or null) */
  lastSaved: string | null;
  /** Clear the stored draft */
  clearDraft: () => void;
  /** Attempt to restore draft — returns the stored data or null */
  restoreDraft: () => T | null;
};

/**
 * Auto-saves `data` to localStorage whenever it changes (debounced).
 * On mount, checks for a stored draft and exposes it via `restoreDraft()`.
 *
 * Usage:
 *   const { draftRestored, lastSaved, clearDraft, restoreDraft } = useAutoSave({
 *     key: 'admin_news_new',
 *     data: form,
 *     delay: 2000,
 *   });
 *
 *   // On mount, if draftRestored is true, offer to restore:
 *   useEffect(() => {
 *     if (draftRestored) {
 *       const draft = restoreDraft();
 *       if (draft && confirm('Restaurer le brouillon sauvegardé ?')) {
 *         setForm(draft);
 *       } else {
 *         clearDraft();
 *       }
 *     }
 *   }, [draftRestored]);
 */
export function useAutoSave<T>(
  data: T,
  options: AutoSaveOptions
): AutoSaveReturn<T> {
  const { key, delay = 2000, ready = true } = options;
  const storageKey = `autosave_${key}`;

  const [draftRestored, setDraftRestored] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialCheckDone = useRef(false);

  // On mount, check if a draft exists
  useEffect(() => {
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data) {
          setDraftRestored(true);
          setLastSaved(parsed.savedAt || null);
        }
      }
    } catch {
      // corrupted data — ignore
    }
  }, [storageKey]);

  // Debounced save on data change
  useEffect(() => {
    if (!ready) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        localStorage.setItem(
          storageKey,
          JSON.stringify({ data, savedAt: now })
        );
        setLastSaved(now);
      } catch {
        // localStorage full or unavailable — silently fail
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, storageKey, delay, ready]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setDraftRestored(false);
    setLastSaved(null);
  }, [storageKey]);

  const restoreDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return (parsed?.data as T) ?? null;
      }
    } catch {
      // corrupted
    }
    return null;
  }, [storageKey]);

  return { draftRestored, lastSaved, clearDraft, restoreDraft };
}
