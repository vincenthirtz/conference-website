// features/admin/stages/ui/GroupsBoard.tsx — briques présentationnelles de
// l'écran des poules (pages/admin/stages/[stageId]/groups.tsx) : puce de
// poule, ligne d'équipe glissable, classement d'une poule. Aucune donnée
// chargée ici : l'état du glisser-déposer reste dans la page.

import Image from 'next/image';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStageGroups from '@/lib/i18n/locales/admin-fr/adminStageGroups';
import Chip from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminStageGroups.fr;

export type GroupTeam = {
  teamId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  seed: number | null;
};

export type GroupStandingRow = {
  teamId: string;
  teamName: string | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
};

export function GroupLabel({ groupKey }: { groupKey: string }) {
  const t = useAdminT(nsAdminStageGroups);
  return <Chip tone="brand">{format(t.groupLabel, { key: groupKey })}</Chip>;
}

/** Une équipe glissable d'une poule vers une autre. */
export function DraggableTeamRow({
  team,
  onDragStart,
  onDragEnd,
}: {
  team: GroupTeam;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="flex cursor-grab items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-3 py-2 transition-colors hover:border-[var(--or,#b467d1)] active:cursor-grabbing"
    >
      {team.logoUrl ? (
        <Image
          src={team.logoUrl}
          alt=""
          width={24}
          height={24}
          className="rounded-[3px] object-cover"
        />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-[var(--s3,#2f2732)] text-xs font-bold text-[var(--t3,#a39ba6)]">
          {(team.shortName || team.name || '?')[0].toUpperCase()}
        </div>
      )}
      <span className="flex-1 truncate text-sm font-medium text-[var(--t1,#f4edf7)]">
        {team.name || team.teamId.slice(0, 8)}
      </span>
      {team.seed !== null && (
        <span className="font-mono text-xs text-[var(--t4,#807984)]">
          #{team.seed}
        </span>
      )}
    </div>
  );
}

/** Classement (lecture seule) d'une poule. */
export function GroupStandingsTable({
  groupKey,
  rows,
  t,
}: {
  groupKey: string;
  rows: GroupStandingRow[];
  t: Dict;
}) {
  return (
    <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
      <div className="mb-2">
        <GroupLabel groupKey={groupKey} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left">
              <th scope="col" className="pb-1">
                #
              </th>
              <th scope="col" className="pb-1">
                {t.thTeam}
              </th>
              <th scope="col" className="pb-1 text-center">
                {t.thWins}
              </th>
              <th scope="col" className="pb-1 text-center">
                {t.thLosses}
              </th>
              <th scope="col" className="pb-1 text-center">
                {t.thDraws}
              </th>
              <th scope="col" className="pb-1 text-right">
                {t.thPoints}
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-[var(--t2,#c7bfca)]">
            {rows.map((s) => (
              <tr
                key={s.teamId}
                className="border-t border-[var(--line,rgba(194,196,201,.12))]"
              >
                <td className="py-1 text-[var(--t4,#807984)]">{s.rank}</td>
                <td className="max-w-[140px] truncate py-1 font-sans text-[var(--t1,#f4edf7)]">
                  {s.teamName || s.teamId.slice(0, 6)}
                </td>
                <td className="py-1 text-center text-[var(--lf,#7fca65)]">
                  {s.wins}
                </td>
                <td className="py-1 text-center text-[var(--err,#ff6b6b)]">
                  {s.losses}
                </td>
                <td className="py-1 text-center text-[var(--t3,#a39ba6)]">
                  {s.draws}
                </td>
                <td className="py-1 text-right font-semibold text-[var(--t1,#f4edf7)]">
                  {s.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
