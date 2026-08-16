// components/admin/bracket/MatchListView.tsx
// List view for bracket-builder matches

import Image from 'next/image';
import { formatTime } from '@/utils/dateFormatters';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { parseNotes } from './types';
import type { ScheduleMatch, MatchDay } from './types';
import nsAdminBracketMatchListView from '@/lib/i18n/locales/admin-fr/adminBracketMatchListView';

type MatchListViewProps = {
  matches: ScheduleMatch[];
  matchDays: MatchDay[];
};

function teamDisplay(m: ScheduleMatch, slot: 1 | 2) {
  const team = slot === 1 ? m.team1 : m.team2;
  const teamId = slot === 1 ? m.team1_id : m.team2_id;
  const isWinner = !!m.winner_team_id && m.winner_team_id === teamId;
  const info = parseNotes(m.notes);
  const seed = slot === 1 ? info?.seed1 : info?.seed2;

  return (
    <div
      className={`flex items-center gap-2 ${isWinner ? 'text-emerald-300 font-semibold' : ''}`}
    >
      {team?.logo_url && (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={18}
          height={18}
          className="w-[18px] h-[18px] rounded object-cover"
        />
      )}
      <span>{team?.name ?? (seed ? `Seed ${seed}` : 'TBD')}</span>
      {isWinner && (
        <span className="text-[10px] text-emerald-500 font-bold">W</span>
      )}
    </div>
  );
}

export default function MatchListView({ matchDays }: MatchListViewProps) {
  const t = useAdminT(nsAdminBracketMatchListView);
  return (
    <div className="space-y-6">
      {matchDays.map((day) => (
        <section key={day.dateKey}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-6 rounded-full bg-gradient-to-b from-purple-400 to-purple-600" />
            <h2 className="text-base font-bold capitalize">{day.label}</h2>
            {day.roundName && (
              <span className="text-xs text-purple-300/60 uppercase tracking-wider font-medium">
                {day.roundName}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th
                    scope="col"
                    className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider"
                  >
                    {t.colTime}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider"
                  >
                    {t.colTeam1}
                  </th>
                  <th
                    scope="col"
                    className="text-center px-2 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider"
                  >
                    vs
                  </th>
                  <th
                    scope="col"
                    className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider"
                  >
                    {t.colTeam2}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider"
                  >
                    {t.colFormat}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider"
                  >
                    {t.colRound}
                  </th>
                  <th
                    scope="col"
                    className="text-left px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider"
                  >
                    {t.colStatus}
                  </th>
                </tr>
              </thead>
              <tbody>
                {day.matches.map((m) => {
                  const statusCfg = STATUS_CONFIG[m.status];
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-3 py-2.5 tabular-nums font-medium text-white/80">
                        {m.scheduled_at ? formatTime(m.scheduled_at) : '—'}
                      </td>
                      <td className="px-3 py-2.5">{teamDisplay(m, 1)}</td>
                      <td className="px-2 py-2.5 text-center text-[10px] text-neutral-600 font-bold">
                        vs
                      </td>
                      <td className="px-3 py-2.5">{teamDisplay(m, 2)}</td>
                      <td className="px-3 py-2.5">
                        {m.match_format ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-white/5 text-neutral-400 border border-white/5">
                            {m.match_format}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-400">
                        {m.round_name ??
                          (m.round_number ? `R${m.round_number}` : '—')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusCfg.bg}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}
                          />
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
