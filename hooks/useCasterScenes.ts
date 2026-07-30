// Scènes du cockpit caster web — chargement + synchro Supabase Realtime sur la
// table `caster_scenes` (partagée avec l'app desktop womenscup-caster : toute
// édition ici est vue en direct par l'app et les overlays, et réciproquement).
//
// La liste est petite (une dizaine de lignes) : sur chaque event postgres_changes
// on recharge tout — plus simple et plus sûr qu'un merge fin, même posture que
// les autres écrans admin. L'anti-clobber de la scène en cours d'édition est la
// responsabilité de l'appelant (draft local, cf. /admin/caster).
//
// Lot 7 — CRUD complet (création / renommage / duplication / suppression /
// réordonnancement), en écriture directe Supabase comme `saveSceneData` (RLS
// staff actif). Toute la logique PURE est déléguée : `utils/caster/sceneCrud.ts`
// (nom, overlay et `data` par défaut d'un type) et `utils/caster/sceneReorder.ts`
// (diff des `sort_order`). Les mutateurs `throw` en cas d'échec — l'appelant
// décide du toast : ici on ne sait pas si l'action était à l'antenne ou non.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { supabaseClient } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  defaultOverlayFile,
  defaultSceneData,
  defaultSceneName,
  duplicateName,
} from '@/utils/caster/sceneCrud';
import {
  orderWithDuplicateAfter,
  sortOrderUpdates,
} from '@/utils/caster/sceneReorder';
import type { CasterScene, CasterSceneType } from '@/types/caster';

type Options = {
  enabled?: boolean;
  /** Statut Realtime (SUBSCRIBED / CHANNEL_ERROR / …) — stable (useCallback). */
  onStatus?: (status: string) => void;
};

export function useCasterScenes({ enabled = true, onStatus }: Options = {}) {
  const [scenes, setScenes] = useState<CasterScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Liste courante lue depuis des callbacks STABLES (les mutateurs ne doivent
  // pas changer d'identité à chaque render). Mise à jour par `reload` lui-même
  // et NON au render : un mutateur qui enchaîne `await reload()` puis une
  // décision sur la liste (duplication → réordonnancement) doit voir la liste
  // fraîche immédiatement, alors que `setScenes` n'a pas encore re-rendu.
  const scenesRef = useRef<CasterScene[]>([]);
  // Garde anti-course : ne pas appliquer une réponse arrivée après unmount.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const { data, error: err } = await supabaseClient
      .from('caster_scenes')
      .select('*')
      .order('sort_order', { ascending: true });
    if (!alive.current) return;
    if (err) {
      logger.error('[useCasterScenes] load error', err);
      setError(err.message);
    } else {
      const list = (data as CasterScene[]) ?? [];
      scenesRef.current = list;
      setScenes(list);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  const onChange = useCallback(() => {
    void reload();
  }, [reload]);

  useRealtimeChannel({
    enabled,
    channel: 'caster-scenes-admin',
    table: 'caster_scenes',
    onChange,
    onStatus,
  });

  /**
   * Écrit la config d'une scène (colonne jsonb `data`). RLS : staff actif.
   * Le Realtime propage ensuite vers l'app desktop et les overlays.
   */
  const saveSceneData = useCallback(
    async (sceneId: string, data: Record<string, unknown>) => {
      const { error: err } = await supabaseClient
        .from('caster_scenes')
        .update({ data })
        .eq('id', sceneId);
      if (err) {
        logger.error('[useCasterScenes] save error', err);
        throw new Error(err.message);
      }
    },
    []
  );

  /* ------------------------------------------------------------------ *
   * Lot 7 — CRUD de la liste
   * ------------------------------------------------------------------ */

  /** Prochain `sort_order` libre (dense-ish : max + 1, jamais de collision). */
  const nextSortOrder = useCallback(
    () =>
      scenesRef.current.reduce(
        (max, scene) => Math.max(max, scene.sort_order ?? 0),
        -1
      ) + 1,
    []
  );

  /**
   * Réécrit les `sort_order` pour refléter `orderedIds`. Seules les lignes dont
   * l'ordre change réellement sont écrites (cf. sceneReorder.ts) : un UPDATE
   * inutile part quand même en Realtime vers l'app desktop et les overlays.
   */
  const reorderScenes = useCallback(
    async (orderedIds: string[]) => {
      const updates = sortOrderUpdates(orderedIds, scenesRef.current);
      if (updates.length === 0) return;
      // Séquentiel : la liste fait une dizaine de lignes, et un ordre d'écriture
      // déterministe rend le journal Postgres lisible en cas d'incident.
      for (const { id, sort_order } of updates) {
        const { error: err } = await supabaseClient
          .from('caster_scenes')
          .update({ sort_order })
          .eq('id', id);
        if (err) {
          logger.error('[useCasterScenes] reorder error', err);
          // On recharge : l'ordre en base est peut-être partiellement appliqué,
          // l'UI doit montrer la vérité plutôt que l'ordre optimiste.
          await reload();
          throw new Error(err.message);
        }
      }
      await reload();
    },
    [reload]
  );

  /**
   * Crée une scène du type donné et rend son id (pour la sélectionner).
   * `overlay` est renseigné avec le nom de fichier historique du desktop : cette
   * colonne y sert à charger le HTML local, une scène créée depuis le web doit
   * donc rester ouvrable là-bas.
   */
  const createScene = useCallback(
    async (type: CasterSceneType): Promise<string> => {
      const { data, error: err } = await supabaseClient
        .from('caster_scenes')
        .insert({
          name: defaultSceneName(type),
          type,
          overlay: defaultOverlayFile(type),
          data: defaultSceneData(type),
          sort_order: nextSortOrder(),
        })
        .select('id')
        .single();
      if (err || !data) {
        logger.error('[useCasterScenes] create error', err);
        throw new Error(err?.message || 'insert failed');
      }
      await reload();
      return (data as { id: string }).id;
    },
    [nextSortOrder, reload]
  );

  /** Renomme une scène (nom trimé, jamais vide). */
  const renameScene = useCallback(
    async (sceneId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('empty name');
      const { error: err } = await supabaseClient
        .from('caster_scenes')
        .update({ name: trimmed })
        .eq('id', sceneId);
      if (err) {
        logger.error('[useCasterScenes] rename error', err);
        throw new Error(err.message);
      }
      await reload();
    },
    [reload]
  );

  /**
   * Duplique une scène (même type, même overlay, même `data`) et rend l'id de la
   * copie. Insérée en fin de table puis remontée juste après l'originale — deux
   * allers-retours, mais aucun `sort_order` en doublon (le desktop, lui, écrit
   * `idx + 1` et laisse deux lignes partager le même rang).
   */
  const duplicateScene = useCallback(
    async (sceneId: string): Promise<string> => {
      const list = scenesRef.current;
      const source = list.find((scene) => scene.id === sceneId);
      if (!source) throw new Error('scene not found');
      const { data, error: err } = await supabaseClient
        .from('caster_scenes')
        .insert({
          name: duplicateName(
            source.name,
            list.map((scene) => scene.name)
          ),
          type: source.type,
          overlay: source.overlay ?? defaultOverlayFile(source.type),
          data: source.data ?? {},
          sort_order: nextSortOrder(),
        })
        .select('id')
        .single();
      if (err || !data) {
        logger.error('[useCasterScenes] duplicate error', err);
        throw new Error(err?.message || 'insert failed');
      }
      const createdId = (data as { id: string }).id;
      await reload();
      await reorderScenes(
        orderWithDuplicateAfter(
          scenesRef.current.map((scene) => scene.id),
          sceneId,
          createdId
        )
      );
      return createdId;
    },
    [nextSortOrder, reload, reorderScenes]
  );

  /** Supprime une scène. La confirmation est la responsabilité de l'appelant. */
  const deleteScene = useCallback(
    async (sceneId: string) => {
      const { error: err } = await supabaseClient
        .from('caster_scenes')
        .delete()
        .eq('id', sceneId);
      if (err) {
        logger.error('[useCasterScenes] delete error', err);
        throw new Error(err.message);
      }
      await reload();
    },
    [reload]
  );

  return {
    scenes,
    loading,
    error,
    reload,
    saveSceneData,
    createScene,
    renameScene,
    duplicateScene,
    deleteScene,
    reorderScenes,
  };
}
