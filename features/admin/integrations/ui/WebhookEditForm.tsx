// features/admin/integrations/ui/WebhookEditForm.tsx
//
// Volet « Modifier » d'un abonnement webhook (/admin/webhooks) : URL, events,
// description. Le serveur applique à l'URL les MÊMES règles anti-SSRF qu'à la
// création (HTTPS, hôte public) — son refus s'affiche tel quel dans le volet.

import { useCallback, useState } from 'react';
import { integrationsPaths, type WebhookSubscription } from '../client';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminWebhooks from '@/lib/i18n/locales/admin-fr/adminWebhooks';
import AlertBanner from '@/components/admin/AlertBanner';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

const LABEL = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

type Draft = {
  url: string;
  description: string;
  selected: Set<string>;
  error: string | null;
  saving: boolean;
};

export default function WebhookEditForm({
  sub,
  available,
  onCancel,
  onSaved,
}: {
  sub: WebhookSubscription;
  available: readonly string[];
  onCancel: () => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const t = useAdminT(nsAdminWebhooks);
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => ({
    url: sub.url,
    description: sub.description ?? '',
    selected: new Set(sub.event_types),
    error: null,
    saving: false,
  }));

  const toggleEvent = useCallback((ev: string) => {
    setDraft((d) => {
      const selected = new Set(d.selected);
      if (selected.has(ev)) selected.delete(ev);
      else selected.add(ev);
      return { ...d, selected };
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.saving) return;
    if (!draft.url.trim()) {
      setDraft((d) => ({ ...d, error: t.errorUrlRequired }));
      return;
    }
    if (draft.selected.size === 0) {
      setDraft((d) => ({ ...d, error: t.errorEventsRequired }));
      return;
    }
    setDraft((d) => ({ ...d, error: null, saving: true }));
    try {
      await mutateJson(integrationsPaths.webhook(sub.id), {
        method: 'PATCH',
        body: JSON.stringify({
          url: draft.url.trim(),
          event_types: [...draft.selected],
          description: draft.description.trim() || null,
        }),
      });
      addToast(t.toastUpdated, 'success');
      await onSaved();
    } catch (err) {
      const msg = (err as Error)?.message || t.errorGeneric;
      setDraft((d) => ({ ...d, error: msg, saving: false }));
      addToast(msg, 'error');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3"
      data-testid={`webhook-edit-form-${sub.id}`}
    >
      <AlertBanner
        message={draft.error}
        variant="error"
        onDismiss={() => setDraft((d) => ({ ...d, error: null }))}
      />
      <div>
        <label htmlFor={`wh-edit-url-${sub.id}`} className={LABEL}>
          {t.urlLabel}
        </label>
        <input
          id={`wh-edit-url-${sub.id}`}
          type="url"
          value={draft.url}
          onChange={(e) => {
            const url = e.target.value;
            setDraft((d) => ({ ...d, url }));
          }}
          className={`${INPUT} font-mono`}
        />
      </div>
      <div>
        <span className={LABEL}>{t.eventsLabel}</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {available.map((ev) => (
            <label
              key={ev}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 py-2"
            >
              <input
                type="checkbox"
                checked={draft.selected.has(ev)}
                onChange={() => toggleEvent(ev)}
                className="h-4 w-4 accent-[var(--or,#b467d1)]"
              />
              <span className="font-mono text-sm text-[var(--t1,#f4edf7)]">
                {ev}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={`wh-edit-desc-${sub.id}`} className={LABEL}>
          {t.descriptionLabel}
        </label>
        <input
          id={`wh-edit-desc-${sub.id}`}
          type="text"
          value={draft.description}
          onChange={(e) => {
            const description = e.target.value;
            setDraft((d) => ({ ...d, description }));
          }}
          placeholder={t.descriptionPlaceholder}
          maxLength={200}
          className={INPUT}
        />
      </div>
      <div className="flex justify-end gap-2">
        <AdminButton size="sm" onClick={onCancel} disabled={draft.saving}>
          {t.cancel}
        </AdminButton>
        <AdminButton
          size="sm"
          type="submit"
          variant="primary"
          disabled={draft.saving}
          data-testid={`webhook-save-btn-${sub.id}`}
        >
          {draft.saving ? t.saving : t.save}
        </AdminButton>
      </div>
    </form>
  );
}
