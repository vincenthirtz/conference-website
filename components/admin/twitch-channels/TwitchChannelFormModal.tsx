import { useEffect, useId, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTwitchChannelsNew from '@/lib/i18n/locales/admin-fr/adminTwitchChannelsNew';

type TwitchChannelFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a channel is successfully created. */
  onCreated: () => void;
};

const EMPTY_FORM = {
  channel: '',
  label: '',
  badge: '',
  description: '',
  backgroundUrl: '',
  isActive: true,
  sortOrder: '',
};

/**
 * Création d'une chaîne Twitch dans une modale, ouverte depuis la liste
 * (`/admin/twitch-channels`). Remplace l'ancienne page
 * `/admin/twitch-channels/new`.
 */
export default function TwitchChannelFormModal({
  open,
  onClose,
  onCreated,
}: TwitchChannelFormModalProps) {
  const t = useAdminT(nsAdminTwitchChannelsNew);
  const { mutateJson } = useIdempotentMutation();
  const formId = useId();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repart d'un formulaire vierge à chaque ouverture.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM });
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const updateField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.channel.trim() || !form.label.trim()) {
      setError(t.errorRequired);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        channel: form.channel.trim(),
        label: form.label.trim(),
        badge: form.badge.trim() || null,
        description: form.description.trim() || null,
        backgroundUrl: form.backgroundUrl.trim() || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
      };

      await mutateJson('/api/admin/twitch-channels', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onCreated();
      onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={t.heading}
      subtitle={t.subtitle}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.creating}
              </>
            ) : (
              t.submit
            )}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.channelLabel} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.channel}
              onChange={(e) => updateField('channel', e.target.value)}
              placeholder="ex: crocheh"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              required
            />
            <p className="text-xs text-neutral-500 mt-1">{t.channelHint}</p>
          </div>

          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.labelLabel} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => updateField('label', e.target.value)}
              placeholder="ex: Crocheh"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              required
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.badgeLabel}
            </label>
            <input
              type="text"
              value={form.badge}
              onChange={(e) => updateField('badge', e.target.value)}
              placeholder={t.badgePlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.sortOrderLabel}
            </label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => updateField('sortOrder', e.target.value)}
              placeholder={t.sortOrderPlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              min="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1">
            {t.avatarLabel}
          </label>
          <input
            type="url"
            value={form.backgroundUrl}
            onChange={(e) => updateField('backgroundUrl', e.target.value)}
            placeholder="https://static-cdn.jtvnw.net/..."
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
          />
          <p className="text-xs text-neutral-500 mt-1">{t.avatarHint}</p>
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1">
            {t.descriptionLabel}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder={t.descriptionPlaceholder}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-y"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => updateField('isActive', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
          <span className="text-sm text-neutral-300">{t.activeLabel}</span>
        </div>
      </form>
    </Modal>
  );
}
