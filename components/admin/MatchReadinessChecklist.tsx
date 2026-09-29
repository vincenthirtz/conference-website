// components/admin/MatchReadinessChecklist.tsx
// Checklist "pret a jouer" affichee avant un match.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminMatchReadinessChecklist from '@/lib/i18n/locales/admin-fr/adminMatchReadinessChecklist';
import Chip from '@/features/admin/_shared/ui/Chip';

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
            className="h-4 w-4 text-[var(--lf,#7fca65)]"
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
            className="h-4 w-4 text-[var(--t4,#807984)]"
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
            item.ok ? 'text-[var(--t1,#f4edf7)]' : 'text-[var(--t3,#a39ba6)]'
          }`}
        >
          {item.label}
        </span>
        {item.detail && (
          <p className="mt-0.5 text-[11px] text-[var(--t4,#807984)]">
            {item.detail}
          </p>
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
  const t = useAdminT(nsAdminMatchReadinessChecklist);
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
    <section className="space-y-3 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.heading}</h2>
        <Chip tone={allReady ? 'ok' : percentage >= 60 ? 'warn' : 'err'}>
          {readyCount}/{totalCount}
        </Chip>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-[var(--s3,#2f2732)]">
        <div
          className={`h-full rounded-[2px] transition-all ${
            allReady
              ? 'bg-emerald-500'
              : percentage >= 60
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
        {checks.map((check, i) => (
          <CheckRow key={i} item={check} />
        ))}
      </div>

      {allReady && (
        <p className="pt-1 text-xs font-medium text-[var(--lf,#7fca65)]">
          {t.allReady}
        </p>
      )}
    </section>
  );
}
