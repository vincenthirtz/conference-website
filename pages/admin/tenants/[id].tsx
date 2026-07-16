import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSidePropsContext } from 'next';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import BotSecretsRevealModal from '@/components/admin/BotSecretsRevealModal';
import Tabs, {
  tabButtonId,
  tabPanelId,
  type TabItem,
} from '@/components/admin/Tabs';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type Tenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  custom_domain: string | null;
  created_at: string;
  updated_at: string;
};

type GuildRow = {
  guild_id: string;
  guild_name: string | null;
  joined_at: string | null;
};

type StaffRow = {
  staff_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  added_at: string | null;
};

type TenantDetailResponse = {
  tenant: Tenant;
  guilds: GuildRow[];
  staff: StaffRow[];
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
  tenantId: string;
};

type Tab = 'general' | 'discord' | 'staff';

const TABS_ID_BASE = 'tenant-detail';

const CONFERENCE_SLUG = 'conference';

// POST /api/admin/tenants/[id]/rotate-secrets is live (manager+ only).
const ROTATE_SECRETS_API_READY = true;

type RotateSecretsResponse = {
  tenantId: string;
  botApiKey: string;
  botWebhookSecret: string;
  rotatedAt: string;
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function AdminTenantDetailPage({ tenantId }: Props) {
  const t = useAdminT('adminTenantDetail');
  const router = useRouter();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();

  const [tab, setTab] = useState<Tab>('general');
  const [data, setData] = useState<TenantDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Edit form (general tab)
  const [editName, setEditName] = useState('');
  const [editLocale, setEditLocale] = useState('fr');
  const [editActive, setEditActive] = useState(true);

  // White-label branding (general tab)
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('');
  const [editAccentColor, setEditAccentColor] = useState('');
  const [editCustomDomain, setEditCustomDomain] = useState('');

  // Add staff form
  const [staffIdToAdd, setStaffIdToAdd] = useState('');
  const [staffRoleToAdd, setStaffRoleToAdd] = useState('caster');
  const [addingStaff, setAddingStaff] = useState(false);

  // Bot secrets rotation
  const [rotatingSecrets, setRotatingSecrets] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<{
    botApiKey: string;
    botWebhookSecret: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const json = await adminFetchJson<TenantDetailResponse>(
        `/api/admin/tenants/${tenantId}`
      );
      setData(json);
      setEditName(json.tenant.name);
      setEditLocale(json.tenant.default_locale ?? 'fr');
      setEditActive(json.tenant.is_active);
      setEditLogoUrl(json.tenant.logo_url ?? '');
      setEditPrimaryColor(json.tenant.primary_color ?? '');
      setEditAccentColor(json.tenant.accent_color ?? '');
      setEditCustomDomain(json.tenant.custom_domain ?? '');
    } catch (err) {
      logger.error('AdminTenantDetailPage: fetch error', err);
      setError((err as Error)?.message || t.errorLoad);
    }
  }, [adminFetchJson, tenantId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      await mutateJson(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          default_locale: editLocale || null,
          is_active: editActive,
          logo_url: editLogoUrl.trim() || null,
          primary_color: editPrimaryColor.trim() || null,
          accent_color: editAccentColor.trim() || null,
          custom_domain: editCustomDomain.trim() || null,
        }),
      });
      addToast(t.toastUpdated, 'success');
      await fetchData();
    } catch (err) {
      setError((err as Error)?.message || t.errorUpdate);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!data) return;
    if (data.tenant.slug === CONFERENCE_SLUG) {
      addToast(t.conferenceNoArchive, 'error');
      return;
    }
    const ok = await confirm({
      title: format(t.confirmArchiveTitle, { slug: data.tenant.slug }),
      subtitle: t.confirmArchiveSubtitle,
      variant: 'danger',
      confirmLabel: t.archive,
    });
    if (!ok) return;
    setArchiving(true);
    try {
      await mutateJson(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });
      addToast(t.toastArchived, 'success');
      router.push('/admin/tenants');
    } catch (err) {
      addToast((err as Error)?.message || t.errorArchive, 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffIdToAdd.trim()) return;
    setAddingStaff(true);
    try {
      await mutateJson(`/api/admin/tenants/${tenantId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          staff_id: staffIdToAdd.trim(),
          role: staffRoleToAdd,
        }),
      });
      addToast(t.toastStaffAdded, 'success');
      setStaffIdToAdd('');
      await fetchData();
    } catch (err) {
      addToast((err as Error)?.message || t.errorAddStaff, 'error');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleRotateSecrets = async () => {
    if (!data) return;
    if (!ROTATE_SECRETS_API_READY) return;
    const ok = await confirm({
      title: t.confirmRotateTitle,
      subtitle: t.confirmRotateSubtitle,
      variant: 'danger',
      confirmLabel: t.rotate,
    });
    if (!ok) return;
    setRotatingSecrets(true);
    try {
      const resp = await mutateJson<RotateSecretsResponse>(
        `/api/admin/tenants/${tenantId}/rotate-secrets`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      // Show the secrets one-shot — never store, never log.
      setRevealedSecrets({
        botApiKey: resp.botApiKey,
        botWebhookSecret: resp.botWebhookSecret,
      });
      addToast(t.toastRotated, 'success');
    } catch (err) {
      addToast((err as Error)?.message || t.errorRotate, 'error');
    } finally {
      setRotatingSecrets(false);
    }
  };

  const handleRemoveStaff = async (row: StaffRow) => {
    const ok = await confirm({
      title: format(t.confirmRemoveStaffTitle, {
        name: row.display_name ?? row.email ?? row.staff_id,
      }),
      subtitle: t.confirmRemoveStaffSubtitle,
      variant: 'danger',
      confirmLabel: t.remove,
    });
    if (!ok) return;
    try {
      await mutateJson(`/api/admin/tenants/${tenantId}/staff/${row.staff_id}`, {
        method: 'DELETE',
      });
      addToast(t.toastStaffRemoved, 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error)?.message || t.errorRemoveStaff, 'error');
    }
  };

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { slug: data?.tenant.slug ?? '' })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTenants, href: '/admin/tenants' },
              { label: data?.tenant.slug ?? '…' },
            ]}
          />

          {data === null && error === null && (
            <div className="py-16">
              <LoadingSpinner label={t.loading} />
            </div>
          )}

          <AlertBanner message={error} className="mb-4" />

          {data && (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                      {data.tenant.name}
                    </h1>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        data.tenant.is_active
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-neutral-700/40 text-neutral-400 border border-neutral-600/40'
                      }`}
                    >
                      {data.tenant.is_active
                        ? t.statusActive
                        : t.statusArchived}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-400 font-mono">
                    {data.tenant.slug} · {data.tenant.id}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={archiving || data.tenant.slug === CONFERENCE_SLUG}
                    className="px-4 py-2.5 rounded-xl border border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      data.tenant.slug === CONFERENCE_SLUG
                        ? t.archiveTitleDisabled
                        : undefined
                    }
                    data-testid="tenant-archive-btn"
                  >
                    {archiving ? t.archiving : t.archive}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <Tabs
                tabs={
                  [
                    { id: 'general', label: t.tabGeneral },
                    {
                      id: 'discord',
                      label: (
                        <>
                          {t.tabDiscord}
                          {data.guilds.length > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-neutral-700 text-neutral-300">
                              {data.guilds.length}
                            </span>
                          )}
                        </>
                      ),
                    },
                    {
                      id: 'staff',
                      label: (
                        <>
                          {t.tabStaff}
                          {data.staff.length > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-neutral-700 text-neutral-300">
                              {data.staff.length}
                            </span>
                          )}
                        </>
                      ),
                    },
                  ] satisfies TabItem[]
                }
                active={tab}
                onChange={(id) => setTab(id as Tab)}
                ariaLabel={t.tablistLabel}
                idBase={TABS_ID_BASE}
                className="mb-6"
              />

              {tab === 'general' && (
                <div
                  role="tabpanel"
                  id={tabPanelId(TABS_ID_BASE, 'general')}
                  aria-labelledby={tabButtonId(TABS_ID_BASE, 'general')}
                  className="space-y-6"
                >
                  <form
                    onSubmit={handleSaveGeneral}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8 space-y-6"
                  >
                    <div>
                      <label
                        htmlFor="g-name"
                        className="block text-sm font-medium text-neutral-300 mb-2"
                      >
                        {t.nameLabel}
                      </label>
                      <input
                        id="g-name"
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="g-locale"
                        className="block text-sm font-medium text-neutral-300 mb-2"
                      >
                        {t.localeLabel}
                      </label>
                      <select
                        id="g-locale"
                        value={editLocale}
                        onChange={(e) => setEditLocale(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                      >
                        <option value="fr">{t.localeFr}</option>
                        <option value="en">{t.localeEn}</option>
                      </select>
                    </div>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                        className="w-5 h-5 rounded border-neutral-600 bg-neutral-900/50 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-sm font-medium text-neutral-300">
                        {t.activeLabel}
                      </span>
                    </label>

                    {/* White-label branding */}
                    <fieldset
                      className="border-t border-neutral-700/50 pt-6 space-y-6"
                      data-testid="tenant-branding-section"
                    >
                      <legend className="sr-only">{t.brandingHeading}</legend>
                      <div>
                        <h3 className="text-base font-semibold text-white">
                          {t.brandingHeading}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-400">
                          {t.brandingDesc}
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="g-logo-url"
                          className="block text-sm font-medium text-neutral-300 mb-2"
                        >
                          {t.logoUrlLabel}
                        </label>
                        <input
                          id="g-logo-url"
                          type="text"
                          value={editLogoUrl}
                          onChange={(e) => setEditLogoUrl(e.target.value)}
                          placeholder={t.logoUrlPlaceholder}
                          className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                          data-testid="tenant-logo-url-input"
                        />
                        <p className="mt-1.5 text-xs text-neutral-500">
                          {t.logoUrlHint}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label
                            htmlFor="g-primary-color"
                            className="block text-sm font-medium text-neutral-300 mb-2"
                          >
                            {t.primaryColorLabel}
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              aria-label={t.primaryColorLabel}
                              value={
                                /^#[0-9a-fA-F]{6}$/.test(editPrimaryColor)
                                  ? editPrimaryColor
                                  : '#b24be0'
                              }
                              onChange={(e) =>
                                setEditPrimaryColor(e.target.value)
                              }
                              className="h-11 w-14 rounded-lg border border-neutral-600 bg-neutral-900/50 cursor-pointer p-1"
                            />
                            <input
                              id="g-primary-color"
                              type="text"
                              value={editPrimaryColor}
                              onChange={(e) =>
                                setEditPrimaryColor(e.target.value)
                              }
                              placeholder={t.colorPlaceholder}
                              className="flex-1 px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono"
                              data-testid="tenant-primary-color-input"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="g-accent-color"
                            className="block text-sm font-medium text-neutral-300 mb-2"
                          >
                            {t.accentColorLabel}
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              aria-label={t.accentColorLabel}
                              value={
                                /^#[0-9a-fA-F]{6}$/.test(editAccentColor)
                                  ? editAccentColor
                                  : '#7bc96a'
                              }
                              onChange={(e) =>
                                setEditAccentColor(e.target.value)
                              }
                              className="h-11 w-14 rounded-lg border border-neutral-600 bg-neutral-900/50 cursor-pointer p-1"
                            />
                            <input
                              id="g-accent-color"
                              type="text"
                              value={editAccentColor}
                              onChange={(e) =>
                                setEditAccentColor(e.target.value)
                              }
                              placeholder={t.colorPlaceholder}
                              className="flex-1 px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono"
                              data-testid="tenant-accent-color-input"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="g-custom-domain"
                          className="block text-sm font-medium text-neutral-300 mb-2"
                        >
                          {t.customDomainLabel}
                        </label>
                        <input
                          id="g-custom-domain"
                          type="text"
                          value={editCustomDomain}
                          onChange={(e) => setEditCustomDomain(e.target.value)}
                          placeholder={t.customDomainPlaceholder}
                          className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white font-mono"
                          data-testid="tenant-custom-domain-input"
                        />
                        <p className="mt-1.5 text-xs text-neutral-500">
                          {t.customDomainHint}
                        </p>
                      </div>

                      {/* Live preview */}
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
                          {t.previewLabel}
                        </p>
                        <div
                          className="flex items-center gap-4 rounded-xl border border-neutral-700/50 bg-neutral-900/50 p-4"
                          data-testid="tenant-branding-preview"
                        >
                          {editLogoUrl.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={editLogoUrl.trim()}
                              alt={t.previewLogoAlt}
                              className="h-10 w-10 rounded-lg object-contain bg-neutral-800"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-500">
                              {t.previewNoLogo}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span
                              className="h-8 w-8 rounded-md border border-white/10"
                              style={{
                                backgroundColor: /^#[0-9a-fA-F]{6}$/.test(
                                  editPrimaryColor
                                )
                                  ? editPrimaryColor
                                  : 'transparent',
                              }}
                              title={t.primaryColorLabel}
                            />
                            <span
                              className="h-8 w-8 rounded-md border border-white/10"
                              style={{
                                backgroundColor: /^#[0-9a-fA-F]{6}$/.test(
                                  editAccentColor
                                )
                                  ? editAccentColor
                                  : 'transparent',
                              }}
                              title={t.accentColorLabel}
                            />
                          </div>
                          {editCustomDomain.trim() && (
                            <span className="text-xs font-mono text-neutral-400 truncate">
                              {editCustomDomain.trim()}
                            </span>
                          )}
                        </div>
                      </div>
                    </fieldset>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                      >
                        {saving ? t.saving : t.save}
                      </button>
                    </div>
                  </form>

                  <section
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8"
                    data-testid="tenant-bot-secrets-section"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-amber-900/30 flex items-center justify-center text-amber-300 flex-shrink-0">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          {t.botSecretsHeading}
                        </h2>
                        <p className="mt-1 text-sm text-neutral-400">
                          {t.botSecretsDesc}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRotateSecrets}
                        disabled={rotatingSecrets || !ROTATE_SECRETS_API_READY}
                        className="px-4 py-2.5 rounded-xl border border-amber-500/50 text-amber-200 hover:border-amber-400 hover:bg-amber-500/10 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          !ROTATE_SECRETS_API_READY
                            ? t.apiComingSoonTitle
                            : undefined
                        }
                        data-testid="tenant-rotate-secrets-btn"
                      >
                        {rotatingSecrets ? t.rotating : t.rotateBtn}
                      </button>
                      {!ROTATE_SECRETS_API_READY && (
                        <span className="text-xs text-neutral-500">
                          {t.apiInProgress}
                        </span>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {tab === 'discord' && (
                <section
                  role="tabpanel"
                  id={tabPanelId(TABS_ID_BASE, 'discord')}
                  aria-labelledby={tabButtonId(TABS_ID_BASE, 'discord')}
                  className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden"
                >
                  {data.guilds.length === 0 ? (
                    <EmptyState
                      title={t.discordEmptyTitle}
                      description={t.discordEmptyDesc}
                      action={
                        <Link
                          href="/admin/onboarding?tab=guild-links"
                          className="px-4 py-2 rounded-lg border border-neutral-600 text-sm hover:border-neutral-500 transition-colors"
                        >
                          {t.discordEmptyAction}
                        </Link>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left">
                              {t.colGuildId}
                            </th>
                            <th scope="col" className="px-4 py-3 text-left">
                              {t.colGuildName}
                            </th>
                            <th scope="col" className="px-4 py-3 text-left">
                              {t.colJoinedAt}
                            </th>
                            <th scope="col" className="px-4 py-3 text-right">
                              {t.colActions}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700/50">
                          {data.guilds.map((g) => (
                            <tr
                              key={g.guild_id}
                              className="hover:bg-neutral-700/30 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-xs text-purple-300">
                                {g.guild_id}
                              </td>
                              <td className="px-4 py-3 text-white">
                                {g.guild_name ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-neutral-400 text-xs">
                                {formatDate(g.joined_at)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link
                                  href={`/admin/tenants/${tenantId}/discord-config/${g.guild_id}`}
                                  className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                                >
                                  {t.configure}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {tab === 'staff' && (
                <div
                  role="tabpanel"
                  id={tabPanelId(TABS_ID_BASE, 'staff')}
                  aria-labelledby={tabButtonId(TABS_ID_BASE, 'staff')}
                  className="space-y-4"
                >
                  <form
                    onSubmit={handleAddStaff}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 flex flex-wrap gap-3 items-end"
                  >
                    <div className="flex-1 min-w-[220px]">
                      <label
                        htmlFor="add-staff-id"
                        className="block text-xs font-medium text-neutral-400 mb-1"
                      >
                        {t.staffIdLabel}
                      </label>
                      <input
                        id="add-staff-id"
                        type="text"
                        value={staffIdToAdd}
                        onChange={(e) => setStaffIdToAdd(e.target.value)}
                        placeholder={t.staffIdPlaceholder}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="add-staff-role"
                        className="block text-xs font-medium text-neutral-400 mb-1"
                      >
                        {t.staffRoleLabel}
                      </label>
                      <select
                        id="add-staff-role"
                        value={staffRoleToAdd}
                        onChange={(e) => setStaffRoleToAdd(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      >
                        <option value="caster">caster</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={addingStaff || !staffIdToAdd.trim()}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingStaff ? t.addingStaff : t.addStaff}
                    </button>
                  </form>

                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
                    {data.staff.length === 0 ? (
                      <EmptyState
                        title={t.staffEmptyTitle}
                        description={t.staffEmptyDesc}
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                            <tr>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colStaffName}
                              </th>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colStaffEmail}
                              </th>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colStaffRole}
                              </th>
                              <th scope="col" className="px-4 py-3 text-left">
                                {t.colAddedAt}
                              </th>
                              <th scope="col" className="px-4 py-3 text-right">
                                {t.colActions}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-700/50">
                            {data.staff.map((s) => (
                              <tr
                                key={s.staff_id}
                                className="hover:bg-neutral-700/30 transition-colors"
                              >
                                <td className="px-4 py-3 text-white">
                                  {s.display_name ?? '—'}
                                </td>
                                <td className="px-4 py-3 text-neutral-300">
                                  {s.email ?? '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider bg-white/5 border border-white/10 text-neutral-300">
                                    {s.role}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-neutral-400 text-xs">
                                  {formatDate(s.added_at)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStaff(s)}
                                    className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                                  >
                                    {t.removeStaff}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
        {dialog}
        {revealedSecrets && (
          <BotSecretsRevealModal
            botApiKey={revealedSecrets.botApiKey}
            botWebhookSecret={revealedSecrets.botWebhookSecret}
            onClose={() => setRevealedSecrets(null)}
          />
        )}
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage<{ tenantId: string }>(
  'admin',
  async (ctx: GetServerSidePropsContext) => {
    const id = ctx.params?.id;
    if (typeof id !== 'string') {
      return { tenantId: '' };
    }
    return { tenantId: id };
  }
);

export default AdminTenantDetailPage;
