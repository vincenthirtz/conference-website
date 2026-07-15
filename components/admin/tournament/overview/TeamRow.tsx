import { memo } from 'react';
import Image from 'next/image';
import RegistrationAnswers, {
  hasRenderableAnswers,
} from '@/components/admin/RegistrationAnswers';
import type { RegistrationField } from '@/utils/registrationFields';
import type { Dict, TournamentTeam } from './types';

type TeamRowProps = {
  tt: TournamentTeam;
  registrationFields: RegistrationField[];
  onRemove: (tournamentTeamId: string) => void;
  tx: Dict;
};

/**
 * Registered-team card in the tournament overview Teams section.
 * Memoized so unrelated page re-renders (e.g. typing in a modal) don't
 * reconcile every team row.
 */
function TeamRow({ tt, registrationFields, onRemove, tx }: TeamRowProps) {
  const showAnswers =
    registrationFields.length > 0 &&
    hasRenderableAnswers(tt.field_values, registrationFields);

  return (
    <div className="bg-neutral-900/50 rounded-lg px-3 py-2 group">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {tt.seed && (
            <span className="text-xs text-neutral-500 font-mono w-6">
              #{tt.seed}
            </span>
          )}
          {tt.team?.logo_url && (
            <Image
              src={tt.team.logo_url}
              alt=""
              width={24}
              height={24}
              className="w-6 h-6 rounded object-cover"
            />
          )}
          <span className="truncate text-sm font-medium">
            {tt.team?.name || tx.unknownTeam}
          </span>
        </div>
        <button
          onClick={() => onRemove(tt.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/50 text-red-400 transition-all"
          title={tx.removeFromTournament}
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      {showAnswers && (
        <RegistrationAnswers
          fieldValues={tt.field_values as Record<string, unknown>}
          fields={registrationFields}
          compact
        />
      )}
    </div>
  );
}

export default memo(TeamRow);
