// features/player/matches/hooks/usePlayerMatchThread.ts — l'état vivant du
// « fil du match » (lot P12). Extrait TEL QUEL de PlayerMatchScreen : même
// chargement, même cadence de rafraîchissement, même check-in.
//
// Pourquoi pas TanStack Query ici : la cadence réseau dépend de l'horloge
// locale et de la fenêtre de check-in (matchThreadRefreshMs), un échec en
// arrière-plan GARDE l'écran, et un rafraîchissement ne chevauche jamais
// l'autre. C'est la mécanique d'un soir de match, éprouvée : on la déplace,
// on ne la réécrit pas.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useToast } from '@/components/Toast';
import { logger } from '@/utils/logger';
import { matchThreadRefreshMs } from '@/utils/matches/playerMatchLive';
import type { PlayerScope } from '@/utils/player/playerHttp';
import { isSessionExpiredError } from '@/utils/player/sessionExpiry';
import { postCheckin } from '../../checkin/client';
import { matchesClient } from '../client';
import type { PlayerMatchDetail } from '../schemas';

type Messages = {
  loadError: string;
  checkinFailed: string;
  checkinAlready: string;
  checkinSuccess: string;
};

export function usePlayerMatchThread(
  matchId: string,
  ready: boolean,
  t: Messages
) {
  const { subjectId, isActingAs } = usePlayerArea();
  const { addToast } = useToast();
  const scope = useMemo<PlayerScope>(
    () => ({ subjectId, actAs: isActingAs, teamId: null }),
    [subjectId, isActingAs]
  );

  const [data, setData] = useState<PlayerMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  // Horloge LOCALE : fait basculer les états qui dépendent de l'heure (fin de
  // la fenêtre de check-in, bouton de report au coup d'envoi) et décide de la
  // cadence réseau. Aucun appel réseau à chaque tick.
  const [now, setNow] = useState<number>(() => Date.now());
  // Un rafraîchissement en arrière-plan ne chevauche jamais un autre.
  const inFlight = useRef(false);

  /**
   * `background` : rafraîchissement silencieux. Un échec y GARDE l'écran tel
   * quel — remplacer le fil par « erreur de chargement » parce qu'une requête
   * a échoué en 4G, c'est perdre le bouton de check-in au pire moment.
   */
  const load = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (background && inFlight.current) return;
      inFlight.current = true;
      if (!background) setError(null);
      try {
        setData(await matchesClient.detail(scope, matchId));
        setSessionExpired(false);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          // Pas de redirection sèche : l'écran dit ce qui se passe et donne
          // le lien qui ramène ICI.
          setSessionExpired(true);
        } else if (!background) {
          logger.error('[player/match] load error:', err);
          setData(null);
          setError(t.loadError);
        } else {
          logger.warn('[player/match] background refresh failed:', err);
        }
      } finally {
        inFlight.current = false;
        setNow(Date.now());
        setLoading(false);
      }
    },
    [scope, matchId, t]
  );

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  // Tick local (30 s, onglet visible seulement) + rattrapage au retour sur
  // l'onglet. Le téléphone verrouillé entre deux matchs est LE cas nominal.
  useEffect(() => {
    if (!ready) return;
    const clockId = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      void load({ background: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(clockId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, load]);

  // Cadence réseau : rapprochée seulement quand quelque chose PEUT bouger
  // (fenêtre de check-in, match en cours) ; rien sur un match lointain.
  const refreshMs = data
    ? matchThreadRefreshMs(
        {
          status: data.match.status,
          checkinOpensAt: data.checkin.opensAt,
          checkinClosesAt: data.checkin.closesAt,
        },
        now
      )
    : null;
  useEffect(() => {
    if (!ready || refreshMs === null || sessionExpired) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load({ background: true });
    }, refreshMs);
    return () => clearInterval(id);
  }, [ready, refreshMs, sessionExpired, load]);

  // Check-in par la route PUBLIQUE à jeton (idempotente) : un second envoi
  // répond `alreadyCheckedIn` sans double écriture — le retour le distingue.
  const checkIn = useCallback(async () => {
    const token = data?.checkin.token;
    if (!token || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const json = await postCheckin(token, t.checkinFailed);
      addToast(
        json.alreadyCheckedIn === true ? t.checkinAlready : t.checkinSuccess,
        json.alreadyCheckedIn === true ? 'info' : 'success'
      );
      await load({ background: true });
    } catch (err) {
      addToast(err instanceof Error ? err.message : t.checkinFailed, 'error');
    } finally {
      setCheckinBusy(false);
    }
  }, [addToast, checkinBusy, data?.checkin.token, load, t]);

  /** « Réessayer » : repasse par le squelette, comme avant. */
  const retry = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  return {
    data,
    loading,
    error,
    sessionExpired,
    now,
    checkinBusy,
    load,
    retry,
    checkIn,
  };
}
