import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAutoSave } from '@/utils/useAutoSave';
import DraftBanner from '@/components/admin/DraftBanner';
import AutoSaveIndicator from '@/components/admin/AutoSaveIndicator';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminAnnouncementsNew from '@/lib/i18n/locales/admin-fr/adminAnnouncementsNew';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

type FormState = {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  isActive: boolean;
};

export const getServerSideProps = withStaffPage('admin');

function AdminAnnouncementCreatePage({ staff }: Props) {
  const t = useAdminT(nsAdminAnnouncementsNew);
  const router = useRouter();
  const { adminFetch } = useAdminFetch();

  const [form, setForm] = useState<FormState>({
    title: '',
    message: '',
    ctaLabel: '',
    ctaUrl: '',
    startsAt: '',
    endsAt: '',
    priority: '0',
    isActive: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const { draftRestored, lastSaved, clearDraft, restoreDraft } = useAutoSave(
    form,
    {
      key: 'announcement_new',
    }
  );

  useEffect(() => {
    if (draftRestored) setShowDraftBanner(true);
  }, [draftRestored]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.title.trim()) {
      setErrorMsg(t.errorTitleRequired);
      return;
    }

    if (!form.message.trim()) {
      setErrorMsg(t.errorMessageRequired);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        isActive: form.isActive,
        priority: Number(form.priority) || 0,
      };

      const res = await adminFetch('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorCreate);
      }

      clearDraft();
      router.push('/admin/announcements');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorCreateUnknown);
      setSubmitting(false);
    }
  }

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
              onClick={() => router.push('/admin/announcements')}
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
              {errorMsg && (
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
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
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
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="inline-flex items-center gap-3 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                          checked={form.isActive}
                          onChange={(e) =>
                            updateField('isActive', e.target.checked)
                          }
                        />
                        <span>{t.activate}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.messageLabel} <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
                      value={form.message}
                      onChange={(e) => updateField('message', e.target.value)}
                      placeholder={t.messagePlaceholder}
                    />
                  </div>
                </section>

                {/* Call to Action */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">{t.sectionCta}</h2>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.ctaLabelLabel}
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.ctaLabel}
                        onChange={(e) =>
                          updateField('ctaLabel', e.target.value)
                        }
                        placeholder={t.ctaLabelPlaceholder}
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.ctaUrlLabel}
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                        value={form.ctaUrl}
                        onChange={(e) => updateField('ctaUrl', e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </section>

                {/* Planification */}
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-semibold">{t.sectionSchedule}</h2>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.startDateLabel}
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.startsAt}
                        onChange={(e) =>
                          updateField('startsAt', e.target.value)
                        }
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.startDateHint}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.endDateLabel}
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.endsAt}
                        onChange={(e) => updateField('endsAt', e.target.value)}
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.endDateHint}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.priorityLabel}
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={form.priority}
                        onChange={(e) =>
                          updateField('priority', e.target.value)
                        }
                        placeholder="0"
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.priorityHint}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
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
                    onClick={() => router.push('/admin/announcements')}
                    disabled={submitting}
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
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                      <svg
                        className="w-5 h-5 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {form.title || t.previewTitleFallback}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        form.isActive
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-neutral-600 text-neutral-300'
                      }`}
                    >
                      {form.isActive ? t.statusActive : t.statusInactive}
                    </span>
                    {Number(form.priority) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                        {format(t.priority, { priority: form.priority })}
                      </span>
                    )}
                  </div>

                  {form.message && (
                    <p className="text-sm text-neutral-400 line-clamp-3">
                      {form.message}
                    </p>
                  )}

                  {form.ctaLabel && (
                    <div className="pt-2">
                      <span className="inline-block px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 text-xs font-medium border border-blue-500/30">
                        {form.ctaLabel}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-3">
                <h2 className="text-lg font-semibold">{t.sectionInfo}</h2>
                <div className="text-xs text-neutral-400 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>{t.infoBanner}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>{t.infoSchedule}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>{t.infoPriority}</p>
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

export default AdminAnnouncementCreatePage;
