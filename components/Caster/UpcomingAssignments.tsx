// components/Caster/UpcomingAssignments.tsx
//
// Liste des prochaines assignations cast (24h horizon) pour le caster
// connecte. Affiche team1 vs team2, scheduledAt, tournament, role.

import type { CasterUpcomingAssignment } from '@/hooks/useCasterSession';

type Props = {
  assignments: CasterUpcomingAssignment[];
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diff = t - Date.now();
  const absMin = Math.abs(Math.round(diff / 60_000));
  if (Math.abs(diff) < 60_000) return 'maintenant';
  if (absMin < 60)
    return diff > 0 ? `dans ${absMin} min` : `il y a ${absMin} min`;
  const hours = Math.round(absMin / 60);
  if (hours < 24) return diff > 0 ? `dans ${hours}h` : `il y a ${hours}h`;
  const days = Math.round(hours / 24);
  return diff > 0 ? `dans ${days}j` : `il y a ${days}j`;
}

export default function UpcomingAssignments({ assignments }: Props) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white mb-1">
          Tes prochaines assignations
        </div>
        <p className="text-xs text-gray-400">
          Aucune assignation cast dans les 24h. Reviens plus tard ou contacte le
          Director.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm font-semibold text-white mb-3">
        Tes prochaines assignations
      </div>
      <ul className="space-y-2.5">
        {assignments.map((a) => {
          const m = a.match;
          const when = m.scheduledAt
            ? new Date(m.scheduledAt).toLocaleString('fr-FR', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Non programme';
          return (
            <li
              key={a.assignmentId}
              className="rounded-xl border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200">
                  {a.role || 'Caster'}
                </span>
                <span className="text-[11px] text-gray-400">
                  {when} • {relativeTime(m.scheduledAt)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white">
                <span className="truncate flex-1 text-right">
                  {m.team1?.name || 'TBD'}
                </span>
                <span className="text-gray-500 text-xs">vs</span>
                <span className="truncate flex-1">
                  {m.team2?.name || 'TBD'}
                </span>
              </div>
              {m.tournament && (
                <div className="text-[11px] text-gray-500 mt-1 truncate">
                  {m.tournament.name}
                  {m.roundName ? ` — ${m.roundName}` : ''}
                </div>
              )}
              {m.streamUrl && (
                <div className="mt-2">
                  <a
                    href={m.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-purple-300 hover:text-purple-200 underline"
                  >
                    Stream
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
