// components/admin/bracket/MatchListView.tsx
// List view for bracket-builder matches

import Image from 'next/image';
import { formatTime } from '@/utils/dateFormatters';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { parseNotes } from './types';
import type { ScheduleMatch, MatchDay } from './types';
import nsAdminBracketMatchListView from '@/lib/i18n/locales/admin-fr/adminBracketMatchListView';
import Chip from '@/features/admin/_shared/ui/Chip';
import { MATCH_STATUS_TONE } from './statusTone';

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
      className={`flex items-center gap-2 ${isWinner ? 'font-semibold text-[var(--lf-200,#b3e7a3)]' : ''}`}
    >
      {team?.logo_url && (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={18}
          height={18}
          className="h-[18px] w-[18px] rounded-[3px] object-cover"
        />
      )}
      <span>{team?.name ?? (seed ? `Seed ${seed}` : 'TBD')}</span>
      {isWinner && (
        <span className="text-[10px] font-bold text-[var(--lf,#7fca65)]">
          W
        </span>
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
            <div className="h-6 w-1 rounded-[2px] bg-[var(--or,#b467d1)]" />
            <h2 className="text-base font-bold capitalize">{day.label}</h2>
            {day.roundName && (
              <span className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
                {day.roundName}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]">
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colTime}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colTeam1}
                  </th>
                  <th scope="col" className="px-2 py-2 text-center">
                    vs
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colTeam2}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colFormat}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    {t.colRound}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
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
                      className="border-b border-[var(--line,rgba(194,196,201,.12))] transition-colors hover:bg-[var(--s2,#1d1520)]"
                    >
                      <td className="px-3 py-2.5 font-mono font-medium text-[var(--t1,#f4edf7)]">
                        {m.scheduled_at ? formatTime(m.scheduled_at) : '—'}
                      </td>
                      <td className="px-3 py-2.5">{teamDisplay(m, 1)}</td>
                      <td className="px-2 py-2.5 text-center text-[10px] font-bold text-[var(--t4,#807984)]">
                        vs
                      </td>
                      <td className="px-3 py-2.5">{teamDisplay(m, 2)}</td>
                      <td className="px-3 py-2.5">
                        {m.match_format ? <Chip>{m.match_format}</Chip> : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--t3,#a39ba6)]">
                        {m.round_name ??
                          (m.round_number ? `R${m.round_number}` : '—')}
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip tone={MATCH_STATUS_TONE[m.status] ?? 'neutral'}>
                          {statusCfg.label}
                        </Chip>
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
