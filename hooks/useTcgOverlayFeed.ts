// hooks/useTcgOverlayFeed.ts
//
// Alimente la source navigateur OBS du TCG (`/overlay/tcg/<jeton>`).
//
// INTERROGATION SEULE, PAS DE REALTIME — et c'est une différence assumée avec
// `useOverlayState`. Celui-là s'abonne à UNE ligne (`event_runs`) que la RLS
// expose ; ici la donnée vit dans `tcg_wallet_entries`, table en service-role
// sans policy publique. Un abonnement Realtime depuis un navigateur anonyme n'y
// recevrait jamais rien : il donnerait l'illusion d'un canal temps réel qui
// n'existe pas. Mieux vaut une interrogation honnête toutes les 5 secondes.
//
// CONÇU POUR TOURNER DES HEURES. Une source OBS est ouverte avant le direct et
// refermée après. D'où :
//   * un intervalle stable, sans accélération après une erreur ;
//   * aucune accumulation en mémoire — la file d'annonces est bornée ;
//   * un nettoyage complet au démontage (minuteur ET requête en vol).
//
// LES ANNONCES NE SE REJOUENT PAS. Chaque écriture porte un identifiant ; on
// retient ceux déjà vus. Sans cela, un rechargement d'OBS en plein direct
// rejouerait d'un coup les quinze dernières minutes de gains à l'écran.
//
// LE PREMIER CHARGEMENT N'ANNONCE RIEN. Ce qui s'est passé avant l'ouverture de
// la source n'est pas un événement à célébrer : on amorce la mémoire en
// silence, puis on annonce ce qui arrive ENSUITE.

import { useCallback, useEffect, useRef, useState } from 'react';

export type TcgOverlayKind = 'twitch_drop' | 'match_win' | 'scrim_win';

export type TcgOverlayItem = {
  id: string;
  kind: TcgOverlayKind;
  twitchLogin: string | null;
  at: string;
};

/** Annonces visibles simultanément. Au-delà, la plus ancienne sort. */
const MAX_VISIBLE = 3;

/** Durée d'affichage d'une annonce. */
const VISIBLE_MS = 8000;

const POLL_MS = 5000;

type Options = {
  token: string | null;
  enabled?: boolean;
  pollMs?: number;
};

type State = {
  /** Les annonces à l'écran, la plus récente d'abord. */
  visible: TcgOverlayItem[];
  /** Vrai tant que la source n'a pas réussi sa première lecture. */
  connecting: boolean;
  /** Jeton refusé : la régie doit le savoir, l'overlay reste muet. */
  rejected: boolean;
};

export function useTcgOverlayFeed({
  token,
  enabled = true,
  pollMs = POLL_MS,
}: Options): State {
  const [visible, setVisible] = useState<TcgOverlayItem[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [rejected, setRejected] = useState(false);

  // Identifiants déjà annoncés. Une `ref` et non un état : la faire entrer dans
  // le rendu déclencherait un cycle à chaque interrogation.
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const alive = useRef(true);

  const tick = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/overlay/tcg/${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!alive.current) return;

      if (res.status === 404 || res.status === 400) {
        // Jeton inconnu, révoqué ou malformé : inutile de continuer à
        // interroger, et il faut que ça se voie à la configuration.
        setRejected(true);
        setConnecting(false);
        return;
      }
      if (!res.ok) {
        // Panne passagère : on garde l'écran tel quel et on réessaiera au
        // prochain tour. Un overlay ne clignote pas parce que le réseau tousse.
        setConnecting(false);
        return;
      }

      const json = (await res.json()) as { items?: TcgOverlayItem[] };
      if (!alive.current) return;
      const items = Array.isArray(json.items) ? json.items : [];

      setConnecting(false);

      if (!primed.current) {
        // Amorçage silencieux : cf. l'en-tête.
        for (const item of items) seen.current.add(item.id);
        primed.current = true;
        return;
      }

      const fresh = items.filter((item) => !seen.current.has(item.id));
      if (fresh.length === 0) return;
      for (const item of fresh) seen.current.add(item.id);

      // Les plus anciennes d'abord, pour que la file les fasse défiler dans
      // l'ordre où elles se sont produites.
      const ordered = [...fresh].reverse();
      setVisible((prev) => [...ordered, ...prev].slice(0, MAX_VISIBLE));

      for (const item of ordered) {
        window.setTimeout(() => {
          if (!alive.current) return;
          setVisible((prev) => prev.filter((x) => x.id !== item.id));
        }, VISIBLE_MS);
      }
    } catch {
      // Réseau coupé : on ne change rien à l'écran.
      if (alive.current) setConnecting(false);
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    if (!enabled || !token) return;

    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [enabled, token, pollMs, tick]);

  return { visible, connecting, rejected };
}
