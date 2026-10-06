/* biome-ignore-all lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import slugify from 'slugify';
import { useDirtyBaseline } from '@/hooks/forms/useDirtyBaseline';
import { useUnsavedChangesGuard } from '@/hooks/forms/useUnsavedChangesGuard';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useCreateNews } from '@/features/admin/news/hooks/useNews';
import type { NewsPayload } from '@/features/admin/news/schemas';
import { useAutoSave } from '@/utils/useAutoSave';
import DraftBanner from '@/components/admin/DraftBanner';
import AutoSaveIndicator from '@/components/admin/AutoSaveIndicator';
import LogoUpload from '@/components/admin/LogoUpload';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminNewsNew from '@/lib/i18n/locales/admin-fr/adminNewsNew';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { FicheLayout, FicheSection } from '@/features/admin/_shared/ui/Fiche';

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

const slugifyValue = (value: string) =>
  slugify(value, { lower: true, strict: true });

const EMPTY_FORM = {
  title: '',
  slug: '',
  tag: 'general',
  excerpt: '',
  imageUrl: '',
  content: '',
  status: 'draft',
  publishedAt: '',
};

function AdminNewsCreate() {
  const t = useAdminT(nsAdminNewsNew);
  const router = useRouter();
  const create = useCreateNews();
  const tf = useAdminT(nsAdminFiche);
  const [form, setForm] = useState(EMPTY_FORM);
  // « Modifications non enregistrées » : tout écart au formulaire vierge (un
  // brouillon restauré compris). Désarmé juste avant de quitter après création.
  const { dirty, markClean } = useDirtyBaseline(form);
  useEffect(() => markClean(EMPTY_FORM), [markClean]);
  useUnsavedChangesGuard(dirty, tf.unsavedConfirm);
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
    setError(null);

    try {
      const payload = {
        ...form,
        slug: form.slug || slugifyValue(form.title),
      };

      const json = await create.mutateAsync(payload as NewsPayload);
      clearDraft();
      flushSync(() => markClean(form));
      router.push(`/admin/news/${json.id}`);
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorGeneric);
    }
  };
  const loading = create.isPending;

  const formId = 'news-new-form';
  const inputClass =
    'w-full px-3 py-2.5 rounded-xl bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] text-sm text-[var(--t1,#f4edf7)]';
  const labelClass = 'block text-sm text-[var(--t2,#c7bfca)] mb-1';
  const hintClass = 'text-xs text-[var(--t3,#a39ba6)] mt-1';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <button
          type="button"
          onClick={() => router.push('/admin/news')}
          className="mb-3 inline-block text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)] transition-colors"
        >
          {t.back}
        </button>

        <EntityHeader
          crest={
            form.title.trim()
              ? form.title.trim().slice(0, 3).toUpperCase()
              : undefined
          }
          title={form.title || t.heading}
          meta={t.subtitle}
          status={<AutoSaveIndicator lastSaved={lastSaved} />}
          actions={
            <>
              <AdminButton
                onClick={() => router.push('/admin/news')}
                disabled={loading}
              >
                {t.cancel}
              </AdminButton>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={loading}
              >
                {loading ? t.creating : t.submit}
              </AdminButton>
            </>
          }
        />

        <FicheLayout
          main={
            <>
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
                <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
                  {error}
                </div>
              )}

              <form
                id={formId}
                onSubmit={onSubmit}
                className="flex flex-col gap-6"
              >
                <FicheSection title={t.sectionGeneral}>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          {t.titleLabel}{' '}
                          <span className="text-[var(--err,#ff6b6b)]">*</span>
                        </label>
                        <input
                          type="text"
                          className={inputClass}
                          value={form.title}
                          onChange={(e) => updateField('title', e.target.value)}
                          placeholder={t.titlePlaceholder}
                          required
                        />
                      </div>

                      <div>
                        <label className={labelClass}>{t.slugLabel}</label>
                        <input
                          type="text"
                          className={`${inputClass} font-mono`}
                          value={form.slug}
                          onChange={(e) =>
                            updateField('slug', slugifyValue(e.target.value))
                          }
                          placeholder={t.slugPlaceholder}
                        />
                        <p className={hintClass}>{t.slugHint}</p>
                      </div>

                      <div>
                        <label className={labelClass}>
                          {t.tagLabel}{' '}
                          <span className="text-[var(--err,#ff6b6b)]">*</span>
                        </label>
                        <input
                          type="text"
                          className={inputClass}
                          value={form.tag}
                          onChange={(e) =>
                            updateField('tag', slugifyValue(e.target.value))
                          }
                          placeholder={t.tagPlaceholder}
                          required
                        />
                        <p className={hintClass}>{t.tagHint}</p>
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
                      <label className={labelClass}>{t.excerptLabel}</label>
                      <textarea
                        rows={2}
                        className={`${inputClass} resize-y`}
                        value={form.excerpt}
                        onChange={(e) => updateField('excerpt', e.target.value)}
                        placeholder={t.excerptPlaceholder}
                      />
                    </div>
                  </div>
                </FicheSection>

                <FicheSection title={t.sectionContent}>
                  <label className={labelClass}>
                    {t.contentLabel}{' '}
                    <span className="text-[var(--err,#ff6b6b)]">*</span>
                  </label>
                  <textarea
                    rows={12}
                    className={`${inputClass} font-mono resize-y`}
                    value={form.content}
                    onChange={(e) => updateField('content', e.target.value)}
                    placeholder={t.contentPlaceholder}
                    required
                  />
                </FicheSection>

                <FicheSection title={t.sectionPublication}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>{t.statusLabel}</label>
                      <select
                        className={inputClass}
                        value={form.status}
                        onChange={(e) => updateField('status', e.target.value)}
                      >
                        <option value="draft">{t.statusDraft}</option>
                        <option value="published">{t.statusPublished}</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>{t.publishDateLabel}</label>
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={form.publishedAt}
                        onChange={(e) =>
                          updateField('publishedAt', e.target.value)
                        }
                      />
                      <p className={hintClass}>{t.publishDateHint}</p>
                    </div>
                  </div>
                </FicheSection>
              </form>
            </>
          }
          aside={
            <>
              <FicheSection eyebrow title={t.sectionPreview}>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {form.imageUrl && !previewError ? (
                      <img
                        src={form.imageUrl}
                        alt="Preview"
                        width={64}
                        height={64}
                        loading="lazy"
                        className="w-16 h-16 rounded-xl object-cover border border-[var(--line2,rgba(194,196,201,.2))]"
                        onError={() => setPreviewError(true)}
                      />
                    ) : (
                      <div className="w-16 h-16 flex-shrink-0 rounded-xl border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-semibold text-[var(--t1,#f4edf7)]">
                        {form.title || t.titlePlaceholder}
                      </p>
                      {form.slug && (
                        <p className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                          /{form.slug}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Chip tone={form.status === 'published' ? 'ok' : 'neutral'}>
                      {form.status === 'published'
                        ? t.statusPublished
                        : t.statusDraft}
                    </Chip>
                    {form.tag && <Chip tone="brand">{form.tag}</Chip>}
                  </div>

                  {form.excerpt && (
                    <p className="line-clamp-3 text-sm text-[var(--t3,#a39ba6)]">
                      {form.excerpt}
                    </p>
                  )}
                </div>
              </FicheSection>

              <FicheSection eyebrow title={t.sectionInfo}>
                <ul className="list-disc space-y-2 pl-4 text-xs text-[var(--t3,#a39ba6)]">
                  <li>{t.infoDraft}</li>
                  <li>{t.infoMarkdown}</li>
                  <li>{t.infoTag}</li>
                </ul>
              </FicheSection>
            </>
          }
        />
      </div>
    </>
  );
}

export default withAdminQuery(AdminNewsCreate);
