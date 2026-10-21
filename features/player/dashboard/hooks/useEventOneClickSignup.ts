// features/player/dashboard/hooks/useEventOneClickSignup.ts — l'inscription
// EN UN CLIC à un événement regroupé, partagée par l'encart de l'espace
// joueuse (`components/player/EventSignupCard.tsx`) et le hall de la Library
// (la citrouille et le fantôme d'Halloween, lot 16 de
// docs/PLAN-womens-library.md).
//
// Elle assemble la session (pseudo, BattleTag), l'équipe active de l'espace
// (`ActiveTeamProvider`, monté dans `_app`), la lecture et le geste de
// `useEventPoolSignup` (cache partagé : s'inscrire depuis le hall met aussi
// l'encart à jour), et ce que le clic enverrait (`eventSignupDraft`).
// Pas de lecture sans session ni hors affiche (`enabled`).

import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { eventSignupBody, eventSignupDraft } from '../eventSignupDraft';
import { useEventPoolSignup } from './useEventPoolSignup';

export function useEventOneClickSignup(tournamentId: string, enabled: boolean) {
  const { user, token, loading } = usePlayerSession({ redirect: false });
  const { activeTeamId } = useActiveTeam();
  const { view, reading, readFailed, register, busy, errorKind } =
    useEventPoolSignup(tournamentId, enabled && !!token);
  const draft =
    view && user
      ? eventSignupDraft(user.user_metadata, view.teams, activeTeamId)
      : null;

  function registerOneClick() {
    const body = draft ? eventSignupBody(draft) : null;
    if (body) register(body);
  }

  return {
    user,
    view,
    draft,
    /** La session ou l'inscription est encore en lecture. */
    reading: enabled && (loading || reading),
    readFailed,
    registerOneClick,
    busy,
    errorKind,
  };
}
