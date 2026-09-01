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

export const getServerSideProps = withStaffPage({ permission: 'manage_settings' });

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-5xl mx-auto">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTitle },
            ]}
          />

          <div className="mb-8">
            <p className="text-sm text-neutral-400">{t.kicker}</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
              {t.heading}
            </h1>
            <p className="text-sm text-neutral-400 mt-2 max-w-2xl">{t.intro}</p>
          </div>

          {/* ===== Création ===== */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-semibold mb-1">{t.createHeading}</h2>
            <p className="text-sm text-neutral-400 mb-4">{t.createSubtitle}</p>

            <AlertBanner
              message={formError}
              variant="error"
              className="mb-4"
              onDismiss={() => setFormError(null)}
            />

            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label
                  htmlFor="wh-url"
                  className="block text-sm text-neutral-400 mb-1"
                >
                  {t.urlLabel}
                </label>
                <input
                  id="wh-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://exemple.com/webhooks/conference"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                  data-testid="webhook-url-input"
                />
              </div>

              <div>
                <span className="block text-sm text-neutral-400 mb-1">
                  {t.eventsLabel}
                </span>
                <p className="text-xs text-neutral-500 mb-3">{t.eventsHint}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {available.map((ev) => {
                    const checked = selected.has(ev);
                    return (
                      <label
                        key={ev}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-purple-600/15 border-purple-500/40'
                            : 'bg-neutral-900/40 border-neutral-700/50 hover:border-neutral-600'
                        }`}
                        data-testid={`webhook-event-${ev}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEvent(ev)}
                          className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 text-purple-500 focus:ring-purple-500/50"
                        />
                        <span className="text-sm font-mono text-neutral-200">
                          {ev}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="wh-desc"
                  className="block text-sm text-neutral-400 mb-1"
                >
                  {t.descriptionLabel}
                </label>
                <input
                  id="wh-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.descriptionPlaceholder}
                  maxLength={200}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="webhook-create-btn"
                >
                  {creating ? t.creating : t.createButton}
                </button>
              </div>
            </form>
          </section>

          {/* ===== Liste ===== */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-700/50">
              <h2 className="text-xl font-semibold">{t.listHeading}</h2>
            </div>

            <AlertBanner
              message={loadError}
              variant="error"
              className="m-4"
              onDismiss={() => setLoadError(null)}
            />

            {subs === null ? (
              <LoadingSpinner label={t.loading} className="py-16" />
            ) : subs.length === 0 ? (
              <EmptyState title={t.emptyState} className="py-16" />
            ) : (
              <ul className="divide-y divide-neutral-700/50">
                {subs.map((sub) => (
                  <li
                    key={sub.id}
                    className="px-6 py-4"
                    data-testid={`webhook-row-${sub.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-white break-all">
                            {sub.url}
                          </code>
                          {sub.enabled ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                              {t.statusActive}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                              {t.statusDisabled}
                            </span>
                          )}
                        </div>
                        {sub.description && (
                          <p className="text-xs text-neutral-400 mt-1">
                            {sub.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {sub.event_types.map((ev) => (
                            <span
                              key={ev}
                              className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-neutral-700/50 border border-neutral-600/50 text-neutral-300"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-2">
                          {t.lastDelivery}:{' '}
                          {formatDate(sub.last_delivery_at, t.never)}
                          {sub.consecutive_failures > 0 && (
                            <span className="text-amber-400/80">
                              {' · '}
                              {t.failures.replace(
                                '{n}',
                                String(sub.consecutive_failures)
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleDeliveries(sub)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-500/40 text-neutral-300 hover:border-neutral-400 text-sm transition-colors"
                          data-testid={`webhook-deliveries-btn-${sub.id}`}
                        >
                          {openId === sub.id
                            ? t.hideDeliveries
                            : t.viewDeliveries}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(sub)}
                          disabled={busyId === sub.id}
                          className="px-3 py-1.5 rounded-lg border border-neutral-500/40 text-neutral-300 hover:border-neutral-400 text-sm transition-colors disabled:opacity-50"
                          data-testid={`webhook-toggle-btn-${sub.id}`}
                        >
                          {sub.enabled ? t.disable : t.enable}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(sub)}
                          disabled={busyId === sub.id}
                          className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors disabled:opacity-50"
                          data-testid={`webhook-delete-btn-${sub.id}`}
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>

                    {openId === sub.id && (
                      <div className="mt-4 rounded-xl border border-neutral-700/50 bg-neutral-900/40 p-3">
                        {!deliveries[sub.id] ? (
                          <LoadingSpinner label={t.loading} className="py-4" />
                        ) : deliveries[sub.id].length === 0 ? (
                          <p className="text-xs text-neutral-500 py-2">
                            {t.noDeliveries}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-neutral-500">
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
                              <tbody className="divide-y divide-neutral-800">
                                {deliveries[sub.id].map((d) => (
                                  <tr key={d.id}>
                                    <td className="py-1.5 pr-3 font-mono text-neutral-300">
                                      {d.event_name}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                      <span
                                        className={
                                          d.status === 'delivered'
                                            ? 'text-emerald-300'
                                            : d.status === 'failed'
                                              ? 'text-red-300'
                                              : 'text-neutral-400'
                                        }
                                      >
                                        {d.status}
                                      </span>
                                    </td>
                                    <td className="py-1.5 pr-3 text-neutral-400">
                                      {d.attempts}
                                    </td>
                                    <td className="py-1.5 pr-3 text-neutral-400">
                                      {d.response_status ?? '—'}
                                    </td>
                                    <td className="py-1.5 text-neutral-400 whitespace-nowrap">
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
      </div>
    </>
  );
}

AdminWebhooksPage.displayName = 'AdminWebhooksPage';

export default AdminWebhooksPage;
