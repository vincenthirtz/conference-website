// pages/overlay/caster/[sceneKey].tsx
//
// Overlay OBS PUBLIC des scènes caster — Browser Source 1920×1080 branché sur
// la table `caster_scenes` (partagée avec l'app desktop womenscup-caster).
//
// URL : /overlay/caster/<sceneKey> où sceneKey = UUID de scène OU type de
// scène (`match`). Par type, on prend la première au sort_order — le même
// ordre que le hub de scènes du caster.
//
// - Aucune auth : la table a une policy SELECT publique (les overlays lisent
//   avec la clé anon, comme n'importe quel client). Lecture via supabaseClient.
// - Chrome-less : `pages/_app.tsx` rend `/overlay/*` bare + noindex.
// - Temps réel : Supabase Realtime sur la ligne résolue — le payload UPDATE
//   contient la ligne complète (payload.new), appliquée SANS refetch. Filet de
//   sécurité : re-fetch toutes les 15 s (les Browser Sources OBS tournent des
//   heures ; même posture que useOverlayState pour /overlay/[runId]).
// - Flash-guard : rien n'est rendu avant la première donnée (équivalent du
//   `body:not(.data-ready)` de match.html — pas de placeholders à l'antenne).
// - Scène introuvable ou type inconnu (ligne écrite par une version plus
//   récente du caster) : page vide transparente — jamais de 404 ni de texte,
//   ça partirait à l'antenne.
//
// Les 13 types de scènes sont portés — un composant par type sous
// components/overlay/caster/ : lot 2 pour match + starting / pause / results /
// end / mvp / scrim / webcam, lot 6 pour bracket / player / leaderboard /
// standings (ces 4 dernières ne stockent qu'une référence et vont chercher
// leurs données sur l'API publique du site, en same-origin), lot 7 pour
// `camera` (captation d'un opérateur distant intégrée par un lien — WEB-ONLY,
// l'app desktop n'a pas cet overlay).

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseClient } from '@/utils/supabase';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { isValidUUID } from '@/utils/apiHelpers';
import { CASTER_SCENE_TYPES, type CasterScene } from '@/types/caster';
import { normalizeMatchData } from '@/utils/caster/matchScene';
import { useCasterTheme } from '@/hooks/useCasterTheme';
import { themeCssVars } from '@/utils/caster/theme';
import { CasterMatchOverlay } from '@/components/overlay/caster/CasterMatchOverlay';
import { CasterStartingOverlay } from '@/components/overlay/caster/CasterStartingOverlay';
import { CasterPauseOverlay } from '@/components/overlay/caster/CasterPauseOverlay';
import { CasterResultsOverlay } from '@/components/overlay/caster/CasterResultsOverlay';
import { CasterEndOverlay } from '@/components/overlay/caster/CasterEndOverlay';
import { CasterMvpOverlay } from '@/components/overlay/caster/CasterMvpOverlay';
import { CasterScrimOverlay } from '@/components/overlay/caster/CasterScrimOverlay';
import { CasterWebcamOverlay } from '@/components/overlay/caster/CasterWebcamOverlay';
import { CasterBracketOverlay } from '@/components/overlay/caster/CasterBracketOverlay';
import { CasterPlayerOverlay } from '@/components/overlay/caster/CasterPlayerOverlay';
import { CasterLeaderboardOverlay } from '@/components/overlay/caster/CasterLeaderboardOverlay';
import { CasterStandingsOverlay } from '@/components/overlay/caster/CasterStandingsOverlay';
import { CasterCameraOverlay } from '@/components/overlay/caster/CasterCameraOverlay';

/** Filet de sécurité si le socket Realtime lâche en cours de show. */
const POLL_MS = 15_000;

function isSceneType(key: string): boolean {
  return (CASTER_SCENE_TYPES as readonly string[]).includes(key);
}

/**
 * Dispatch type de scène → composant overlay. Un type inconnu (ligne future
 * en base : bracket, player…) rend null = page vide transparente.
 */
function SceneOverlay({ scene }: { scene: CasterScene }) {
  switch (scene.type) {
    case 'match':
      return <CasterMatchOverlay data={normalizeMatchData(scene.data)} />;
    case 'starting':
      return <CasterStartingOverlay data={scene.data} />;
    case 'pause':
      return <CasterPauseOverlay data={scene.data} />;
    case 'results':
      return <CasterResultsOverlay data={scene.data} />;
    case 'end':
      return <CasterEndOverlay data={scene.data} />;
    case 'mvp':
      return <CasterMvpOverlay data={scene.data} />;
    case 'scrim':
      return <CasterScrimOverlay data={scene.data} />;
    case 'webcam':
      return <CasterWebcamOverlay data={scene.data} />;
    case 'bracket':
      return <CasterBracketOverlay data={scene.data} />;
    case 'player':
      return <CasterPlayerOverlay data={scene.data} />;
    case 'leaderboard':
      return <CasterLeaderboardOverlay data={scene.data} />;
    case 'standings':
      return <CasterStandingsOverlay data={scene.data} />;
    // `camera` = captation d'un opérateur DISTANT par un lien (WEB-ONLY). Ne
    // pas confondre avec `webcam`, caméra LOCALE de la machine OBS.
    case 'camera':
      return <CasterCameraOverlay data={scene.data} />;
    default:
      return null;
  }
}

function CasterOverlayPage() {
  const router = useRouter();
  const raw = router.query.sceneKey;
  const sceneKey = typeof raw === 'string' ? raw : '';

  const [scene, setScene] = useState<CasterScene | null>(null);
  // Flash-guard : tant que le premier fetch n'a pas répondu, on ne rend RIEN.
  const [loaded, setLoaded] = useState(false);

  const fetchScene = useCallback(async () => {
    if (!sceneKey) return;
    if (!isValidUUID(sceneKey) && !isSceneType(sceneKey)) {
      // Clé invalide : page vide transparente, inutile d'interroger la base.
      setLoaded(true);
      return;
    }
    try {
      const base = supabaseClient.from('caster_scenes').select('*');
      const query = isValidUUID(sceneKey)
        ? base.eq('id', sceneKey).limit(1)
        : base
            .eq('type', sceneKey)
            .order('sort_order', { ascending: true })
            .limit(1);
      const { data, error } = await query;
      // Erreur transitoire : on garde le dernier état rendu (jamais de trou
      // noir à l'antenne), le prochain poll retentera.
      if (!error) setScene((data?.[0] as CasterScene | undefined) ?? null);
    } catch {
      /* réseau : silencieux, le poll suivant réessaie */
    } finally {
      setLoaded(true);
    }
  }, [sceneKey]);

  // Premier chargement + polling (re-résout aussi la scène par type si la
  // première au sort_order change, et rattrape un DELETE non filtré).
  useEffect(() => {
    if (!sceneKey) return undefined;
    void fetchScene();
    const timer = setInterval(() => void fetchScene(), POLL_MS);
    return () => clearInterval(timer);
  }, [sceneKey, fetchScene]);

  // Realtime sur la ligne résolue : UPDATE ⇒ payload.new = ligne complète,
  // appliquée directement (pas de refetch). DELETE ⇒ on efface (si le filtre
  // le laisse passer ; sinon le poll s'en charge).
  const sceneId = scene?.id ?? null;
  const onChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'UPDATE') {
        const next = payload.new as unknown as CasterScene;
        if (next && next.id) setScene(next);
      } else if (payload.eventType === 'DELETE') {
        setScene(null);
      }
    },
    []
  );
  useRealtimeChannel({
    enabled: !!sceneId,
    channel: `caster-overlay-${sceneId ?? 'none'}`,
    table: 'caster_scenes',
    filter: sceneId ? `id=eq.${sceneId}` : undefined,
    onChange,
  });

  // Thème actif (couleurs + polices) — suivi en Realtime comme la scène : un
  // changement d'habillage se voit à l'antenne sans recharger la source OBS.
  const { theme, loaded: themeLoaded } = useCasterTheme({
    channel: 'caster-overlay-theme',
  });

  return (
    <>
      <Head>
        <title>Overlay caster</title>
        <meta name="robots" content="noindex" />
      </Head>
      {/* Fond transparent pour que OBS composite l'overlay sur la vidéo —
          même technique que /overlay/[runId]. */}
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>
      {/* Thème actif appliqué en variables CSS sur un wrapper : les custom
          properties étant héritées, elles atteignent la racine de l'overlay et
          gagnent sur ses défauts (déclarés en règle de classe). Les tokens
          dérivés (--panel, --glow, --muted-2…) sont des color-mix de ces
          variables : ils suivent sans rien de plus.
          `themeLoaded` fait partie du flash-guard — rendre avant l'aurait
          affiché une fraction de seconde aux couleurs par défaut. */}
      {loaded && themeLoaded && scene ? (
        <div style={themeCssVars(theme) as React.CSSProperties}>
          <SceneOverlay scene={scene} />
        </div>
      ) : null}
    </>
  );
}

export default CasterOverlayPage;
