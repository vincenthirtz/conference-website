// features/player/dashboard/eventSignupDraft.ts — CE QUE L'INSCRIPTION EN UN
// CLIC ENVERRAIT à un événement regroupé (`pooledTeams`), à partir de ce
// qu'on sait déjà de la joueuse. Sorti de l'encart de l'espace joueuse
// (`components/player/EventSignupCard.tsx`) pour être partagé avec la
// citrouille et le fantôme du hall de la Library (lot 16 de
// docs/PLAN-womens-library.md) : les deux montrent la même chose avant le
// clic et envoient la même chose.
//
// Les sources sont celles du formulaire de la page d'inscription :
//   - le pseudo et le BattleTag du profil (`user_metadata.display_name`,
//     `battle_tag`), le BattleTag seulement s'il est valide ;
//   - l'équipe : l'équipe active de l'espace si elle est parmi les équipes
//     proposées, sinon la seule équipe proposée. Plusieurs équipes et aucune
//     active : c'est à elle de choisir, sur la page.
// Le clic seul ne suffit que si le pseudo (2 caractères au moins) et le
// BattleTag sont là, et que l'équipe n'est pas à choisir.
//
// Module PUR (aucun hook, aucun réseau).

import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import type { PoolTeamRef } from '@/utils/tournaments/pool';
import type { EventPoolRegisterBody } from './client';

export type EventSignupDraft = {
  pseudo: string;
  /** BattleTag valide, sinon ''. */
  tag: string;
  /** L'équipe d'origine envoyée, ou null (sans équipe, ou à choisir). */
  team: PoolTeamRef | null;
  /** Plusieurs équipes, aucune active : le choix revient à la page. */
  teamAmbiguous: boolean;
  /** Tout est là : un clic suffit. */
  oneClick: boolean;
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Ce que le clic enverrait, d'après le profil, les équipes et l'équipe active. */
export function eventSignupDraft(
  userMetadata: unknown,
  teams: readonly PoolTeamRef[],
  activeTeamId: string | null | undefined
): EventSignupDraft {
  const meta =
    typeof userMetadata === 'object' && userMetadata !== null
      ? (userMetadata as Record<string, unknown>)
      : {};
  const pseudo = text(meta.display_name);
  const rawTag = text(meta.battle_tag);
  const tag = BATTLE_TAG_REGEX.test(rawTag) ? rawTag : '';
  const team =
    teams.find((x) => x.id === activeTeamId) ??
    (teams.length === 1 ? teams[0] : null);
  const teamAmbiguous = !team && teams.length > 1;
  const oneClick = pseudo.length >= 2 && !!tag && !teamAmbiguous;
  return { pseudo, tag, team, teamAmbiguous, oneClick };
}

/** Le corps de `POST /api/tournament/{id}/pool`, ou null si un clic ne suffit pas. */
export function eventSignupBody(
  draft: EventSignupDraft
): EventPoolRegisterBody | null {
  if (!draft.oneClick) return null;
  return {
    displayName: draft.pseudo,
    battleTag: draft.tag,
    originTeamId: draft.team?.id ?? null,
  };
}
