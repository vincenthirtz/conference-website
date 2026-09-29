import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  useCreateLeague,
  useDeleteLeagueFromList,
  useLeaguesList,
} from '@/features/admin/leagues/hooks/useLeagues';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/admin/Skeleton';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import type { StaffProps } from '@/types/admin';
import type { League, LeagueStatus } from '@/types/leagues';

import { logger } from '../../../utils/logger';
import nsAdminLeaguesList from '@/lib/i18n/locales/admin-fr/adminLeaguesList';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type Dict = typeof nsAdminLeaguesList.fr;

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

function statusTone(status: LeagueStatus): ChipTone {
  switch (status) {
    case 'active':
      return 'ok';
    case 'finished':
      return 'brand';
    default:
      return 'neutral';
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
  const t = useAdminT(nsAdminLeaguesList);
  const create = useCreateLeague();
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
  const submitting = create.isPending;
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

    try {
      const league = await create.mutateAsync({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        game: game.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        points_table: pointsTable,
        is_public: isPublic,
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
    }
  }

  const inputCls =
    'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
  const labelCls = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
    >
      <h2 className="font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]">
        {t.formTitle}
      </h2>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
        >
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
        <p className="mt-1 text-xs text-[var(--t4,#807984)]">{t.pointsHelp}</p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--or,#b467d1)]"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        {t.publicLabel}
      </label>

      <div className="flex gap-3 pt-2">
        <AdminButton type="submit" variant="primary" disabled={submitting}>
          {submitting ? t.creating : t.submit}
        </AdminButton>
        <AdminButton onClick={onCancel}>{t.cancel}</AdminButton>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------
 * Page liste
 * ---------------------------------------------------------------- */

function AdminLeaguesPage(_props: StaffProps) {
  const t = useAdminT(nsAdminLeaguesList);
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Liste complète des leagues du tenant : l'endpoint ne pagine pas.
  const list = useLeaguesList();
  const leagues: League[] = list.data?.leagues ?? [];
  // Chaque (re)chargement repasse par l'état de chargement, comme avant.
  const loading = list.isFetching;
  const errorMsg = list.isError && !list.isFetching ? list.error.message : null;
  const load = () => void list.refetch();
  const removeLeague = useDeleteLeagueFromList();

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
      // Retire la ligne du cache quand la réponse est un succès.
      const res = await removeLeague.mutateAsync(league.id);
      if (!res.ok && res.status !== 204) {
        throw new Error(format(t.errDeleteStatus, { status: res.status }));
      }
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbLeagues },
          ]}
        />

        {/* Formulaire ouvert : son bouton « Créer » devient l'action principale. */}
        <AdminPageHeader
          title={t.heading}
          subtitle={
            loading
              ? t.loading
              : format(
                  leagues.length > 1 ? t.leagueCount_other : t.leagueCount_one,
                  { count: leagues.length }
                )
          }
          actions={
            <>
              <AdminButtonLink href="/admin/ratings">
                {t.ratingsLink}
              </AdminButtonLink>
              <AdminButton
                variant={showCreate ? 'ghost' : 'primary'}
                onClick={() => setShowCreate((s) => !s)}
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t.newLeague}
              </AdminButton>
            </>
          }
        />

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
          <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
          >
            <span className="flex-1">{errorMsg}</span>
            <AdminButton size="xs" variant="danger" onClick={() => load()}>
              {t.retry}
            </AdminButton>
          </div>
        )}

        <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
          {loading ? (
            <div className="space-y-3 p-4">
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
                <AdminButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowCreate(true)}
                >
                  {t.newLeague}
                </AdminButton>
              }
            />
          ) : (
            <div className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
              {leagues.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--s2,#1d1520)] sm:flex-row sm:items-center sm:gap-4"
                >
                  <Link
                    href={`/admin/leagues/${l.id}`}
                    className="group min-w-0 flex-1"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-[var(--t1,#f4edf7)] transition-colors group-hover:text-[var(--or-200,#eec4ff)]">
                        {l.name}
                      </h3>
                      <Chip tone={statusTone(l.status)}>
                        {statusLabel(l.status, t)}
                      </Chip>
                      {l.is_public && <Chip tone="ok">{t.publicBadge}</Chip>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--t3,#a39ba6)] sm:gap-3">
                      <span className="rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs">
                        /{l.slug}
                      </span>
                      {l.game && <span>{l.game}</span>}
                      <span className="hidden sm:inline">•</span>
                      <span data-numeric>
                        {formatDate(l.start_date)} → {formatDate(l.end_date)}
                      </span>
                    </div>
                  </Link>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <AdminButtonLink size="sm" href={`/admin/leagues/${l.id}`}>
                      {t.edit}
                    </AdminButtonLink>
                    <AdminButton
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(l)}
                      disabled={deletingId === l.id}
                    >
                      {deletingId === l.id ? '…' : t.delete}
                    </AdminButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {dialog}
    </>
  );
}

export default withAdminQuery(AdminLeaguesPage);
