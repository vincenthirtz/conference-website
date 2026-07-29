// Scènes du cockpit caster web — chargement + synchro Supabase Realtime sur la
// table `caster_scenes` (partagée avec l'app desktop womenscup-caster : toute
// édition ici est vue en direct par l'app et les overlays, et réciproquement).
//
// La liste est petite (une dizaine de lignes) : sur chaque event postgres_changes
// on recharge tout — plus simple et plus sûr qu'un merge fin, même posture que
// les autres écrans admin. L'anti-clobber de la scène en cours d'édition est la
// responsabilité de l'appelant (draft local, cf. /admin/caster).

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { supabaseClient } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type { CasterScene } from '@/types/caster';

type Options = {
  enabled?: boolean;
  /** Statut Realtime (SUBSCRIBED / CHANNEL_ERROR / …) — stable (useCallback). */
  onStatus?: (status: string) => void;
};

export function useCasterScenes({ enabled = true, onStatus }: Options = {}) {
  const [scenes, setScenes] = useState<CasterScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setScenes((data as CasterScene[]) ?? []);
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

  return { scenes, loading, error, reload, saveSceneData };
}
