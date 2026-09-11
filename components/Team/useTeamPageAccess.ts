// Droits du visiteur sur une fiche équipe publique (`/team/[slug]`), résolus
// côté client après hydratation — le rendu ISR ne sait rien de la session.
//
//  - `canEdit` : capitaine / manager de CETTE équipe → lien « Modifier ».
//  - `canProposeScrim` : gère une AUTRE équipe → proposition de scrim depuis
//    son espace, adversaire pré-sélectionné (R3), au lieu du formulaire public.
//
// L'appel à /api/admin/teams/my ne part QUE pour une session ouverte. Il
// partait pour tous les visiteurs, anonymes compris — l'immense majorité des
// vues — et coûtait à chaque affichage une fonction serverless qui répondait
// 401.
//
// La logique est dans deux fonctions pures (testées) : le harnais vitest n'a
// ni jsdom ni testing-library (politique zéro dépendance), le hook lui-même
// n'est donc pas rendu en test.

import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';

export type TeamPageAccess = {
  canEdit: boolean;
  canProposeScrim: boolean;
};

export const NO_TEAM_PAGE_ACCESS: TeamPageAccess = {
  canEdit: false,
  canProposeScrim: false,
};

/** L'appel n'a de sens que pour une session résolue ET ouverte. */
export function shouldCheckTeamPageAccess(session: {
  loading: boolean;
  userId: string | null;
}): boolean {
  return !session.loading && !!session.userId;
}

/** Réponse de GET /api/admin/teams/my → droits sur la fiche `teamId`. */
export function resolveTeamPageAccess(
  data: {
    team?: { id?: string } | null;
    isCaptain?: boolean;
    isManager?: boolean;
  } | null,
  teamId: string
): TeamPageAccess {
  const managedId = data?.team?.id;
  const managesATeam = !!(data?.isCaptain || data?.isManager) && !!managedId;
  const sameTeam = managedId === teamId;
  return {
    canEdit: managesATeam && sameTeam,
    canProposeScrim: managesATeam && !sameTeam,
  };
}

export function useTeamPageAccess(teamId: string): TeamPageAccess {
  const { user, token, loading } = useSession();
  const userId = user?.id ?? null;
  const signedIn = shouldCheckTeamPageAccess({ loading, userId });
  const [resolved, setResolved] =
    useState<TeamPageAccess>(NO_TEAM_PAGE_ACCESS);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/teams/my', {
          credentials: 'include',
          // Bearer : résolu par le cache jeton côté serveur, sans repasser
          // par la lecture des cookies Supabase.
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (cancelled) return;
        // Valeurs posées dans les deux sens : un changement de compte ne doit
        // pas laisser l'affordance du compte précédent.
        const next = res.ok
          ? resolveTeamPageAccess(await res.json(), teamId)
          : NO_TEAM_PAGE_ACCESS;
        if (!cancelled) setResolved(next);
      } catch {
        // Silencieux : un contrôle en échec masque simplement les CTA.
      }
    })();
    return () => {
      cancelled = true;
    };
    // `userId` : un changement de compte relance le contrôle.
  }, [teamId, signedIn, userId, token]);

  // Déconnexion : on masque sans attendre un nouvel appel.
  return signedIn ? resolved : NO_TEAM_PAGE_ACCESS;
}
