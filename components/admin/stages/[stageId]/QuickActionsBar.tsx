// components/admin/stages/[stageId]/QuickActionsBar.tsx
import React from 'react';
import Link from 'next/link';
import type { Stage } from '@/types/admin';
import type { Dict } from './stageDisplay';

type Props = {
  stage: Stage;
  matchesUrl: string | null;
  cloning: boolean;
  onEdit: () => void;
  onOpenAdvance: () => void;
  onClone: (includeMatches: boolean) => void;
  t: Dict;
};

/**
 * Barre d'actions rapides (éditer, matches, avancer, cloner, historique).
 * Ne reçoit que des callbacks STABLES (`useCallback` côté page) + des scalaires,
 * donc `React.memo` la fige tant qu'aucune action n'est en vol : une frappe dans
 * un formulaire/modale ne la re-rend plus.
 */
function QuickActionsBar({
  stage,
  matchesUrl,
  cloning,
  onEdit,
  onOpenAdvance,
  onClone,
  t,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onEdit}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        {t.editStage}
      </button>
      {matchesUrl && (
        <Link
          href={matchesUrl}
          className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          {t.viewMatches}
        </Link>
      )}
      <button
        onClick={onOpenAdvance}
        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        {t.advanceTeams}
      </button>
      <button
        onClick={() => onClone(false)}
        disabled={cloning}
        className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        {cloning ? t.cloning : t.cloneStage}
      </button>
      <button
        onClick={() => onClone(true)}
        disabled={cloning}
        className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        {cloning ? t.cloning : t.cloneWithMatches}
      </button>
      <Link
        href={`/admin/stages/${stage.id}/history`}
        className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {t.history}
      </Link>
    </div>
  );
}

export default React.memo(QuickActionsBar);
