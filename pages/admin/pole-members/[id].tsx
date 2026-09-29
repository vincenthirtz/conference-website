import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import {
  usePoleMember,
  useUpdatePoleMember,
} from '@/features/admin/pole-members/hooks/usePoleMember';
import { useToast } from '@/components/Toast';
import { POLE_KEYS, POLE_LABELS, type PoleKey } from '@/utils/associationPoles';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminPoleMemberEdit from '@/lib/i18n/locales/admin-fr/adminPoleMemberEdit';
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

function AdminPoleMemberEditPage(_props: Props) {
  const t = useAdminT(nsAdminPoleMemberEdit);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const memberId = typeof id === 'string' ? id : null;
  const member = usePoleMember(memberId);
  const update = useUpdatePoleMember(memberId);

  const [form, setForm] = useState({
    poleKey: 'direction' as PoleKey,
    name: '',
    title: '',
    description: '',
    imageUrl: '',
    linkUrl: '',
    isActive: true,
    sortOrder: '',
  });

  const saving = update.isPending;
  const [error, setError] = useState<string | null>(null);

  // Formulaire copié UNE fois de la fiche (jamais réécrit sous la saisie).
  const hydrated = useHydrateOnce(memberId, member.data, (data) =>
    setForm({
      poleKey: (data.pole_key as PoleKey) || 'direction',
      name: data.name || '',
      title: data.title || '',
      description: data.description || '',
      imageUrl: data.image_url || '',
      linkUrl: data.link_url || '',
      isActive: data.is_active ?? true,
      sortOrder: data.sort_order?.toString() || '',
    })
  );
  // Chargement puis horodatages lus dans la même réponse (null si échec).
  const loading = !member.isError && !hydrated;
  const meta =
    hydrated && member.data
      ? {
          createdAt: member.data.created_at ?? null,
          updatedAt: member.data.updated_at ?? null,
        }
      : null;

  useEffect(() => {
    if (member.error) setError(member.error.message || t.errorLoad);
  }, [member.error, t]);

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

      await update.mutateAsync(payload);

      addToast(t.updateSuccess, 'success');
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorGeneric);
    }
  };

  const formId = 'pole-member-edit-form';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />

        <EntityHeader
          crest={
            form.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: free-form URL (site path or external), outside next/image remotePatterns
              <img
                src={form.imageUrl}
                alt={form.name}
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
                onClick={() => router.push('/admin/pole-members')}
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
              <form id={formId} onSubmit={handleSubmit}>
                <fieldset disabled={saving} className="contents">
                  <FicheSection title={t.identitySection}>
                    <div className="space-y-6">
                      <FormError message={error} />

                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                            {t.poleLabel}{' '}
                            <span className="text-red-400">*</span>
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
                          <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                            {t.nameLabel}{' '}
                            <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) =>
                              updateField('name', e.target.value)
                            }
                            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid gap-6 md:grid-cols-2">
                        <div>
                          <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                            {t.titleLabel}
                          </label>
                          <input
                            type="text"
                            value={form.title}
                            onChange={(e) =>
                              updateField('title', e.target.value)
                            }
                            placeholder={t.titlePlaceholder}
                            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                            {t.sortOrderLabel}
                          </label>
                          <input
                            type="number"
                            value={form.sortOrder}
                            onChange={(e) =>
                              updateField('sortOrder', e.target.value)
                            }
                            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            min="0"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                          {t.avatarLabel}
                        </label>
                        <input
                          type="text"
                          value={form.imageUrl}
                          onChange={(e) =>
                            updateField('imageUrl', e.target.value)
                          }
                          placeholder="/img/team/nom.jpg ou https://..."
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                          {t.linkLabel}
                        </label>
                        <input
                          type="url"
                          value={form.linkUrl}
                          onChange={(e) =>
                            updateField('linkUrl', e.target.value)
                          }
                          placeholder="https://www.twitch.tv/..."
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-[var(--t2,#c7bfca)] mb-1">
                          {t.descriptionLabel}
                        </label>
                        <textarea
                          value={form.description}
                          onChange={(e) =>
                            updateField('description', e.target.value)
                          }
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

export default withAdminQuery(AdminPoleMemberEditPage);
