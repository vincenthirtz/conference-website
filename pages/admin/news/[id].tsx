import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import slugify from 'slugify';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Breadcrumb from '@/components/admin/Breadcrumb';
import LogoUpload from '@/components/admin/LogoUpload';
import { useAdminT } from '@/lib/i18n/useAdminT';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string | null;
  };
};

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

export const getServerSideProps = withStaffPage('admin');

const slugifyValue = (value: string) =>
  slugify(value, { lower: true, strict: true });

export default function AdminNewsEdit({ staff }: Props) {
  const t = useAdminT('adminNewsEdit');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { id } = router.query;

  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateField = (key: keyof FormState, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  useEffect(() => {
    const fetchItem = async () => {
      if (!id) return;
      setLoading(true);
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
      } catch (err: unknown) {
        setError((err as Error)?.message || t.errorGeneric);
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
    // Chargement unique par id de route : fetchItem capture adminFetchJson (identité liée au router, non stable) ; l'inclure provoquerait des refetch parasites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <Breadcrumb
          items={[
            { label: t.breadcrumbNews, href: '/admin/news' },
            { label: t.breadcrumbEdit },
          ]}
        />
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-sm text-neutral-400">{t.staffSpace}</p>
            <h1 className="text-3xl font-bold mt-1">{t.heading}</h1>
            <p className="text-sm text-neutral-400 mt-1">{t.subtitle}</p>
          </div>
        </header>

        {loading && <div className="text-neutral-300">{t.loading}</div>}
        {error && (
          <div className="text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}
        {form && (
          <form
            onSubmit={onSubmit}
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 max-w-5xl"
          >
            <fieldset disabled={saving} className="space-y-4">
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
                <p className="text-xs text-neutral-400">{t.tagHint}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <LogoUpload
                  value={form.imageUrl}
                  onChange={(url) => updateField('imageUrl', url)}
                  label={t.imageLabel}
                  hint={t.imageHint}
                />
                <div className="grid gap-2">
                  <label className="text-sm text-neutral-300">
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
                    <label className="text-sm text-neutral-300">
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

              <div className="grid gap-2">
                <label className="text-sm text-neutral-300">
                  {t.excerptLabel}
                </label>
                <textarea
                  className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white min-h-[80px]"
                  value={form.excerpt}
                  onChange={(e) => updateField('excerpt', e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm text-neutral-300">
                  {t.contentLabel}
                </label>
                <textarea
                  className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white min-h-[220px]"
                  value={form.content}
                  required
                  onChange={(e) => updateField('content', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition disabled:opacity-60"
                >
                  {saving ? t.saving : t.submit}
                </button>
                <Link
                  href="/admin/news"
                  className={`px-4 py-2 rounded-lg border border-white/15 hover:border-white/30${saving ? ' pointer-events-none opacity-50' : ''}`}
                >
                  {t.back}
                </Link>
              </div>
            </fieldset>
          </form>
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
      <label className="text-sm text-neutral-300">
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
