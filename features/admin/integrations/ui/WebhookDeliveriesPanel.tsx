// features/admin/integrations/ui/WebhookDeliveriesPanel.tsx
//
// Volet « Livraisons » d'un abonnement webhook (/admin/webhooks) : 50
// dernières livraisons, et « Renvoyer » sur une livraison échouée (corps
// d'origine relu dans l'outbox côté serveur, secret courant).

import { useEffect, useState } from 'react';
import {
  integrationsPaths,
  type WebhookDelivery,
  type WebhookSendResult,
} from '../client';
import {
  useReloadWebhookDeliveries,
  useWebhookDeliveries,
} from '../hooks/useIntegrations';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminWebhooks from '@/lib/i18n/locales/admin-fr/adminWebhooks';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

/** Date courte (fr-FR) d'une livraison / d'un abonnement. */
export function formatWebhookDate(s: string | null, fallback: string): string {
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

export default function WebhookDeliveriesPanel({
  subscriptionId,
  onRedelivered,
}: {
  subscriptionId: string;
  /** Après un renvoi : relire l'abonnement (compteur d'échecs, dernière livraison). */
  onRedelivered: () => Promise<unknown> | void;
}) {
  const t = useAdminT(nsAdminWebhooks);
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const query = useWebhookDeliveries(subscriptionId);
  const reload = useReloadWebhookDeliveries();
  const [redeliveringId, setRedeliveringId] = useState<string | null>(null);
  const deliveries: WebhookDelivery[] | undefined = query.data;

  // Livraisons illisibles : toast, le volet reste en chargement.
  useEffect(() => {
    if (query.error) {
      addToast(query.error.message || t.errorGeneric, 'error');
    }
  }, [query.error, addToast, t.errorGeneric]);

  const handleRedeliver = async (d: WebhookDelivery) => {
    if (redeliveringId) return;
    setRedeliveringId(d.id);
    try {
      const res = await mutateJson<WebhookSendResult>(
        integrationsPaths.webhookRedeliver(subscriptionId),
        { method: 'POST', body: JSON.stringify({ deliveryId: d.id }) }
      );
      if (res.ok) {
        addToast(
          t.toastRedeliverOk.replace('{status}', String(res.status ?? '')),
          'success'
        );
      } else {
        addToast(
          t.toastRedeliverFailed.replace('{error}', res.error || '—'),
          'error'
        );
      }
      await Promise.all([reload(subscriptionId), onRedelivered()]);
    } catch (err) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setRedeliveringId(null);
    }
  };

  return (
    <div className="mt-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3">
      {!deliveries ? (
        <LoadingSpinner label={t.loading} className="py-4" />
      ) : deliveries.length === 0 ? (
        <p className="py-2 text-xs text-[var(--t4,#807984)]">
          {t.noDeliveries}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--t3,#a39ba6)]">
                <th className="py-1.5 pr-3 font-medium">{t.colEvent}</th>
                <th className="py-1.5 pr-3 font-medium">{t.colStatus}</th>
                <th className="py-1.5 pr-3 font-medium">{t.colAttempts}</th>
                <th className="py-1.5 pr-3 font-medium">HTTP</th>
                <th className="py-1.5 pr-3 font-medium">{t.colWhen}</th>
                <th className="py-1.5 font-medium">
                  <span className="sr-only">{t.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
              {deliveries.map((d) => (
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
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[var(--t3,#a39ba6)]">
                    {formatWebhookDate(d.delivered_at ?? d.created_at, '—')}
                  </td>
                  <td className="py-1.5 text-right">
                    {d.status === 'failed' && (
                      <AdminButton
                        size="sm"
                        onClick={() => handleRedeliver(d)}
                        disabled={redeliveringId !== null}
                        title={d.last_error ?? undefined}
                        data-testid={`webhook-redeliver-btn-${d.id}`}
                      >
                        {redeliveringId === d.id ? t.redelivering : t.redeliver}
                      </AdminButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
