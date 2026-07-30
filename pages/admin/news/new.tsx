/* eslint-disable @next/next/no-img-element */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import slugify from 'slugify';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAutoSave } from '@/utils/useAutoSave';
import DraftBanner from '@/components/admin/DraftBanner';
import AutoSaveIndicator from '@/components/admin/AutoSaveIndicator';
import LogoUpload from '@/components/admin/LogoUpload';
import { useAdminT } from '@/lib/i18n/useAdminT';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string | null;
  };
};

export const getServerSideProps = withStaffPage('admin');

const slugifyValue = (value: string) =>
  slugify(value, { lower: true, strict: true });

export default function AdminNewsCreate({ staff }: Props) {
  const t = useAdminT('adminNewsNew');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const [form, setForm] = useState({
    title: '',
    slug: '',
    tag: 'general',
    excerpt: '',
    imageUrl: '',
    content: '',
    status: 'draft',
    publishedAt: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  // Fallback d'aperçu géré par état (réarmé à chaque changement d'URL).
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setPreviewError(false);
  }, [form.imageUrl]);

  const { draftRestored, lastSaved, clearDraft, restoreDraft } = useAutoSave(
    form,
    {
      key: 'news_new',
    }
  );

  useEffect(() => {
    if (draftRestored) setShowDraftBanner(true);
  }, [draftRestored]);

  const updateField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...form,
        slug: form.slug || slugifyValue(form.title),
      };

      const json = await adminFetchJson<{ id: string }>('/api/admin/news', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      clearDraft();
      router.push(`/admin/news/${json.id}`);
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/news')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t.back}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
            {/* Form */}
            <div className="space-y-6">
              {showDraftBanner && (
                <DraftBanner
                  lastSaved={lastSaved}
                  onRestore={() => {
                    const draft = restoreDraft();
                    if (draft) setForm(draft);
                    setShowDraftBanner(false);
                  }}
                  onDiscard={() => {
                    clearDraft();
                    setShowDraftBanner(false);
                  }}
                />
              )}
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

              <form onSubmit={onSubmit} className="space-y-6">
                {/* Informations generales */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">{t.sectionGeneral}</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.titleLabel} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.title}
                        onChange={(e) => updateField('title', e.target.value)}
                        placeholder={t.titlePlaceholder}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.slugLabel}
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                        value={form.slug}
                        onChange={(e) =>
                          updateField('slug', slugifyValue(e.target.value))
                        }
                        placeholder={t.slugPlaceholder}
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.slugHint}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.tagLabel} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.tag}
                        onChange={(e) =>
                          updateField('tag', slugifyValue(e.target.value))
                        }
                        placeholder={t.tagPlaceholder}
                        required
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.tagHint}
                      </p>
                    </div>

                    <div>
                      <LogoUpload
                        value={form.imageUrl}
                        onChange={(url) => updateField('imageUrl', url)}
                        label={t.imageLabel}
                        hint={t.imageHint}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.excerptLabel}
                    </label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
                      value={form.excerpt}
                      onChange={(e) => updateField('excerpt', e.target.value)}
                      placeholder={t.excerptPlaceholder}
                    />
                  </div>
                </section>

                {/* Contenu */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">{t.sectionContent}</h2>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.contentLabel} <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      rows={12}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono resize-y"
                      value={form.content}
                      onChange={(e) => updateField('content', e.target.value)}
                      placeholder={t.contentPlaceholder}
                      required
                    />
                  </div>
                </section>

                {/* Publication */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">
                    {t.sectionPublication}
                  </h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.statusLabel}
                      </label>
                      <select
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.status}
                        onChange={(e) => updateField('status', e.target.value)}
                      >
                        <option value="draft">{t.statusDraft}</option>
                        <option value="published">{t.statusPublished}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.publishDateLabel}
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.publishedAt}
                        onChange={(e) =>
                          updateField('publishedAt', e.target.value)
                        }
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.publishDateHint}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <AutoSaveIndicator lastSaved={lastSaved} />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.creating}
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        {t.submit}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push('/admin/news')}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {t.cancel}
                  </button>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <aside className="space-y-6">
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">{t.sectionPreview}</h2>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {form.imageUrl && !previewError ? (
                      <img
                        src={form.imageUrl}
                        alt="Preview"
                        width={64}
                        height={64}
                        loading="lazy"
                        className="w-16 h-16 rounded-xl object-cover border border-neutral-700"
                        onError={() => setPreviewError(true)}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700 flex-shrink-0">
                        <svg
                          className="w-6 h-6 text-neutral-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {form.title || t.titlePlaceholder}
                      </p>
                      {form.slug && (
                        <p className="text-xs text-neutral-400 font-mono">
                          /{form.slug}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        form.status === 'published'
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-neutral-600 text-neutral-300'
                      }`}
                    >
                      {form.status === 'published'
                        ? t.statusPublished
                        : t.statusDraft}
                    </span>
                    {form.tag && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30">
                        {form.tag}
                      </span>
                    )}
                  </div>

                  {form.excerpt && (
                    <p className="text-sm text-neutral-400 line-clamp-3">
                      {form.excerpt}
                    </p>
                  )}
                </div>
              </section>

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-3">
                <h2 className="text-lg font-semibold">{t.sectionInfo}</h2>
                <div className="text-xs text-neutral-400 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>{t.infoDraft}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>{t.infoMarkdown}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>{t.infoTag}</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
