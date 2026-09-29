// features/admin/teams/ui/MyTeamJoinRequests.tsx — la carte « Demandes de
// joueurs » de l'espace « mon équipe » (pages/admin/teams/my.tsx) en « Le
// Ruban » : une ligne par demande en attente, Accepter / Refuser, et la saisie
// du BattleTag quand la demande n'en porte pas.
//
// Purement présentationnel : la page charge les demandes, tient les BattleTags
// saisis et envoie l'approbation ou le refus.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { DemandePayload } from '@/utils/teams/demandeRows';
import { MY_TEAM_SPINNER } from './MyTeamClasses';

export type MyTeamJoinRequest = {
  id: string;
  user_id: string;
  status: string;
  comment: string | null;
  payload: DemandePayload | null;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
  } | null;
};

export default function MyTeamJoinRequests({
  joinRequests,
  loading,
  processingRequestId,
  joinBattleTags,
  onBattleTagChange,
  onAction,
  onRefresh,
}: {
  joinRequests: MyTeamJoinRequest[];
  loading: boolean;
  processingRequestId: string | null;
  joinBattleTags: Record<string, string>;
  onBattleTagChange: (demandeId: string, value: string) => void;
  onAction: (demandeId: string, action: 'approve' | 'reject') => void;
  onRefresh: () => void;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  return (
    <FicheSection
      title={t.joinRequestsTitle}
      aside={
        <AdminButton
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? t.loading : t.refresh}
        </AdminButton>
      }
    >
      <p className="-mt-3 mb-4 text-xs text-[var(--t3,#a39ba6)]">
        {format(
          joinRequests.length > 1
            ? t.joinRequestCount_other
            : t.joinRequestCount_one,
          { count: joinRequests.length }
        )}
      </p>

      {loading && joinRequests.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-[var(--t3,#a39ba6)]">
          <div className={`h-4 w-4 ${MY_TEAM_SPINNER}`} />
          {t.loadingRequests}
        </div>
      ) : (
        <div className="space-y-3">
          {joinRequests.map((jr) => {
            const isProcessing = processingRequestId === jr.id;
            const displayName =
              jr.user?.display_name ||
              jr.payload?.user_display_name ||
              t.unknownPlayer;
            const battleTag =
              jr.user?.battle_tag || jr.payload?.user_battle_tag || null;
            const desiredRole = jr.payload?.desired_role || 'player';
            const roleLabel =
              desiredRole === 'substitute' ? t.roleSubstitute : t.rolePlayer;

            return (
              <div
                key={jr.id}
                className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--t1,#f4edf7)]">
                        {displayName}
                      </span>
                      <Chip>{roleLabel}</Chip>
                    </div>
                    {battleTag && (
                      <p className="mt-0.5 font-mono text-xs text-[var(--t2,#c7bfca)]">
                        {battleTag}
                      </p>
                    )}
                    {jr.user?.email && (
                      <p className="mt-0.5 text-xs text-[var(--t3,#a39ba6)]">
                        {jr.user.email}
                      </p>
                    )}
                    {jr.comment && (
                      <p className="mt-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] px-3 py-2 text-sm text-[var(--t2,#c7bfca)]">
                        &laquo; {jr.comment} &raquo;
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-[var(--t4,#807984)]">
                      {new Date(jr.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 gap-2">
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      onClick={() => onAction(jr.id, 'approve')}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <div className={`h-3.5 w-3.5 ${MY_TEAM_SPINNER}`} />
                      ) : (
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                      {t.accept}
                    </AdminButton>
                    <AdminButton
                      variant="danger"
                      size="sm"
                      onClick={() => onAction(jr.id, 'reject')}
                      disabled={isProcessing}
                    >
                      <svg
                        className="h-4 w-4"
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
                      {t.reject}
                    </AdminButton>
                  </div>
                </div>

                {!battleTag && (
                  <div className="mt-3 sm:max-w-xs">
                    <label
                      htmlFor={`admin-join-btag-${jr.id}`}
                      className="mb-1 block font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--warn,#f5a524)]"
                    >
                      {t.joinMissingBattleTagLabel}
                    </label>
                    <input
                      id={`admin-join-btag-${jr.id}`}
                      type="text"
                      value={joinBattleTags[jr.id] || ''}
                      onChange={(e) => onBattleTagChange(jr.id, e.target.value)}
                      placeholder={t.battleTagPlaceholder}
                      maxLength={64}
                      aria-describedby={`admin-join-btag-hint-${jr.id}`}
                      className="w-full rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[var(--s1,#100812)] px-3 py-2 text-xs text-[var(--t1,#f4edf7)] placeholder:text-[var(--t4,#807984)] focus:border-[var(--warn,#f5a524)] focus:outline-none"
                    />
                    <p
                      id={`admin-join-btag-hint-${jr.id}`}
                      className="mt-1 text-[11px] text-[var(--t3,#a39ba6)]"
                    >
                      {t.joinMissingBattleTagHint}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FicheSection>
  );
}
