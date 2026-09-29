// components/admin/MatchTimeline.tsx
// Timeline visuelle des actions staff sur un match,
// alimentée par l'historique du match (useMatchHistory, cache partagé).

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useMatchHistory } from '@/features/admin/matches/hooks/useMatch';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import nsAdminMatchTimeline from '@/lib/i18n/locales/admin-fr/adminMatchTimeline';

type Dict = typeof nsAdminMatchTimeline.fr;

type HistoryLog = {
  id: string;
  created_at: string;
  readableAction: string;
  readableEntity: string | null;
  date: string;
  payload: Record<string, any> | null;
  staff: {
    display_name: string | null;
    role: string | null;
  } | null;
};

type Props = {
  matchId: string;
};

function summarize(log: HistoryLog, t: Dict): string {
  const p = log.payload;
  if (!p) return log.readableAction;

  // Score update
  if (p.new_team1_score !== undefined && p.new_team2_score !== undefined) {
    const prev =
      p.prev_team1_score != null && p.prev_team2_score != null
        ? `${p.prev_team1_score}-${p.prev_team2_score}`
        : null;
    const next = `${p.new_team1_score}-${p.new_team2_score}`;
    return prev
      ? format(t.scoreWithPrev, { prev, next })
      : format(t.scoreOnly, { next });
  }

  // Status change
  if (p.prev_status && p.new_status && p.prev_status !== p.new_status) {
    return `${p.prev_status} \u2192 ${p.new_status}`;
  }

  // Forfeit
  if (p.forfeit_team_id) {
    return t.forfeit;
  }

  // Cancel / delete
  if (p.cancelled) return t.cancel;
  if (p.hard_delete) return t.delete;

  // Meta
  if (p.mode === 'meta') return t.meta;

  return log.readableAction;
}

export default function MatchTimeline({ matchId }: Props) {
  const t = useAdminT(nsAdminMatchTimeline);
  const history = useMatchHistory(matchId);
  // Réarmé à chaque (re)lecture : une erreur transitoire suivie d'une relecture
  // réussie n'affiche plus l'erreur ; un autre match repasse par le chargement.
  const loading = history.isFetching;
  const error = history.error
    ? history.error instanceof AdminHttpError
      ? t.errorLoad
      : t.errorNetwork
    : null;
  const logs = (history.data ?? []) as HistoryLog[];

  if (loading) {
    return (
      <div className="py-3 text-xs text-[var(--t4,#807984)]">{t.loading}</div>
    );
  }

  if (error) {
    return (
      <div className="py-3 text-xs text-[var(--err,#ff6b6b)]">{error}</div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-3 text-xs text-[var(--t4,#807984)]">{t.empty}</div>
    );
  }

  return (
    <div className="space-y-0">
      {logs.slice(0, 15).map((log, idx) => (
        <div key={log.id} className="flex gap-3 group">
          {/* Vertical line + dot */}
          <div className="flex flex-col items-center">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--t4,#807984)] transition-colors group-hover:bg-[var(--or,#b467d1)]" />
            {idx < Math.min(logs.length, 15) - 1 && (
              <div className="w-px flex-1 bg-[var(--line2,rgba(194,196,201,.2))]" />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 min-w-0">
            <p className="text-sm leading-tight text-[var(--t1,#f4edf7)]">
              {summarize(log, t)}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-[11px]">
              {log.staff?.display_name && (
                // Le rôle n'est pas un signal : l'auteur reste en encre.
                <span className="font-medium text-[var(--t2,#c7bfca)]">
                  {log.staff.display_name}
                </span>
              )}
              <span className="font-mono text-[var(--t4,#807984)]">
                {log.date}
              </span>
            </div>
          </div>
        </div>
      ))}

      {logs.length > 15 && (
        <p className="pl-5 text-[11px] text-[var(--t4,#807984)]">
          {format(t.more, { count: logs.length - 15 })}
        </p>
      )}
    </div>
  );
}
