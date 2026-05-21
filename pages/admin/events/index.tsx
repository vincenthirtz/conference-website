// pages/admin/events/index.tsx
//
// Feature: Run-of-show — Lot 3 (admin UI).
// Listing des event_runs avec :
//   - bouton "Nouvel event" (modal de creation)
//   - tableau filtrable par status, tri par scheduled_at DESC
//   - actions par ligne : ouvrir Director, supprimer (avec confirmation)
//
// L'API ne renvoie pas le nombre de segments par run dans la liste (perf), donc
// on n'affiche pas la colonne "nb segments" pour ne pas faire N+1 GET. La page
// Director affiche le compteur a sa place.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import slugify from 'slugify';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { withStaffPage } from '@/utils/staff';
import {
  runStatusBadgeClasses,
  runStatusDotClasses,
  runStatusLabel,
} from '@/utils/eventSegmentLabels';
import type { StaffProps } from '@/types/admin';
import type { EventRun, EventRunStatus } from '@/types/events';

export const getServerSideProps = withStaffPage('manager');

type ListResponse = {
  items: EventRun[];
  total: number;
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function AdminEventsIndexPage(_props: StaffProps) {
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutate } = useIdempotentMutation({ autoRegenerateOnSuccess: true });
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [items, setItems] = useState<EventRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EventRunStatus | 'all'>(
    'all'
  );

  const [createOpen, setCreateOpen] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const json = await adminFetchJson<ListResponse>(
        `/api/admin/events?${params.toString()}`
      );
      setItems(json.items ?? []);
    } catch (err) {
      setErrorMsg((err as Error)?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, statusFilter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  async function handleDelete(run: EventRun) {
    const ok = await confirm({
      title: `Supprimer "${run.name}" ?`,
      subtitle:
        'Cette action supprimera definitivement le run et tous ses segments. Irreversible.',
      variant: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      const res = await mutate(`/api/admin/events/${run.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error ?? `Suppression echouee (${res.status}).`
        );
      }
      addToast('Event supprime.', 'success');
      setItems((prev) => prev.filter((r) => r.id !== run.id));
    } catch (err) {
      addToast((err as Error)?.message ?? 'Suppression echouee.', 'error');
    }
  }

  const counts = useMemo(() => {
    const c = { draft: 0, live: 0, done: 0 };
    for (const r of items) {
      if (r.status in c) c[r.status] += 1;
    }
    return c;
  }, [items]);

  return (
    <>
      <Head>
        <title>Admin – Run of show</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Run of show' },
            ]}
          />

          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Run of show
              </h1>
              <p className="text-neutral-400 text-sm mt-1">
                Planifie le deroule d&apos;une soiree : segments, matches,
                pauses, intros.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              data-testid="events-new"
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
            >
              + Nouvel event
            </button>
          </div>

          {/* Tabs status */}
          <div className="mb-6 flex flex-wrap gap-2">
            {(
              [
                { v: 'all', label: 'Tous', count: items.length },
                { v: 'draft', label: 'Brouillons', count: counts.draft },
                { v: 'live', label: 'En direct', count: counts.live },
                { v: 'done', label: 'Termines', count: counts.done },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setStatusFilter(t.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  statusFilter === t.v
                    ? 'bg-purple-600/30 border-purple-500/60 text-white'
                    : 'bg-neutral-800/50 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {t.label}
                {t.v !== 'all' && (
                  <span className="ml-2 text-xs text-neutral-400">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <AlertBanner
            message={errorMsg}
            variant="error"
            onDismiss={() => setErrorMsg(null)}
            className="mb-4"
          />

          {loading ? (
            <div className="py-16">
              <LoadingSpinner label="Chargement…" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30">
              <EmptyState
                title="Aucun event pour ce filtre."
                description="Cree ton premier run-of-show pour planifier les segments d'une soiree."
                action={
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium"
                  >
                    Nouvel event
                  </button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-neutral-700/50 bg-neutral-800/30">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-400 border-b border-neutral-700/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nom</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Date prevue</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      data-testid={`event-row-${r.id}`}
                      data-event-status={r.status}
                      data-event-slug={r.slug}
                      className="border-b border-neutral-700/30 last:border-0 hover:bg-neutral-800/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/events/${r.id}/director`}
                          className="font-medium text-white hover:text-purple-300"
                        >
                          {r.name}
                        </Link>
                        {r.description && (
                          <div className="text-xs text-neutral-400 truncate max-w-[300px]">
                            {r.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        <code className="text-xs">{r.slug}</code>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {formatDate(r.scheduled_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${runStatusBadgeClasses(
                            r.status
                          )}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${runStatusDotClasses(
                              r.status
                            )}`}
                          />
                          {runStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/events/${r.id}/director`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40"
                          >
                            Ouvrir le Director
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-700/50 hover:bg-red-700/40 text-neutral-300 hover:text-red-200 border border-neutral-600/40"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateRunModal
          onClose={() => setCreateOpen(false)}
          onCreated={(run) => {
            setCreateOpen(false);
            addToast(`Event "${run.name}" cree.`, 'success');
            router.push(`/admin/events/${run.id}/director`);
          }}
        />
      )}

      {dialog}
    </>
  );
}

/* -----------------------------------------------------------
 * Modal de creation
 * ---------------------------------------------------------*/

type CreateRunModalProps = {
  onClose: () => void;
  onCreated: (run: EventRun) => void;
};

function CreateRunModal({ onClose, onCreated }: CreateRunModalProps) {
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const ref = useFocusTrap<HTMLDivElement>();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name unless user edited it.
  useEffect(() => {
    if (slugDirty) return;
    if (!name.trim()) {
      setSlug('');
      return;
    }
    setSlug(slugify(name, { lower: true, strict: true }));
  }, [name, slugDirty]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }
    if (!scheduledAt) {
      setError('La date prevue est obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
      };
      const json = await mutateJson<EventRun>('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onCreated(json);
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Creation echouee.';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-run-title"
      onClick={onClose}
    >
      <div
        ref={ref}
        className="w-full max-w-lg bg-neutral-900 border border-neutral-700/60 rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="create-run-modal"
      >
        <div className="px-6 py-4 border-b border-neutral-700/60">
          <h2 id="create-run-title" className="text-lg font-semibold">
            Nouvel event
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Un event_run en mode draft. Tu pourras ajouter les segments ensuite.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              Nom <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="create-run-name"
              placeholder="Conference du 21 mai"
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Slug</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugDirty(true);
              }}
              data-testid="create-run-slug"
              placeholder="conference-21-mai"
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Auto-genere depuis le nom. Editable si tu veux personnaliser.
            </p>
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              Date prevue <span className="text-red-400">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              data-testid="create-run-scheduled"
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="create-run-description"
              placeholder="Note optionnelle visible uniquement par le staff."
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="create-run-submit"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Creation…' : 'Creer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminEventsIndexPage;
