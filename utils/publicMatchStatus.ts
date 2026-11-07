// utils/publicMatchStatus.ts — libellé et puce du statut sur la fiche
// publique d'un match (pages/match/[id].tsx). Sortis de la page pour être
// testés : sans les cas `walkover` / `disputed` / `postponed`, la valeur brute
// s'affichait, en anglais, sur un site francophone.

import type { MatchStatus } from '@/types/admin';
import type nsMatchDetail from '@/lib/i18n/locales/fr/matchDetail';

type MatchDict = typeof nsMatchDetail.fr;

export function getMatchStatusLabel(status: MatchStatus, t: MatchDict): string {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    case 'walkover':
      return t.statusWalkover;
    case 'disputed':
      return t.statusDisputed;
    case 'postponed':
      return t.statusPostponed;
    default:
      return status;
  }
}

/**
 * Filtre « Terminés » des listes publiques : un forfait a un vainqueur
 * désigné, il n'a pas à disparaître du filtre.
 */
const FINISHED_FILTER: ReadonlySet<string> = new Set([
  'finished',
  'completed',
  'walkover',
]);

export function isFinishedForFilter(status: string): boolean {
  return FINISHED_FILTER.has(status);
}

export function getMatchStatusChipClass(status: MatchStatus): string {
  switch (status) {
    case 'pending':
      return 'px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60';
    case 'ongoing':
      return 'px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60';
    case 'finished':
    case 'walkover':
      return 'px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60';
    case 'disputed':
    case 'postponed':
      return 'px-1.5 py-[2px] rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/60';
    case 'cancelled':
      return 'px-1.5 py-[2px] rounded-full bg-red-500/20 text-red-200 border border-red-500/60';
    default:
      return 'px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30';
  }
}
