import { useEffect, useId, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { POLE_KEYS, POLE_LABELS, type PoleKey } from '@/utils/associationPoles';
import { useAdminT } from '@/lib/i18n/useAdminT';

type PoleMemberFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a pole member is successfully created. */
  onCreated: () => void;
  /** Pré-sélectionne un pôle (ex. filtre courant de la liste). */
  initialPole?: PoleKey;
};

/**
 * Création d'un membre de pôle dans une modale, ouverte depuis la liste
 * (`/admin/pole-members`). Remplace l'ancienne page `/admin/pole-members/new`.
 */
export default function PoleMemberFormModal({
  open,
  onClose,
  onCreated,
  initialPole = 'direction',
}: PoleMemberFormModalProps) {
  const t = useAdminT('adminPoleMembersNew');
  const { adminFetchJson } = useAdminFetch();
  const formId = useId();

  const [form, setForm] = useState({
    poleKey: initialPole as PoleKey,
    name: '',
    title: '',
    description: '',
    imageUrl: '',
    linkUrl: '',
    isActive: true,
    sortOrder: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repart d'un formulaire vierge à chaque ouverture.
  useEffect(() => {
    if (open) {
      setForm({
        poleKey: initialPole,
        name: '',
        title: '',
        description: '',
        imageUrl: '',
        linkUrl: '',
        isActive: true,
        sortOrder: '',
      });
      setError(null);
      setSaving(false);
    }
  }, [open, initialPole]);

  const updateField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(t.errorNameRequired);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        poleKey: form.poleKey,
        name: form.name.trim(),
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        linkUrl: form.linkUrl.trim() || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
      };

      await adminFetchJson('/api/admin/pole-members', {
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
            {saving ? t.creating : t.submit}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.poleLabel} <span className="text-red-400">*</span>
            </label>
            <select
              value={form.poleKey}
              onChange={(e) =>
                updateField('poleKey', e.target.value as PoleKey)
              }
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              required
            >
              {POLE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {POLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.nameLabel} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="ex: Arukdo"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              required
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              {t.titleLabel}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder={t.titlePlaceholder}
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
            type="text"
            value={form.imageUrl}
            onChange={(e) => updateField('imageUrl', e.target.value)}
            placeholder="/img/team/nom.jpg ou https://..."
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1">
            {t.linkLabel}
          </label>
          <input
            type="url"
            value={form.linkUrl}
            onChange={(e) => updateField('linkUrl', e.target.value)}
            placeholder="https://www.twitch.tv/..."
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
          />
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
