// features/admin/leagues/ui/LeagueParts.tsx — briques présentationnelles de
// la fiche d'une ligue (pages/admin/leagues/[id].tsx) : classes « Le Ruban »,
// puce de statut, liste des tournois liés, classement. Aucune donnée chargée
// ici : la page garde l'état et les appels réseau.

import type { ReactNode } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type nsAdminLeagueDetail from '@/lib/i18n/locales/admin-fr/adminLeagueDetail';
import type {
  LeagueStandingPublic,
  LeagueStatus,
  LeagueTournamentRef,
} from '@/types/leagues';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminLeagueDetail.fr;

export const LEAGUE_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
export const LEAGUE_LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
export const LEAGUE_CARD =
  'space-y-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6';
export const LEAGUE_CARD_TITLE = 'text-[19px] text-[var(--t1,#f4edf7)]';
export const LEAGUE_ERROR =
  'rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';

const TONE: Record<LeagueStatus, ChipTone> = {
  draft: 'neutral',
  active: 'ok',
  finished: 'brand',
  archived: 'neutral',
};

export function LeagueStatusChip({
  status,
  label,
}: {
  status: LeagueStatus;
  label: ReactNode;
}) {
  return <Chip tone={TONE[status] ?? 'neutral'}>{label}</Chip>;
}

/** Tournois rattachés à la ligue, chacun avec son poids et « Détacher ». */
export function LinkedTournamentsList({
  tournaments,
  onUnlink,
  t,
}: {
  tournaments: LeagueTournamentRef[];
  onUnlink: (tm: LeagueTournamentRef) => void;
  t: Dict;
}) {
  return (
    <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))] overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
      {tournaments.map((tm) => (
        <div
          key={tm.id}
          className="flex items-center gap-3 bg-[var(--s2,#1d1520)] p-3"
        >
          <div className="min-w-0 flex-1">
            <span className="truncate font-medium text-[var(--t1,#f4edf7)]">
              {tm.name ?? tm.id}
            </span>
            {tm.slug && (
              <span className="ml-2 rounded-[3px] bg-[var(--s3,#2f2732)] px-2 py-0.5 font-mono text-xs text-[var(--t2,#c7bfca)]">
                /{tm.slug}
              </span>
            )}
          </div>
          <span className="font-mono text-sm text-[var(--t3,#a39ba6)]">
            {format(t.weightPrefix, { weight: tm.weight })}
          </span>
          <AdminButton variant="danger" size="xs" onClick={() => onUnlink(tm)}>
            {t.unlink}
          </AdminButton>
        </div>
      ))}
    </div>
  );
}

/** Classement de la ligue (lecture seule). */
export function LeagueStandingsTable({
  standings,
  t,
}: {
  standings: LeagueStandingPublic[];
  t: Dict;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--s2,#1d1520)]">
          <tr>
            <th scope="col" className="w-16 px-4 py-2.5 text-left">
              {t.thRank}
            </th>
            <th scope="col" className="px-4 py-2.5 text-left">
              {t.thTeam}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              {t.thPoints}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              {t.thTournaments}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              {t.thBestRank}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))] text-[var(--t2,#c7bfca)]">
          {standings.map((s) => (
            <tr key={s.teamId} className="hover:bg-[var(--s2,#1d1520)]">
              <td className="px-4 py-2.5 font-mono font-semibold text-[var(--t1,#f4edf7)]">
                {s.rank}
              </td>
              <td className="px-4 py-2.5 text-[var(--t1,#f4edf7)]">
                {s.teamName ?? s.teamId}
              </td>
              <td className="px-4 py-2.5 text-right font-mono font-medium text-[var(--t1,#f4edf7)]">
                {s.points}
              </td>
              <td className="px-4 py-2.5 text-right font-mono">
                {s.tournamentsCounted}
              </td>
              <td className="px-4 py-2.5 text-right font-mono">
                {s.bestRank ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
