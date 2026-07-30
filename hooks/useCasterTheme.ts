// Thème actif des overlays caster — lit la table `caster_themes` (une seule
// ligne `is_active`, garanti par un index unique partiel) et suit ses
// changements en Realtime.
//
// Utilisé des DEUX côtés :
//  - les overlays hébergés (/overlay/caster/*) : lecture avec la clé anon
//    (policy SELECT publique), pour appliquer couleurs et polices à l'antenne ;
//  - le cockpit (/admin/caster) : même lecture, pour l'aperçu et l'édition.
//
// Realtime sur la table entière (pas de filtre) : une activation change DEUX
// lignes (l'ancienne active et la nouvelle), et la ligne active n'est pas
// connue d'avance — un filtre `id=eq.` serait donc faux ici. La table ne
// contient qu'une poignée de lignes : recharger à chaque event est trivial.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { supabaseClient } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { normalizeThemeData } from '@/utils/caster/theme';
import {
  DEFAULT_CASTER_THEME,
  type CasterTheme,
  type CasterThemeData,
} from '@/types/casterTheme';

type Options = {
  enabled?: boolean;
  /** Nom du canal Realtime — distinct par surface pour éviter les collisions. */
  channel?: string;
};

export function useCasterTheme({
  enabled = true,
  channel = 'caster-themes',
}: Options = {}) {
  const [themes, setThemes] = useState<CasterTheme[]>([]);
  /** Thème actif normalisé — jamais null : défaut si la table est vide/KO. */
  const [theme, setTheme] = useState<CasterThemeData>(DEFAULT_CASTER_THEME);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const { data, error } = await supabaseClient
      .from('caster_themes')
      .select('*')
      .order('created_at', { ascending: true });
    if (!alive.current) return;
    if (error) {
      // Thème = habillage : en cas d'erreur on garde le défaut plutôt que de
      // priver l'overlay de rendu.
      logger.error('[useCasterTheme] load error', error);
      setLoaded(true);
      return;
    }
    const rows = (data as CasterTheme[]) ?? [];
    setThemes(rows);
    const active = rows.find((t) => t.is_active) ?? rows[0] ?? null;
    setActiveId(active?.id ?? null);
    setTheme(
      normalizeThemeData(
        (active?.data as Record<string, unknown> | undefined) ?? null
      )
    );
    setLoaded(true);
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
    channel,
    table: 'caster_themes',
    onChange,
  });

  return { theme, themes, activeId, loaded, reload };
}
