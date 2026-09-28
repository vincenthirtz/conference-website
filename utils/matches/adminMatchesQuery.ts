// utils/matches/adminMatchesQuery.ts
//
// La requête de l'écran admin des matchs d'un tournoi
// (`pages/admin/tournament/[id]/matches.tsx` → `/api/admin/tournament/[id]/matches`).
//
// Sortie de l'écran, qui est gelé en taille (`adminFileSizeGuard`), et pure :
// testable sans monter la page.
//
// DEUX RÈGLES QUE L'ÉCRAN AVAIT PERDUES :
//   - TRI PAR HORAIRE. Sans `orderBy`, l'API trie par date de CRÉATION
//     décroissante : la liste mélangeait les jours.
//   - LE CALENDRIER CHARGE TOUT. Paginé comme la liste (25), il ne dessinait
//     que la page courante — 5 matchs sur 30 manquaient sur un tournoi réel.
//     512 est le plafond de l'API (`maxLimit`).

import { dayRangeToIsoBounds } from './adminMatchesTz';

/** Plafond de l'API : la vue calendrier charge tout le tournoi d'un coup. */
export const CALENDAR_LIMIT = 512;

export type AdminMatchesQueryInput = {
  view: 'list' | 'calendar';
  limit: number;
  offset: number;
  stageId?: string;
  status?: string;
  roundNumber?: string;
  result?: string;
  /** Jours AAAA-MM-JJ, bornes incluses, dans le fuseau du tournoi. */
  dateFrom?: string;
  dateTo?: string;
  timezone: string;
  search?: string;
};

export function buildAdminMatchesQuery(input: AdminMatchesQueryInput): string {
  const calendar = input.view === 'calendar';
  const params = new URLSearchParams({
    orderBy: 'scheduled_at',
    orderDir: 'asc',
    limit: String(calendar ? CALENDAR_LIMIT : input.limit),
    offset: String(calendar ? 0 : input.offset),
    includeStages: '1',
    includeTotal: '1',
    includeTeams: '1',
  });
  if (input.stageId) params.set('stageId', input.stageId);
  if (input.status) params.set('status', input.status);
  if (input.roundNumber) params.set('roundNumber', input.roundNumber);
  if (input.result) params.set('result', input.result);
  const bounds = dayRangeToIsoBounds(
    input.dateFrom ?? '',
    input.dateTo ?? '',
    input.timezone
  );
  if (bounds.dateFrom) params.set('dateFrom', bounds.dateFrom);
  if (bounds.dateTo) params.set('dateTo', bounds.dateTo);
  const search = input.search?.trim();
  if (search) params.set('search', search);
  return params.toString();
}
