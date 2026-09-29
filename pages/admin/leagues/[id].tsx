import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
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
import nsAdminLeagueDetail from '@/lib/i18n/locales/admin-fr/adminLeagueDetail';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  LEAGUE_CARD,
  LEAGUE_CARD_TITLE,
  LEAGUE_ERROR,
  LEAGUE_INPUT,
  LEAGUE_LABEL,
  LeagueStandingsTable,
  LeagueStatusChip,
  LinkedTournamentsList,
} from '@/features/admin/leagues/ui/LeagueParts';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type Dict = typeof nsAdminLeagueDetail.fr;

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

const inputCls = LEAGUE_INPUT;
const labelCls = LEAGUE_LABEL;

/** Convertit une points_table objet en paires triées par rang numérique. */
function tableToRows(
  table: Record<string, number>
): { rank: string; points: number }[] {
  return Object.entries(table)
    .map(([rank, points]) => ({ rank, points }))
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}

function AdminLeagueDetailPage(_props: StaffProps) {
  const t = useAdminT(nsAdminLeagueDetail);
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

  const WRAP = 'min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]';

  if (loading) {
    return (
      <div className={WRAP}>
        <div className="max-w-5xl space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" rounded="rounded-2xl" />
          <Skeleton className="h-40 w-full" rounded="rounded-2xl" />
        </div>
      </div>
    );
  }

  if (errorMsg && !league) {
    return (
      <div className={WRAP}>
        <AdminBreadcrumbs />
        <div className={`flex items-center gap-3 ${LEAGUE_ERROR}`}>
          <span className="flex-1">{errorMsg}</span>
          <AdminButton variant="danger" size="xs" onClick={() => load()}>
            {t.retry}
          </AdminButton>
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

      <div className={WRAP}>
        <AdminBreadcrumbs />
        <div className="max-w-5xl space-y-6">
          <EntityHeader
            title={league?.name}
            meta={league?.slug ? `/${league.slug}` : undefined}
            status={
              league && (
                <LeagueStatusChip
                  status={league.status}
                  label={
                    statusOptions.find((o) => o.value === league.status)
                      ?.label ?? league.status
                  }
                />
              )
            }
            actions={
              <AdminButton variant="danger" size="sm" onClick={handleDelete}>
                {t.deleteLeague}
              </AdminButton>
            }
          />

          {errorMsg && <div className={LEAGUE_ERROR}>{errorMsg}</div>}

          {/* --- Édition --- */}
          <form onSubmit={handleSave} className={LEAGUE_CARD}>
            <h2 className={LEAGUE_CARD_TITLE}>{t.infoTitle}</h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                  <p className="text-sm text-[var(--t3,#a39ba6)]">
                    {t.noPointsRows}
                  </p>
                )}
                {pointsRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={format(t.rankAria, { n: i + 1 })}
                      className={`${inputCls} !w-24 font-mono`}
                      value={row.rank}
                      onChange={(e) =>
                        updatePointRow(i, 'rank', e.target.value)
                      }
                      placeholder={t.rankPlaceholder}
                    />
                    <span className="text-[var(--t4,#807984)]">→</span>
                    <input
                      type="number"
                      aria-label={format(t.rankPointsAria, { n: i + 1 })}
                      className={`${inputCls} !w-32`}
                      value={row.points}
                      onChange={(e) =>
                        updatePointRow(i, 'points', e.target.value)
                      }
                      placeholder={t.pointsPlaceholder}
                    />
                    <AdminButton size="xs" onClick={() => removePointRow(i)}>
                      {t.removeRow}
                    </AdminButton>
                  </div>
                ))}
              </div>
              <AdminButton size="xs" className="mt-2" onClick={addPointRow}>
                {t.addRow}
              </AdminButton>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              {t.publicLabel}
            </label>

            <div className="pt-2">
              <AdminButton variant="primary" type="submit" disabled={saving}>
                {saving ? t.saving : t.save}
              </AdminButton>
            </div>
          </form>

          {/* --- Tournois liés --- */}
          <section className={LEAGUE_CARD}>
            <h2 className={LEAGUE_CARD_TITLE}>{t.linkedTournamentsTitle}</h2>

            <form
              onSubmit={handleLink}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[220px] flex-1">
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
              <AdminButton
                variant="secondary"
                type="submit"
                disabled={!selectedTournament || linking}
              >
                {linking ? t.linking : t.link}
              </AdminButton>
            </form>

            {tournaments.length === 0 ? (
              <EmptyState
                title={t.emptyTournamentsTitle}
                description={t.emptyTournamentsDescription}
              />
            ) : (
              <LinkedTournamentsList
                tournaments={tournaments}
                onUnlink={handleUnlink}
                t={t}
              />
            )}
          </section>

          {/* --- Standings --- */}
          <section className={LEAGUE_CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={LEAGUE_CARD_TITLE}>{t.standingsTitle}</h2>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={handleRecompute}
                disabled={recomputing}
              >
                {recomputing ? t.recomputing : t.recompute}
              </AdminButton>
            </div>

            {standings.length === 0 ? (
              <EmptyState
                title={t.emptyStandingsTitle}
                description={t.emptyStandingsDescription}
              />
            ) : (
              <LeagueStandingsTable standings={standings} t={t} />
            )}
          </section>

          <div>
            <Link
              href="/admin/leagues"
              className="text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
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
