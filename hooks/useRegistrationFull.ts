// hooks/useRegistrationFull.ts
//
// « Les inscriptions sont-elles fermées faute de places ? »
//
// POURQUOI DÉDUIT, ET PAS UN DRAPEAU. C'est la règle déjà appliquée par la
// landing de tournoi et la section « prochain rendez-vous » :
//
//   « "Complet" se DÉDUIT des places. Le jour où une équipe se désiste, la
//     section réinvite d'elle-même. Un drapeau à lever à la main resterait
//     levé. »
//
// Le même raisonnement vaut pour la saison suivante : un bouton désactivé en
// dur resterait désactivé, et personne ne se souviendrait de le rouvrir.
//
// POURQUOI CÔTÉ CLIENT. Ces boutons vivent sur sept surfaces, dont deux pages
// sans aucun chargement de données (`/espace-capitaine`, `/jeux`) et trois en
// génération statique. Ajouter un `getStaticProps` à chacune pour un booléen —
// et les re-générer à chaque inscription — coûte plus cher qu'une requête
// unique vers une API publique qui expose déjà `max_teams` et `team_count`.
//
// L'état initial est `false` : tant qu'on ne SAIT pas, on n'affiche pas
// « Complet ». Un faux « complet » sur une page qui charge encore découragerait
// une inscription légitime ; l'inverse ne coûte qu'un aller-retour sur une page
// d'inscription qui le dira.

import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';

type PublicTournament = {
  status: string;
  max_teams: number | null;
  team_count?: number | null;
  start_date: string | null;
};

export type RegistrationFullState = {
  /** `true` seulement si un tournoi à venir a atteint sa capacité. */
  isFull: boolean;
  /** `false` une fois la réponse reçue (ou l'échec constaté). */
  loading: boolean;
};

export function useRegistrationFull(): RegistrationFullState {
  const [state, setState] = useState<RegistrationFullState>({
    isFull: false,
    loading: true,
  });

  useEffect(() => {
    let alive = true;

    fetch('/api/tournaments?limit=20')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { tournaments?: PublicTournament[]; items?: PublicTournament[] }) => {
        if (!alive) return;
        const list = json.tournaments ?? json.items ?? [];

        // On ne regarde que les tournois OUVERTS aux inscriptions : un tournoi
        // terminé est « complet » au sens littéral, mais son bouton n'a plus
        // lieu d'être de toute façon.
        const upcoming = list
          .filter((t) => t.status === 'published')
          .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));

        const next = upcoming[0];
        const isFull = Boolean(
          next &&
            next.max_teams != null &&
            (next.team_count ?? 0) >= next.max_teams
        );
        setState({ isFull, loading: false });
      })
      .catch((err) => {
        if (!alive) return;
        // Une API injoignable ne doit pas fermer les inscriptions.
        logger.error('[useRegistrationFull] lecture impossible', err);
        setState({ isFull: false, loading: false });
      });

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
