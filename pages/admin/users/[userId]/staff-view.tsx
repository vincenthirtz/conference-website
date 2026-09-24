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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-header pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbUsers, href: '/admin/users/manage' },
              { label: t.breadcrumbCurrent },
            ]}
          />

          <AlertBanner message={error} variant="error" className="mb-4" />

          {loading ? (
            <p className="text-sm text-neutral-400">{t.loading}</p>
          ) : !record ? (
            <p className="py-10 text-center text-sm text-neutral-400">
              {t.notStaff}
            </p>
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-neutral-400">{t.subtitle}</p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
                    {name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs ${roleColor(record.role ?? '')}`}
                    >
                      {roleLabel(tRoles, record.role ?? '')}
                    </span>
                    {record.isActive === false && (
                      <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs text-red-200">
                        {t.suspended}
                      </span>
                    )}
                    {record.isPoleAdmin && (
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs text-sky-200">
                        {t.poleAdmin}
                      </span>
                    )}
                    <span className="text-xs text-neutral-500">
                      {format(t.since, { date: formatDate(record.createdAt) })}
                    </span>
                  </div>
                </div>

                {/* Les gestes vivent là où ils sont déjà gardés et audités. */}
                <Link
                  href="/admin/users/manage"
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  {t.manageCta}
                </Link>
              </div>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold">
                  {t.spacesHeading}
                </h2>
                <p className="mb-3 max-w-2xl text-sm text-neutral-400">
                  {t.spacesHint}
                </p>
                {spaces.length === 0 ? (
                  <p className="text-sm text-neutral-400">{t.spacesEmpty}</p>
                ) : (
                  <ul className="space-y-2">
                    {spaces.map((space) => (
                      <li
                        key={space.tenantId}
                        data-testid="staff-view-space"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700/50 bg-neutral-800/40 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/tenants/${space.tenantId}`}
                            className="font-medium text-white hover:text-violet-300"
                          >
                            {space.name ?? space.tenantId}
                          </Link>
                          {space.slug && (
                            <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-400">
                              {space.slug}
                            </code>
                          )}
                          {space.isActive === false && (
                            <span className="rounded-full bg-neutral-700/40 px-2 py-0.5 text-[11px] text-neutral-300">
                              {t.spaceInactive}
                            </span>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs ${roleColor(space.role ?? '')}`}
                        >
                          {roleLabel(tRoles, space.role ?? '')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold">
                  {t.permissionsHeading}
                </h2>
                {!perms ? (
                  <p className="text-sm text-neutral-400">
                    {t.permissionsUnavailable}
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-neutral-400">
                      {format(t.permissionsCount, {
                        count: perms.effective.length,
                      })}
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {perms.effective.map((perm) => {
                        const extra = perms.extraPermissions.includes(perm);
                        return (
                          <li
                            key={perm}
                            title={extra ? t.permissionExtra : t.permissionRole}
                            className={`rounded-full border px-2.5 py-0.5 text-xs ${
                              extra
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                                : 'border-neutral-600/50 bg-neutral-700/20 text-neutral-300'
                            }`}
                          >
                            {perm}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-xs text-neutral-500">
                      {t.permissionsLegend}
                    </p>
                  </>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold">{t.logsHeading}</h2>
                {logs.length === 0 ? (
                  <p className="text-sm text-neutral-400">{t.logsEmpty}</p>
                ) : (
                  <ul className="divide-y divide-neutral-700/40">
                    {logs.map((log) => (
                      <li
                        key={log.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2"
                      >
                        <span className="text-sm text-neutral-200">
                          {log.action}
                          {log.entity_type ? (
                            <span className="text-neutral-500">
                              {' '}
                              · {log.entity_type}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {formatDate(log.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={`/admin/logs?staffId=${encodeURIComponent(record.id)}`}
                  className="mt-3 inline-block text-xs text-violet-300 underline hover:text-violet-200"
                >
                  {t.logsAll}
                </Link>
              </section>
            </>
          )}
        </div>
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
