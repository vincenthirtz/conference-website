import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Breadcrumb from '@/components/admin/Breadcrumb';
import Th from '@/components/admin/Th';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';
import type { StaffProps } from '@/types/admin';
import type { LeaderboardPlayer, LeaderboardResponse } from '@/types/rating';
import type { RatingCoverageResponse } from '../api/admin/ratings/coverage';

import { logger } from '../../utils/logger';
import nsAdminRatings from '@/lib/i18n/locales/admin-fr/adminRatings';

export const getServerSideProps = withStaffPage('admin');

type RebuildResult = { players: number; matches: number };
type RatingCoverage = RatingCoverageResponse;

function AdminRatingsPage(_props: StaffProps) {
  const { adminFetchJson } = useAdminFetch();
  const rebuild = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const t = useAdminT(nsAdminRatings);
  const playerLabel = (n: number) =>
    format(n > 1 ? t.playerCount_other : t.playerCount_one, { count: n });
  const matchLabel = (n: number) =>
    format(n > 1 ? t.matchCount_other : t.matchCount_one, { count: n });

  const [rebuilding, setRebuilding] = useState(false);
  const [lastResult, setLastResult] = useState<RebuildResult | null>(null);

  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

  // Couverture : combien de matchs terminés produisent réellement un rating.
  // Un match peut rester non noté SANS erreur (roster non rattaché à des
  // comptes) — c'est invisible partout ailleurs.
  const [coverage, setCoverage] = useState<RatingCoverage | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(true);

  const loadCoverage = useCallback(async () => {
    setLoadingCoverage(true);
    try {
      const data = await adminFetchJson<RatingCoverage>(
        '/api/admin/ratings/coverage'
      );
      setCoverage(data);
    } catch (err: unknown) {
      logger.error('load ratings coverage error', err);
      setCoverage(null);
    } finally {
      setLoadingCoverage(false);
    }
  }, [adminFetchJson]);

  const loadBoard = useCallback(async () => {
    setLoadingBoard(true);
    setBoardError(null);
    try {
      const data = await adminFetchJson<LeaderboardResponse>(
        '/api/players/leaderboard?limit=10'
      );
      setPlayers(data.players ?? []);
    } catch (err: unknown) {
      logger.error('load leaderboard error', err);
      setBoardError((err as Error)?.message || t.errorLoadBoard);
    } finally {
      setLoadingBoard(false);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    loadBoard();
    loadCoverage();
  }, [loadBoard, loadCoverage]);

  async function handleRebuild() {
    const ok = await confirm({
      title: t.confirmTitle,
      subtitle: t.confirmSubtitle,
      variant: 'warning',
      confirmLabel: t.confirmLabel,
    });
    if (!ok) return;

    setRebuilding(true);
    try {
      const result = await rebuild.mutateJson<RebuildResult>(
        '/api/admin/ratings/rebuild',
        { method: 'POST' }
      );
      setLastResult(result);
      addToast(
        format(t.toastRebuilt, {
          players: playerLabel(result.players),
          matches: matchLabel(result.matches),
        }),
        'success'
      );
      await Promise.all([loadBoard(), loadCoverage()]);
    } catch (err: unknown) {
      logger.error('rebuild ratings error', err);
      addToast((err as Error)?.message || t.errorRebuild, 'error');
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 space-y-6">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbCurrent },
            ]}
          />

          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
          </div>

          {/* --- Reconstruction --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t.rebuildHeading}</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">
              {t.rebuildDesc}
            </p>

            {lastResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
                {format(t.lastRebuild, {
                  players: playerLabel(lastResult.players),
                  matches: matchLabel(lastResult.matches),
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleRebuild}
              disabled={rebuilding}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {rebuilding ? t.rebuilding : t.rebuildBtn}
            </button>
          </section>

          {/* --- Couverture du rating --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t.coverageHeading}</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">
              {t.coverageDesc}
            </p>

            {loadingCoverage ? (
              <Skeleton className="h-16 w-full" rounded="rounded-xl" />
            ) : !coverage ? (
              <p className="text-sm text-neutral-500">
                {t.coverageUnavailable}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <span className="rounded-xl border border-neutral-700/50 bg-neutral-900/50 px-4 py-2 text-sm">
                    {format(t.coverageFinished, { count: coverage.finished })}
                  </span>
                  <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-200">
                    {format(t.coverageRated, { count: coverage.rated })}
                  </span>
                  <span
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      coverage.unrated > 0
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-neutral-700/50 bg-neutral-900/50 text-neutral-400'
                    }`}
                  >
                    {format(t.coverageUnrated, { count: coverage.unrated })}
                  </span>
                </div>

                {coverage.samples.length > 0 && (
                  <div className="overflow-x-auto border border-neutral-700/50 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-900/50 text-neutral-400">
                        <tr>
                          <Th className="text-left px-4 py-2.5">
                            {t.coverageColMatch}
                          </Th>
                          <Th className="text-left px-4 py-2.5">
                            {t.coverageColReason}
                          </Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-700/50">
                        {coverage.samples.map((s) => (
                          <tr
                            key={s.matchId}
                            className="hover:bg-neutral-700/20"
                          >
                            <td className="px-4 py-2.5">
                              {s.team1 ?? '—'}{' '}
                              <span className="text-neutral-500">vs</span>{' '}
                              {s.team2 ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-neutral-300">
                              {s.reason === 'no_participants'
                                ? t.coverageReasonNoParticipants
                                : s.reason === 'one_side_only'
                                  ? t.coverageReasonOneSide
                                  : t.coverageReasonUnknown}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {/* --- Top leaderboard --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t.boardHeading}</h2>
              <Link
                href="/admin/leagues"
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                {t.leaguesLink}
              </Link>
            </div>

            {loadingBoard ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-10 w-full"
                    rounded="rounded-lg"
                  />
                ))}
              </div>
            ) : boardError ? (
              <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-3">
                <span className="flex-1">{boardError}</span>
                <button
                  type="button"
                  onClick={() => loadBoard()}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
                >
                  {t.retry}
                </button>
              </div>
            ) : players.length === 0 ? (
              <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
            ) : (
              <div className="overflow-x-auto border border-neutral-700/50 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400">
                    <tr>
                      <Th className="text-left px-4 py-2.5 w-16">#</Th>
                      <Th className="text-left px-4 py-2.5">{t.colPlayer}</Th>
                      <Th className="text-right px-4 py-2.5">{t.colRating}</Th>
                      <Th className="text-right px-4 py-2.5">{t.colGames}</Th>
                      <Th className="text-right px-4 py-2.5">{t.colWinLoss}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {players.map((p) => (
                      <tr key={p.userId} className="hover:bg-neutral-700/20">
                        <td className="px-4 py-2.5 font-semibold">{p.rank}</td>
                        <td className="px-4 py-2.5">
                          {p.displayName ?? p.battleTag ?? p.userId}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {Math.round(p.rating)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-400">
                          {p.gamesPlayed}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-400">
                          {p.wins} / {p.losses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      {dialog}
    </>
  );
}

export default AdminRatingsPage;
