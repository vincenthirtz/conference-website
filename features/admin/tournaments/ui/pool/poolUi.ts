// features/admin/tournaments/ui/pool/poolUi.ts — styles et bornes partagés par
// l'écran de répartition (pages/admin/tournament/[id]/pool.tsx) et ses blocs.

/** Bloc logé dans une carte (une équipe, un formulaire). */
export const poolInner =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]';
export const poolInput =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-1.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
export const poolLinkBtn =
  'text-xs text-[var(--t3,#a39ba6)] underline-offset-2 hover:text-[var(--t1,#f4edf7)] hover:underline disabled:opacity-50';
export const poolLabel = 'text-xs text-[var(--t3,#a39ba6)]';

/** Bornes de la base (tournament_pool_entries, teams). */
export const poolNameOk = (s: string) =>
  s.trim().length >= 2 && s.trim().length <= 40;
export const poolTagOk = (s: string) =>
  s.trim().length >= 3 && s.trim().length <= 40;
export const poolTeamNameOk = (s: string) =>
  s.trim().length >= 2 && s.trim().length <= 60;
