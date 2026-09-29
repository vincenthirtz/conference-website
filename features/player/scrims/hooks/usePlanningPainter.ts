// features/player/scrims/hooks/usePlanningPainter.ts — état de peinture d'une
// grille de disponibilités (« When2Meet ») : créneaux locaux, dernier état
// persisté, garde « quitter sans enregistrer », sauvegarde automatique
// (debounce 1,2 s) et « reprendre mes dispos habituelles ».
//
// Les gestes passent par le client du module (PUT availability, GET
// suggest) ; l'appartenance à la session reste vérifiée côté serveur
// (resolvePlanningParty) à chaque appel.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useSavePlanningAvailability,
  useSuggestPlanningSlots,
} from './useScrimsQueries';

export type PlanningPainterTexts = {
  saveSuccess: string;
  saveError: string;
  reuseNone: string;
  reuseApplied: string;
  reuseError: string;
};

type Toast = (message: string, kind: 'success' | 'error' | 'info') => void;

export function usePlanningPainter({
  planningId,
  initialSlots,
  readOnly,
  t,
  toast,
  errorText,
  onSaved,
}: {
  planningId: string;
  initialSlots: string[];
  readOnly: boolean;
  t: PlanningPainterTexts;
  toast: Toast;
  errorText: (err: unknown, fallback: string) => string;
  onSaved?: (slots: string[]) => void;
}) {
  const [slots, setSlots] = useState<string[]>(() =>
    Array.isArray(initialSlots) ? initialSlots : []
  );
  // Dernier état persisté (modifications non enregistrées).
  const [savedSlots, setSavedSlots] = useState<string[]>(() =>
    Array.isArray(initialSlots) ? initialSlots : []
  );
  const save = useSavePlanningAvailability(planningId);
  const suggest = useSuggestPlanningSlots(planningId);
  const saving = save.isPending;

  // Comparaison ensembliste : l'ordre canonique peut varier.
  const dirty = useMemo(() => {
    if (slots.length !== savedSlots.length) return true;
    const saved = new Set(savedSlots);
    return slots.some((s) => !saved.has(s));
  }, [slots, savedSlots]);

  // Garde-fou navigateur avant de quitter avec des dispos non sauvegardées.
  useEffect(() => {
    if (readOnly || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, readOnly]);

  const handleSave = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (saving || readOnly) return;
      try {
        const data = await save.mutateAsync({ slots });
        const persisted = Array.isArray(data?.mySlots) ? data.mySlots : slots;
        setSlots(persisted);
        setSavedSlots(persisted);
        onSaved?.(persisted);
        // Auto-save silencieux : le témoin « enregistré » suffit.
        if (!opts?.silent) toast(t.saveSuccess, 'success');
      } catch (err) {
        toast(errorText(err, t.saveError), 'error');
      }
    },
    [saving, readOnly, save, slots, onSaved, toast, t, errorText]
  );

  // Auto-save (debounce ~1,2 s après la dernière modification).
  useEffect(() => {
    if (readOnly || !dirty || saving) return;
    const id = setTimeout(() => {
      void handleSave({ silent: true });
    }, 1200);
    return () => clearTimeout(id);
  }, [dirty, readOnly, saving, handleSave]);

  const reuseUsual = useCallback(async () => {
    if (suggest.isPending) return;
    try {
      const data = await suggest.mutateAsync();
      const suggested = Array.isArray(data?.slots) ? data.slots : [];
      if (suggested.length === 0) {
        toast(t.reuseNone, 'info');
        return;
      }
      setSlots(suggested);
      toast(t.reuseApplied, 'success');
    } catch (err) {
      toast(errorText(err, t.reuseError), 'error');
    }
  }, [suggest, toast, t, errorText]);

  return {
    slots,
    setSlots,
    dirty,
    saving,
    loadingSuggest: suggest.isPending,
    handleSave,
    reuseUsual,
  };
}
