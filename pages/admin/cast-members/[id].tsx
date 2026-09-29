import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import CastMemberStaffPicker from '@/components/admin/CastMemberStaffPicker';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminCastMemberEdit from '@/lib/i18n/locales/admin-fr/adminCastMemberEdit';
import CastMemberFields from '@/components/admin/cast-members/CastMemberFields';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import { FormError } from '@/components/admin/form/FormField';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
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

function AdminCastMemberEditPage(_props: Props) {
  const t = useAdminT(nsAdminCastMemberEdit);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();

  const [form, setForm] = useState({
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
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chargement ET horodatages de la fiche, en UN état : « en cours », puis
  // les dates lues dans la même réponse (null si le chargement a échoué).
  // Un `loading` à part ne disait rien de plus que « pas encore de réponse ».
  const [stamps, setStamps] = useState<
    { createdAt: string | null; updatedAt: string | null } | 'loading' | null
  >('loading');
  const loading = stamps === 'loading';
  const meta = stamps === 'loading' ? null : stamps;

  const fetchMember = useCallback(async () => {
    if (!id) return;
    setStamps('loading');
    setError(null);

    try {
      const data = await adminFetchJson<any>(`/api/admin/cast-members/${id}`);

      setForm({
        name: data.name || '',
        title: data.title || '',
        description: data.description || '',
        imageUrl: data.image_url || '',
        twitchUrl: data.twitch_url || '',
        city: data.city || '',
        isActive: data.is_active ?? true,
        isPromo: data.is_promo ?? false,
        sortOrder: data.sort_order?.toString() || '',
        authUserId: data.auth_user_id ?? null,
      });
      setStamps({
        createdAt: data.created_at ?? null,
        updatedAt: data.updated_at ?? null,
      });
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorLoad);
    } finally {
      setStamps((prev) => (prev === 'loading' ? null : prev));
    }
  }, [id, adminFetchJson, t]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

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

      await adminFetchJson(`/api/admin/cast-members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      addToast(t.updateSuccess, 'success');
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const memberId = typeof id === 'string' ? id : null;
  const formId = 'cast-member-edit-form';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />
        <DiffusionTabsNav active="casters" />

        <EntityHeader
          crest={
            form.imageUrl ? (
              <Image
                src={form.imageUrl}
                alt={form.name}
                width={52}
                height={52}
                className="h-full w-full object-cover"
              />
            ) : form.name ? (
              form.name.slice(0, 3).toUpperCase()
            ) : undefined
          }
          title={form.name || t.loading}
          meta={
            meta?.createdAt
              ? `${t.heading} · ${tf.metaCreated} ${day(meta.createdAt)}`
              : t.heading
          }
          actions={
            <>
              <AdminButton
                disabled={saving}
                onClick={() => router.push('/admin/diffusion/casteuses')}
              >
                {tf.cancel}
              </AdminButton>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={loading || saving}
              >
                {saving ? tf.saving : tf.save}
              </AdminButton>
            </>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
          </div>
        ) : (
          <FicheLayout
            main={
              <form
                id={formId}
                onSubmit={handleSubmit}
                className="flex flex-col gap-6"
              >
                <fieldset disabled={saving} className="contents">
                  <FicheSection title={t.identitySection}>
                    <div className="flex flex-col gap-6">
                      <FormError message={error} />

                      {/* Aperçu */}
                      {form.imageUrl && (
                        <div className="flex items-center gap-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
                          <Image
                            src={form.imageUrl}
                            alt={form.name}
                            width={64}
                            height={64}
                            className="h-16 w-16 rounded-[var(--r-ctrl,4px)] object-cover"
                          />
                          <div>
                            <div className="font-semibold text-[var(--t1,#f4edf7)]">
                              {form.name || t.previewNameFallback}
                            </div>
                            <div className="text-sm text-[var(--t3,#a39ba6)]">
                              {form.title || t.previewTitleFallback}
                            </div>
                            {form.city && (
                              <div className="text-sm text-[var(--t4,#807984)]">
                                {form.city}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <CastMemberFields form={form} onField={updateField} />
                    </div>
                  </FicheSection>

                  <FicheSection title={t.visibilitySection}>
                    <div className="flex flex-col gap-6">
                      <CastMemberStaffPicker
                        value={form.authUserId}
                        currentCastMemberId={memberId}
                        onChange={(next) => updateField('authUserId', next)}
                      />

                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={form.isActive}
                              onChange={(e) =>
                                updateField('isActive', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                          </label>
                          <span className="text-sm text-[var(--t2,#c7bfca)]">
                            {t.activeLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={form.isPromo}
                              onChange={(e) =>
                                updateField('isPromo', e.target.checked)
                              }
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                          </label>
                          <span className="text-sm text-[var(--t2,#c7bfca)]">
                            {t.promoLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </FicheSection>
                </fieldset>
              </form>
            }
            aside={
              <FicheSection eyebrow title={tf.metaTitle}>
                <MetaList
                  items={[
                    {
                      label: tf.metaId,
                      value: memberId ? `${memberId.slice(0, 8)}…` : '—',
                    },
                    { label: tf.metaCreated, value: day(meta?.createdAt) },
                    { label: tf.metaUpdated, value: day(meta?.updatedAt) },
                  ]}
                />
              </FicheSection>
            }
          />
        )}
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

export default AdminCastMemberEditPage;
