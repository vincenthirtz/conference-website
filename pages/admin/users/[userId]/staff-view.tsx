// pages/admin/users/[userId]/staff-view.tsx
//
// Admin « Vue staff » — la fiche d'une personne qui administre.
//
// Elle répond à trois questions qu'on se posait en ouvrant trois écrans :
//
//   1. QUE PEUT-ELLE ? Son rôle de plateforme, ses permissions effectives, et
//      celles qui lui ont été accordées à l'unité par-dessus son rôle.
//   2. CHEZ QUI ? Les espaces où elle est rattachée, avec son rôle dans chacun.
//      C'est la dimension qu'on oublie : `staff.role` dit ce qu'on est sur la
//      PLATEFORME, `tenant_staff.role` ce qu'on est CHEZ un espace, et il élève
//      sans déborder. Les confondre a déjà créé un partenaire en `admin`
//      global, avec accès aux adhérents et aux campagnes email de l'association.
//   3. QU'A-T-ELLE FAIT ? Ses dernières actions au journal d'audit.
//
// Aucune de ces données n'est nouvelle : la page COMPOSE trois endpoints qui
// existaient déjà, plutôt que d'ajouter un quatrième qui les recopierait et
// divergerait. Seule la fiche staff elle-même — rôle, état, rattachements —
// demandait une lecture que personne ne servait.
//
// C'est une vue de LECTURE. Changer un rôle, accorder une permission ou
// suspendre un compte se fait depuis `/admin/users/manage`, où ces gestes sont
// déjà écrits, gardés et audités ; les dupliquer ici ferait deux chemins pour
// le même pouvoir.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { roleColor, roleLabel } from '@/components/admin/users/roleDisplay';
import type { StaffProps } from '@/types/admin';
import nsAdminStaffView from '@/lib/i18n/locales/admin-fr/adminStaffView';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';
import { AdminButtonLink } from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
// Les libellés de rôles vivent avec l'écran qui les édite : en recopier une
// seconde table ici la ferait diverger au premier rôle ajouté.
import nsAdminUsersManage from '@/lib/i18n/locales/admin-fr/adminUsersManage';

type StaffRecord = {
  id: string;
  authUserId: string;
  email: string | null;
  displayName: string | null;
  role: string | null;
  isActive: boolean | null;
  isPoleAdmin: boolean | null;
  createdAt: string | null;
};

type SpaceRow = {
  tenantId: string;
  name: string | null;
  slug: string | null;
  isActive: boolean | null;
  role: string | null;
  since: string | null;
};

type PermissionsPayload = {
  role: string;
  rolePermissions: string[];
  extraPermissions: string[];
  effective: string[];
};

type LogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminStaffViewPage(_props: StaffProps) {
  const t = useAdminT(nsAdminStaffView);
  const tRoles = useAdminT(nsAdminUsersManage);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();

  const userId = Array.isArray(router.query.userId)
    ? router.query.userId[0]
    : router.query.userId;

  const [record, setRecord] = useState<StaffRecord | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [perms, setPerms] = useState<PermissionsPayload | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const fiche = await adminFetchJson<{
          staff: StaffRecord;
          spaces: SpaceRow[];
        }>(`/api/admin/users/${id}/staff`);
        setRecord(fiche.staff);
        setSpaces(fiche.spaces);

        // Les deux compléments ne doivent pas faire échouer la fiche : une
        // permission illisible ou un journal indisponible laissent la page
        // utile, un écran vide ne l'est pas.
        const [p, l] = await Promise.allSettled([
          adminFetchJson<PermissionsPayload>(
            `/api/admin/users/${id}/permissions`
          ),
          adminFetchJson<{ logs: LogRow[] }>(
            `/api/admin/logs?staffId=${encodeURIComponent(fiche.staff.id)}&limit=15`
          ),
        ]);
        if (p.status === 'fulfilled') setPerms(p.value);
        if (l.status === 'fulfilled') setLogs(l.value.logs ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.loadError);
        setRecord(null);
      } finally {
        setLoading(false);
      }
    },
    [adminFetchJson, t.loadError]
  );

  useEffect(() => {
    if (typeof userId === 'string' && userId) void load(userId);
  }, [load, userId]);

  const name = record?.displayName || record?.email || t.unnamed;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbUsers, href: '/admin/users/manage' },
            { label: t.breadcrumbCurrent },
          ]}
        />

        <AlertBanner message={error} variant="error" className="mb-4" />

        {loading ? (
          <p className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</p>
        ) : !record ? (
          <p className="py-10 text-center text-sm text-[var(--t3,#a39ba6)]">
            {t.notStaff}
          </p>
        ) : (
          <>
            {/* Les gestes vivent là où ils sont déjà gardés et audités. */}
            <EntityHeader
              crest={name.slice(0, 3).toUpperCase()}
              title={name}
              meta={
                <>
                  {t.subtitle} ·{' '}
                  {format(t.since, { date: formatDate(record.createdAt) })}
                </>
              }
              status={
                <>
                  <span
                    className={`inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11px] font-bold uppercase tracking-[0.12em] ${roleColor(record.role ?? '')}`}
                  >
                    {roleLabel(tRoles, record.role ?? '')}
                  </span>
                  {record.isActive === false && (
                    <Chip tone="err">{t.suspended}</Chip>
                  )}
                  {record.isPoleAdmin && (
                    <Chip tone="brand">{t.poleAdmin}</Chip>
                  )}
                </>
              }
              actions={
                <AdminButtonLink href="/admin/users/manage" size="sm">
                  {t.manageCta}
                </AdminButtonLink>
              }
            />

            <FicheLayout
              main={
                <>
                  <FicheSection title={t.spacesHeading}>
                    <p className="mb-4 max-w-2xl text-sm text-[var(--t3,#a39ba6)]">
                      {t.spacesHint}
                    </p>
                    {spaces.length === 0 ? (
                      <p className="text-sm text-[var(--t3,#a39ba6)]">
                        {t.spacesEmpty}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {spaces.map((space) => (
                          <li
                            key={space.tenantId}
                            data-testid="staff-view-space"
                            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/tenants/${space.tenantId}`}
                                className="font-medium text-[var(--t1,#f4edf7)] hover:text-[var(--or-200,#eec4ff)]"
                              >
                                {space.name ?? space.tenantId}
                              </Link>
                              {space.slug && (
                                <code className="rounded-[3px] bg-[var(--s1,#100812)] px-1.5 py-0.5 text-xs text-[var(--t3,#a39ba6)]">
                                  {space.slug}
                                </code>
                              )}
                              {space.isActive === false && (
                                <Chip>{t.spaceInactive}</Chip>
                              )}
                            </div>
                            <span
                              className={`inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11px] font-bold uppercase tracking-[0.12em] ${roleColor(space.role ?? '')}`}
                            >
                              {roleLabel(tRoles, space.role ?? '')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </FicheSection>

                  <FicheSection
                    title={t.permissionsHeading}
                    aside={
                      perms ? (
                        <span className="text-xs text-[var(--t3,#a39ba6)]">
                          {format(t.permissionsCount, {
                            count: perms.effective.length,
                          })}
                        </span>
                      ) : undefined
                    }
                  >
                    {!perms ? (
                      <p className="text-sm text-[var(--t3,#a39ba6)]">
                        {t.permissionsUnavailable}
                      </p>
                    ) : (
                      <>
                        <ul className="flex flex-wrap gap-1.5">
                          {perms.effective.map((perm) => {
                            const extra = perms.extraPermissions.includes(perm);
                            return (
                              <li
                                key={perm}
                                title={
                                  extra ? t.permissionExtra : t.permissionRole
                                }
                                className={`rounded-[3px] border px-2 py-0.5 font-mono text-[11.5px] ${
                                  extra
                                    ? 'border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] text-[#ffd9a3]'
                                    : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)]'
                                }`}
                              >
                                {perm}
                              </li>
                            );
                          })}
                        </ul>
                        <p className="mt-3 text-xs text-[var(--t4,#807984)]">
                          {t.permissionsLegend}
                        </p>
                      </>
                    )}
                  </FicheSection>
                </>
              }
              aside={
                <>
                  <FicheSection eyebrow title={t.logsHeading}>
                    {logs.length === 0 ? (
                      <p className="text-sm text-[var(--t3,#a39ba6)]">
                        {t.logsEmpty}
                      </p>
                    ) : (
                      <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                        {logs.map((log) => (
                          <li
                            key={log.id}
                            className="flex flex-wrap items-baseline justify-between gap-3 py-2"
                          >
                            <span className="text-[13px] text-[var(--t1,#f4edf7)]">
                              {log.action}
                              {log.entity_type ? (
                                <span className="text-[var(--t4,#807984)]">
                                  {' '}
                                  · {log.entity_type}
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono text-[11.5px] text-[var(--t3,#a39ba6)]">
                              {formatDate(log.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link
                      href={`/admin/logs?staffId=${encodeURIComponent(record.id)}`}
                      className="mt-4 inline-block text-xs text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]"
                    >
                      {t.logsAll}
                    </Link>
                  </FicheSection>
                  <FicheSection eyebrow title={tf.metaTitle}>
                    <MetaList
                      items={[
                        {
                          label: tf.metaId,
                          value: `${record.id.slice(0, 8)}…`,
                        },
                        {
                          label: tf.metaCreated,
                          value: formatDate(record.createdAt),
                        },
                      ]}
                    />
                  </FicheSection>
                </>
              }
            />
          </>
        )}
      </div>
    </>
  );
}

// `manage_staff` : cette fiche dit qui détient quel pouvoir, et c'est le droit
// qui redistribue ce pouvoir. Le serveur revérifie.
export const getServerSideProps = withStaffPage({
  permission: 'manage_staff',
  scope: 'platform',
});
