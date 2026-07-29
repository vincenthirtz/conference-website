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
// - Scène introuvable ou type non porté (types futurs : bracket / player /
//   leaderboard / standings n'existent pas encore en base) : page vide
//   transparente — jamais de 404 ni de texte, ça partirait à l'antenne.
//
// Lot 2 : les 8 types de scènes sont portés (match + starting / pause /
// results / end / mvp / scrim / webcam) — un composant par type sous
// components/overlay/caster/.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseClient } from '@/utils/supabase';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { isValidUUID } from '@/utils/apiHelpers';
import { CASTER_SCENE_TYPES, type CasterScene } from '@/types/caster';
import { normalizeMatchData } from '@/utils/caster/matchScene';
import { CasterMatchOverlay } from '@/components/overlay/caster/CasterMatchOverlay';
import { CasterStartingOverlay } from '@/components/overlay/caster/CasterStartingOverlay';
import { CasterPauseOverlay } from '@/components/overlay/caster/CasterPauseOverlay';
import { CasterResultsOverlay } from '@/components/overlay/caster/CasterResultsOverlay';
import { CasterEndOverlay } from '@/components/overlay/caster/CasterEndOverlay';
import { CasterMvpOverlay } from '@/components/overlay/caster/CasterMvpOverlay';
import { CasterScrimOverlay } from '@/components/overlay/caster/CasterScrimOverlay';
import { CasterWebcamOverlay } from '@/components/overlay/caster/CasterWebcamOverlay';

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
      {loaded && scene ? <SceneOverlay scene={scene} /> : null}
    </>
  );
}

export default CasterOverlayPage;
