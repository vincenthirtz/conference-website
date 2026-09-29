import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetServerSidePropsContext } from 'next';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import {
  type TenantDetail,
  tenantsPaths,
} from '@/features/admin/tenants/client';
import {
  useReloadTenant,
  useTenantDetail,
} from '@/features/admin/tenants/hooks/useTenants';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import DataTable from '@/components/admin/DataTable';
import {
  buildGuildColumns,
  buildStaffColumns,
} from '@/components/admin/tenants/tenantTableColumns';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import TenantOverviewPanel from '@/components/admin/tenants/TenantOverviewPanel';
import TenantBotSecretsPanel from '@/components/admin/tenants/TenantBotSecretsPanel';
import TenantInvitationsPanel from '@/components/admin/tenants/TenantInvitationsPanel';
import TenantDomainPanel from '@/components/admin/tenants/TenantDomainPanel';
import TenantLifecyclePanel from '@/components/admin/tenants/TenantLifecyclePanel';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import Tabs, {
  tabButtonId,
  tabPanelId,
  type TabItem,
} from '@/components/admin/Tabs';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';
import TenantNetworkSection from '@/components/admin/tenants/TenantNetworkSection';
import TenantBrandingSection from '@/components/admin/tenants/TenantBrandingSection';

type TenantDetailResponse = TenantDetail;
type StaffRow = TenantDetail['staff'][number];
type GuildRow = TenantDetail['guilds'][number];

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
  tenantId: string;
};

// « Vue d'ensemble » d'abord : la première question posée devant une fiche
// d'espace est « il se passe quoi ici ? », pas « que puis-je changer ? ».
type Tab = 'overview' | 'general' | 'discord' | 'staff';

const TABS_ID_BASE = 'tenant-detail';

const CONFERENCE_SLUG = 'conference';

// POST /api/admin/tenants/[id]/rotate-secrets is live (manager+ only).
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
  const t = useAdminT(nsAdminTenantDetail);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();

  const [tab, setTab] = useState<Tab>('overview');
  const detail = useTenantDetail(tenantId);
  const reloadTenant = useReloadTenant(tenantId);
  const data: TenantDetailResponse | null = detail.data ?? null;
  const [error, setError] = useState<string | null>(null);
  const loadError = detail.error ? detail.error.message || t.errorLoad : null;
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Edit form (general tab)
  const [editName, setEditName] = useState('');
  const [editLocale, setEditLocale] = useState('fr');
  const [editActive, setEditActive] = useState(true);
  // Réseau entre espaces volontaires (lot 4) : deux décisions distinctes,
  // fermées par défaut.
  const [editShareScrims, setEditShareScrims] = useState(false);
  const [editShareRecruitment, setEditShareRecruitment] = useState(false);

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

  const hydrate = useCallback((json: TenantDetailResponse) => {
    setEditName(json.tenant.name);
    setEditLocale(json.tenant.default_locale ?? 'fr');
    setEditActive(json.tenant.is_active);
    setEditLogoUrl(json.tenant.logo_url ?? '');
    setEditPrimaryColor(json.tenant.primary_color ?? '');
    setEditAccentColor(json.tenant.accent_color ?? '');
    setEditCustomDomain(json.tenant.custom_domain ?? '');
    setEditShareScrims(json.tenant.network_share_scrims === true);
    setEditShareRecruitment(json.tenant.network_share_recruitment === true);
  }, []);
  useHydrateOnce(tenantId, detail.data, hydrate);

  useEffect(() => {
    if (detail.error) {
      logger.error('AdminTenantDetailPage: fetch error', detail.error);
    }
  }, [detail.error]);

  /** Relit la fiche ; le formulaire « Général » garde la saisie. */
  const fetchData = useCallback(async () => {
    setError(null);
    await reloadTenant();
  }, [reloadTenant]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      await mutateJson(tenantsPaths.byId(tenantId), {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          default_locale: editLocale || null,
          is_active: editActive,
          logo_url: editLogoUrl.trim() || null,
          primary_color: editPrimaryColor.trim() || null,
          accent_color: editAccentColor.trim() || null,
          custom_domain: editCustomDomain.trim() || null,
          network_share_scrims: editShareScrims,
          network_share_recruitment: editShareRecruitment,
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
      await mutateJson(tenantsPaths.byId(tenantId), {
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
      await mutateJson(tenantsPaths.staff(tenantId), {
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
      await mutateJson(tenantsPaths.staffMember(tenantId, row.staff_id), {
        method: 'DELETE',
      });
      addToast(t.toastStaffRemoved, 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error)?.message || t.errorRemoveStaff, 'error');
    }
  };

  const guildColumns = buildGuildColumns({ t, tenantId, formatDate });
  const staffColumns = buildStaffColumns({
    t,
    formatDate,
    onRemove: handleRemoveStaff,
  });

  const inputClass =
    'w-full px-4 py-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
  const labelClass = 'block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2';
  const smallInputClass =
    'px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
  const smallLabelClass =
    'block text-xs font-medium text-[var(--t3,#a39ba6)] mb-1';
  const cardClass =
    'overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
  const countBadgeClass =
    'ml-2 rounded-[3px] bg-[var(--s3,#2f2732)] px-1.5 py-0.5 text-[10px] text-[var(--t2,#c7bfca)]';

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { slug: data?.tenant.slug ?? '' })}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbTenants, href: '/admin/tenants' },
            { label: data?.tenant.slug ?? '…' },
          ]}
        />

        {data === null && error === null && loadError === null && (
          <div className="py-16">
            <LoadingSpinner label={t.loading} />
          </div>
        )}

        <AlertBanner message={error ?? loadError} className="mb-4" />

        {data && (
          <>
            <div className="mt-4">
              <EntityHeader
                crest={
                  data.tenant.logo_url ? (
                    // biome-ignore lint/performance/noImgElement: free-form URL, outside next/image remotePatterns
                    <img
                      src={data.tenant.logo_url}
                      alt={data.tenant.name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    data.tenant.slug.slice(0, 3).toUpperCase()
                  )
                }
                title={data.tenant.name}
                meta={
                  <span className="font-mono">
                    {data.tenant.slug} · {data.tenant.id}
                  </span>
                }
                status={
                  <Chip tone={data.tenant.is_active ? 'ok' : 'neutral'}>
                    {data.tenant.is_active ? t.statusActive : t.statusArchived}
                  </Chip>
                }
                actions={
                  <AdminButton
                    variant="danger"
                    size="sm"
                    onClick={handleArchive}
                    disabled={archiving || data.tenant.slug === CONFERENCE_SLUG}
                    title={
                      data.tenant.slug === CONFERENCE_SLUG
                        ? t.archiveTitleDisabled
                        : undefined
                    }
                    data-testid="tenant-archive-btn"
                  >
                    {archiving ? t.archiving : t.archive}
                  </AdminButton>
                }
              />
            </div>

            {/* Tabs */}
            <Tabs
              tabs={
                [
                  { id: 'overview', label: t.tabOverview },
                  { id: 'general', label: t.tabGeneral },
                  {
                    id: 'discord',
                    label: (
                      <>
                        {t.tabDiscord}
                        {data.guilds.length > 0 && (
                          <span className={countBadgeClass} data-numeric>
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
                          <span className={countBadgeClass} data-numeric>
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

            {tab === 'overview' && (
              <div
                role="tabpanel"
                id={tabPanelId(TABS_ID_BASE, 'overview')}
                aria-labelledby={tabButtonId(TABS_ID_BASE, 'overview')}
              >
                <TenantOverviewPanel
                  tenantId={tenantId}
                  onOpenTab={(next) => setTab(next as Tab)}
                />

                <div className="mt-6">
                  <TenantLifecyclePanel
                    tenantId={tenantId}
                    onChanged={() => void fetchData()}
                  />
                </div>

                {/* « Qui a fait quoi ici » : suspension, plan, rotation de
                    clé, domaine. Il fallait jusqu'ici ouvrir /admin/logs et
                    filtrer à la main, en sachant quoi chercher. */}
                <div className="mt-6">
                  <EntityHistoryButton
                    entityType="tenant"
                    entityId={tenantId}
                  />
                </div>
              </div>
            )}

            {tab === 'general' && (
              <div
                role="tabpanel"
                id={tabPanelId(TABS_ID_BASE, 'general')}
                aria-labelledby={tabButtonId(TABS_ID_BASE, 'general')}
              >
                <FicheLayout
                  main={
                    <>
                      <FicheSection title={t.tabGeneral}>
                        <form
                          onSubmit={handleSaveGeneral}
                          className="space-y-6"
                        >
                          <div>
                            <label htmlFor="g-name" className={labelClass}>
                              {t.nameLabel}
                            </label>
                            <input
                              id="g-name"
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              required
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label htmlFor="g-locale" className={labelClass}>
                              {t.localeLabel}
                            </label>
                            <select
                              id="g-locale"
                              value={editLocale}
                              onChange={(e) => setEditLocale(e.target.value)}
                              className={inputClass}
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
                              className="h-5 w-5 rounded border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--or,#b467d1)] focus:ring-[var(--or,#b467d1)]"
                            />
                            <span className="text-sm font-medium text-[var(--t2,#c7bfca)]">
                              {t.activeLabel}
                            </span>
                          </label>

                          {/* Réseau entre espaces volontaires : décision
                              d'ouverture, posée avant la marque blanche parce
                              qu'elle engage l'espace et pas son apparence. Le
                              panneau vit à part (règle des écrans gelés, cf.
                              tests/unit/adminFileSizeGuard.test.ts). */}
                          <TenantNetworkSection
                            shareScrims={editShareScrims}
                            shareRecruitment={editShareRecruitment}
                            onChangeScrims={setEditShareScrims}
                            onChangeRecruitment={setEditShareRecruitment}
                            labels={{
                              heading: t.networkHeading,
                              intro: t.networkIntro,
                              scrimsLabel: t.networkScrimsLabel,
                              scrimsHint: t.networkScrimsHint,
                              recruitmentLabel: t.networkRecruitmentLabel,
                              recruitmentHint: t.networkRecruitmentHint,
                            }}
                          />

                          <TenantBrandingSection
                            logoUrl={editLogoUrl}
                            primaryColor={editPrimaryColor}
                            accentColor={editAccentColor}
                            customDomain={editCustomDomain}
                            onChangeLogoUrl={setEditLogoUrl}
                            onChangePrimaryColor={setEditPrimaryColor}
                            onChangeAccentColor={setEditAccentColor}
                            onChangeCustomDomain={setEditCustomDomain}
                          />

                          <div className="pt-2">
                            <AdminButton
                              variant="primary"
                              type="submit"
                              disabled={saving}
                            >
                              {saving ? t.saving : t.save}
                            </AdminButton>
                          </div>
                        </form>
                      </FicheSection>

                      <TenantDomainPanel tenantId={tenantId} />

                      <TenantBotSecretsPanel tenantId={tenantId} />
                    </>
                  }
                  aside={
                    <FicheSection eyebrow title={tf.metaTitle}>
                      <MetaList
                        items={[
                          {
                            label: tf.metaId,
                            value: `${data.tenant.id.slice(0, 8)}…`,
                          },
                          {
                            label: tf.metaCreated,
                            value: formatDate(data.tenant.created_at),
                          },
                          {
                            label: tf.metaUpdated,
                            value: formatDate(data.tenant.updated_at),
                          },
                        ]}
                      />
                    </FicheSection>
                  }
                />
              </div>
            )}

            {tab === 'discord' && (
              <section
                role="tabpanel"
                id={tabPanelId(TABS_ID_BASE, 'discord')}
                aria-labelledby={tabButtonId(TABS_ID_BASE, 'discord')}
                className={cardClass}
              >
                {data.guilds.length === 0 ? (
                  <EmptyState
                    title={t.discordEmptyTitle}
                    description={t.discordEmptyDesc}
                    action={
                      <AdminButtonLink
                        href="/admin/onboarding?tab=a-traiter"
                        size="sm"
                      >
                        {t.discordEmptyAction}
                      </AdminButtonLink>
                    }
                  />
                ) : (
                  <DataTable<GuildRow>
                    rows={data.guilds}
                    columns={guildColumns}
                    rowKey={(g) => g.guild_id}
                    loading={false}
                    error={null}
                    emptyTitle={t.discordEmptyTitle}
                    exportFilename="serveurs-discord"
                  />
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
                {/* Inviter d'abord : rattacher un UUID est le cas rare, et
                    c'était pourtant le seul possible. */}
                <TenantInvitationsPanel
                  tenantId={tenantId}
                  onAccepted={() => void fetchData()}
                />

                <form
                  onSubmit={handleAddStaff}
                  className="flex flex-wrap items-end gap-3 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
                >
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="add-staff-id" className={smallLabelClass}>
                      {t.staffIdLabel}
                    </label>
                    <input
                      id="add-staff-id"
                      type="text"
                      value={staffIdToAdd}
                      onChange={(e) => setStaffIdToAdd(e.target.value)}
                      placeholder={t.staffIdPlaceholder}
                      className={`${smallInputClass} w-full font-mono`}
                    />
                  </div>
                  <div>
                    <label htmlFor="add-staff-role" className={smallLabelClass}>
                      {t.staffRoleLabel}
                    </label>
                    <select
                      id="add-staff-role"
                      value={staffRoleToAdd}
                      onChange={(e) => setStaffRoleToAdd(e.target.value)}
                      className={smallInputClass}
                    >
                      <option value="caster">caster</option>
                      <option value="admin">admin</option>
                      <option value="owner">owner</option>
                    </select>
                  </div>
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    type="submit"
                    disabled={addingStaff || !staffIdToAdd.trim()}
                  >
                    {addingStaff ? t.addingStaff : t.addStaff}
                  </AdminButton>
                </form>

                <section className={cardClass}>
                  {data.staff.length === 0 ? (
                    <EmptyState
                      title={t.staffEmptyTitle}
                      description={t.staffEmptyDesc}
                    />
                  ) : (
                    <DataTable<StaffRow>
                      rows={data.staff}
                      columns={staffColumns}
                      rowKey={(row) => row.staff_id}
                      loading={false}
                      error={null}
                      emptyTitle={t.staffEmptyTitle}
                      emptyMessage={t.staffEmptyDesc}
                      exportFilename="staff-tenant"
                    />
                  )}
                </section>
              </div>
            )}
          </>
        )}
        {dialog}
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage<{ tenantId: string }>(
  { permission: 'manage_settings' },
  async (ctx: GetServerSidePropsContext) => {
    const id = ctx.params?.id;
    if (typeof id !== 'string') {
      return { tenantId: '' };
    }
    return { tenantId: id };
  }
);

export default withAdminQuery(AdminTenantDetailPage);
