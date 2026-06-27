// pages/admin/users/[userId]/player-view.tsx
//
// Admin "Vue player" — READ-ONLY inspection of a given user's PLAYER area.
// NO impersonation, NO actions: staff browse a snapshot of the user's
// profile / team / matches / notifications / demandes, organised as tabs that
// mirror the player navigation. Data comes from
//   GET /api/admin/users/[userId]/player-view
// gated at `manager` (mirrors the endpoint's withStaffRoute('manager')).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import type { AdminPlayerViewPayload } from '@/pages/api/admin/users/[userId]/player-view';

import { logger } from '../../../../utils/logger';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage('manager');

type TabKey = 'profil' | 'equipe' | 'matchs' | 'notifications' | 'demandes';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'profil', label: 'Profil' },
  { key: 'equipe', label: 'Équipe' },
  { key: 'matchs', label: 'Mes matchs' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'demandes', label: 'Demandes' },
];

type PlayerMatch = AdminPlayerViewPayload['matches'][number];
type Demande = AdminPlayerViewPayload['demandes'][number];

/* ----------------------------------------------------------------------- */
/* Helpers (pure presentation, no actions)                                  */
/* ----------------------------------------------------------------------- */

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function formatScheduled(iso: string | null): string {
  if (!iso) return 'Date à venir';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return iso;
  }
}

function initials(name: string | null, email: string | null): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function matchLabel(match: PlayerMatch): string | null {
  if (match.format) return match.format.toUpperCase();
  if (match.bestOf) return `BO${match.bestOf}`;
  return null;
}

function isUpcoming(match: PlayerMatch): boolean {
  if (match.status === 'pending' || match.status === 'ongoing') return true;
  if (match.scheduledAt) {
    return new Date(match.scheduledAt).getTime() > Date.now();
  }
  return false;
}

function scheduledTime(match: PlayerMatch): number {
  return match.scheduledAt ? new Date(match.scheduledAt).getTime() : 0;
}

const DEMANDE_TYPE_LABELS: Record<string, string> = {
  captain_request: 'Demande de capitaine',
  join: 'Rejoindre une équipe',
  leave: "Quitter l'équipe",
  transfer: 'Transfert',
  scrim: 'Scrim',
  other: 'Demande',
};

const DEMANDE_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
  cancelled: 'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30',
};

const DEMANDE_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};

/* ----------------------------------------------------------------------- */
/* Small presentational atoms                                               */
/* ----------------------------------------------------------------------- */

function ResultBadge({ result }: { result: PlayerMatch['result'] }) {
  if (result === 'win') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
        Victoire
      </span>
    );
  }
  if (result === 'loss') {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
        Défaite
      </span>
    );
  }
  if (result === 'draw') {
    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-200">
        Nul
      </span>
    );
  }
  return null;
}

/** Read-only check-in status rendered as plain text (NO button). */
function CheckinStatus({ match }: { match: PlayerMatch }) {
  const checkin = match.checkin;
  if (!checkin) return <span className="text-neutral-500">—</span>;
  if (checkin.alreadyCheckedIn) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-300">
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
        Check-in validé
      </span>
    );
  }
  if (checkin.isOpen) {
    return <span className="text-amber-300">Fenêtre de check-in ouverte</span>;
  }
  if (checkin.isPassed) {
    return <span className="text-neutral-500">Check-in fermé (manqué)</span>;
  }
  return <span className="text-neutral-400">Check-in pas encore ouvert</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-8 text-center text-neutral-400">
      {children}
    </div>
  );
}

function MatchRow({ match }: { match: PlayerMatch }) {
  const upcoming = isUpcoming(match);
  const label = matchLabel(match);
  const isLive = match.status === 'ongoing';

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-emerald-200/70">
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
            En direct
          </span>
        )}
        {match.tournament && <span>{match.tournament.name}</span>}
        {match.roundName && <span>{match.roundName}</span>}
        {label && <span className="tabular-nums">{label}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg md:text-xl font-bold text-white leading-tight">
            <span className="text-white/50">vs</span>{' '}
            {match.opponent?.name ?? 'Adversaire à définir'}
          </h3>
          <p className="text-sm text-neutral-300 mt-1 capitalize">
            {formatScheduled(match.scheduledAt)}
          </p>
        </div>

        {!upcoming && match.score && (
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-2xl font-bold text-white">
              {match.score.mine ?? '–'}{' '}
              <span className="text-white/40">–</span>{' '}
              {match.score.opponent ?? '–'}
            </span>
            <ResultBadge result={match.result} />
          </div>
        )}
      </div>

      {upcoming && (
        <div className="mt-3 text-sm">
          <span className="text-neutral-500">Check-in : </span>
          <CheckinStatus match={match} />
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight && value > 0
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : 'border-neutral-700/50 bg-neutral-800/40'
      }`}
    >
      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-sm text-neutral-400 mt-1">{label}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                      */
/* ----------------------------------------------------------------------- */

function PlayerViewPage({ staff: _staff }: { staff: StaffShape }) {
  const router = useRouter();
  const rawUserId = router.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  const { adminFetchJson } = useAdminFetch();
  const [data, setData] = useState<AdminPlayerViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>('profil');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const json = await adminFetchJson<AdminPlayerViewPayload>(
        `/api/admin/users/${encodeURIComponent(userId)}/player-view`
      );
      setData(json);
    } catch (err) {
      logger.error('[admin/player-view] load error:', err);
      if (err instanceof AdminFetchError && err.status === 404) {
        setNotFound(true);
      } else {
        setError('Erreur lors du chargement de la vue player.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, adminFetchJson]);

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [router.isReady, load]);

  const headerName =
    data?.user.displayName || data?.user.email || 'Utilisateur';

  const { upcoming, past } = useMemo(() => {
    const matches = data?.matches ?? [];
    return {
      upcoming: matches
        .filter(isUpcoming)
        .sort((a, b) => scheduledTime(a) - scheduledTime(b)),
      past: matches
        .filter((m) => !isUpcoming(m))
        .sort((a, b) => scheduledTime(b) - scheduledTime(a)),
    };
  }, [data]);

  return (
    <>
      <Head>
        <title>Vue player – {headerName}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Back link */}
          <Link
            href="/admin/users/manage"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors mb-4"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour à la gestion des inscrits
          </Link>

          {/* Read-only banner */}
          <div
            role="status"
            className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-amber-100">
                  Vue lecture seule — espace joueur de {headerName}
                </h1>
                <p className="text-sm text-amber-100/80 mt-1">
                  Inspection staff strictement informative. Aucune action
                  n&apos;est effectuée au nom de l&apos;utilisateur (pas
                  d&apos;usurpation, pas de modification).
                </p>
              </div>
            </div>
          </div>

          {/* States */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 rounded-xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
            </div>
          ) : notFound ? (
            <EmptyState>
              <p className="text-lg font-semibold text-white">
                Utilisateur introuvable
              </p>
              <p className="mt-2 text-sm">
                Ce compte n&apos;existe pas ou a été supprimé.
              </p>
            </EmptyState>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Tabs */}
              <div
                role="tablist"
                aria-label="Sections de l'espace joueur"
                className="flex flex-wrap gap-2 mb-6 border-b border-neutral-700/50 pb-3"
              >
                {TABS.map((t) => {
                  const active = tab === t.key;
                  const badge =
                    t.key === 'notifications' && data.notifications.total > 0
                      ? data.notifications.total
                      : null;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.key)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60'
                      }`}
                    >
                      {t.label}
                      {badge !== null && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-neutral-900">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Profil */}
              {tab === 'profil' && (
                <section
                  role="tabpanel"
                  className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6"
                >
                  <div className="flex items-center gap-4">
                    {data.user.avatarUrl ? (
                      <Image
                        src={data.user.avatarUrl}
                        alt=""
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-2xl object-cover border border-neutral-700"
                        unoptimized
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-200">
                        {initials(data.user.displayName, data.user.email)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-white truncate">
                        {data.user.displayName || 'Sans nom'}
                      </h2>
                      {data.user.battleTag && (
                        <p className="text-sm text-emerald-300 font-mono">
                          {data.user.battleTag}
                        </p>
                      )}
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Email
                      </dt>
                      <dd className="text-sm text-white break-all">
                        {data.user.email || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Rôle
                      </dt>
                      <dd className="text-sm text-white">
                        {data.user.role || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        BattleTag
                      </dt>
                      <dd className="text-sm text-white font-mono">
                        {data.user.battleTag || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Inscrit le
                      </dt>
                      <dd className="text-sm text-white">
                        {formatDate(data.user.createdAt)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Identifiant
                      </dt>
                      <dd className="text-xs text-neutral-400 font-mono break-all">
                        {data.user.id}
                      </dd>
                    </div>
                  </dl>
                </section>
              )}

              {/* Équipe */}
              {tab === 'equipe' && (
                <section role="tabpanel">
                  {!data.team ? (
                    <EmptyState>
                      <p className="text-lg font-semibold text-white">
                        Aucune équipe
                      </p>
                      <p className="mt-2 text-sm">
                        Cet utilisateur n&apos;appartient à aucune équipe.
                      </p>
                    </EmptyState>
                  ) : (
                    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
                      <div className="flex items-center gap-4">
                        {data.team.logoUrl ? (
                          <Image
                            src={data.team.logoUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="w-14 h-14 rounded-xl object-cover border border-neutral-700"
                            unoptimized
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-neutral-700/50 border border-neutral-700 flex items-center justify-center text-neutral-300 font-bold">
                            {initials(data.team.name, null)}
                          </div>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-white">
                            {data.team.name}
                          </h2>
                          <div className="mt-1 flex items-center gap-2">
                            {data.team.role && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-200 border border-emerald-500/30">
                                {data.team.role === 'captain'
                                  ? 'Capitaine'
                                  : 'Membre'}
                              </span>
                            )}
                            {data.team.isSubstitute && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-200 border border-amber-500/30">
                                Remplaçant·e
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                          Roster ({data.team.members.length})
                        </h3>
                        {data.team.members.length === 0 ? (
                          <p className="text-sm text-neutral-500">
                            Aucun membre.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-neutral-700/50">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-700/50">
                                  <th className="px-4 py-2 font-medium">
                                    Nom affiché
                                  </th>
                                  <th className="px-4 py-2 font-medium">
                                    BattleTag
                                  </th>
                                  <th className="px-4 py-2 font-medium">Rôle</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-700/40">
                                {data.team.members.map((m) => (
                                  <tr key={m.id}>
                                    <td className="px-4 py-2.5 text-white">
                                      {m.displayName || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-emerald-300">
                                      {m.battleTag || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-300">
                                      {m.role || 'Membre'}
                                      {m.isSubstitute && (
                                        <span className="ml-2 text-xs text-amber-300">
                                          (remplaçant·e)
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Mes matchs */}
              {tab === 'matchs' && (
                <section role="tabpanel" className="space-y-10">
                  {upcoming.length === 0 && past.length === 0 ? (
                    <EmptyState>
                      <p className="text-lg font-semibold text-white">
                        Aucun match
                      </p>
                      <p className="mt-2 text-sm">
                        Aucun match programmé ou joué pour cet utilisateur.
                      </p>
                    </EmptyState>
                  ) : (
                    <>
                      <div>
                        <h2 className="text-lg font-semibold mb-4 text-white">
                          À venir
                          <span className="ml-2 text-sm font-normal text-neutral-500">
                            ({upcoming.length})
                          </span>
                        </h2>
                        {upcoming.length === 0 ? (
                          <EmptyState>Aucun match à venir.</EmptyState>
                        ) : (
                          <div className="space-y-4">
                            {upcoming.map((m) => (
                              <MatchRow key={m.id} match={m} />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h2 className="text-lg font-semibold mb-4 text-white">
                          Résultats
                          <span className="ml-2 text-sm font-normal text-neutral-500">
                            ({past.length})
                          </span>
                        </h2>
                        {past.length === 0 ? (
                          <EmptyState>Aucun résultat.</EmptyState>
                        ) : (
                          <div className="space-y-4">
                            {past.map((m) => (
                              <MatchRow key={m.id} match={m} />
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* Notifications */}
              {tab === 'notifications' && (
                <section
                  role="tabpanel"
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <StatTile
                    label="Messages non lus"
                    value={data.notifications.unreadMessages}
                    highlight
                  />
                  <StatTile
                    label="Scrims en attente"
                    value={data.notifications.pendingScrims}
                    highlight
                  />
                  <StatTile
                    label="Demandes de join"
                    value={data.notifications.pendingJoinRequests}
                    highlight
                  />
                  <StatTile
                    label="Check-in en attente"
                    value={data.notifications.checkinPending}
                    highlight
                  />
                  <StatTile
                    label="Total"
                    value={data.notifications.total}
                  />
                </section>
              )}

              {/* Demandes */}
              {tab === 'demandes' && (
                <section role="tabpanel">
                  {data.demandes.length === 0 ? (
                    <EmptyState>
                      <p className="text-lg font-semibold text-white">
                        Aucune demande
                      </p>
                      <p className="mt-2 text-sm">
                        Cet utilisateur n&apos;a soumis aucune demande.
                      </p>
                    </EmptyState>
                  ) : (
                    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 divide-y divide-neutral-700/40">
                      {data.demandes.map((d: Demande) => {
                        const teamName = d.team?.name || null;
                        return (
                          <div key={d.id} className="p-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="min-w-0">
                                <span className="font-medium text-white">
                                  {DEMANDE_TYPE_LABELS[d.type] || d.type}
                                </span>
                                {teamName && (
                                  <span className="text-neutral-400 ml-2">
                                    ({teamName})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    DEMANDE_STATUS_STYLES[d.status] ||
                                    'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30'
                                  }`}
                                >
                                  {DEMANDE_STATUS_LABELS[d.status] || d.status}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatDate(d.created_at)}
                                </span>
                              </div>
                            </div>
                            {d.comment && (
                              <p className="mt-1.5 text-xs text-neutral-400 italic">
                                &ldquo;{d.comment}&rdquo;
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default PlayerViewPage;
