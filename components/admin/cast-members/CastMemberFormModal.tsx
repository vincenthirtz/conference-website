import { useEffect, useId, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import CastMemberStaffPicker from '@/components/admin/CastMemberStaffPicker';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminCastMembersNew from '@/lib/i18n/locales/admin-fr/adminCastMembersNew';
import CastMemberFields from '@/components/admin/cast-members/CastMemberFields';

type CastMemberFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a cast member is successfully created. */
  onCreated: () => void;
};

const EMPTY_FORM = {
  name: '',
  title: '',
  description: '',
  imageUrl: '',
  twitchUrl: '',
  city: '',
  isActive: true,
  isPromo: false,
  sortOrder: '',
  authUserId: null as string | null,
};

/**
 * Création d'une casteuse dans une modale, ouverte depuis la liste
 * (Diffusion › Casteuses, `/admin/diffusion/casteuses`, `?new=1`). Remplace
 * l'ancienne page `/admin/cast-members/new`.
 */
export default function CastMemberFormModal({
  open,
  onClose,
  onCreated,
}: CastMemberFormModalProps) {
  const t = useAdminT(nsAdminCastMembersNew);
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

  const updateField = (
    key: keyof typeof form,
    value: string | boolean | null
  ) => {
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
        name: form.name.trim(),
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        twitchUrl: form.twitchUrl.trim() || null,
        city: form.city.trim() || null,
        isActive: form.isActive,
        isPromo: form.isPromo,
        sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : undefined,
        authUserId: form.authUserId,
      };

      await mutateJson('/api/admin/cast-members', {
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

        <CastMemberFields
          form={form}
          onField={updateField}
          sortOrderPlaceholder={t.sortOrderPlaceholder}
        />

        <CastMemberStaffPicker
          value={form.authUserId}
          onChange={(next) => updateField('authUserId', next)}
        />

        <div className="space-y-3">
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

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPromo}
                onChange={(e) => updateField('isPromo', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
            <span className="text-sm text-neutral-300">{t.promoLabel}</span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
