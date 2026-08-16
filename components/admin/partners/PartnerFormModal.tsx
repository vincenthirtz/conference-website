import { useEffect, useId, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminPartnersNew from '@/lib/i18n/locales/admin-fr/adminPartnersNew';

type PartnerFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a partner is successfully created. */
  onCreated: () => void;
};

type FormData = {
  name: string;
  description: string;
  category: 'super' | 'major' | 'cultural' | '';
  logoUrl: string;
  websiteUrl: string;
  note: string;
  displayOrder: number;
  isActive: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  category: '',
  logoUrl: '',
  websiteUrl: '',
  note: '',
  displayOrder: 0,
  isActive: true,
};

/**
 * Création d'un partenaire dans une modale, ouverte depuis la liste
 * (`/admin/partners`). Remplace l'ancienne page `/admin/partners/new`.
 */
export default function PartnerFormModal({
  open,
  onClose,
  onCreated,
}: PartnerFormModalProps) {
  const t = useAdminT(nsAdminPartnersNew);
  const { mutateJson } = useIdempotentMutation();
  const formId = useId();

  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
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

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError(t.errorNameRequired);
      return;
    }
    if (!form.description.trim()) {
      setError(t.errorDescriptionRequired);
      return;
    }
    if (!form.category) {
      setError(t.errorCategoryRequired);
      return;
    }

    setSaving(true);
    try {
      await mutateJson('/api/admin/partners', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || t.errorGeneric);
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
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-400 flex-shrink-0"
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

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.nameLabel}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
              placeholder={t.namePlaceholder}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.categoryLabel}
            </label>
            <select
              value={form.category}
              onChange={(e) =>
                updateField('category', e.target.value as FormData['category'])
              }
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
              required
            >
              <option value="">{t.categoryPlaceholder}</option>
              <option value="super">{t.categorySuper}</option>
              <option value="major">{t.categoryMajor}</option>
              <option value="cultural">{t.categoryCultural}</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.descriptionLabel}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white resize-none"
              placeholder={t.descriptionPlaceholder}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.logoUrlLabel}
            </label>
            <input
              type="url"
              value={form.logoUrl}
              onChange={(e) => updateField('logoUrl', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.websiteLabel}
            </label>
            <input
              type="url"
              value={form.websiteUrl}
              onChange={(e) => updateField('websiteUrl', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
              placeholder="https://www.exemple.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.noteLabel}
            </label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => updateField('note', e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
              placeholder={t.notePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {t.displayOrderLabel}
            </label>
            <input
              type="number"
              value={form.displayOrder}
              onChange={(e) =>
                updateField('displayOrder', parseInt(e.target.value) || 0)
              }
              className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
              placeholder="0"
            />
            <p className="text-xs text-neutral-500 mt-1">
              {t.displayOrderHint}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField('isActive', e.target.checked)}
                className="w-5 h-5 rounded border-neutral-600 bg-neutral-900/50 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-neutral-300">
                {t.activeLabel}
              </span>
            </label>
          </div>
        </div>
      </form>
    </Modal>
  );
}
