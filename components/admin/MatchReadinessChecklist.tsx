// components/admin/MatchReadinessChecklist.tsx
// Checklist "pret a jouer" affichee avant un match.

import { useAdminT } from '@/lib/i18n/useAdminT';

type CheckItem = {
  label: string;
  ok: boolean;
  detail?: string;
};

type MatchReadinessProps = {
  match: {
    status: string;
    team1_id: string | null;
    team2_id: string | null;
    is_bye: boolean | null;
    best_of: number | null;
    scheduled_at: string | null;
    stream_url: string | null;
    lobby_code: string | null;
    notes: string | null;
  };
  team1Name: string | null;
  team2Name: string | null;
  tournamentStatus: string | null;
  stageActive: boolean | null;
};

function CheckRow({ item }: { item: CheckItem }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className="mt-0.5 flex-shrink-0">
        {item.ok ? (
          <svg
            className="w-4 h-4 text-emerald-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4 text-neutral-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${
            item.ok ? 'text-emerald-300' : 'text-neutral-400'
          }`}
        >
          {item.label}
        </span>
        {item.detail && (
          <p className="text-[11px] text-neutral-500 mt-0.5">{item.detail}</p>
        )}
      </div>
    </div>
  );
}

export default function MatchReadinessChecklist({
  match,
  team1Name,
  team2Name,
  tournamentStatus,
  stageActive,
}: MatchReadinessProps) {
  const t = useAdminT('adminMatchReadinessChecklist');
  const isBye = match.is_bye === true;

  const checks: CheckItem[] = [
    {
      label: t.team1Assigned,
      ok: !!match.team1_id,
      detail: match.team1_id
        ? team1Name || match.team1_id.slice(0, 8)
        : t.notAssigned,
    },
    ...(!isBye
      ? [
          {
            label: t.team2Assigned,
            ok: !!match.team2_id,
            detail: match.team2_id
              ? team2Name || match.team2_id.slice(0, 8)
              : t.notAssigned,
          },
        ]
      : []),
    {
      label: t.formatDefined,
      ok: !!match.best_of && match.best_of > 0,
      detail: match.best_of ? `BO${match.best_of}` : t.formatUndefined,
    },
    {
      label: t.scheduleSet,
      ok: !!match.scheduled_at,
      detail: match.scheduled_at
        ? new Date(match.scheduled_at).toLocaleString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : t.notScheduled,
    },
    {
      label: t.streamConfigured,
      ok: !!match.stream_url,
      detail: match.stream_url || t.noStream,
    },
    {
      label: t.lobbyCodeSet,
      ok: !!match.lobby_code,
      detail: match.lobby_code || t.notSet,
    },
    {
      label: t.tournamentRunning,
      ok: tournamentStatus === 'running' || tournamentStatus === 'published',
      detail:
        tournamentStatus === 'running'
          ? t.statusRunning
          : tournamentStatus === 'published'
            ? t.statusPublished
            : tournamentStatus || t.unknownStatus,
    },
    ...(stageActive !== null
      ? [
          {
            label: t.stageActive,
            ok: stageActive === true,
            detail: stageActive ? t.yes : t.inactive,
          },
        ]
      : []),
    {
      label: t.matchNotCancelled,
      ok: match.status !== 'cancelled',
      detail:
        match.status === 'cancelled'
          ? t.statusCancelled
          : match.status === 'finished'
            ? t.statusFinished
            : match.status === 'ongoing'
              ? t.statusRunning
              : t.statusUpcoming,
    },
  ];

  const readyCount = checks.filter((c) => c.ok).length;
  const totalCount = checks.length;
  const allReady = readyCount === totalCount;
  const percentage = Math.round((readyCount / totalCount) * 100);

  return (
    <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.heading}</h2>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            allReady
              ? 'bg-emerald-600/20 text-emerald-300'
              : percentage >= 60
                ? 'bg-amber-600/20 text-amber-300'
                : 'bg-red-600/20 text-red-300'
          }`}
        >
          {readyCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            allReady
              ? 'bg-emerald-500'
              : percentage >= 60
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="divide-y divide-neutral-700/50">
        {checks.map((check, i) => (
          <CheckRow key={i} item={check} />
        ))}
      </div>

      {allReady && (
        <p className="text-xs text-emerald-400 font-medium pt-1">
          {t.allReady}
        </p>
      )}
    </section>
  );
}
