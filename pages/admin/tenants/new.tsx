import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CreateTenantResponse = {
  tenant: { id: string; slug: string; name: string };
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function AdminNewTenantPage(_props: Props) {
  const t = useAdminT('adminTenantsNew');
  const router = useRouter();
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [defaultLocale, setDefaultLocale] = useState('fr');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const computedSlug = slugTouched ? slug : slugify(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t.errorNameRequired);
      return;
    }
    const finalSlug = computedSlug.trim();
    if (!finalSlug) {
      setError(t.errorSlugRequired);
      return;
    }
    if (!SLUG_RE.test(finalSlug)) {
      setError(t.errorSlugInvalid);
      return;
    }

    setSaving(true);
    try {
      const json = await mutateJson<CreateTenantResponse>(
        '/api/admin/tenants',
        {
          method: 'POST',
          body: JSON.stringify({
            slug: finalSlug,
            name: name.trim(),
            default_locale: defaultLocale || undefined,
          }),
        }
      );
      addToast(format(t.toastCreated, { slug: json.tenant.slug }), 'success');
      router.push(`/admin/tenants/${json.tenant.id}`);
    } catch (err) {
      setError((err as Error)?.message || t.errorCreate);
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
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTenants, href: '/admin/tenants' },
              { label: t.breadcrumbNew },
            ]}
          />

          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">{t.heading}</h1>
            <p className="mt-1 text-sm text-neutral-400">{t.subtitle}</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8 space-y-6"
          >
            <AlertBanner message={error} />

            <div>
              <label
                htmlFor="tenant-name"
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                {t.nameLabel} <span className="text-red-400">*</span>
              </label>
              <input
                id="tenant-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                placeholder={t.namePlaceholder}
                required
                data-testid="tenant-name-input"
              />
            </div>

            <div>
              <label
                htmlFor="tenant-slug"
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                {t.slugLabel} <span className="text-red-400">*</span>
              </label>
              <input
                id="tenant-slug"
                type="text"
                value={computedSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono text-sm"
                placeholder={t.slugPlaceholder}
                required
                data-testid="tenant-slug-input"
              />
              <p className="text-xs text-neutral-500 mt-1">{t.slugHelp}</p>
            </div>

            <div>
              <label
                htmlFor="tenant-locale"
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                {t.localeLabel}
              </label>
              <select
                id="tenant-locale"
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
              >
                <option value="fr">{t.localeFr}</option>
                <option value="en">{t.localeEn}</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                data-testid="tenant-create-submit"
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
                href="/admin/tenants"
                className="px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800"
              >
                {t.cancel}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('manager');

export default AdminNewTenantPage;
