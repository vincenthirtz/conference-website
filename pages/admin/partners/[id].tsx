import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import {
  usePartner,
  useUpdatePartner,
} from '@/features/admin/partners/hooks/usePartners';
import type { PartnerPayload } from '@/features/admin/partners/schemas';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPartnerEdit from '@/lib/i18n/locales/admin-fr/adminPartnerEdit';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import { FormError } from '@/components/admin/form/FormField';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
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

function AdminEditPartnerPage(_props: Props) {
  const t = useAdminT(nsAdminPartnerEdit);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { addToast } = useToast();
  const { id } = router.query;
  const partnerId = typeof id === 'string' ? id : null;
  const partner = usePartner(partnerId);
  const update = useUpdatePartner(partnerId);

  const [error, setError] = useState<string | null>(null);
  // Horodatages de la fiche lus dans la même réponse (null si le chargement
  // a échoué).
  const meta = partner.data
    ? {
        createdAt: partner.data.created_at ?? null,
        updatedAt: partner.data.updated_at ?? null,
      }
    : null;
  const saving = update.isPending;

  const [form, setForm] = useState<FormData>({
    name: '',
    description: '',
    category: '',
    logoUrl: '',
    websiteUrl: '',
    note: '',
    displayOrder: 0,
    isActive: true,
  });

  // Hydrate le formulaire UNE fois par fiche : une relecture ne doit jamais
  // écraser une saisie en cours.
  const hydrated = useHydrateOnce(partnerId, partner.data, (json) =>
    setForm({
      name: json.name || '',
      description: json.description || '',
      category: (json.category as FormData['category']) || '',
      logoUrl: json.logo_url || '',
      websiteUrl: json.website_url || '',
      note: json.note || '',
      displayOrder: json.display_order || 0,
      isActive: json.is_active ?? true,
    })
  );
  const loading = !partner.isError && !hydrated;

  useEffect(() => {
    if (partner.error) setError(partner.error.message || t.errorLoad);
  }, [partner.error, t]);

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

    try {
      await update.mutateAsync(form as PartnerPayload);
      addToast(t.updateSuccess, 'success');
    } catch (err: unknown) {
      setError((err as Error).message || t.errorGeneric);
    }
  };

  const formId = 'partner-edit-form';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { name: form.name })}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />

        <EntityHeader
          crest={
            form.logoUrl ? (
              // biome-ignore lint/performance/noImgElement: free-form URL, outside next/image remotePatterns
              <img
                src={form.logoUrl}
                alt={form.name}
                className="h-full w-full object-contain p-1"
              />
            ) : form.name ? (
              form.name.slice(0, 3).toUpperCase()
            ) : undefined
          }
          title={form.name || t.heading}
          meta={
            meta?.createdAt
              ? `${t.heading} · ${tf.metaCreated} ${day(meta.createdAt)}`
              : t.heading
          }
          actions={
            <>
              {partnerId && (
                <EntityHistoryButton
                  entityType="partner"
                  entityId={partnerId}
                />
              )}
              <AdminButtonLink
                href="/admin/partners"
                className={saving ? 'pointer-events-none opacity-50' : ''}
              >
                {tf.cancel}
              </AdminButtonLink>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={saving}
              >
                {saving ? tf.saving : tf.save}
              </AdminButton>
            </>
          }
        />

        <FicheLayout
          main={
            <FicheSection title={t.identitySection}>
              <form id={formId} onSubmit={handleSubmit}>
                <fieldset disabled={saving} className="space-y-6">
                  <FormError message={error} />

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
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
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
                        {t.categoryLabel}
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) =>
                          updateField(
                            'category',
                            e.target.value as FormData['category']
                          )
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
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
                        {t.descriptionLabel}
                      </label>
                      <textarea
                        value={form.description}
                        onChange={(e) =>
                          updateField('description', e.target.value)
                        }
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white resize-none"
                        placeholder={t.descriptionPlaceholder}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
                        {t.logoUrlLabel}
                      </label>
                      <input
                        type="url"
                        value={form.logoUrl}
                        onChange={(e) => updateField('logoUrl', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                        placeholder="https://..."
                      />
                      {form.logoUrl && (
                        <div className="mt-2 p-2 bg-white/5 rounded-lg border border-neutral-700">
                          {/* biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */}
                          <img
                            src={form.logoUrl}
                            alt={t.logoPreviewAlt}
                            className="max-h-16 w-auto mx-auto object-contain"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
                        {t.websiteLabel}
                      </label>
                      <input
                        type="url"
                        value={form.websiteUrl}
                        onChange={(e) =>
                          updateField('websiteUrl', e.target.value)
                        }
                        className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                        placeholder="https://www.exemple.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
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
                      <label className="block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2">
                        {t.displayOrderLabel}
                      </label>
                      <input
                        type="number"
                        value={form.displayOrder}
                        onChange={(e) =>
                          updateField(
                            'displayOrder',
                            parseInt(e.target.value) || 0
                          )
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
                          onChange={(e) =>
                            updateField('isActive', e.target.checked)
                          }
                          className="w-5 h-5 rounded border-neutral-600 bg-neutral-900/50 text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-sm font-medium text-[var(--t2,#c7bfca)]">
                          {t.activeLabel}
                        </span>
                      </label>
                    </div>
                  </div>
                </fieldset>
              </form>
            </FicheSection>
          }
          aside={
            <FicheSection eyebrow title={tf.metaTitle}>
              <MetaList
                items={[
                  {
                    label: tf.metaId,
                    value: partnerId ? `${partnerId.slice(0, 8)}…` : '—',
                  },
                  { label: tf.metaCreated, value: day(meta?.createdAt) },
                  { label: tf.metaUpdated, value: day(meta?.updatedAt) },
                ]}
              />
            </FicheSection>
          }
        />
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

export default withAdminQuery(AdminEditPartnerPage);
