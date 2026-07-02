import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';
import type { StaffProps } from '@/types/admin';
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
} from '@/types/rating';

import { logger } from '../../utils/logger';

export const getServerSideProps = withStaffPage('manager');

type RebuildResult = { players: number; matches: number };

function AdminRatingsPage(_props: StaffProps) {
  const { adminFetchJson } = useAdminFetch();
  const rebuild = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [rebuilding, setRebuilding] = useState(false);
  const [lastResult, setLastResult] = useState<RebuildResult | null>(null);

  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

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
      setBoardError(
        (err as Error)?.message || 'Erreur lors du chargement du classement.'
      );
    } finally {
      setLoadingBoard(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  async function handleRebuild() {
    const ok = await confirm({
      title: 'Reconstruire tous les ratings ?',
      subtitle:
        'Opération lourde : recalcule tout l’historique des ratings depuis le premier match. Peut prendre du temps.',
      variant: 'warning',
      confirmLabel: 'Reconstruire',
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
        `Ratings reconstruits : ${result.players} joueur${
          result.players > 1 ? 's' : ''
        }, ${result.matches} match${result.matches > 1 ? 's' : ''}.`,
        'success'
      );
      await loadBoard();
    } catch (err: unknown) {
      logger.error('rebuild ratings error', err);
      addToast(
        (err as Error)?.message || 'Erreur lors de la reconstruction.',
        'error'
      );
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Ratings</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 space-y-6">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Ratings' },
            ]}
          />

          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Ratings joueurs
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Système de classement Glicko-2 des joueurs.
            </p>
          </div>

          {/* --- Reconstruction --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Reconstruction complète</h2>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Recalcule l’intégralité des ratings Glicko-2 en rejouant tous les
              matchs terminés dans l’ordre chronologique. Les rosters actuels
              des équipes servent de base de backfill pour attribuer les matchs
              historiques aux joueurs. Utile après un correctif de données ou un
              changement de l’algorithme. C’est une opération lourde : à lancer
              hors période de pic.
            </p>

            {lastResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
                Dernière reconstruction : {lastResult.players} joueur
                {lastResult.players > 1 ? 's' : ''} sur {lastResult.matches}{' '}
                match{lastResult.matches > 1 ? 's' : ''}.
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
              {rebuilding ? 'Reconstruction…' : 'Reconstruire les ratings'}
            </button>
          </section>

          {/* --- Top leaderboard --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Top classement</h2>
              <Link
                href="/admin/leagues"
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Ligues →
              </Link>
            </div>

            {loadingBoard ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" rounded="rounded-lg" />
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
                  Réessayer
                </button>
              </div>
            ) : players.length === 0 ? (
              <EmptyState
                title="Aucun joueur noté"
                description="Lance une reconstruction après avoir enregistré des résultats de matchs."
              />
            ) : (
              <div className="overflow-x-auto border border-neutral-700/50 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400">
                    <tr>
                      <th className="text-left px-4 py-2.5 w-16">#</th>
                      <th className="text-left px-4 py-2.5">Joueur</th>
                      <th className="text-right px-4 py-2.5">Rating</th>
                      <th className="text-right px-4 py-2.5">Parties</th>
                      <th className="text-right px-4 py-2.5">V / D</th>
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
