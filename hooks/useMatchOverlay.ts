// hooks/useMatchOverlay.ts
//
// Alimente les sources de stream par match (`/overlay/match/*`) depuis
// `GET /api/overlay/match/[matchId]`.
//
// POURQUOI DU POLLING, ET PAS DU REALTIME. L'overlay de conducteur
// (`useOverlayState`) s'abonne à `event_runs` parce que la régie écrit sur
// cette ligne et que la scène doit basculer à la seconde. Ici, la donnée suit
// une feuille de match : un score saisi par le staff, une manche close. Quatre
// secondes de retard sur un tableau de score ne se voient pas — la voix du
// caster arrive toujours avant l'écran — alors qu'un abonnement Realtime sur
// `matches` dépendrait des politiques RLS anonymes, qui peuvent changer sans
// que personne ne pense à l'overlay. Une boucle de fetch, elle, ne peut pas
// tomber en silence.
//
// Le hook est conçu pour tourner SIX HEURES dans un OBS laissé ouvert :
//   - l'intervalle se met en veille quand l'onglet est caché (OBS le fait pour
//     une source invisible), et rattrape au retour ;
//   - une erreur réseau ne vide jamais l'écran : on garde la dernière donnée
//     connue et on retente. Un bandeau de score qui disparaît sur un hoquet de
//     wifi est pire qu'un bandeau figé pendant dix secondes.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayMatchView } from '@/utils/overlay/matchOverlay';

export type MatchOverlayPayload = {
  match: OverlayMatchView | null;
  tournament: {
    id: string;
    slug: string | null;
    name: string | null;
    shortName: string | null;
    game: string | null;
  } | null;
  branding: {
    name: string | null;
    logoUrl: string | null;
    accent: string | null;
  } | null;
  serverTime: string;
};

type Options = {
  /** UUID d'un match, ou `next` pour « le match du moment ». */
  matchId: string | null;
  /** Requis quand `matchId === 'next'` : identifiant ou slug du tournoi. */
  tournament?: string | null;
  /** Slug d'espace, pour les sources d'un autre tenant. */
  tenant?: string | null;
  enabled?: boolean;
  intervalMs?: number;
};

type Return = {
  data: MatchOverlayPayload | null;
  loading: boolean;
  /** Erreur de CONFIGURATION (400/402/404), affichée à l'écran. */
  fatal: string | null;
  /**
   * Décalage entre l'horloge du poste et celle du serveur, en ms.
   *
   * Le compte à rebours s'en sert pour ne pas dépendre de l'heure locale : un
   * PC de régie mal réglé afficherait un décompte faux, et c'est le genre de
   * détail que personne ne vérifie avant de lancer le direct.
   */
  clockSkewMs: number;
};

export function useMatchOverlay({
  matchId,
  tournament,
  tenant,
  enabled = true,
  intervalMs = 4000,
}: Options): Return {
  const [data, setData] = useState<MatchOverlayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [clockSkewMs, setClockSkew] = useState(0);
  const inFlight = useRef(false);

  const url = buildUrl(matchId, tournament, tenant);

  const fetchOnce = useCallback(async () => {
    if (!url || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        // 400/402/404 = l'URL collée dans OBS est mauvaise ou le palier ne
        // l'ouvre pas : ça ne se corrigera pas tout seul, on le DIT à l'écran.
        // Tout le reste (500, coupure) est transitoire : on garde l'affichage.
        if (res.status === 400 || res.status === 402 || res.status === 404) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setFatal(body?.error ?? 'Source indisponible.');
        }
        return;
      }
      const json = (await res.json()) as MatchOverlayPayload;
      setFatal(null);
      setData(json);
      const serverMs = Date.parse(json.serverTime);
      if (Number.isFinite(serverMs)) setClockSkew(serverMs - Date.now());
    } catch {
      // Réseau : on ne touche à rien, la boucle repassera.
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return undefined;
    }
    void fetchOnce();
    const timer = setInterval(
      () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        void fetchOnce();
      },
      Math.max(1000, intervalMs)
    );

    // Une source masquée puis réaffichée dans OBS doit être à jour tout de
    // suite, sans attendre le prochain tour de boucle.
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) void fetchOnce();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [enabled, url, intervalMs, fetchOnce]);

  return { data, loading, fatal, clockSkewMs };
}

function buildUrl(
  matchId: string | null,
  tournament?: string | null,
  tenant?: string | null
): string | null {
  if (!matchId) return null;
  const params = new URLSearchParams();
  if (tournament) params.set('tournament', tournament);
  if (tenant) params.set('tenant', tenant);
  const qs = params.toString();
  return `/api/overlay/match/${encodeURIComponent(matchId)}${qs ? `?${qs}` : ''}`;
}
