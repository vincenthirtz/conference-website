import { useEffect, useId, useState } from 'react';
import Modal from '@/components/admin/Modal';
import AlertBanner from '@/components/admin/AlertBanner';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { tenantsPaths } from '@/features/admin/tenants/client';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantsNew from '@/lib/i18n/locales/admin-fr/adminTenantsNew';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

type TenantFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a tenant is successfully created. */
  onCreated: () => void;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CreateTenantResponse = {
  tenant: { id: string; slug: string; name: string };
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Création d'un tenant dans une modale, ouverte depuis la liste
 * (`/admin/tenants`). Remplace l'ancienne page `/admin/tenants/new`.
 */
export default function TenantFormModal({
  open,
  onClose,
  onCreated,
}: TenantFormModalProps) {
  const t = useAdminT(nsAdminTenantsNew);
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();
  const formId = useId();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [defaultLocale, setDefaultLocale] = useState('fr');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Repart d'un formulaire vierge à chaque ouverture.
  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugTouched(false);
      setDefaultLocale('fr');
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const computedSlug = slugTouched ? slug : slugify(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t.errorNameRequired);
      return;
    }
    const finalSlug = computedSlug.trim();
    if (!finalSlug) {
      setError(t.errorSlugRequired);
      return;
    }
    if (!SLUG_RE.test(finalSlug)) {
      setError(t.errorSlugInvalid);
      return;
    }

    setSaving(true);
    try {
      const json = await mutateJson<CreateTenantResponse>(tenantsPaths.list, {
        method: 'POST',
        body: JSON.stringify({
          slug: finalSlug,
          name: name.trim(),
          default_locale: defaultLocale || undefined,
        }),
      });
      addToast(format(t.toastCreated, { slug: json.tenant.slug }), 'success');
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error)?.message || t.errorCreate);
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
          <AdminButton
            variant="ghost"
            size="md"
            type="button"
            onClick={onClose}
          >
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="md"
            type="submit"
            form={formId}
            disabled={saving}
            data-testid="tenant-create-submit"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.saving}
              </>
            ) : (
              t.submit
            )}
          </AdminButton>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        <AlertBanner message={error} />

        <div>
          <label
            htmlFor="tenant-name"
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            {t.nameLabel} <span className="text-red-400">*</span>
          </label>
          <input
            id="tenant-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
            placeholder={t.namePlaceholder}
            required
            data-testid="tenant-name-input"
          />
        </div>

        <div>
          <label
            htmlFor="tenant-slug"
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            {t.slugLabel} <span className="text-red-400">*</span>
          </label>
          <input
            id="tenant-slug"
            type="text"
            value={computedSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="w-full px-4 py-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono text-sm"
            placeholder={t.slugPlaceholder}
            required
            data-testid="tenant-slug-input"
          />
          <p className="text-xs text-neutral-500 mt-1">{t.slugHelp}</p>
        </div>

        <div>
          <label
            htmlFor="tenant-locale"
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            {t.localeLabel}
          </label>
          <select
            id="tenant-locale"
            value={defaultLocale}
            onChange={(e) => setDefaultLocale(e.target.value)}
            className="w-full px-4 py-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
          >
            <option value="fr">{t.localeFr}</option>
            <option value="en">{t.localeEn}</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
