import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

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

function AdminEditPartnerPage({ staff }: Props) {
  const t = useAdminT('adminPartnerEdit');
  const router = useRouter();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    async function fetchPartner() {
      setLoading(true);
      try {
        const json = await adminFetchJson<{
          name?: string;
          description?: string;
          category?: FormData['category'];
          logo_url?: string;
          website_url?: string;
          note?: string;
          display_order?: number;
          is_active?: boolean;
        }>(`/api/admin/partners/${id}`);

        setForm({
          name: json.name || '',
          description: json.description || '',
          category: json.category || '',
          logoUrl: json.logo_url || '',
          websiteUrl: json.website_url || '',
          note: json.note || '',
          displayOrder: json.display_order || 0,
          isActive: json.is_active ?? true,
        });
      } catch (err: unknown) {
        setError((err as Error).message || t.errorLoad);
      } finally {
        setLoading(false);
      }
    }

    fetchPartner();
    // adminFetchJson et t sont désormais stables : l'effet ne se relance qu'au
    // changement d'id de route, sans refetch parasite.
  }, [id, adminFetchJson, t]);

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

    setSaving(true);

    try {
      await adminFetchJson(`/api/admin/partners/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      addToast(t.updateSuccess, 'success');
    } catch (err: unknown) {
      setError((err as Error).message || t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { name: form.name })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin/partners"
              className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition mb-4"
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
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{t.heading}</h1>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8"
          >
            <fieldset disabled={saving} className="space-y-6">
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

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
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
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
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
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    {t.descriptionLabel}
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white resize-none"
                    placeholder={t.descriptionPlaceholder}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.logoUrl}
                        alt={t.logoPreviewAlt}
                        className="max-h-16 w-auto mx-auto object-contain"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    {t.websiteLabel}
                  </label>
                  <input
                    type="url"
                    value={form.websiteUrl}
                    onChange={(e) => updateField('websiteUrl', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="https://www.exemple.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
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
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    {t.displayOrderLabel}
                  </label>
                  <input
                    type="number"
                    value={form.displayOrder}
                    onChange={(e) =>
                      updateField('displayOrder', parseInt(e.target.value) || 0)
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
                    <span className="text-sm font-medium text-neutral-300">
                      {t.activeLabel}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.saving}
                    </>
                  ) : (
                    t.submit
                  )}
                </button>
                <Link
                  href="/admin/partners"
                  className={`px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800${saving ? ' pointer-events-none opacity-50' : ''}`}
                >
                  {t.backButton}
                </Link>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminEditPartnerPage;
