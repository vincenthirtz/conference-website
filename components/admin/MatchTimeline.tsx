// components/admin/MatchTimeline.tsx
// Timeline visuelle des actions staff sur un match,
// alimentée par l'API /api/admin/matches/[matchId]/history.

import { useEffect, useState, useCallback } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminMatchTimeline'>>;

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

const ROLE_COLORS: Record<string, string> = {
  owner: 'text-amber-300',
  admin: 'text-blue-300',
  manager: 'text-emerald-300',
  caster: 'text-purple-300',
};

export default function MatchTimeline({ matchId }: Props) {
  const t = useAdminT('adminMatchTimeline');
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    // Réarmer loading/error à chaque (re)fetch : sinon, après une erreur
    // transitoire, un refetch réussi continue d'afficher l'erreur, et un
    // changement de matchId montre les logs de l'ancien match sans loading.
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/history`);
      if (!res.ok) {
        setError(t.errorLoad);
        return;
      }
      const json = await res.json();
      setLogs(json.logs || []);
    } catch {
      setError(t.errorNetwork);
    } finally {
      setLoading(false);
    }
  }, [matchId, t]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return <div className="text-xs text-neutral-500 py-3">{t.loading}</div>;
  }

  if (error) {
    return <div className="text-xs text-red-400 py-3">{error}</div>;
  }

  if (logs.length === 0) {
    return <div className="text-xs text-neutral-500 py-3">{t.empty}</div>;
  }

  return (
    <div className="space-y-0">
      {logs.slice(0, 15).map((log, idx) => (
        <div key={log.id} className="flex gap-3 group">
          {/* Vertical line + dot */}
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-neutral-500 group-hover:bg-blue-400 mt-1.5 shrink-0 transition-colors" />
            {idx < Math.min(logs.length, 15) - 1 && (
              <div className="w-px flex-1 bg-neutral-700" />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 min-w-0">
            <p className="text-sm text-neutral-200 leading-tight">
              {summarize(log, t)}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-[11px]">
              {log.staff?.display_name && (
                <span
                  className={
                    ROLE_COLORS[log.staff.role ?? ''] ?? 'text-neutral-400'
                  }
                >
                  {log.staff.display_name}
                </span>
              )}
              <span className="text-neutral-500">{log.date}</span>
            </div>
          </div>
        </div>
      ))}

      {logs.length > 15 && (
        <p className="text-[11px] text-neutral-500 pl-5">
          {format(t.more, { count: logs.length - 15 })}
        </p>
      )}
    </div>
  );
}
