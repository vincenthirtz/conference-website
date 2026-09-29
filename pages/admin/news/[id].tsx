import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import slugify from 'slugify';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
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

export default function AdminNewsEdit() {
  const t = useAdminT(nsAdminNewsEdit);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { id } = router.query;

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Chargement ET horodatages de la fiche, en UN état : « en cours », puis
  // les dates lues dans la même réponse (null si le chargement a échoué).
  // Un `loading` à part ne disait rien de plus que « pas encore de réponse ».
  const [stamps, setStamps] = useState<
    { createdAt: string | null; updatedAt: string | null } | 'loading' | null
  >('loading');
  const loading = stamps === 'loading';
  const meta = stamps === 'loading' ? null : stamps;

  const updateField = (key: keyof FormState, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  useEffect(() => {
    const fetchItem = async () => {
      if (!id) return;
      setStamps('loading');
      setError(null);
      try {
        const json = await adminFetchJson<{
          title?: string;
          slug?: string;
          tag?: string;
          excerpt?: string;
          image_url?: string;
          content?: string;
          status?: 'draft' | 'published';
          published_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        }>(`/api/admin/news/${id}`);

        setForm({
          title: json.title || '',
          slug: json.slug || '',
          tag: json.tag || 'general',
          excerpt: json.excerpt || '',
          imageUrl: json.image_url || '',
          content: json.content || '',
          status: json.status || 'draft',
          publishedAt: json.published_at
            ? new Date(json.published_at).toISOString().slice(0, 16)
            : '',
        });
        setStamps({
          createdAt: json.created_at ?? null,
          updatedAt: json.updated_at ?? null,
        });
      } catch (err: unknown) {
        setError((err as Error)?.message || t.errorGeneric);
      } finally {
        setStamps((prev) => (prev === 'loading' ? null : prev));
      }
    };
    fetchItem();
    // adminFetchJson et t sont désormais stables : l'effet ne se relance qu'au
    // changement d'id de route, sans refetch parasite.
  }, [id, adminFetchJson, t]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        slug: form.slug || slugifyValue(form.title),
      };

      await adminFetchJson(`/api/admin/news/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      router.push('/admin/news');
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const newsId = typeof id === 'string' ? id : null;
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
