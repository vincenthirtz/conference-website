// hooks/useMvpPublicRelay.ts
//
// LE PONT ENTRE LE CHAT TWITCH ET LA BASE.
//
// Le cockpit régie lit le chat Twitch depuis le navigateur (IRC anonyme) et
// compte les `!mvp N` en mémoire. Jusqu'ici ce décompte ne servait qu'à
// l'overlay : il s'évaporait avec la scène, et aucune voix du public n'a
// jamais été persistée. Ce hook relaie ces voix vers
// `POST /api/admin/matches/:id/mvp-public`.
//
// POURQUOI UNE FILE ET PAS UN APPEL PAR VOIX. Sur un pic, `!mvp N` arrive par
// dizaines par seconde. Un appel par message mettrait l'API à genoux, ferait
// exploser le quota de fonctions, et la latence réseau finirait par perdre des
// voix. On accumule, et on envoie par lots.
//
// LA DERNIÈRE VOIX D'UNE PERSONNE ÉCRASE LES PRÉCÉDENTES, DANS LA FILE AUSSI.
// Quelqu'un qui change trois fois d'avis en dix secondes ne doit produire
// qu'une seule ligne dans le lot — sinon l'UPSERT se bat contre lui-même dans
// la même requête. La file est donc une Map, pas un tableau.
//
// UN ÉCHEC D'ENVOI NE DOIT PAS PERDRE LES VOIX. En cas d'erreur, le lot est
// REMIS dans la file (sans écraser une voix plus récente arrivée entre-temps)
// et repartira au prochain battement. Une soirée de direct traverse forcément
// une coupure réseau ; elle ne doit pas coûter le scrutin.
//
// CE HOOK NE COMPTE RIEN. Le décompte affiché reste celui du cockpit, en
// mémoire, qui pilote l'overlay sans attendre le réseau. Ici on ne fait que
// persister — les deux chemins sont volontairement indépendants, pour qu'une
// API lente ne fige jamais l'affichage à l'antenne.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { logger } from '@/utils/logger';

/** Battement d'envoi. Aligné sur la publication de l'overlay (1,5 s). */
export const RELAY_FLUSH_MS = 1500;

/** Plafond de l'API : au-delà, on découpe. */
const MAX_BATCH = 200;

export type MvpPublicRelay = {
  /** Met une voix en file. Sans effet si aucun match n'est rattaché. */
  relayVote: (voterKey: string, memberId: string) => void;
  /** Ouvre le scrutin côté base. Rend `true` si c'est passé. */
  openVote: (windowMinutes?: number) => Promise<boolean>;
  /** Dépouille et ferme. Rend le résultat, ou `null` en cas d'échec. */
  closeVote: () => Promise<{
    winnerLabel: string | null;
    reason: string | null;
  } | null>;
  /** Voix en attente d'envoi — pour afficher un état en régie. */
  pending: number;
  /** Dernière erreur d'envoi, pour que la régie sache que ça ne passe pas. */
  lastError: string | null;
};

/**
 * @param matchId  Le match auquel le scrutin est rattaché, ou `null` pour un
 *                 poll libre (candidates saisies à la main) : le relais est
 *                 alors inerte, le cockpit compte sans persister.
 */
export function useMvpPublicRelay(matchId: string | null): MvpPublicRelay {
  const { adminFetch } = useAdminFetch();

  // voterKey (minuscule) -> memberId. Une entrée par personne.
  const queue = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const matchRef = useRef(matchId);
  matchRef.current = matchId;
  const fetchRef = useRef(adminFetch);
  fetchRef.current = adminFetch;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Envoie ce qui est en file. Sans effet si vide, ou si un envoi est en vol. */
  const flush = useCallback(async () => {
    const id = matchRef.current;
    if (!id || inFlight.current || queue.current.size === 0) return;

    const batch = Array.from(queue.current.entries())
      .slice(0, MAX_BATCH)
      .map(([voterKey, memberId]) => ({ voterKey, memberId }));
    for (const v of batch) queue.current.delete(v.voterKey);
    if (alive.current) setPending(queue.current.size);

    inFlight.current = true;
    try {
      const res = await fetchRef.current(
        `/api/admin/matches/${id}/mvp-public`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'vote',
            source: 'twitch',
            votes: batch,
          }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (alive.current) setLastError(null);
    } catch (err) {
      // On REMET les voix en file, sans écraser une voix plus récente arrivée
      // pendant l'envoi : celle-là est la bonne.
      for (const v of batch) {
        if (!queue.current.has(v.voterKey)) {
          queue.current.set(v.voterKey, v.memberId);
        }
      }
      logger.error('[mvp-public-relay] envoi échoué:', err);
      if (alive.current) {
        setPending(queue.current.size);
        setLastError((err as Error)?.message || 'envoi impossible');
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Battement régulier. Il tourne même à vide : c'est ce qui fait repartir un
  // lot remis en file après un échec, sans logique de réessai à part.
  useEffect(() => {
    if (!matchId) return undefined;
    const timer = setInterval(() => void flush(), RELAY_FLUSH_MS);
    return () => {
      clearInterval(timer);
      // Dernier envoi au démontage : fermer l'onglet ne doit pas jeter les
      // voix des deux dernières secondes.
      void flush();
    };
  }, [matchId, flush]);

  const relayVote = useCallback((voterKey: string, memberId: string) => {
    if (!matchRef.current) return;
    const key = String(voterKey || '')
      .trim()
      .toLowerCase();
    if (!key || !memberId) return;
    queue.current.set(key, memberId);
    if (alive.current) setPending(queue.current.size);
  }, []);

  const openVote = useCallback(async (windowMinutes?: number) => {
    const id = matchRef.current;
    if (!id) return false;
    try {
      const res = await fetchRef.current(
        `/api/admin/matches/${id}/mvp-public`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'open',
            ...(windowMinutes ? { windowMinutes } : {}),
          }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (alive.current) setLastError(null);
      return true;
    } catch (err) {
      logger.error('[mvp-public-relay] ouverture échouée:', err);
      if (alive.current) {
        setLastError((err as Error)?.message || 'ouverture impossible');
      }
      return false;
    }
  }, []);

  const closeVote = useCallback(async () => {
    const id = matchRef.current;
    if (!id) return null;
    // Les voix en attente partent AVANT le dépouillement, sinon les dernières
    // secondes du scrutin — souvent les plus nourries — ne compteraient pas.
    await flush();
    try {
      const res = await fetchRef.current(
        `/api/admin/matches/${id}/mvp-public`,
        { method: 'POST', body: JSON.stringify({ action: 'close' }) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (alive.current) setLastError(null);
      return {
        winnerLabel: json?.winnerLabel ?? null,
        reason: json?.reason ?? null,
      };
    } catch (err) {
      logger.error('[mvp-public-relay] clôture échouée:', err);
      if (alive.current) {
        setLastError((err as Error)?.message || 'clôture impossible');
      }
      return null;
    }
  }, [flush]);

  return { relayVote, openVote, closeVote, pending, lastError };
}
