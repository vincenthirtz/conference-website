import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import slugify from 'slugify';
import { useDirtyBaseline } from '@/hooks/forms/useDirtyBaseline';
import { useUnsavedChangesGuard } from '@/hooks/forms/useUnsavedChangesGuard';
import { isStaleUpdateError } from '@/features/admin/_shared/optimisticLock';
import StaleUpdateNotice from '@/features/admin/_shared/ui/StaleUpdateNotice';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import {
  useNewsItem,
  useUpdateNews,
} from '@/features/admin/news/hooks/useNews';
import Breadcrumb from '@/components/admin/Breadcrumb';
import LogoUpload from '@/components/admin/LogoUpload';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminNewsEdit from '@/lib/i18n/locales/admin-fr/adminNewsEdit';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import { FormError } from '@/components/admin/form/FormField';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

type FormState = {
  title: string;
  slug: string;
  tag: string;
  excerpt: string;
  imageUrl: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt: string;
};

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

const slugifyValue = (value: string) =>
  slugify(value, { lower: true, strict: true });

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

function AdminNewsEdit() {
  const t = useAdminT(nsAdminNewsEdit);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { id } = router.query;
  const newsId = typeof id === 'string' ? id : null;
  const item = useNewsItem(newsId);
  const update = useUpdateNews(newsId);

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateField = (key: keyof FormState, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  // « Modifications non enregistrées » : écart à la version hydratée.
  const { dirty, markClean } = useDirtyBaseline(form);
  useUnsavedChangesGuard(dirty, tf.unsavedConfirm);

  // Verrou optimiste : `updated_at` de la version sur laquelle repose la saisie.
  const [version, setVersion] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Formulaire copié UNE fois de la fiche (jamais réécrit sous la saisie),
  // puis sur demande après un conflit (« Recharger »).
  const hydrateFrom = (json: NonNullable<typeof item.data>) => {
    const next: FormState = {
      title: json.title || '',
      slug: json.slug || '',
      tag: json.tag || 'general',
      excerpt: json.excerpt || '',
      imageUrl: json.image_url || '',
      content: json.content || '',
      status: (json.status as FormState['status']) || 'draft',
      publishedAt: json.published_at
        ? new Date(json.published_at).toISOString().slice(0, 16)
        : '',
    };
    setForm(next);
    setVersion(json.updated_at ?? null);
    markClean(next);
  };
  const hydrated = useHydrateOnce(newsId, item.data, hydrateFrom);

  // 409 : relire l'article et repartir de la version à jour.
  const onReload = async () => {
    setReloading(true);
    try {
      const { data } = await item.refetch();
      if (data) hydrateFrom(data);
      setStale(false);
      setError(null);
    } finally {
      setReloading(false);
    }
  };
  // Chargement puis horodatages lus dans la même réponse (null si échec).
  const loading = !item.isError && !hydrated;
  const meta =
    hydrated && item.data
      ? {
          createdAt: item.data.created_at ?? null,
          updatedAt: item.data.updated_at ?? null,
        }
      : null;
  const saving = update.isPending;

  useEffect(() => {
    if (item.error) setError(item.error.message || t.errorGeneric);
  }, [item.error, t]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      const payload = {
        ...form,
        slug: form.slug || slugifyValue(form.title),
        // Verrou optimiste : 409 si l'article a changé depuis l'ouverture.
        expected_updated_at: version,
      };

      await update.mutateAsync(payload);
      // Garde désarmée AVANT de quitter la page (rendu synchrone) : sinon la
      // navigation qui suit l'enregistrement demanderait confirmation.
      flushSync(() => markClean(form));
      router.push('/admin/news');
    } catch (err: unknown) {
      if (isStaleUpdateError(err)) setStale(true);
      else setError((err as Error)?.message || t.errorGeneric);
    }
  };

  const formId = 'news-edit-form';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbNews, href: '/admin/news' },
            { label: t.breadcrumbEdit },
          ]}
        />

        <EntityHeader
          crest={
            form?.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: storage URL, outside next/image remotePatterns
              <img
                src={form.imageUrl}
                alt={form.title}
                className="h-full w-full object-cover"
              />
            ) : form?.title ? (
              form.title.slice(0, 3).toUpperCase()
            ) : undefined
          }
          title={form?.title || t.heading}
          meta={
            meta?.createdAt
              ? `${t.heading} · ${tf.metaCreated} ${day(meta.createdAt)}`
              : t.subtitle
          }
          actions={
            <>
              <AdminButtonLink
                href="/admin/news"
                className={saving ? 'pointer-events-none opacity-50' : ''}
              >
                {tf.cancel}
              </AdminButtonLink>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={!form || saving}
              >
                {saving ? tf.saving : tf.save}
              </AdminButton>
            </>
          }
        />

        {stale && (
          <StaleUpdateNotice onReload={onReload} reloading={reloading} />
        )}
        {loading && <div className="text-[var(--t3,#a39ba6)]">{t.loading}</div>}
        {!form && <FormError message={error} />}
        {form && (
          <FicheLayout
            main={
              <form
                id={formId}
                onSubmit={onSubmit}
                className="flex flex-col gap-6"
              >
                <fieldset disabled={saving} className="contents">
                  <FormError message={error} />

                  <FicheSection title={t.contentSection}>
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field
                          label={t.titleLabel}
                          required
                          value={form.title}
                          onChange={(v) => updateField('title', v)}
                        />
                        <Field
                          label={t.slugLabel}
                          placeholder={t.slugPlaceholder}
                          value={form.slug}
                          onChange={(v) => updateField('slug', slugifyValue(v))}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Field
                          label={t.tagLabel}
                          placeholder={t.tagPlaceholder}
                          value={form.tag}
                          onChange={(v) => updateField('tag', slugifyValue(v))}
                          required
                        />
                        <p className="text-xs text-[var(--t3,#a39ba6)]">
                          {t.tagHint}
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm text-[var(--t2,#c7bfca)]">
                          {t.excerptLabel}
                        </label>
                        <textarea
                          className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white min-h-[80px]"
                          value={form.excerpt}
                          onChange={(e) =>
                            updateField('excerpt', e.target.value)
                          }
                        />
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm text-[var(--t2,#c7bfca)]">
                          {t.contentLabel}
                        </label>
                        <textarea
                          className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white min-h-[220px]"
                          value={form.content}
                          required
                          onChange={(e) =>
                            updateField('content', e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </FicheSection>

                  <FicheSection title={t.publicationSection}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <LogoUpload
                        value={form.imageUrl}
                        onChange={(url) => updateField('imageUrl', url)}
                        label={t.imageLabel}
                        hint={t.imageHint}
                      />
                      <div className="grid gap-2">
                        <label className="text-sm text-[var(--t2,#c7bfca)]">
                          {t.statusLabel}
                        </label>
                        <select
                          className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                          value={form.status}
                          onChange={(e) =>
                            updateField(
                              'status',
                              e.target.value as FormState['status']
                            )
                          }
                        >
                          <option value="draft">{t.statusDraft}</option>
                          <option value="published">{t.statusPublished}</option>
                        </select>
                        <div className="grid gap-1">
                          <label className="text-sm text-[var(--t2,#c7bfca)]">
                            {t.publishDateLabel}
                          </label>
                          <input
                            type="datetime-local"
                            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                            value={form.publishedAt}
                            onChange={(e) =>
                              updateField('publishedAt', e.target.value)
                            }
                          />
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
                      value: newsId ? `${newsId.slice(0, 8)}…` : '—',
                    },
                    { label: t.slugLabel, value: form.slug || '—' },
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm text-[var(--t2,#c7bfca)]">
        {label} {required && <span className="text-red-300">*</span>}
      </label>
      <input
        className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

export default withAdminQuery(AdminNewsEdit);
