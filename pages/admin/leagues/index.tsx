import { useCallback, useEffect, useState } from 'react';
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
import type { StaffProps } from '@/types/admin';
import type { League, LeagueStatus, LeaguesListResponse } from '@/types/leagues';

import { logger } from '../../../utils/logger';

export const getServerSideProps = withStaffPage('manager');

/* ----------------------------------------------------------------
 * Statut → libellé / couleur
 * ---------------------------------------------------------------- */

function statusLabel(status: LeagueStatus): string {
  switch (status) {
    case 'draft':
      return 'Brouillon';
    case 'active':
      return 'Active';
    case 'finished':
      return 'Terminée';
    case 'archived':
      return 'Archivée';
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
      setError('Le nom est requis.');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError(
        'Le slug doit être en minuscules, chiffres et tirets uniquement.'
      );
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
        setError(
          'Le barème de points doit être un objet JSON { rang: points }.'
        );
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
      addToast('Ligue créée.', 'success');
      onCreated(league);
    } catch (err: unknown) {
      const payload = (err as { payload?: { code?: string } })?.payload;
      if (payload?.code === 'SLUG_CONFLICT') {
        setError('Ce slug est déjà utilisé par une autre ligue.');
      } else {
        setError((err as Error)?.message || 'Erreur lors de la création.');
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
      <h2 className="text-lg font-semibold">Nouvelle ligue</h2>

      {error && (
        <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="league-name">
            Nom *
          </label>
          <input
            id="league-name"
            type="text"
            className={inputCls}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Saison Été 2026"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="league-slug">
            Slug *
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
            placeholder="saison-ete-2026"
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="league-desc">
          Description
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
            Jeu
          </label>
          <input
            id="league-game"
            type="text"
            className={inputCls}
            value={game}
            onChange={(e) => setGame(e.target.value)}
            placeholder="Overwatch 2"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="league-start">
            Date de début
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
            Date de fin
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
          Barème de points (JSON rang → points)
        </label>
        <textarea
          id="league-points"
          className={`${inputCls} font-mono text-sm min-h-[110px]`}
          value={pointsJson}
          onChange={(e) => setPointsJson(e.target.value)}
        />
        <p className="text-xs text-neutral-500 mt-1">
          Laisser tel quel pour le barème par défaut.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Ligue publique (visible sur le site)
      </label>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? 'Création…' : 'Créer la ligue'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------
 * Page liste
 * ---------------------------------------------------------------- */

function AdminLeaguesPage(_props: StaffProps) {
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutate } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data =
        await adminFetchJson<LeaguesListResponse>('/api/admin/leagues');
      setLeagues(data.leagues ?? []);
    } catch (err: unknown) {
      logger.error('load leagues error', err);
      setErrorMsg((err as Error)?.message || 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(league: League) {
    const ok = await confirm({
      title: `Supprimer « ${league.name} » ?`,
      subtitle:
        'La ligue et ses standings seront supprimés. Cette action est irréversible.',
      variant: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;

    setDeletingId(league.id);
    try {
      const res = await mutate(`/api/admin/leagues/${league.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Suppression échouée (${res.status})`);
      }
      setLeagues((prev) => prev.filter((l) => l.id !== league.id));
      addToast('Ligue supprimée.', 'success');
    } catch (err: unknown) {
      logger.error('delete league error', err);
      addToast(
        (err as Error)?.message || 'Erreur lors de la suppression.',
        'error'
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Ligues</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Ligues' },
            ]}
          />

          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Ligues &amp; saisons
              </h1>
              <p className="text-neutral-400 text-sm mt-1">
                {loading
                  ? 'Chargement…'
                  : `${leagues.length} ligue${leagues.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin/ratings"
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
              >
                Ratings
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
                Nouvelle ligue
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
                Réessayer
              </button>
            </div>
          )}

          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />
                ))}
              </div>
            ) : leagues.length === 0 ? (
              <EmptyState
                title="Aucune ligue"
                description="Crée une première ligue/saison pour agréger les classements de plusieurs tournois."
                action={
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    Nouvelle ligue
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
                          {statusLabel(l.status)}
                        </span>
                        {l.is_public && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                            Public
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
                        Éditer
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(l)}
                        disabled={deletingId === l.id}
                        className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 text-xs font-medium text-red-200 transition-colors disabled:opacity-50"
                      >
                        {deletingId === l.id ? '…' : 'Supprimer'}
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
