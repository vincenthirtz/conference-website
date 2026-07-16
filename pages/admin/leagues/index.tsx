import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminResource } from '@/hooks/useAdminResource';
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
  LeagueStatus,
  LeaguesListResponse,
} from '@/types/leagues';

import { logger } from '../../../utils/logger';

export const getServerSideProps = withStaffPage('admin');

type Dict = ReturnType<typeof useAdminT<'adminLeaguesList'>>;

/* ----------------------------------------------------------------
 * Statut → libellé / couleur
 * ---------------------------------------------------------------- */

function statusLabel(status: LeagueStatus, t: Dict): string {
  switch (status) {
    case 'draft':
      return t.statusDraft;
    case 'active':
      return t.statusActive;
    case 'finished':
      return t.statusFinished;
    case 'archived':
      return t.statusArchived;
    default:
      return status;
  }
}

function statusColor(status: LeagueStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-neutral-600 text-neutral-100';
    case 'active':
      return 'bg-emerald-600 text-white';
    case 'finished':
      return 'bg-purple-600 text-white';
    case 'archived':
      return 'bg-neutral-700 text-neutral-300';
    default:
      return 'bg-neutral-700 text-neutral-200';
  }
}

function formatDate(d: string | null): string {
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

/** Slugifie un nom : minuscules, tirets, alphanumérique uniquement. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const DEFAULT_POINTS_TABLE: Record<string, number> = {
  '1': 100,
  '2': 75,
  '3': 50,
  '4': 25,
};

/* ----------------------------------------------------------------
 * Formulaire de création
 * ---------------------------------------------------------------- */

type CreateFormProps = {
  onCreated: (league: League) => void;
  onCancel: () => void;
};

function CreateLeagueForm({ onCreated, onCancel }: CreateFormProps) {
  const t = useAdminT('adminLeaguesList');
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [game, setGame] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [pointsJson, setPointsJson] = useState(
    JSON.stringify(DEFAULT_POINTS_TABLE, null, 2)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t.errNameRequired);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError(t.errSlugFormat);
      return;
    }

    let pointsTable: Record<string, number> | undefined;
    const trimmedPoints = pointsJson.trim();
    if (trimmedPoints) {
      try {
        const parsed = JSON.parse(trimmedPoints);
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed) ||
          Object.values(parsed).some((v) => typeof v !== 'number')
        ) {
          throw new Error('shape');
        }
        pointsTable = parsed as Record<string, number>;
      } catch {
        setError(t.errPointsShape);
        return;
      }
    }

    setSubmitting(true);
    try {
      const league = await mutateJson<League>('/api/admin/leagues', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim() || undefined,
          game: game.trim() || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          points_table: pointsTable,
          is_public: isPublic,
        }),
      });
      addToast(t.toastCreated, 'success');
      onCreated(league);
    } catch (err: unknown) {
      const payload = (err as { payload?: { code?: string } })?.payload;
      if (payload?.code === 'SLUG_CONFLICT') {
        setError(t.errSlugConflict);
      } else {
        setError((err as Error)?.message || t.errCreate);
      }
      logger.error('create league error', err);
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm text-neutral-400 mb-1';

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6 space-y-4"
    >
      <h2 className="text-lg font-semibold">{t.formTitle}</h2>

      {error && (
        <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="league-name">
            {t.nameLabel}
          </label>
          <input
            id="league-name"
            type="text"
            className={inputCls}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t.namePlaceholder}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="league-slug">
            {t.slugLabel}
          </label>
          <input
            id="league-slug"
            type="text"
            className={`${inputCls} font-mono`}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder={t.slugPlaceholder}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="league-desc">
          {t.descriptionLabel}
        </label>
        <textarea
          id="league-desc"
          className={`${inputCls} min-h-[80px]`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls} htmlFor="league-game">
            {t.gameLabel}
          </label>
          <input
            id="league-game"
            type="text"
            className={inputCls}
            value={game}
            onChange={(e) => setGame(e.target.value)}
            placeholder={t.gamePlaceholder}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="league-start">
            {t.startDateLabel}
          </label>
          <input
            id="league-start"
            type="date"
            className={inputCls}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="league-end">
            {t.endDateLabel}
          </label>
          <input
            id="league-end"
            type="date"
            className={inputCls}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="league-points">
          {t.pointsLabel}
        </label>
        <textarea
          id="league-points"
          className={`${inputCls} font-mono text-sm min-h-[110px]`}
          value={pointsJson}
          onChange={(e) => setPointsJson(e.target.value)}
        />
        <p className="text-xs text-neutral-500 mt-1">{t.pointsHelp}</p>
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

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? t.creating : t.submit}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------
 * Page liste
 * ---------------------------------------------------------------- */

function AdminLeaguesPage(_props: StaffProps) {
  const t = useAdminT('adminLeaguesList');
  const router = useRouter();
  const { mutate } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Liste complète des leagues du tenant : l'endpoint ne pagine pas
  // (aucun total ni filtre serveur), d'où `includeTotal: false`. Le patch
  // local `mutateLeagues` sert à la suppression optimiste.
  const {
    data: leagues,
    loading,
    error: errorMsg,
    refresh: load,
    mutate: mutateLeagues,
  } = useAdminResource<League, LeaguesListResponse>('/api/admin/leagues', {
    includeTotal: false,
    select: (res) => res.leagues ?? [],
  });

  async function handleDelete(league: League) {
    const ok = await confirm({
      title: format(t.deleteConfirmTitle, { name: league.name }),
      subtitle: t.deleteConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.deleteConfirmLabel,
    });
    if (!ok) return;

    setDeletingId(league.id);
    try {
      const res = await mutate(`/api/admin/leagues/${league.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(format(t.errDeleteStatus, { status: res.status }));
      }
      mutateLeagues((prev) => prev.filter((l) => l.id !== league.id));
      addToast(t.toastDeleted, 'success');
    } catch (err: unknown) {
      logger.error('delete league error', err);
      addToast((err as Error)?.message || t.errDelete, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbLeagues },
            ]}
          />

          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {t.heading}
              </h1>
              <p className="text-neutral-400 text-sm mt-1">
                {loading
                  ? t.loading
                  : format(
                      leagues.length > 1
                        ? t.leagueCount_other
                        : t.leagueCount_one,
                      { count: leagues.length }
                    )}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin/ratings"
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
              >
                {t.ratingsLink}
              </Link>
              <button
                type="button"
                onClick={() => setShowCreate((s) => !s)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t.newLeague}
              </button>
            </div>
          </div>

          {showCreate && (
            <CreateLeagueForm
              onCancel={() => setShowCreate(false)}
              onCreated={(league) => {
                setShowCreate(false);
                router.push(`/admin/leagues/${league.id}`);
              }}
            />
          )}

          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-3">
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => load()}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                {t.retry}
              </button>
            </div>
          )}

          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-16 w-full"
                    rounded="rounded-xl"
                  />
                ))}
              </div>
            ) : leagues.length === 0 ? (
              <EmptyState
                title={t.emptyTitle}
                description={t.emptyDescription}
                action={
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    {t.newLeague}
                  </button>
                }
              />
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {leagues.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-neutral-700/30 transition-colors"
                  >
                    <Link
                      href={`/admin/leagues/${l.id}`}
                      className="flex-1 min-w-0 group"
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                          {l.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                            l.status
                          )}`}
                        >
                          {statusLabel(l.status, t)}
                        </span>
                        {l.is_public && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                            {t.publicBadge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 text-sm text-neutral-400 flex-wrap">
                        <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                          /{l.slug}
                        </span>
                        {l.game && <span>{l.game}</span>}
                        <span className="hidden sm:inline">•</span>
                        <span>
                          {formatDate(l.start_date)} → {formatDate(l.end_date)}
                        </span>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/admin/leagues/${l.id}`}
                        className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-xs font-medium transition-colors"
                      >
                        {t.edit}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(l)}
                        disabled={deletingId === l.id}
                        className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 text-xs font-medium text-red-200 transition-colors disabled:opacity-50"
                      >
                        {deletingId === l.id ? '…' : t.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {dialog}
    </>
  );
}

export default AdminLeaguesPage;
