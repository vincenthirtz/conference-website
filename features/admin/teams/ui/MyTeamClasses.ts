// features/admin/teams/ui/MyTeamClasses.ts — classes « Le Ruban » partagées
// par les blocs de l'espace « mon équipe » (pages/admin/teams/my.tsx) : champ,
// libellé, aide, carte. Mêmes valeurs que la fiche d'édition d'une équipe
// (TeamEditInfoForm), recopiées ici pour ne pas lier les deux écrans.

export const MY_TEAM_LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
export const MY_TEAM_HELP = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';
export const MY_TEAM_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
export const MY_TEAM_CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6';
export const MY_TEAM_SPINNER =
  'animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]';
