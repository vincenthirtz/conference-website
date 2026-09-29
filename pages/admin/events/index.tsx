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

import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import Link from 'next/link';
import { useRouter } from 'next/router';
import slugify from 'slugify';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { withStaffPage } from '@/utils/staff';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { runStatusLabel } from '@/utils/eventSegmentLabels';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import type { StaffProps } from '@/types/admin';
import type { EventRun, EventRunStatus } from '@/types/events';
import nsAdminEventsList from '@/lib/i18n/locales/admin-fr/adminEventsList';

export const getServerSideProps = withStaffPage({
  permission: 'manage_broadcast',
});

// Pastille d'état « Le Ruban » : seul le run EN DIRECT porte la lueur.
const RUN_STATUS_TONE: Record<EventRunStatus, ChipTone> = {
  draft: 'neutral',
  live: 'live',
  done: 'ok',
};

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';

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
  const t = useAdminT(nsAdminEventsList);
  const router = useRouter();
  const { mutate } = useIdempotentMutation({ autoRegenerateOnSuccess: true });
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<EventRunStatus | 'all'>(
    'all'
  );

  const [createOpen, setCreateOpen] = useState(false);

  // TOUS les runs, filtrés À L'ÉCRAN. Le filtre partait au serveur, et les
  // compteurs d'onglets se calculaient sur la liste déjà filtrée : choisir
  // « Brouillons » affichait Live 0 et Terminés 0. `limit: 100` réplique la
  // requête d'origine ; aucun total serveur n'est affiché.
  const {
    data: items,
    loading,
    error: fetchError,
    mutate: mutateItems,
  } = useAdminResource<EventRun, ListResponse>('/api/admin/events', {
    limit: 100,
    includeTotal: false,
    select: (res) => res.items ?? [],
  });

  // La bannière d'erreur reste manuellement masquable (onDismiss) : on superpose
  // un flag de rejet à l'erreur du hook, réinitialisé à chaque nouvelle erreur.
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [fetchError]);
  const errorMsg = errorDismissed ? null : fetchError;

  async function handleDelete(run: EventRun) {
    const ok = await confirm({
      title: format(t.confirmDeleteTitle, { name: run.name }),
      subtitle: t.confirmDeleteSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmDeleteLabel,
    });
    if (!ok) return;
    try {
      const res = await mutate(`/api/admin/events/${run.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error ?? format(t.deleteFailedStatus, { status: res.status })
        );
      }
      addToast(t.eventDeleted, 'success');
      mutateItems((prev) => prev.filter((r) => r.id !== run.id));
    } catch (err) {
      addToast((err as Error)?.message ?? t.deleteFailed, 'error');
    }
  }

  const visible = useMemo(
    () =>
      statusFilter === 'all'
        ? items
        : items.filter((r) => r.status === statusFilter),
    [items, statusFilter]
  );

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
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbRunOfShow },
          ]}
        />
        <DiffusionTabsNav active="runofshow" />

        <AdminPageHeader
          title={t.heading}
          subtitle={t.subtitle}
          actions={
            <AdminButton
              variant="primary"
              onClick={() => setCreateOpen(true)}
              data-testid="events-new"
            >
              {t.newEvent}
            </AdminButton>
          }
        />

        {/* Tabs status */}
        <div className="mb-6 flex flex-wrap gap-2">
          {(
            [
              { v: 'all', label: t.tabAll, count: items.length },
              { v: 'draft', label: t.tabDraft, count: counts.draft },
              { v: 'live', label: t.tabLive, count: counts.live },
              { v: 'done', label: t.tabDone, count: counts.done },
            ] as const
          ).map((tab) => (
            <button
              key={tab.v}
              type="button"
              onClick={() => setStatusFilter(tab.v)}
              aria-pressed={statusFilter === tab.v}
              className={`inline-flex h-[38px] items-center rounded-[var(--r-ctrl,4px)] border px-[13px] font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] transition-colors [font-stretch:75%] ${
                statusFilter === tab.v
                  ? 'border-[var(--or,#b467d1)] text-[var(--or-200,#eec4ff)]'
                  : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
              }`}
            >
              {tab.label}
              {tab.v !== 'all' && (
                <span className="ml-2 text-[var(--t4,#807984)]" data-numeric>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <AlertBanner
          message={errorMsg}
          variant="error"
          onDismiss={() => setErrorDismissed(true)}
          className="mb-4"
        />

        {loading ? (
          <div className="py-16">
            <LoadingSpinner label={t.loading} />
          </div>
        ) : items.length > 0 && visible.length === 0 ? (
          // Des runs existent, aucun sous CE filtre : pas d'invitation à
          // « créer le premier run ».
          <div className={CARD}>
            <EmptyState
              title={t.emptyFilteredTitle}
              description={t.emptyFilteredDescription}
            />
          </div>
        ) : items.length === 0 ? (
          <div className={CARD}>
            <EmptyState
              title={t.emptyTitle}
              description={t.emptyDescription}
              action={
                <AdminButton size="sm" onClick={() => setCreateOpen(true)}>
                  {t.emptyAction}
                </AdminButton>
              }
            />
          </div>
        ) : (
          <div className={`overflow-x-auto ${CARD}`}>
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line,rgba(194,196,201,.12))] text-left text-xs uppercase tracking-wide text-[var(--t3,#a39ba6)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colName}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colSlug}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colScheduled}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t.colStatus}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">
                    {t.colActions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    data-testid={`event-row-${r.id}`}
                    data-event-status={r.status}
                    data-event-slug={r.slug}
                    className="border-b border-[var(--line,rgba(194,196,201,.12))] last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/events/${r.id}/director`}
                        className="font-medium text-[var(--t1,#f4edf7)] hover:text-[var(--or-200,#eec4ff)]"
                      >
                        {r.name}
                      </Link>
                      {r.description && (
                        <div className="max-w-[300px] truncate text-xs text-[var(--t3,#a39ba6)]">
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--t3,#a39ba6)]">
                      <code className="text-xs">{r.slug}</code>
                    </td>
                    <td
                      className="px-4 py-3 text-[var(--t2,#c7bfca)]"
                      data-numeric
                    >
                      {formatDate(r.scheduled_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={RUN_STATUS_TONE[r.status] ?? 'neutral'}>
                        {runStatusLabel(r.status)}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <AdminButtonLink
                          href={`/admin/events/${r.id}/director`}
                          variant="secondary"
                          size="xs"
                        >
                          {t.openDirector}
                        </AdminButtonLink>
                        {/* Pas de suppression d'un run EN DIRECT : l'antenne le
                              suit (l'API refuse aussi, 409). */}
                        <AdminButton
                          variant="danger"
                          size="xs"
                          onClick={() => handleDelete(r)}
                          disabled={r.status === 'live'}
                          title={
                            r.status === 'live'
                              ? t.deleteLiveBlocked
                              : undefined
                          }
                        >
                          {t.delete}
                        </AdminButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateRunModal
          onClose={() => setCreateOpen(false)}
          onCreated={(run) => {
            setCreateOpen(false);
            addToast(
              format(t.eventCreatedToast, { name: run.name }),
              'success'
            );
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
  const t = useAdminT(nsAdminEventsList);
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
      setError(t.nameRequired);
      return;
    }
    if (!scheduledAt) {
      setError(t.scheduledRequired);
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
      const msg = (err as Error)?.message ?? t.createFailed;
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
        className="w-full max-w-lg rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="create-run-modal"
      >
        <div className="px-6 py-4 border-b border-neutral-700/60">
          <h2 id="create-run-title" className="text-lg font-semibold">
            {t.modalTitle}
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">{t.modalSubtitle}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.nameLabel} <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="create-run-name"
              placeholder={t.namePlaceholder}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.slugLabel}
            </label>
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
            <p className="text-xs text-neutral-500 mt-1">{t.slugHint}</p>
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.scheduledLabel} <span className="text-red-400">*</span>
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
              {t.descriptionLabel}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="create-run-description"
              placeholder={t.descriptionPlaceholder}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <AdminButton size="sm" onClick={onClose} disabled={submitting}>
              {t.cancel}
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={submitting}
              data-testid="create-run-submit"
            >
              {submitting ? t.submitting : t.submit}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminEventsIndexPage;
