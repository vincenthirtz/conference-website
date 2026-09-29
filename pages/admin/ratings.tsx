import { useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Breadcrumb from '@/components/admin/Breadcrumb';
import Th from '@/components/admin/Th';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';
import type { StaffProps } from '@/types/admin';
import type { LeaderboardPlayer } from '@/types/rating';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  ratingsPaths,
  type RatingsRebuildResult,
} from '@/features/admin/ratings/client';
import {
  useLeaderboardTop,
  useRatingCoverage,
  useRefreshRatings,
} from '@/features/admin/ratings/hooks/useRatings';

import { logger } from '../../utils/logger';
import nsAdminRatings from '@/lib/i18n/locales/admin-fr/adminRatings';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import StatTile from '@/features/admin/_shared/ui/StatTile';

// Planche « Le Ruban », archétype Liste : cartes et titres de section.
const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const TABLE_WRAP =
  'overflow-x-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type RebuildResult = RatingsRebuildResult;

function AdminRatingsPage(_props: StaffProps) {
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

  const board = useLeaderboardTop();
  const players: LeaderboardPlayer[] = board.data?.players ?? [];
  // Squelette aussi pendant « Réessayer » (comme l'ancien chargement manuel).
  const loadingBoard = board.isPending || (board.isError && board.isFetching);
  const boardError = board.isError
    ? (board.error as Error)?.message || t.errorLoadBoard
    : null;

  // Couverture : combien de matchs terminés produisent réellement un rating.
  // Un match peut rester non noté SANS erreur (roster non rattaché à des
  // comptes) — c'est invisible partout ailleurs.
  const coverageQuery = useRatingCoverage();
  const coverage = coverageQuery.data ?? null;
  const loadingCoverage = coverageQuery.isPending;
  const refreshRatings = useRefreshRatings();

  useEffect(() => {
    if (board.error) logger.error('load leaderboard error', board.error);
  }, [board.error]);
  useEffect(() => {
    if (coverageQuery.error)
      logger.error('load ratings coverage error', coverageQuery.error);
  }, [coverageQuery.error]);

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
        ratingsPaths.rebuild,
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
      await refreshRatings();
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbCurrent },
          ]}
        />

        <AdminPageHeader
          title={t.heading}
          subtitle={t.subtitle}
          actions={
            <AdminButtonLink href="/admin/leagues">
              {t.leaguesLink}
            </AdminButtonLink>
          }
        />

        <div className="space-y-6">
          {/* --- Reconstruction --- */}
          <section className={`${CARD} space-y-4`}>
            <h2 className={SECTION_TITLE}>{t.rebuildHeading}</h2>
            <p className="text-sm leading-relaxed text-[var(--t3,#a39ba6)]">
              {t.rebuildDesc}
            </p>

            {lastResult && (
              <div className="rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] px-4 py-3 text-sm text-[var(--lf-200,#b3e7a3)]">
                {format(t.lastRebuild, {
                  players: playerLabel(lastResult.players),
                  matches: matchLabel(lastResult.matches),
                })}
              </div>
            )}

            {/* Pas de création sur cet écran : le recalcul est une action
                d'institution (secondary), confirmée avant de partir. */}
            <AdminButton
              variant="secondary"
              onClick={handleRebuild}
              disabled={rebuilding}
            >
              <svg
                className="h-4 w-4"
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
            </AdminButton>
          </section>

          {/* --- Couverture du rating --- */}
          <section className={`${CARD} space-y-4`}>
            <h2 className={SECTION_TITLE}>{t.coverageHeading}</h2>
            <p className="text-sm leading-relaxed text-[var(--t3,#a39ba6)]">
              {t.coverageDesc}
            </p>

            {loadingCoverage ? (
              <Skeleton className="h-16 w-full" rounded="rounded-xl" />
            ) : !coverage ? (
              <p className="text-sm text-[var(--t4,#807984)]">
                {t.coverageUnavailable}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatTile
                    label={t.coverageFinished}
                    value={coverage.finished}
                  />
                  <StatTile
                    label={t.coverageRated}
                    value={coverage.rated}
                    tone="ok"
                  />
                  <StatTile
                    label={t.coverageUnrated}
                    value={coverage.unrated}
                    tone={coverage.unrated > 0 ? 'warn' : 'neutral'}
                  />
                </div>

                {coverage.samples.length > 0 && (
                  <div className={TABLE_WRAP}>
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--s2,#1d1520)] text-[var(--t3,#a39ba6)]">
                        <tr>
                          <Th className="px-4 py-2.5 text-left">
                            {t.coverageColMatch}
                          </Th>
                          <Th className="px-4 py-2.5 text-left">
                            {t.coverageColReason}
                          </Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
                        {coverage.samples.map((s) => (
                          <tr
                            key={s.matchId}
                            className="hover:bg-[var(--s2,#1d1520)]"
                          >
                            <td className="px-4 py-2.5">
                              {s.team1 ?? '—'}{' '}
                              <span className="text-[var(--t4,#807984)]">
                                vs
                              </span>{' '}
                              {s.team2 ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--t2,#c7bfca)]">
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
          <section className={`${CARD} space-y-4`}>
            <h2 className={SECTION_TITLE}>{t.boardHeading}</h2>

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
              <div className="flex items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
                <span className="flex-1">{boardError}</span>
                <AdminButton
                  size="xs"
                  variant="danger"
                  onClick={() => void board.refetch()}
                >
                  {t.retry}
                </AdminButton>
              </div>
            ) : players.length === 0 ? (
              <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
            ) : (
              <div className={TABLE_WRAP}>
                <table className="w-full text-sm">
                  <thead className="bg-[var(--s2,#1d1520)] text-[var(--t3,#a39ba6)]">
                    <tr>
                      <Th className="w-16 px-4 py-2.5 text-left">#</Th>
                      <Th className="px-4 py-2.5 text-left">{t.colPlayer}</Th>
                      <Th className="px-4 py-2.5 text-right">{t.colRating}</Th>
                      <Th className="px-4 py-2.5 text-right">{t.colGames}</Th>
                      <Th className="px-4 py-2.5 text-right">{t.colWinLoss}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
                    {players.map((p) => (
                      <tr
                        key={p.userId}
                        className="hover:bg-[var(--s2,#1d1520)]"
                      >
                        <td className="px-4 py-2.5 font-semibold" data-numeric>
                          {p.rank}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.displayName ?? p.battleTag ?? p.userId}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right font-medium"
                          data-numeric
                        >
                          {Math.round(p.rating)}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right text-[var(--t3,#a39ba6)]"
                          data-numeric
                        >
                          {p.gamesPlayed}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right text-[var(--t3,#a39ba6)]"
                          data-numeric
                        >
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

export default withAdminQuery(AdminRatingsPage);
