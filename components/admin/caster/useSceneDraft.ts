// components/admin/caster/useSceneDraft.ts
//
// Machinerie draft/auto-save partagée par TOUS les éditeurs de scènes caster
// (extraite de MatchSceneEditor au lot 2, comportement inchangé) :
//
//  - Draft local initialisé via `normalize(scene.data)` — chaque éditeur définit
//    son état de formulaire (qui peut contenir des champs texte intermédiaires,
//    ex. le textarea « résultats par map » avant parse).
//  - Auto-save debounce ~600 ms via onSave(scene.id, buildPayload(raw, draft))
//    où le payload commence par `{ ...data brute }` : les champs inconnus/futurs
//    (obsScene, labels de thème, matchId…) sont préservés.
//  - Anti-clobber : tant que le draft est dirty ou qu'une sauvegarde est en vol,
//    les mises à jour Realtime de la scène active sont ignorées ; le draft est
//    ré-initialisé quand une maj distante arrive draft propre. Le parent remonte
//    l'éditeur (key={scene.id}) au changement de scène.
//  - Flush best-effort à l'unmount pour ne pas perdre une édition tombée dans
//    la fenêtre de debounce.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { CasterScene } from '@/types/caster';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Options<D> = {
  scene: CasterScene;
  /** saveSceneData du hook useCasterScenes (throw en cas d'erreur RLS/réseau). */
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
  /** Data jsonb brute → état de formulaire (défauts appliqués). */
  normalize: (raw: Record<string, unknown>) => D;
  /**
   * Payload complet écrit en base : spread de la data brute d'abord (préserve
   * les champs que l'éditeur ne connaît pas), puis les champs édités.
   */
  buildPayload: (
    raw: Record<string, unknown>,
    draft: D
  ) => Record<string, unknown>;
};

export function useSceneDraft<D extends object>({
  scene,
  onSave,
  normalize,
  buildPayload,
}: Options<D>) {
  const t = useAdminT(nsAdminCasterScenes);
  const { addToast } = useToast();

  // normalize/buildPayload sont des fonctions de module côté éditeurs, mais on
  // les garde en refs pour ne pas imposer la stabilité référentielle.
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;
  const buildRef = useRef(buildPayload);
  buildRef.current = buildPayload;

  const [draft, setDraft] = useState<D>(() => normalize(scene.data));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Data brute la plus fraîche (base du spread au save — préserve les champs
  // inconnus, dont ceux mis à jour à distance pendant l'édition).
  const rawRef = useRef<Record<string, unknown>>(scene.data);
  useEffect(() => {
    rawRef.current = scene.data;
  }, [scene.data]);

  // Anti-clobber : save en vol + numéro de séquence des éditions locales.
  const inFlightRef = useRef(false);
  const editSeqRef = useRef(0);

  // Maj distante (Realtime) alors que le draft est propre → ré-init du draft.
  // Gardé par identité pour ne pas ré-initialiser quand seul `dirty` bouge
  // (retour à propre après save : l'écho Realtime n'est pas encore arrivé).
  const lastAppliedRef = useRef<Record<string, unknown>>(scene.data);
  useEffect(() => {
    if (scene.data === lastAppliedRef.current) return;
    lastAppliedRef.current = scene.data;
    if (dirty || inFlightRef.current) return;
    setDraft(normalizeRef.current(scene.data));
  }, [scene.data, dirty]);

  // Auto-save debounce ~600 ms : chaque édition re-arme le timer (le draft est
  // une dépendance de l'effet), la fermeture capture donc l'état le plus frais.
  useEffect(() => {
    if (!dirty) return undefined;
    const seq = editSeqRef.current;
    const timer = setTimeout(async () => {
      inFlightRef.current = true;
      setSaveState('saving');
      try {
        await onSave(scene.id, buildRef.current(rawRef.current, draft));
        // Une édition pendant le vol re-déclenchera un save : on ne repasse à
        // propre que si rien n'a bougé depuis la capture du payload.
        if (editSeqRef.current === seq) {
          setDirty(false);
          setSaveState('saved');
        }
      } catch (err) {
        setSaveState('error');
        addToast(
          format(t.saveErrorToast, {
            message: (err as Error)?.message || '',
          }),
          'error'
        );
      } finally {
        inFlightRef.current = false;
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [dirty, draft, scene.id, onSave, addToast, t]);

  // Flush best-effort à l'unmount (changement de scène / navigation) pour ne
  // pas perdre une édition tombée dans la fenêtre de debounce.
  const latestRef = useRef({ draft, dirty });
  useEffect(() => {
    latestRef.current = { draft, dirty };
  });
  useEffect(() => {
    return () => {
      const l = latestRef.current;
      if (!l.dirty) return;
      void onSave(scene.id, buildRef.current(rawRef.current, l.draft)).catch(
        () => {
          /* best-effort : la page se démonte, pas de toast possible */
        }
      );
    };
  }, [scene.id, onSave]);

  /** Signale une édition locale (re-arme le debounce + saveState 'saving'). */
  const markEdit = useCallback(() => {
    editSeqRef.current += 1;
    setDirty(true);
    setSaveState('saving');
  }, []);

  /** Patch partiel du draft + markEdit (le cas courant des champs contrôlés). */
  const patch = useCallback(
    (p: Partial<D>) => {
      setDraft((d) => ({ ...d, ...p }));
      markEdit();
    },
    [markEdit]
  );

  /** Transformation complète du draft + markEdit (ex. swap des équipes). */
  const update = useCallback(
    (fn: (d: D) => D) => {
      setDraft(fn);
      markEdit();
    },
    [markEdit]
  );

  return { draft, patch, update, markEdit, saveState };
}
