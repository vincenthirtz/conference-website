// features/admin/tournaments/ui/TournamentMatchesShared.tsx — vocabulaire
// commun aux blocs de l'écran « matchs du tournoi »
// (pages/admin/tournament/[id]/matches.tsx) : libellés de statut et de phase,
// ton de puce, classes « Le Ruban » des champs et des cartes.

import { format } from '@/lib/i18n/useAdminT';
import type { MatchStatus, StageSummary } from '@/types/admin';
import type nsAdminTournamentMatches from '@/lib/i18n/locales/admin-fr/adminTournamentMatches';
import type { ChipTone } from '@/features/admin/_shared/ui/Chip';

export type TournamentMatchesDict = typeof nsAdminTournamentMatches.fr;

export function statusLabel(t: TournamentMatchesDict, status: MatchStatus) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

/** Couleur de SIGNAL du statut : le match en cours est le seul « live ». */
export function statusTone(status: MatchStatus): ChipTone {
  switch (status) {
    case 'ongoing':
      return 'live';
    case 'finished':
      return 'ok';
    case 'cancelled':
      return 'err';
    default:
      return 'neutral';
  }
}

export function stageLabel(
  t: TournamentMatchesDict,
  stage: StageSummary | null | undefined
) {
  if (!stage) return '—';
  const base = stage.name;
  if (stage.stage_type === 'swiss') {
    return format(t.stageSwiss, { name: base });
  }
  if (stage.stage_type === 'bracket') {
    return format(t.stageBracket, { name: base });
  }
  if (stage.stage_type === 'group') {
    return format(t.stageGroup, { name: base });
  }
  return base;
}

export const TM_CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
export const TM_PANEL = `${TM_CARD} mb-6 p-5`;
export const TM_PANEL_TITLE =
  'mb-3 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--t2,#c7bfca)] [font-stretch:75%]';
export const TM_LABEL = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';
export const TM_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
export const TM_CHECKBOX =
  'h-4 w-4 shrink-0 rounded-[3px] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] accent-[var(--or,#b467d1)]';
export const TM_HINT = 'mt-2 text-xs text-[var(--warn,#f5a524)]';

/** Triangle d'alerte des conflits horaires. */
export function ConflictIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Rond de chargement aux couleurs du thème. */
export function TournamentMatchesSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
    </div>
  );
}
