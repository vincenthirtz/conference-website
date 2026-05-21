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

import { logger } from '../../../utils/logger';

type Tenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string | null;
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

const CONFERENCE_SLUG = 'conference';

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

  // Add staff form
  const [staffIdToAdd, setStaffIdToAdd] = useState('');
  const [staffRoleToAdd, setStaffRoleToAdd] = useState('caster');
  const [addingStaff, setAddingStaff] = useState(false);

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
    } catch (err) {
      logger.error('AdminTenantDetailPage: fetch error', err);
      setError((err as Error)?.message || 'Erreur de chargement');
    }
  }, [adminFetchJson, tenantId]);

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
        }),
      });
      addToast('Tenant mis à jour.', 'success');
      await fetchData();
    } catch (err) {
      setError((err as Error)?.message || 'Mise à jour impossible.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!data) return;
    if (data.tenant.slug === CONFERENCE_SLUG) {
      addToast('Le tenant « conference » ne peut pas être archivé.', 'error');
      return;
    }
    const ok = await confirm({
      title: `Archiver le tenant « ${data.tenant.slug} » ?`,
      subtitle:
        'Le tenant sera marqué is_active=false. Les staff perdront l\'accès tant qu\'il reste archivé.',
      variant: 'danger',
      confirmLabel: 'Archiver',
    });
    if (!ok) return;
    setArchiving(true);
    try {
      await mutateJson(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });
      addToast('Tenant archivé.', 'success');
      router.push('/admin/tenants');
    } catch (err) {
      addToast((err as Error)?.message || 'Archivage impossible.', 'error');
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
      addToast('Staff ajouté au tenant.', 'success');
      setStaffIdToAdd('');
      await fetchData();
    } catch (err) {
      addToast((err as Error)?.message || 'Ajout impossible.', 'error');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleRemoveStaff = async (row: StaffRow) => {
    const ok = await confirm({
      title: `Retirer ${row.display_name ?? row.email ?? row.staff_id} du tenant ?`,
      subtitle: 'Le staff perdra l\'accès à ce tenant.',
      variant: 'danger',
      confirmLabel: 'Retirer',
    });
    if (!ok) return;
    try {
      await mutateJson(
        `/api/admin/tenants/${tenantId}/staff/${row.staff_id}`,
        { method: 'DELETE' }
      );
      addToast('Staff retiré.', 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error)?.message || 'Retrait impossible.', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Tenant {data?.tenant.slug ?? ''}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Tenants', href: '/admin/tenants' },
              { label: data?.tenant.slug ?? '…' },
            ]}
          />

          {data === null && error === null && (
            <div className="py-16">
              <LoadingSpinner label="Chargement du tenant…" />
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
                      {data.tenant.is_active ? 'Actif' : 'Archivé'}
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
                    disabled={
                      archiving || data.tenant.slug === CONFERENCE_SLUG
                    }
                    className="px-4 py-2.5 rounded-xl border border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      data.tenant.slug === CONFERENCE_SLUG
                        ? 'Le tenant conference ne peut pas être archivé.'
                        : undefined
                    }
                    data-testid="tenant-archive-btn"
                  >
                    {archiving ? 'Archivage…' : 'Archiver'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-6 border-b border-neutral-700/50 flex gap-1">
                {(
                  [
                    ['general', 'Général'],
                    ['discord', 'Discord'],
                    ['staff', 'Staff'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      tab === key
                        ? 'border-purple-500 text-white'
                        : 'border-transparent text-neutral-400 hover:text-white'
                    }`}
                    data-testid={`tenant-tab-${key}`}
                  >
                    {label}
                    {key === 'discord' && data.guilds.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-neutral-700 text-neutral-300">
                        {data.guilds.length}
                      </span>
                    )}
                    {key === 'staff' && data.staff.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-neutral-700 text-neutral-300">
                        {data.staff.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {tab === 'general' && (
                <form
                  onSubmit={handleSaveGeneral}
                  className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8 space-y-6"
                >
                  <div>
                    <label
                      htmlFor="g-name"
                      className="block text-sm font-medium text-neutral-300 mb-2"
                    >
                      Nom
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
                      Locale par défaut
                    </label>
                    <select
                      id="g-locale"
                      value={editLocale}
                      onChange={(e) => setEditLocale(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                    >
                      <option value="fr">Français (fr)</option>
                      <option value="en">English (en)</option>
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
                      Tenant actif
                    </span>
                  </label>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      {saving ? 'Sauvegarde…' : 'Enregistrer'}
                    </button>
                  </div>
                </form>
              )}

              {tab === 'discord' && (
                <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
                  {data.guilds.length === 0 ? (
                    <EmptyState
                      title="Aucun serveur Discord lié"
                      description="Quand le bot est ajouté à un serveur, celui-ci apparaît ici (ou dans la file pending-guild-links si non assigné)."
                      action={
                        <Link
                          href="/admin/pending-guild-links"
                          className="px-4 py-2 rounded-lg border border-neutral-600 text-sm hover:border-neutral-500 transition-colors"
                        >
                          Voir la file d&apos;attente
                        </Link>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3 text-left">Guild ID</th>
                            <th className="px-4 py-3 text-left">Nom</th>
                            <th className="px-4 py-3 text-left">Rejoint le</th>
                            <th className="px-4 py-3 text-right">Actions</th>
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
                                  Configurer
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
                <div className="space-y-4">
                  <form
                    onSubmit={handleAddStaff}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 flex flex-wrap gap-3 items-end"
                  >
                    <div className="flex-1 min-w-[220px]">
                      <label
                        htmlFor="add-staff-id"
                        className="block text-xs font-medium text-neutral-400 mb-1"
                      >
                        ID du staff
                      </label>
                      <input
                        id="add-staff-id"
                        type="text"
                        value={staffIdToAdd}
                        onChange={(e) => setStaffIdToAdd(e.target.value)}
                        placeholder="UUID du staff existant"
                        className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="add-staff-role"
                        className="block text-xs font-medium text-neutral-400 mb-1"
                      >
                        Rôle
                      </label>
                      <select
                        id="add-staff-role"
                        value={staffRoleToAdd}
                        onChange={(e) => setStaffRoleToAdd(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      >
                        <option value="caster">caster</option>
                        <option value="manager">manager</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={addingStaff || !staffIdToAdd.trim()}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingStaff ? 'Ajout…' : 'Ajouter'}
                    </button>
                  </form>

                  <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
                    {data.staff.length === 0 ? (
                      <EmptyState
                        title="Aucun staff sur ce tenant"
                        description="Ajoute un membre via le formulaire ci-dessus."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3 text-left">Nom</th>
                              <th className="px-4 py-3 text-left">Email</th>
                              <th className="px-4 py-3 text-left">Rôle</th>
                              <th className="px-4 py-3 text-left">Ajouté le</th>
                              <th className="px-4 py-3 text-right">Actions</th>
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
                                    Retirer
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
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage<{ tenantId: string }>(
  'manager',
  async (ctx: GetServerSidePropsContext) => {
    const id = ctx.params?.id;
    if (typeof id !== 'string') {
      return { tenantId: '' };
    }
    return { tenantId: id };
  }
);

export default AdminTenantDetailPage;
