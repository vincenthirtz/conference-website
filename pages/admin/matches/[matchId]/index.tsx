// pages/admin/matches/[matchId]/index.tsx
// Vue détaillée d'un match (lecture seule) pour le staff

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import MatchHistoryDrawer from '@/components/admin/MatchHistoryDrawer';
import MatchLineupsPanel from '@/components/admin/MatchLineupsPanel';
import MatchForfeitProposalPanel from '@/components/admin/MatchForfeitProposalPanel';
import Modal from '@/components/admin/Modal';
import nsAdminMatchDetail from '@/lib/i18n/locales/admin-fr/adminMatchDetail';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  MatchDisputeCard,
  MatchInfoCards,
  MatchMapsSection,
  MatchScoreLine,
  matchStatusLabel,
  matchStatusTone,
  type MatchRow,
} from '@/features/admin/matches/ui/MatchDetailBlocks';
import { matchesPaths } from '@/features/admin/matches/client';
import {
  useCancelMatchDispute,
  useInvalidateMatch,
  useMatchDetail,
  useResolveMatchDispute,
} from '@/features/admin/matches/hooks/useMatch';
import { withAdminQuery } from '@/features/admin/_shared/query';

const MODAL_CHROME =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] shadow-2xl';
const LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
const FIELD =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
const MSG = 'mt-2 text-sm text-[#ffc2c2]';

export const getServerSideProps = withStaffPage({
  permission: 'arbitrate_matches',
});

type StaffProps = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
};

function MatchViewPage(_: StaffProps) {
  const t = useAdminT(nsAdminMatchDetail);
  const router = useRouter();
  const { matchId } = router.query;
  const matchIdStr = Array.isArray(matchId) ? matchId[0] : matchId;
  const { confirm, dialog } = useConfirmDialog();
  const { mutateJson: openDisputeMutate } = useIdempotentMutation();

  const detail = useMatchDetail(matchIdStr);
  const resolveDisputeMut = useResolveMatchDispute(matchIdStr ?? '');
  const cancelDisputeMut = useCancelMatchDispute(matchIdStr ?? '');
  const fetchMatch = useInvalidateMatch(matchIdStr);
  const loading = detail.isPending;
  const errorMsg = detail.error ? detail.error.message || t.errorLoad : null;
  const match = (detail.data?.match ?? null) as MatchRow | null;

  // History drawer
  const [showHistory, setShowHistory] = useState(false);

  // Dispute modals
  const [showOpenDispute, setShowOpenDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showResolveDispute, setShowResolveDispute] = useState(false);
  const [resolveText, setResolveText] = useState('');
  const [resolveResumeStatus, setResolveResumeStatus] =
    useState<MatchStatus>('finished');
  const [resolveTeam1Score, setResolveTeam1Score] = useState<string>('');
  const [resolveTeam2Score, setResolveTeam2Score] = useState<string>('');
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeMsg, setDisputeMsg] = useState<string | null>(null);

  async function openDispute() {
    if (!matchIdStr) return;
    if (disputeReason.trim().length === 0) {
      setDisputeMsg(t.errorReasonRequired);
      return;
    }
    setDisputeBusy(true);
    setDisputeMsg(null);
    try {
      await openDisputeMutate(matchesPaths.dispute(matchIdStr), {
        method: 'POST',
        body: JSON.stringify({ reason: disputeReason.trim() }),
      });
      setShowOpenDispute(false);
      setDisputeReason('');
      await fetchMatch();
    } catch (e: unknown) {
      setDisputeMsg((e as Error).message || t.errorOpenDispute);
    } finally {
      setDisputeBusy(false);
    }
  }

  async function resolveDispute() {
    if (!matchIdStr) return;
    if (resolveText.trim().length === 0) {
      setDisputeMsg(t.errorDecisionRequired);
      return;
    }
    setDisputeBusy(true);
    setDisputeMsg(null);
    try {
      const body: Record<string, unknown> = {
        resolution: resolveText.trim(),
        resumeStatus: resolveResumeStatus,
      };
      if (
        (resolveResumeStatus === 'finished' ||
          resolveResumeStatus === 'walkover') &&
        resolveTeam1Score !== '' &&
        resolveTeam2Score !== ''
      ) {
        body.team1Score = Number(resolveTeam1Score);
        body.team2Score = Number(resolveTeam2Score);
      }
      await resolveDisputeMut.mutateAsync(body);
      setShowResolveDispute(false);
      setResolveText('');
      setResolveTeam1Score('');
      setResolveTeam2Score('');
      await fetchMatch();
    } catch (e: unknown) {
      setDisputeMsg((e as Error).message || t.errorResolve);
    } finally {
      setDisputeBusy(false);
    }
  }

  async function cancelDispute() {
    if (!matchIdStr) return;
    const ok = await confirm({
      title: t.confirmCancelDispute,
      variant: 'danger',
    });
    if (!ok) return;
    setDisputeBusy(true);
    setDisputeMsg(null);
    try {
      await cancelDisputeMut.mutateAsync();
      await fetchMatch();
    } catch (e: unknown) {
      setDisputeMsg((e as Error).message || t.errorCancel);
    } finally {
      setDisputeBusy(false);
    }
  }

  return (
    <>
      {dialog}
      <Head>
        <title>{format(t.pageTitle, { id: matchIdStr ?? '' })}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />
        <p className="mt-4 mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
          {t.kicker}
        </p>
        <EntityHeader
          title={
            <>
              {match?.round_name || t.headingMatchFallback}{' '}
              <span className="font-mono text-[0.5em] text-[var(--t3,#a39ba6)]">
                {matchIdStr}
              </span>
            </>
          }
          meta={
            match?.tournament && (
              <>
                {t.tournamentPrefix}{' '}
                {match.tournament.name || match.tournament.id}
                {match.stage?.name ? ` • ${match.stage.name}` : ''}
              </>
            )
          }
          status={
            match && (
              <Chip tone={matchStatusTone(match.status)}>
                {matchStatusLabel(match.status, t)}
              </Chip>
            )
          }
          actions={
            <>
              <AdminButtonLink
                href={`/admin/matches/${matchIdStr}/edit`}
                variant="secondary"
                size="sm"
              >
                {t.edit}
              </AdminButtonLink>
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(true)}
                title={t.historyTitle}
              >
                {t.history}
              </AdminButton>
              {match && match.status === 'disputed' ? (
                <>
                  <AdminButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setResolveText('');
                      setResolveResumeStatus('finished');
                      setResolveTeam1Score(String(match.team1_score ?? 0));
                      setResolveTeam2Score(String(match.team2_score ?? 0));
                      setDisputeMsg(null);
                      setShowResolveDispute(true);
                    }}
                  >
                    {t.resolveDispute}
                  </AdminButton>
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    onClick={cancelDispute}
                    disabled={disputeBusy}
                  >
                    {t.cancelDispute}
                  </AdminButton>
                </>
              ) : (
                match &&
                match.status !== 'cancelled' && (
                  <AdminButton
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setDisputeReason('');
                      setDisputeMsg(null);
                      setShowOpenDispute(true);
                    }}
                  >
                    {t.openDispute}
                  </AdminButton>
                )
              )}
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => fetchMatch()}
              >
                {t.refresh}
              </AdminButton>
            </>
          }
        />

        {loading && (
          <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 text-sm text-[var(--t3,#a39ba6)]">
            {t.loading}
          </div>
        )}

        {errorMsg && !loading && (
          <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-sm text-[#ffc2c2]">
            {errorMsg}
          </div>
        )}

        {match && !loading && (
          <div className="space-y-6">
            {(match.status === 'disputed' || match.dispute_reason) && (
              <MatchDisputeCard match={match} />
            )}

            {/* Forfait PROPOSÉ par le cron de check-in (jamais appliqué
                seul) : confirmer ou refuser. Se tait sans proposition. */}
            <MatchForfeitProposalPanel
              matchId={match.id}
              team1={match.team1}
              team2={match.team2}
            />

            <MatchInfoCards match={match} />

            <MatchScoreLine match={match} />

            {/* Feuilles de match : où en sont les deux équipes, et les deux
                leviers du staff (valider à leur place, rouvrir). Se tait sur
                un match sans équipes (bye, bracket non résolu). */}
            <MatchLineupsPanel matchId={match.id} />

            {match.games && match.games.length > 0 && (
              <MatchMapsSection games={match.games} />
            )}
          </div>
        )}
      </div>

      {matchIdStr && (
        <MatchHistoryDrawer
          matchId={matchIdStr}
          open={showHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      <Modal
        open={showOpenDispute}
        onClose={() => setShowOpenDispute(false)}
        disableEscapeClose={disputeBusy}
        disableBackdropClose={disputeBusy}
        panelChromeClassName={MODAL_CHROME}
        size="lg"
        title={t.openDisputeTitle}
        subtitle={t.openDisputeSubtitle}
        footer={
          <>
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setShowOpenDispute(false)}
              disabled={disputeBusy}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="danger"
              size="sm"
              onClick={openDispute}
              disabled={disputeBusy || disputeReason.trim().length === 0}
            >
              {disputeBusy ? t.opening : t.openDisputeSubmit}
            </AdminButton>
          </>
        }
      >
        <label className={LABEL}>{t.motifModalLabel}</label>
        <textarea
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={t.motifPlaceholder}
          className={FIELD}
        />
        {disputeMsg && <p className={MSG}>{disputeMsg}</p>}
      </Modal>

      <Modal
        open={Boolean(showResolveDispute && match)}
        onClose={() => setShowResolveDispute(false)}
        disableEscapeClose={disputeBusy}
        disableBackdropClose={disputeBusy}
        panelChromeClassName={MODAL_CHROME}
        size="lg"
        title={t.resolveDisputeTitle}
        subtitle={t.resolveDisputeSubtitle}
        footer={
          <>
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setShowResolveDispute(false)}
              disabled={disputeBusy}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={resolveDispute}
              disabled={disputeBusy || resolveText.trim().length === 0}
            >
              {disputeBusy ? t.resolving : t.applyDecision}
            </AdminButton>
          </>
        }
      >
        {match && (
          <>
            <label className={LABEL}>{t.decisionModalLabel}</label>
            <textarea
              value={resolveText}
              onChange={(e) => setResolveText(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t.decisionPlaceholder}
              className={`mb-3 ${FIELD}`}
            />

            <label className={LABEL}>{t.statusAfterLabel}</label>
            <select
              value={resolveResumeStatus}
              onChange={(e) =>
                setResolveResumeStatus(e.target.value as MatchStatus)
              }
              className={`mb-3 ${FIELD}`}
            >
              <option value="finished">{t.resumeFinished}</option>
              <option value="walkover">{t.resumeWalkover}</option>
              <option value="ongoing">{t.resumeOngoing}</option>
              <option value="pending">{t.resumePending}</option>
            </select>

            {(resolveResumeStatus === 'finished' ||
              resolveResumeStatus === 'walkover') && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                    {format(t.scoreFor, {
                      team:
                        match.team1?.short_name ||
                        match.team1?.name ||
                        t.team1Fallback,
                    })}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={resolveTeam1Score}
                    onChange={(e) => setResolveTeam1Score(e.target.value)}
                    className={`font-mono ${FIELD}`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                    {format(t.scoreFor, {
                      team:
                        match.team2?.short_name ||
                        match.team2?.name ||
                        t.team2Fallback,
                    })}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={resolveTeam2Score}
                    onChange={(e) => setResolveTeam2Score(e.target.value)}
                    className={`font-mono ${FIELD}`}
                  />
                </div>
              </div>
            )}

            {disputeMsg && <p className={MSG}>{disputeMsg}</p>}
          </>
        )}
      </Modal>
    </>
  );
}

export default withAdminQuery(MatchViewPage);
