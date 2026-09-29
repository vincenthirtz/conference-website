// features/admin/tournaments/TournamentDashboardMatchModals.tsx — les trois
// modales d'action du hub tournoi (saisie de score, arbitrage d'un litige,
// passage à la phase suivante), sorties de
// pages/admin/tournament/[id]/dashboard.tsx telles quelles.
//
// Hors de `ui/` exprès : ces modales écrivent (score, résolution, avancement)
// par leurs propres appels réseau. La page garde la cible ouverte et le
// rafraîchissement ; ce composant ne fait que les brancher.

import ScoreEntryModal from '@/components/admin/dashboard/ScoreEntryModal';
import DisputeResolveModal from '@/components/admin/dashboard/DisputeResolveModal';
import ConfirmAdvanceModal from '@/components/admin/dashboard/ConfirmAdvanceModal';
import type { DashboardMatchTarget } from './ui/TournamentDashboardMatches';

export default function TournamentDashboardMatchModals({
  scoreTarget,
  disputeTarget,
  advanceTarget,
  onCloseScore,
  onCloseDispute,
  onCloseAdvance,
  onSuccess,
}: {
  scoreTarget: DashboardMatchTarget | null;
  disputeTarget: (DashboardMatchTarget & { reason: string | null }) | null;
  advanceTarget: { stageId: string; stageName: string } | null;
  onCloseScore: () => void;
  onCloseDispute: () => void;
  onCloseAdvance: () => void;
  /** Rafraîchit le payload du hub après une écriture réussie. */
  onSuccess: () => void;
}) {
  return (
    <>
      <ScoreEntryModal
        key={scoreTarget?.id ?? 'score-modal'}
        open={!!scoreTarget}
        matchId={scoreTarget?.id ?? ''}
        team1Name={scoreTarget?.team1Name ?? null}
        team2Name={scoreTarget?.team2Name ?? null}
        initialTeam1Score={scoreTarget?.team1Score ?? null}
        initialTeam2Score={scoreTarget?.team2Score ?? null}
        matchFormat={scoreTarget?.matchFormat ?? null}
        onClose={onCloseScore}
        onSuccess={onSuccess}
      />
      <DisputeResolveModal
        key={disputeTarget?.id ?? 'dispute-modal'}
        open={!!disputeTarget}
        matchId={disputeTarget?.id ?? ''}
        team1Name={disputeTarget?.team1Name ?? null}
        team2Name={disputeTarget?.team2Name ?? null}
        reason={disputeTarget?.reason ?? null}
        initialTeam1Score={disputeTarget?.team1Score ?? null}
        initialTeam2Score={disputeTarget?.team2Score ?? null}
        onClose={onCloseDispute}
        onSuccess={onSuccess}
      />
      <ConfirmAdvanceModal
        open={!!advanceTarget}
        stageId={advanceTarget?.stageId ?? ''}
        stageName={advanceTarget?.stageName ?? ''}
        onClose={onCloseAdvance}
        onSuccess={onSuccess}
      />
    </>
  );
}
