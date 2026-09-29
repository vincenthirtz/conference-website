// features/player/team/ui/ManageTeamFallback.tsx — les deux écrans sans
// équipe affichable : panne (avec « Réessayer » — une panne réseau ne se
// déguise pas en refus) et absence d'équipe (le seul vrai refus).

import Link from 'next/link';
import { Button } from '@/features/ruban';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

const SHELL =
  'min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4';
const CTA = 'inline-block px-6 py-3 rounded-xl font-semibold transition';

export function ManageTeamError({
  t,
  onRetry,
}: {
  t: ManageTeamTexts;
  onRetry: () => void;
}) {
  return (
    <div className={SHELL}>
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold mb-4">{t.errorTitle}</h1>
        <p className="text-gray-400 mb-6">{t.errorBody}</p>
        <Button variant="primary" onClick={onRetry}>
          {t.retry}
        </Button>
      </div>
    </div>
  );
}

export function ManageTeamNoTeam({
  t,
  staffSeesFreePlayers,
}: {
  t: ManageTeamTexts;
  /** Un admin sans équipe a, lui, la liste des joueuses libres. */
  staffSeesFreePlayers: boolean;
}) {
  return (
    <div className={SHELL}>
      <div className="text-center">
        <h1 className="text-xl font-bold mb-4">{t.accessDeniedTitle}</h1>
        <p className="text-gray-400 mb-6">
          {staffSeesFreePlayers ? t.accessDeniedStaffBody : t.accessDeniedBody}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {staffSeesFreePlayers && (
            <Link
              href="/admin/free-players"
              className={`${CTA} bg-emerald-600 hover:bg-emerald-500`}
            >
              {t.staffFreePlayersLink}
            </Link>
          )}
          <Link
            href="/player"
            className={`${CTA} bg-purple-600 hover:bg-purple-500`}
          >
            {t.backToSpace}
          </Link>
        </div>
      </div>
    </div>
  );
}
