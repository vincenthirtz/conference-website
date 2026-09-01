import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import CastMemberStaffPicker from '@/components/admin/CastMemberStaffPicker';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminCastMemberEdit from '@/lib/i18n/locales/admin-fr/adminCastMemberEdit';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function AdminCastMemberEditPage({ staff }: Props) {
  const t = useAdminT(nsAdminCastMemberEdit);
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
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

  const fetchMember = useCallback(async () => {
    if (!id) return;
    setLoading(true);
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
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
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
              onClick={() => router.push('/admin/cast-members')}
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

            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {form.name || t.loading}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <fieldset disabled={saving} className="contents">
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-6 max-w-2xl">
                  {error && (
                    <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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

                  {/* Preview */}
                  {form.imageUrl && (
                    <div className="flex items-center gap-4 p-4 bg-neutral-900/50 rounded-xl border border-neutral-700">
                      <Image
                        src={form.imageUrl}
                        alt={form.name}
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-xl object-cover"
                      />
                      <div>
                        <div className="font-semibold text-white">
                          {form.name || t.previewNameFallback}
                        </div>
                        <div className="text-sm text-neutral-400">
                          {form.title || t.previewTitleFallback}
                        </div>
                        {form.city && (
                          <div className="text-sm text-neutral-500">
                            {form.city}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.nameLabel} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="ex: Gwadael"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.titleLabel}
                      </label>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => updateField('title', e.target.value)}
                        placeholder="ex: Streameuse Overwatch"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.cityLabel}
                      </label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => updateField('city', e.target.value)}
                        placeholder="ex: France, Suisse..."
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.sortOrderLabel}
                      </label>
                      <input
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) =>
                          updateField('sortOrder', e.target.value)
                        }
                        placeholder="0"
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        min="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.imageLabel}
                    </label>
                    <input
                      type="text"
                      value={form.imageUrl}
                      onChange={(e) => updateField('imageUrl', e.target.value)}
                      placeholder="/img/speaker-images/nom.jpg ou https://..."
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.twitchLabel}
                    </label>
                    <input
                      type="url"
                      value={form.twitchUrl}
                      onChange={(e) => updateField('twitchUrl', e.target.value)}
                      placeholder="https://www.twitch.tv/..."
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
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

                  <CastMemberStaffPicker
                    value={form.authUserId}
                    currentCastMemberId={typeof id === 'string' ? id : null}
                    onChange={(next) => updateField('authUserId', next)}
                  />

                  <div className="space-y-3">
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
                      <span className="text-sm text-neutral-300">
                        {t.activeLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
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
                      <span className="text-sm text-neutral-300">
                        {t.promoLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-neutral-700">
                    <button
                      type="button"
                      onClick={() => router.push('/admin/cast-members')}
                      className={`px-5 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors${saving ? ' pointer-events-none opacity-50' : ''}`}
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t.saving}
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {t.submit}
                        </>
                      )}
                    </button>
                  </div>
                </section>
              </fieldset>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({ permission: 'manage_communications' });

export default AdminCastMemberEditPage;
