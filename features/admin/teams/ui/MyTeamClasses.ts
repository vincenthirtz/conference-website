// features/admin/teams/ui/MyTeamClasses.ts — classes « Le Ruban » partagées
// par les blocs de l'espace « mon équipe » (pages/admin/teams/my.tsx) : champ,
// libellé, aide, carte. Mêmes valeurs que la fiche d'édition d'une équipe
// (TeamEditInfoForm). Les classes communes viennent de
// features/admin/_shared/ui/ruban.ts.

import {
  rubanCardPadded,
  rubanFormLabel,
  rubanHelp,
  rubanSpinnerRing,
} from '../../_shared/ui/ruban';

export const MY_TEAM_LABEL = rubanFormLabel;
export const MY_TEAM_HELP = rubanHelp;
export const MY_TEAM_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
export const MY_TEAM_CARD = rubanCardPadded;
export const MY_TEAM_SPINNER = rubanSpinnerRing;
