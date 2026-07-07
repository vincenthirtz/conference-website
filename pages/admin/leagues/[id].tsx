import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';
import type {
  League,
  LeagueStandingsResponse,
  LeagueStandingPublic,
  LeagueStatus,
  LeagueTournamentRef,
} from '@/types/leagues';

import { logger } from '../../../utils/logger';

export const getServerSideProps = withStaffPage('manager');

type Dict = ReturnType<typeof useAdminT<'adminLeagueDetail'>>;

function getStatusOptions(t: Dict): { value: LeagueStatus; label: string }[] {
  return [
    { value: 'draft', label: t.statusDraft },
    { value: 'active', label: t.statusActive },
    { value: 'finished', label: t.statusFinished },
    { value: 'archived', label: t.statusArchived },
  ];
}

type TournamentOption = {
  id: string;
  name: string;
  slug: string | null;
};

type AdminTournamentsResponse = {
  tournaments: TournamentOption[];
  total: number | null;
};

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm text-neutral-400 mb-1';

/** Convertit une points_table objet en paires triées par rang numérique. */
function tableToRows(
  table: Record<string, number>
): { rank: string; points: number }[] {
  return Object.entries(table)
    .map(([rank, points]) => ({ rank, points }))
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}

function AdminLeagueDetailPage(_props: StaffProps) {
  const t = useAdminT('adminLeagueDetail');
  const statusOptions = getStatusOptions(t);
  const router = useRouter();
  const leagueId = typeof router.query.id === 'string' ? router.query.id : '';

  const { adminFetchJson } = useAdminFetch();
  const { mutate, mutateJson } = useIdempotentMutation();
  const recompute = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);

  // Champs éditables.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [game, setGame] = useState('');
  const [status, setStatus] = useState<LeagueStatus>('draft');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [pointsRows, setPointsRows] = useState<
    { rank: string; points: number }[]
  >([]);
  const [saving, setSaving] = useState(false);

  // Tournois liés / standings (lus via l'endpoint public par slug).
  const [tournaments, setTournaments] = useState<LeagueTournamentRef[]>([]);
  const [standings, setStandings] = useState<LeagueStandingPublic[]>([]);
  const [recomputing, setRecomputing] = useState(false);

  // Sélecteur d'ajout de tournoi.
  const [tournamentOptions, setTournamentOptions] = useState<
    TournamentOption[]
  >([]);
  const [selectedTournament, setSelectedTournament] = useState('');
  const [linkWeight, setLinkWeight] = useState('1');
  const [linking, setLinking] = useState(false);

  const hydrateFromLeague = useCallback((l: League) => {
    setLeague(l);
    setName(l.name);
    setSlug(l.slug);
    setDescription(l.description ?? '');
    setGame(l.game ?? '');
    setStatus(l.status);
    setStartDate(l.start_date ? l.start_date.slice(0, 10) : '');
    setEndDate(l.end_date ? l.end_date.slice(0, 10) : '');
    setIsPublic(l.is_public);
    setPointsRows(tableToRows(l.points_table ?? {}));
  }, []);

  // Charge les standings + tournois liés via l'endpoint ADMIN (scopé tenant+id,
  // visible même pour une league draft/privée — contrairement à l'endpoint
  // public par slug).
  const loadDetail = useCallback(async () => {
    if (!leagueId) return;
    try {
      const detail = await adminFetchJson<LeagueStandingsResponse>(
        `/api/admin/leagues/${leagueId}/standings`
      );
      setTournaments(detail.tournaments ?? []);
      setStandings(detail.standings ?? []);
    } catch (err: unknown) {
      logger.error('load league standings error', err);
      setTournaments([]);
      setStandings([]);
    }
  }, [leagueId, adminFetchJson]);

  const load = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const l = await adminFetchJson<League>(`/api/admin/leagues/${leagueId}`);
      hydrateFromLeague(l);
      await loadDetail();
    } catch (err: unknown) {
      logger.error('load league error', err);
      setErrorMsg((err as Error)?.message || t.errLoad);
    } finally {
      setLoading(false);
    }
  }, [leagueId, adminFetchJson, hydrateFromLeague, loadDetail, t.errLoad]);

  useEffect(() => {
    load();
  }, [load]);

  // Liste des tournois du tenant pour le sélecteur.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminFetchJson<AdminTournamentsResponse>(
          '/api/admin/tournaments?limit=200'
        );
        if (!cancelled) setTournamentOptions(data.tournaments ?? []);
      } catch (err: unknown) {
        logger.error('load tournament options error', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  const linkedIds = useMemo(
    () => new Set(tournaments.map((tm) => tm.id)),
    [tournaments]
  );
  const availableOptions = useMemo(
    () => tournamentOptions.filter((o) => !linkedIds.has(o.id)),
    [tournamentOptions, linkedIds]
  );

  /* ---------------- Points table editing ---------------- */

  function updatePointRow(
    index: number,
    field: 'rank' | 'points',
    value: string
  ) {
    setPointsRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: field === 'points' ? Number(value) || 0 : value,
            }
          : row
      )
    );
  }

  function addPointRow() {
    const nextRank = String(pointsRows.length + 1);
    setPointsRows((prev) => [...prev, { rank: nextRank, points: 0 }]);
  }

  function removePointRow(index: number) {
    setPointsRows((prev) => prev.filter((_, i) => i !== index));
  }

  function buildPointsTable(): Record<string, number> | null {
    const table: Record<string, number> = {};
    for (const row of pointsRows) {
      const rank = row.rank.trim();
      if (!rank) continue;
      if (!/^\d+$/.test(rank)) return null;
      table[rank] = row.points;
    }
    return table;
  }

  /* ---------------- Save ---------------- */

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!league) return;
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg(t.errNameRequired);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setErrorMsg(t.errSlugFormat);
      return;
    }
    const pointsTable = buildPointsTable();
    if (pointsTable === null) {
      setErrorMsg(t.errPointsRanks);
      return;
    }

    setSaving(true);
    try {
      const updated = await mutateJson<League>(
        `/api/admin/leagues/${league.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            slug,
            description: description.trim() || null,
            game: game.trim() || null,
            status,
            start_date: startDate || null,
            end_date: endDate || null,
            points_table: pointsTable,
            is_public: isPublic,
          }),
        }
      );
      hydrateFromLeague(updated);
      addToast(t.toastSaved, 'success');
      await loadDetail();
    } catch (err: unknown) {
      const payload = (err as { payload?: { code?: string } })?.payload;
      if (payload?.code === 'SLUG_CONFLICT') {
        setErrorMsg(t.errSlugConflict);
      } else {
        setErrorMsg((err as Error)?.message || t.errSave);
      }
      logger.error('save league error', err);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Delete league ---------------- */

  async function handleDelete() {
    if (!league) return;
    const ok = await confirm({
      title: format(t.deleteConfirmTitle, { name: league.name }),
      subtitle: t.deleteConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.deleteConfirmLabel,
    });
    if (!ok) return;
    try {
      const res = await mutate(`/api/admin/leagues/${league.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(format(t.errDeleteStatus, { status: res.status }));
      }
      addToast(t.toastDeleted, 'success');
      router.push('/admin/leagues');
    } catch (err: unknown) {
      logger.error('delete league error', err);
      addToast((err as Error)?.message || t.errDelete, 'error');
    }
  }

  /* ---------------- Link / unlink tournament ---------------- */

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!league || !selectedTournament) return;
    const weight = Number(linkWeight) || 1;
    setLinking(true);
    try {
      await mutateJson(`/api/admin/leagues/${league.id}/tournaments`, {
        method: 'POST',
        body: JSON.stringify({
          tournament_id: selectedTournament,
          weight,
        }),
      });
      addToast(t.toastLinked, 'success');
      setSelectedTournament('');
      setLinkWeight('1');
      await loadDetail();
    } catch (err: unknown) {
      const payload = (err as { payload?: { code?: string } })?.payload;
      if (payload?.code === 'TOURNAMENT_NOT_FOUND') {
        addToast(t.errTournamentNotFound, 'error');
      } else {
        addToast((err as Error)?.message || t.errLink, 'error');
      }
      logger.error('link tournament error', err);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(tm: LeagueTournamentRef) {
    if (!league) return;
    const ok = await confirm({
      title: format(t.unlinkConfirmTitle, { name: tm.name ?? tm.id }),
      subtitle: t.unlinkConfirmSubtitle,
      variant: 'warning',
      confirmLabel: t.unlinkConfirmLabel,
    });
    if (!ok) return;
    try {
      const res = await mutate(
        `/api/admin/leagues/${league.id}/tournaments/${tm.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(format(t.errUnlinkStatus, { status: res.status }));
      }
      addToast(t.toastUnlinked, 'success');
      await loadDetail();
    } catch (err: unknown) {
      logger.error('unlink tournament error', err);
      addToast((err as Error)?.message || t.errUnlink, 'error');
    }
  }

  /* ---------------- Recompute standings ---------------- */

  async function handleRecompute() {
    if (!league) return;
    setRecomputing(true);
    try {
      const result = await recompute.mutateJson<{ standings_count: number }>(
        `/api/admin/leagues/${league.id}/recompute`,
        { method: 'POST' }
      );
      addToast(
        format(
          result.standings_count > 1
            ? t.toastRecomputed_other
            : t.toastRecomputed_one,
          { count: result.standings_count }
        ),
        'success'
      );
      await loadDetail();
    } catch (err: unknown) {
      logger.error('recompute standings error', err);
      addToast((err as Error)?.message || t.errRecompute, 'error');
    } finally {
      setRecomputing(false);
    }
  }

  /* ---------------- Render ---------------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" rounded="rounded-2xl" />
          <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
        </div>
      </div>
    );
  }

  if (errorMsg && !league) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbLeagues, href: '/admin/leagues' },
              { label: t.breadcrumbError },
            ]}
          />
          <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-3">
            <span className="flex-1">{errorMsg}</span>
            <button
              type="button"
              onClick={() => load()}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
            >
              {t.retry}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>
          {format(t.pageTitle, { name: league?.name ?? t.leagueFallback })}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 space-y-6">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbLeagues, href: '/admin/leagues' },
              { label: league?.name ?? t.leagueFallback },
            ]}
          />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {league?.name}
            </h1>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2.5 rounded-xl bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 text-sm font-medium text-red-200 transition-colors"
            >
              {t.deleteLeague}
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {/* --- Édition --- */}
          <form
            onSubmit={handleSave}
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold">{t.infoTitle}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls} htmlFor="d-name">
                  {t.nameLabel}
                </label>
                <input
                  id="d-name"
                  type="text"
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="d-slug">
                  {t.slugLabel}
                </label>
                <input
                  id="d-slug"
                  type="text"
                  className={`${inputCls} font-mono`}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="d-desc">
                {t.descriptionLabel}
              </label>
              <textarea
                id="d-desc"
                className={`${inputCls} min-h-[80px]`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelCls} htmlFor="d-game">
                  {t.gameLabel}
                </label>
                <input
                  id="d-game"
                  type="text"
                  className={inputCls}
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="d-status">
                  {t.statusLabel}
                </label>
                <select
                  id="d-status"
                  className={inputCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeagueStatus)}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="d-start">
                  {t.startDateLabel}
                </label>
                <input
                  id="d-start"
                  type="date"
                  className={inputCls}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="d-end">
                  {t.endDateLabel}
                </label>
                <input
                  id="d-end"
                  type="date"
                  className={inputCls}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Éditeur de barème */}
            <div>
              <label className={labelCls}>{t.pointsLabel}</label>
              <div className="space-y-2">
                {pointsRows.length === 0 && (
                  <p className="text-sm text-neutral-500">{t.noPointsRows}</p>
                )}
                {pointsRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={format(t.rankAria, { n: i + 1 })}
                      className={`${inputCls} w-24 font-mono`}
                      value={row.rank}
                      onChange={(e) =>
                        updatePointRow(i, 'rank', e.target.value)
                      }
                      placeholder={t.rankPlaceholder}
                    />
                    <span className="text-neutral-500">→</span>
                    <input
                      type="number"
                      aria-label={format(t.rankPointsAria, { n: i + 1 })}
                      className={`${inputCls} w-32`}
                      value={row.points}
                      onChange={(e) =>
                        updatePointRow(i, 'points', e.target.value)
                      }
                      placeholder={t.pointsPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => removePointRow(i)}
                      className="px-3 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-xs transition-colors"
                    >
                      {t.removeRow}
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPointRow}
                className="mt-2 px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-xs font-medium transition-colors"
              >
                {t.addRow}
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              {t.publicLabel}
            </label>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </form>

          {/* --- Tournois liés --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              {t.linkedTournamentsTitle}
            </h2>

            <form
              onSubmit={handleLink}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[220px]">
                <label className={labelCls} htmlFor="link-tournament">
                  {t.tournamentLabel}
                </label>
                <select
                  id="link-tournament"
                  className={inputCls}
                  value={selectedTournament}
                  onChange={(e) => setSelectedTournament(e.target.value)}
                >
                  <option value="">{t.selectTournament}</option>
                  {availableOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.slug ? ` (/${o.slug})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className={labelCls} htmlFor="link-weight">
                  {t.weightLabel}
                </label>
                <input
                  id="link-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  className={inputCls}
                  value={linkWeight}
                  onChange={(e) => setLinkWeight(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={!selectedTournament || linking}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {linking ? t.linking : t.link}
              </button>
            </form>

            {tournaments.length === 0 ? (
              <EmptyState
                title={t.emptyTournamentsTitle}
                description={t.emptyTournamentsDescription}
              />
            ) : (
              <div className="divide-y divide-neutral-700/50 border border-neutral-700/50 rounded-xl overflow-hidden">
                {tournaments.map((tm) => (
                  <div
                    key={tm.id}
                    className="flex items-center gap-3 p-3 hover:bg-neutral-700/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate">
                        {tm.name ?? tm.id}
                      </span>
                      {tm.slug && (
                        <span className="ml-2 font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                          /{tm.slug}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-neutral-400">
                      {format(t.weightPrefix, { weight: tm.weight })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUnlink(tm)}
                      className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 text-xs font-medium text-red-200 transition-colors"
                    >
                      {t.unlink}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* --- Standings --- */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t.standingsTitle}</h2>
              <button
                type="button"
                onClick={handleRecompute}
                disabled={recomputing}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
                {recomputing ? t.recomputing : t.recompute}
              </button>
            </div>

            {standings.length === 0 ? (
              <EmptyState
                title={t.emptyStandingsTitle}
                description={t.emptyStandingsDescription}
              />
            ) : (
              <div className="overflow-x-auto border border-neutral-700/50 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400">
                    <tr>
                      <th className="text-left px-4 py-2.5 w-16">{t.thRank}</th>
                      <th className="text-left px-4 py-2.5">{t.thTeam}</th>
                      <th className="text-right px-4 py-2.5">{t.thPoints}</th>
                      <th className="text-right px-4 py-2.5">
                        {t.thTournaments}
                      </th>
                      <th className="text-right px-4 py-2.5">{t.thBestRank}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {standings.map((s) => (
                      <tr key={s.teamId} className="hover:bg-neutral-700/20">
                        <td className="px-4 py-2.5 font-semibold">{s.rank}</td>
                        <td className="px-4 py-2.5">
                          {s.teamName ?? s.teamId}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {s.points}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-400">
                          {s.tournamentsCounted}
                        </td>
                        <td className="px-4 py-2.5 text-right text-neutral-400">
                          {s.bestRank ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div>
            <Link
              href="/admin/leagues"
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              {t.backToLeagues}
            </Link>
          </div>
        </div>
      </div>
      {dialog}
    </>
  );
}

export default AdminLeagueDetailPage;
