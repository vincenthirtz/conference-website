// components/admin/dashboard/StageProgressBar.tsx
// Petite barre de progression pour une phase (finished/total) avec label.

import Link from 'next/link';

const STAGE_TYPE_LABEL: Record<string, string> = {
  group: 'Poule',
  bracket: 'Bracket',
  swiss: 'Swiss',
  round_robin: 'Round Robin',
  showmatch: 'Showmatch',
};

type Props = {
  stageId: string;
  tournamentId: string;
  name: string;
  stageType: string | null;
  totalMatches: number;
  finishedMatches: number;
  pendingMatches: number;
  ongoingMatches: number;
  isActive: boolean;
  teamsCount: number;
  isReadyToAdvance?: boolean;
};

export default function StageProgressBar({
  stageId,
  tournamentId,
  name,
  stageType,
  totalMatches,
  finishedMatches,
  ongoingMatches,
  isActive,
  teamsCount,
  isReadyToAdvance,
}: Props) {
  const percent =
    totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;
  const remaining = totalMatches - finishedMatches;
  const typeLabel = stageType
    ? (STAGE_TYPE_LABEL[stageType] ?? stageType)
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-transparent p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {name}
            {!isActive && (
              <span className="ml-2 rounded-full bg-gray-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gray-400">
                inactive
              </span>
            )}
            {isReadyToAdvance && (
              <span className="ml-2 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
                ready
              </span>
            )}
          </p>
          <p className="text-[10px] text-gray-500">
            {typeLabel ?? '—'} · {teamsCount} équipe{teamsCount > 1 ? 's' : ''}
            {ongoingMatches > 0 && (
              <span className="ml-1 text-rose-300">
                · {ongoingMatches} en cours
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-gray-300">
            {finishedMatches}/{totalMatches}
          </span>
          <Link
            href={`/admin/tournament/${tournamentId}/matches?stage=${stageId}`}
            className="text-[10px] text-purple-300 hover:text-purple-200"
          >
            Voir →
          </Link>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full transition-all ${
            percent === 100
              ? 'bg-emerald-500'
              : percent >= 50
                ? 'bg-blue-500'
                : 'bg-purple-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {remaining > 0 && (
        <p className="mt-1 text-[10px] text-gray-500">
          {remaining} match{remaining > 1 ? 's' : ''} restant
          {remaining > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
