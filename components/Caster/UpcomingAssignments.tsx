// components/Caster/UpcomingAssignments.tsx
//
// Liste des prochaines assignations cast (24h horizon) pour le caster
// connecte. Affiche team1 vs team2, scheduledAt, tournament, role.

import type { CasterUpcomingAssignment } from '@/hooks/useCasterSession';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

type UpcomingDict = ReturnType<typeof useT<'upcomingAssignments'>>;

type Props = {
  assignments: CasterUpcomingAssignment[];
};

function relativeTime(iso: string | null, t: UpcomingDict): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  const diff = parsed - Date.now();
  const absMin = Math.abs(Math.round(diff / 60_000));
  if (Math.abs(diff) < 60_000) return t.now;
  if (absMin < 60)
    return diff > 0
      ? format(t.inMinutes, { count: absMin })
      : format(t.agoMinutes, { count: absMin });
  const hours = Math.round(absMin / 60);
  if (hours < 24)
    return diff > 0
      ? format(t.inHours, { count: hours })
      : format(t.agoHours, { count: hours });
  const days = Math.round(hours / 24);
  return diff > 0
    ? format(t.inDays, { count: days })
    : format(t.agoDays, { count: days });
}

export default function UpcomingAssignments({ assignments }: Props) {
  const t = useT('upcomingAssignments');
  const locale = useLocale();
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white mb-1">{t.title}</div>
        <p className="text-xs text-gray-300">{t.emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm font-semibold text-white mb-3">{t.title}</div>
      <ul className="space-y-2.5">
        {assignments.map((a) => {
          // Lot 9 : un assignment référence soit un match, soit un scrim.
          // On normalise vers une vue commune pour l'affichage.
          const isScrim = a.kind === 'scrim' && a.scrim;
          const m = a.match;
          const s = a.scrim;
          const scheduledAt = isScrim
            ? (s?.scheduledAt ?? null)
            : (m?.scheduledAt ?? null);
          const team1Name = isScrim
            ? (s?.team1?.name ?? 'TBD')
            : (m?.team1?.name ?? 'TBD');
          const team2Name = isScrim
            ? (s?.team2?.name ?? 'TBD')
            : (m?.team2?.name ?? 'TBD');
          const streamUrl = isScrim
            ? (s?.streamUrl ?? null)
            : (m?.streamUrl ?? null);
          const contextLine = isScrim
            ? `${t.scrim}${s?.slug ? ` — ${s.slug}` : ''}`
            : m?.tournament
              ? `${m.tournament.name}${m.roundName ? ` — ${m.roundName}` : ''}`
              : null;
          const kindBadge = isScrim ? t.scrim : t.match;
          const when = scheduledAt
            ? new Date(scheduledAt).toLocaleString(locale, {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : t.notScheduled;
          return (
            <li
              key={a.assignmentId}
              className="rounded-xl border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isScrim
                        ? 'bg-amber-500/20 text-amber-200'
                        : 'bg-blue-500/20 text-blue-200'
                    }`}
                  >
                    {kindBadge}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200">
                    {a.role || t.roleFallback}
                  </span>
                </div>
                <span className="text-[11px] text-gray-200">
                  {when} • {relativeTime(scheduledAt, t)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white">
                <span className="truncate flex-1 text-right">{team1Name}</span>
                <span className="text-gray-300 text-xs">{t.vs}</span>
                <span className="truncate flex-1">{team2Name}</span>
              </div>
              {contextLine && (
                <div className="text-[11px] text-gray-300 mt-1 truncate">
                  {contextLine}
                </div>
              )}
              {streamUrl && (
                <div className="mt-2">
                  <a
                    href={streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-purple-300 hover:text-purple-200 underline"
                  >
                    {t.stream}
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
