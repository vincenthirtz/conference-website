// pages/admin/webhooks.tsx
//
// Page /admin/webhooks — gestion des abonnements webhook sortants du tenant.
//
// - Formulaire de création : URL + cases à cocher des events (liste blanche
//   WEBHOOK_EVENT_TYPES renvoyée par l'API) + description. Le secret de
//   signature est affiché UNE SEULE FOIS (ApiTokenRevealModal réutilisé).
// - Liste : URL, events, statut (actif / désactivé), échecs consécutifs,
//   dernière livraison. Actions : activer/désactiver, supprimer, voir les
//   dernières livraisons.
//
// Auth : minRole 'admin' (withStaffPage). Le backend (withStaffRoute) est la
// vraie barrière.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/admin/EmptyState';
import ApiTokenRevealModal from '@/components/admin/ApiTokenRevealModal';
import { logger } from '@/utils/logger';
import nsAdminWebhooks from '@/lib/i18n/locales/admin-fr/adminWebhooks';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

// Planche « Le Ruban », archétype Liste : classes partagées par les deux cartes.
const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LABEL = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

type Subscription = {
  id: string;
  url: string;
  event_types: string[];
  description: string | null;
  enabled: boolean;
  consecutive_failures: number;
  disabled_at: string | null;
  last_delivery_at: string | null;
  last_error: string | null;
  created_at: string;
};

type Delivery = {
  id: string;
  event_name: string;
  status: string;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
};

type ListResponse = {
  subscriptions: Subscription[];
  availableEvents: string[];
};
type CreateResponse = { secret: string; subscription: Subscription };

function formatDate(s: string | null, fallback: string): string {
  if (!s) return fallback;
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

function AdminWebhooksPage() {
  const t = useAdminT(nsAdminWebhooks);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchSubs = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await adminFetchJson<ListResponse>('/api/admin/webhooks');
      setSubs(res.subscriptions ?? []);
      setAvailable(res.availableEvents ?? []);
    } catch (err) {
      logger.error('[admin/webhooks] load error', err);
      setSubs([]);
      setLoadError((err as Error)?.message || t.errorLoad);
    }
  }, [adminFetchJson, t.errorLoad]);

  useEffect(() => {
    fetchSubs();
  }, [fetchSubs]);

  const toggleEvent = useCallback((ev: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  }, []);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (creating) return;
      setFormError(null);
      if (!url.trim()) {
        setFormError(t.errorUrlRequired);
        return;
      }
      if (selected.size === 0) {
        setFormError(t.errorEventsRequired);
        return;
      }
      setCreating(true);
      try {
        const res = await mutateJson<CreateResponse>('/api/admin/webhooks', {
          method: 'POST',
          body: JSON.stringify({
            url: url.trim(),
            event_types: [...selected],
            ...(description.trim() ? { description: description.trim() } : {}),
          }),
        });
        addToast(t.toastCreated, 'success');
        setUrl('');
        setDescription('');
        setSelected(new Set());
        setRevealed(res.secret);
        await fetchSubs();
      } catch (err) {
        logger.error('[admin/webhooks] create error', err);
        const msg = (err as Error)?.message || t.errorCreate;
        setFormError(msg);
        addToast(msg, 'error');
      } finally {
        setCreating(false);
      }
    },
    [
      creating,
      url,
      description,
      selected,
      mutateJson,
      addToast,
      fetchSubs,
      t.errorUrlRequired,
      t.errorEventsRequired,
      t.toastCreated,
      t.errorCreate,
    ]
  );

  const handleToggle = useCallback(
    async (sub: Subscription) => {
      setBusyId(sub.id);
      try {
        await mutateJson(`/api/admin/webhooks/${sub.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !sub.enabled }),
        });
        addToast(sub.enabled ? t.toastDisabled : t.toastEnabled, 'success');
        await fetchSubs();
      } catch (err) {
        addToast((err as Error)?.message || t.errorGeneric, 'error');
      } finally {
        setBusyId(null);
      }
    },
    [
      mutateJson,
      addToast,
      fetchSubs,
      t.toastDisabled,
      t.toastEnabled,
      t.errorGeneric,
    ]
  );

  const handleDelete = useCallback(
    async (sub: Subscription) => {
      const ok = await confirm({
        title: t.confirmDeleteTitle,
        subtitle: t.confirmDeleteSubtitle,
        variant: 'danger',
        confirmLabel: t.delete,
      });
      if (!ok) return;
      setBusyId(sub.id);
      try {
        await mutateJson(`/api/admin/webhooks/${sub.id}`, { method: 'DELETE' });
        addToast(t.toastDeleted, 'success');
        await fetchSubs();
      } catch (err) {
        addToast((err as Error)?.message || t.errorGeneric, 'error');
      } finally {
        setBusyId(null);
      }
    },
    [
      confirm,
      mutateJson,
      addToast,
      fetchSubs,
      t.confirmDeleteTitle,
      t.confirmDeleteSubtitle,
      t.delete,
      t.toastDeleted,
      t.errorGeneric,
    ]
  );

  const toggleDeliveries = useCallback(
    async (sub: Subscription) => {
      if (openId === sub.id) {
        setOpenId(null);
        return;
      }
      setOpenId(sub.id);
      if (deliveries[sub.id]) return;
      try {
        const res = await adminFetchJson<{ deliveries: Delivery[] }>(
          `/api/admin/webhooks/${sub.id}/deliveries`
        );
        setDeliveries((prev) => ({ ...prev, [sub.id]: res.deliveries ?? [] }));
      } catch (err) {
        addToast((err as Error)?.message || t.errorGeneric, 'error');
      }
    },
    [openId, deliveries, adminFetchJson, addToast, t.errorGeneric]
  );

  return (
    <>
      {dialog}
      {revealed && (
        <ApiTokenRevealModal
          token={revealed}
          onClose={() => setRevealed(null)}
        />
      )}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbTitle },
          ]}
        />

        <p className={EYEBROW}>{t.kicker}</p>
        <AdminPageHeader title={t.heading} subtitle={t.intro} />

        {/* ===== Création ===== */}
        <section className={`${CARD} mb-6`}>
          <h2 className={SECTION_TITLE}>{t.createHeading}</h2>
          <p className="mt-1 mb-4 text-sm text-[var(--t3,#a39ba6)]">
            {t.createSubtitle}
          </p>

          <AlertBanner
            message={formError}
            variant="error"
            className="mb-4"
            onDismiss={() => setFormError(null)}
          />

          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label htmlFor="wh-url" className={LABEL}>
                {t.urlLabel}
              </label>
              <input
                id="wh-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://exemple.com/webhooks/conference"
                className={`${INPUT} font-mono`}
                data-testid="webhook-url-input"
              />
            </div>

            <div>
              <span className={LABEL}>{t.eventsLabel}</span>
              <p className="mb-3 text-xs text-[var(--t4,#807984)]">
                {t.eventsHint}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {available.map((ev) => {
                  const checked = selected.has(ev);
                  return (
                    <label
                      key={ev}
                      className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] border px-3 py-2.5 transition-colors ${
                        checked
                          ? 'border-[rgba(180,103,209,.45)] bg-[rgba(180,103,209,.1)]'
                          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] hover:border-[var(--t4,#807984)]'
                      }`}
                      data-testid={`webhook-event-${ev}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEvent(ev)}
                        className="h-4 w-4 accent-[var(--or,#b467d1)]"
                      />
                      <span className="font-mono text-sm text-[var(--t1,#f4edf7)]">
                        {ev}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="wh-desc" className={LABEL}>
                {t.descriptionLabel}
              </label>
              <input
                id="wh-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.descriptionPlaceholder}
                maxLength={200}
                className={INPUT}
              />
            </div>

            <div className="flex justify-end">
              <AdminButton
                type="submit"
                variant="primary"
                disabled={creating}
                data-testid="webhook-create-btn"
              >
                {creating ? t.creating : t.createButton}
              </AdminButton>
            </div>
          </form>
        </section>

        {/* ===== Liste ===== */}
        <section className={CARD}>
          <h2 className={`${SECTION_TITLE} mb-2`}>{t.listHeading}</h2>

          <AlertBanner
            message={loadError}
            variant="error"
            className="my-4"
            onDismiss={() => setLoadError(null)}
          />

          {subs === null ? (
            <LoadingSpinner label={t.loading} className="py-16" />
          ) : subs.length === 0 ? (
            <EmptyState title={t.emptyState} className="py-16" />
          ) : (
            <ul className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
              {subs.map((sub) => (
                <li
                  key={sub.id}
                  className="py-4"
                  data-testid={`webhook-row-${sub.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="break-all font-mono text-sm text-[var(--t1,#f4edf7)]">
                          {sub.url}
                        </code>
                        {sub.enabled ? (
                          <Chip tone="ok">{t.statusActive}</Chip>
                        ) : (
                          <Chip tone="warn">{t.statusDisabled}</Chip>
                        )}
                      </div>
                      {sub.description && (
                        <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                          {sub.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sub.event_types.map((ev) => (
                          <span
                            key={ev}
                            className="rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-[11px] text-[var(--t2,#c7bfca)]"
                          >
                            {ev}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--t4,#807984)]">
                        {t.lastDelivery}:{' '}
                        {formatDate(sub.last_delivery_at, t.never)}
                        {sub.consecutive_failures > 0 && (
                          <span className="text-[var(--warn,#f5a524)]">
                            {' · '}
                            {t.failures.replace(
                              '{n}',
                              String(sub.consecutive_failures)
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <AdminButton
                        size="sm"
                        onClick={() => toggleDeliveries(sub)}
                        data-testid={`webhook-deliveries-btn-${sub.id}`}
                      >
                        {openId === sub.id
                          ? t.hideDeliveries
                          : t.viewDeliveries}
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        onClick={() => handleToggle(sub)}
                        disabled={busyId === sub.id}
                        data-testid={`webhook-toggle-btn-${sub.id}`}
                      >
                        {sub.enabled ? t.disable : t.enable}
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(sub)}
                        disabled={busyId === sub.id}
                        data-testid={`webhook-delete-btn-${sub.id}`}
                      >
                        {t.delete}
                      </AdminButton>
                    </div>
                  </div>

                  {openId === sub.id && (
                    <div className="mt-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3">
                      {!deliveries[sub.id] ? (
                        <LoadingSpinner label={t.loading} className="py-4" />
                      ) : deliveries[sub.id].length === 0 ? (
                        <p className="py-2 text-xs text-[var(--t4,#807984)]">
                          {t.noDeliveries}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[var(--t3,#a39ba6)]">
                                <th className="py-1.5 pr-3 font-medium">
                                  {t.colEvent}
                                </th>
                                <th className="py-1.5 pr-3 font-medium">
                                  {t.colStatus}
                                </th>
                                <th className="py-1.5 pr-3 font-medium">
                                  {t.colAttempts}
                                </th>
                                <th className="py-1.5 pr-3 font-medium">
                                  HTTP
                                </th>
                                <th className="py-1.5 font-medium">
                                  {t.colWhen}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
                              {deliveries[sub.id].map((d) => (
                                <tr key={d.id}>
                                  <td className="py-1.5 pr-3 font-mono text-[var(--t2,#c7bfca)]">
                                    {d.event_name}
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <Chip
                                      tone={
                                        d.status === 'delivered'
                                          ? 'ok'
                                          : d.status === 'failed'
                                            ? 'err'
                                            : 'neutral'
                                      }
                                    >
                                      {d.status}
                                    </Chip>
                                  </td>
                                  <td className="py-1.5 pr-3 text-[var(--t3,#a39ba6)]">
                                    {d.attempts}
                                  </td>
                                  <td className="py-1.5 pr-3 text-[var(--t3,#a39ba6)]">
                                    {d.response_status ?? '—'}
                                  </td>
                                  <td className="whitespace-nowrap py-1.5 text-[var(--t3,#a39ba6)]">
                                    {formatDate(
                                      d.delivered_at ?? d.created_at,
                                      '—'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

AdminWebhooksPage.displayName = 'AdminWebhooksPage';

export default AdminWebhooksPage;
