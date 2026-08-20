// pages/admin/matches/[matchId]/index.tsx
// Vue détaillée d'un match (lecture seule) pour le staff

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import MatchHistoryDrawer from '@/components/admin/MatchHistoryDrawer';
import MatchLineupsPanel from '@/components/admin/MatchLineupsPanel';
import Modal from '@/components/admin/Modal';
import nsAdminMatchDetail from '@/lib/i18n/locales/admin-fr/adminMatchDetail';

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type StageMini = {
  id: string;
  name: string | null;
  stage_type: string | null;
};

type TournamentMini = {
  id: string;
  name: string | null;
  slug: string | null;
};

type GameRow = {
  id: string;
  match_id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  match_format: string | null;
  round_name: string | null;
  round_number: number | null;
  group_key: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  stream_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  next_match_win_id: string | null;
  next_match_lose_id: string | null;
  dispute_reason: string | null;
  dispute_opened_by: string | null;
  dispute_opened_at: string | null;
  dispute_resolution: string | null;
  dispute_resolved_by: string | null;
  dispute_resolved_at: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;
  stage?: StageMini | null;
  tournament?: TournamentMini | null;
  games?: GameRow[];
};

export const getServerSideProps = withStaffPage('admin');

function statusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-700 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-500/80 text-neutral-900';
    case 'finished':
      return 'bg-emerald-600/80 text-white';
    case 'cancelled':
      return 'bg-red-700/80 text-white';
    case 'disputed':
      return 'bg-orange-600/90 text-white';
    case 'walkover':
      return 'bg-purple-600/80 text-white';
    case 'postponed':
      return 'bg-sky-700/80 text-white';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

type Dict = typeof nsAdminMatchDetail.fr;

function statusLabel(status: MatchStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    case 'disputed':
      return t.statusDisputed;
    case 'walkover':
      return t.statusWalkover;
    case 'postponed':
      return t.statusPostponed;
    default:
      return status || '—';
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

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
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { mutateJson: openDisputeMutate } = useIdempotentMutation();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchRow | null>(null);

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
      await openDisputeMutate(`/api/admin/matches/${matchIdStr}/dispute`, {
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
      await adminFetchJson(`/api/admin/matches/${matchIdStr}/dispute`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
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
      await adminFetchJson(
        `/api/admin/matches/${matchIdStr}/dispute?resumeStatus=pending`,
        { method: 'DELETE' }
      );
      await fetchMatch();
    } catch (e: unknown) {
      setDisputeMsg((e as Error).message || t.errorCancel);
    } finally {
      setDisputeBusy(false);
    }
  }

  const fetchMatch = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (!matchIdStr) throw new Error(t.errorMatchIdMissing);
      const json = await adminFetchJson<{ match: MatchRow }>(
        `/api/admin/matches/${matchIdStr}?includeGames=1`
      );
      setMatch(json.match as MatchRow);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [matchIdStr, adminFetchJson, t]);

  useEffect(() => {
    if (!matchIdStr) return;
    fetchMatch();
  }, [matchIdStr, fetchMatch]);

  const team1 = match?.team1;
  const team2 = match?.team2;

  return (
    <>
      {dialog}
      <Head>
        <title>{format(t.pageTitle, { id: matchIdStr ?? '' })}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.kicker}
              </p>
              <h1 className="text-2xl font-semibold">
                {match?.round_name || t.headingMatchFallback} {matchIdStr}
              </h1>
              {match?.tournament && (
                <p className="text-sm text-gray-300">
                  {t.tournamentPrefix}{' '}
                  {match.tournament.name || match.tournament.id}
                  {match.stage?.name ? ` • ${match.stage.name}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {match && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(match.status)}`}
                >
                  {statusLabel(match.status, t)}
                </span>
              )}
              <Link
                href={`/admin/matches/${matchIdStr}/edit`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                {t.edit}
              </Link>
              <button
                onClick={() => setShowHistory(true)}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
                title={t.historyTitle}
              >
                {t.history}
              </button>
              {match && match.status === 'disputed' ? (
                <>
                  <button
                    onClick={() => {
                      setResolveText('');
                      setResolveResumeStatus('finished');
                      setResolveTeam1Score(String(match.team1_score ?? 0));
                      setResolveTeam2Score(String(match.team2_score ?? 0));
                      setDisputeMsg(null);
                      setShowResolveDispute(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/80 border border-emerald-400/40 text-sm hover:bg-emerald-500"
                  >
                    {t.resolveDispute}
                  </button>
                  <button
                    onClick={cancelDispute}
                    disabled={disputeBusy}
                    className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15 disabled:opacity-50"
                  >
                    {t.cancelDispute}
                  </button>
                </>
              ) : (
                match &&
                match.status !== 'cancelled' && (
                  <button
                    onClick={() => {
                      setDisputeReason('');
                      setDisputeMsg(null);
                      setShowOpenDispute(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-orange-600/80 border border-orange-400/40 text-sm hover:bg-orange-500"
                  >
                    {t.openDispute}
                  </button>
                )
              )}
              <button
                onClick={() => fetchMatch()}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {t.refresh}
              </button>
            </div>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}

          {match && !loading && (
            <div className="space-y-6">
              {(match.status === 'disputed' || match.dispute_reason) && (
                <div
                  className={`p-4 rounded-xl border ${
                    match.status === 'disputed'
                      ? 'bg-orange-900/30 border-orange-500/40'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h2 className="text-lg font-semibold">
                      {match.status === 'disputed'
                        ? t.disputeOngoingHeading
                        : t.disputeResolvedHeading}
                    </h2>
                    {match.dispute_opened_at && (
                      <span className="text-xs text-gray-300">
                        {format(t.disputeOpenedAt, {
                          date: formatDateTime(match.dispute_opened_at),
                        })}
                      </span>
                    )}
                  </div>
                  {match.dispute_reason && (
                    <div className="mb-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
                        {t.motifLabel}
                      </p>
                      <p className="text-sm text-gray-100 whitespace-pre-wrap">
                        {match.dispute_reason}
                      </p>
                    </div>
                  )}
                  {match.dispute_resolution && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
                        {t.decisionLabel}
                        {match.dispute_resolved_at &&
                          ` · ${formatDateTime(match.dispute_resolved_at)}`}
                      </p>
                      <p className="text-sm text-gray-100 whitespace-pre-wrap">
                        {match.dispute_resolution}
                      </p>
                    </div>
                  )}
                  {match.status === 'disputed' && (
                    <p className="text-xs text-orange-200 mt-3">
                      {t.disputeBlockedNote}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
                    {t.planningHeading}
                  </p>
                  <p className="text-sm text-gray-200">
                    {format(t.startLabel, {
                      date: formatDateTime(match.scheduled_at),
                    })}
                  </p>
                  <p className="text-sm text-gray-200">
                    {format(t.endLabel, {
                      date: formatDateTime(match.completed_at),
                    })}
                  </p>
                  {match.stream_url && (
                    <p className="text-sm text-indigo-200 mt-2 break-all">
                      {t.streamLabel}{' '}
                      <a
                        href={match.stream_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {match.stream_url}
                      </a>
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
                    {t.formatHeading}
                  </p>
                  <p className="text-sm text-gray-200">
                    {format(t.boLabel, { value: match.match_format || '—' })}
                  </p>
                  <p className="text-sm text-gray-200">
                    {format(t.roundLabel, {
                      value: match.round_name || match.round_number || '—',
                    })}
                  </p>
                  {match.lobby_code && (
                    <p className="text-sm text-gray-200 mt-2">
                      {format(t.lobbyLabel, { code: match.lobby_code })}
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
                    {t.summaryHeading}
                  </p>
                  <p className="text-sm text-gray-200">
                    {format(t.scoreLabel, {
                      s1: match.team1_score ?? 0,
                      s2: match.team2_score ?? 0,
                    })}
                  </p>
                  <p className="text-sm text-gray-200">
                    {format(t.winnerLabel, {
                      name: match.winner_team_id
                        ? match.winner_team_id === match.team1_id
                          ? team1?.name || t.team1Fallback
                          : team2?.name || t.team2Fallback
                        : '—',
                    })}
                  </p>
                  {match.notes && (
                    <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">
                      {format(t.notesLabel, { notes: match.notes })}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <TeamLine
                    team={team1}
                    side="home"
                    score={match.team1_score}
                  />
                  <div className="text-lg font-semibold text-white">
                    {match.team1_score ?? 0} — {match.team2_score ?? 0}
                  </div>
                  <TeamLine
                    team={team2}
                    side="away"
                    score={match.team2_score}
                  />
                </div>
              </div>

              {/* Feuilles de match : où en sont les deux équipes, et les deux
                  leviers du staff (valider à leur place, rouvrir). Se tait sur
                  un match sans équipes (bye, bracket non résolu). */}
              <MatchLineupsPanel matchId={match.id} />

              {match.games && match.games.length > 0 && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">{t.mapsHeading}</h2>
                    <span className="text-sm text-gray-400">
                      {format(t.mapsCount, { count: match.games.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {match.games
                      .slice()
                      .sort(
                        (a, b) =>
                          (a.map_order ?? 0) - (b.map_order ?? 0) ||
                          a.map_name?.localeCompare(b.map_name || '') ||
                          0
                      )
                      .map((g) => (
                        <div
                          key={g.id}
                          className="p-3 rounded-lg bg-white/5 border border-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold">
                                {g.map_name || t.mapFallback}
                              </p>
                              <p className="text-xs text-gray-400">
                                {format(t.orderLabel, {
                                  order: g.map_order ?? '—',
                                })}
                              </p>
                            </div>
                            <div className="text-sm font-mono bg-white/10 px-2 py-1 rounded">
                              {g.team1_score ?? 0} - {g.team2_score ?? 0}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {g.is_tiebreaker ? t.tiebreakerPrefix : ''}
                            {g.went_overtime ? t.overtime : t.regularTime}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
        panelChromeClassName="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl"
        size="lg"
        title={t.openDisputeTitle}
        subtitle={t.openDisputeSubtitle}
        footer={
          <>
            <button
              onClick={() => setShowOpenDispute(false)}
              disabled={disputeBusy}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              onClick={openDispute}
              disabled={disputeBusy || disputeReason.trim().length === 0}
              className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-sm font-medium disabled:opacity-50"
            >
              {disputeBusy ? t.opening : t.openDisputeSubmit}
            </button>
          </>
        }
      >
        <label className="block text-sm mb-1 text-neutral-300">
          {t.motifModalLabel}
        </label>
        <textarea
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={t.motifPlaceholder}
          className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        {disputeMsg && (
          <p className="text-sm text-red-300 mt-2">{disputeMsg}</p>
        )}
      </Modal>

      <Modal
        open={Boolean(showResolveDispute && match)}
        onClose={() => setShowResolveDispute(false)}
        disableEscapeClose={disputeBusy}
        disableBackdropClose={disputeBusy}
        panelChromeClassName="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl"
        size="lg"
        title={t.resolveDisputeTitle}
        subtitle={t.resolveDisputeSubtitle}
        footer={
          <>
            <button
              onClick={() => setShowResolveDispute(false)}
              disabled={disputeBusy}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              onClick={resolveDispute}
              disabled={disputeBusy || resolveText.trim().length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-50"
            >
              {disputeBusy ? t.resolving : t.applyDecision}
            </button>
          </>
        }
      >
        {match && (
          <>
            <label className="block text-sm mb-1 text-neutral-300">
              {t.decisionModalLabel}
            </label>
            <textarea
              value={resolveText}
              onChange={(e) => setResolveText(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t.decisionPlaceholder}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
            />

            <label className="block text-sm mb-1 text-neutral-300">
              {t.statusAfterLabel}
            </label>
            <select
              value={resolveResumeStatus}
              onChange={(e) =>
                setResolveResumeStatus(e.target.value as MatchStatus)
              }
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm mb-3"
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
                  <label className="block text-xs mb-1 text-neutral-400">
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
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1 text-neutral-400">
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
                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm"
                  />
                </div>
              </div>
            )}

            {disputeMsg && (
              <p className="text-sm text-red-300 mt-2">{disputeMsg}</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

function TeamLine({
  team,
  side,
  score,
}: {
  team: TeamMini | null | undefined;
  side: 'home' | 'away';
  score: number | null | undefined;
}) {
  const t = useAdminT(nsAdminMatchDetail);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-sm font-semibold">
        {team?.short_name || team?.name?.slice(0, 3) || side.toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">
          {team?.name ||
            format(t.teamFallback, { n: side === 'home' ? '1' : '2' })}
        </div>
        <div className="text-xs text-gray-400">
          {format(t.teamScore, { score: score ?? 0 })}
        </div>
      </div>
    </div>
  );
}

export default MatchViewPage;
