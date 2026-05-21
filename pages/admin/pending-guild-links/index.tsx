import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import {
  useAccessibleTenants,
  type AccessibleTenant,
} from '@/hooks/useAccessibleTenants';

import { logger } from '../../../utils/logger';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PendingLink = {
  guild_id: string;
  guild_name: string | null;
  owner_discord_id: string | null;
  requested_at: string | null;
};

type PendingLinksResponse = {
  links: PendingLink[];
};

type Props = {
  staff: { id: string; role: string; display_name: string };
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

type ClaimMode = 'existing' | 'new';

type ClaimModalState = {
  guild: PendingLink;
  mode: ClaimMode;
  selectedTenantId: string;
  newSlug: string;
  newName: string;
  saving: boolean;
  error: string | null;
};

function AdminPendingGuildLinksPage(_props: Props) {
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { tenants } = useAccessibleTenants();

  const [links, setLinks] = useState<PendingLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ClaimModalState | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const json = await adminFetchJson<PendingLinksResponse>(
        '/api/admin/pending-guild-links'
      );
      setLinks(json.links || []);
    } catch (err) {
      logger.error('AdminPendingGuildLinksPage: fetch error', err);
      setError((err as Error)?.message || 'Erreur de chargement');
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openClaim = (guild: PendingLink) => {
    setModal({
      guild,
      mode: 'existing',
      selectedTenantId: tenants.find((t: AccessibleTenant) => t.is_active)?.id ?? '',
      newSlug: '',
      newName: '',
      saving: false,
      error: null,
    });
  };

  const closeModal = () => setModal(null);

  const submitClaim = async () => {
    if (!modal) return;
    setModal({ ...modal, saving: true, error: null });
    try {
      let body: unknown;
      if (modal.mode === 'existing') {
        if (!modal.selectedTenantId) {
          setModal({
            ...modal,
            saving: false,
            error: 'Sélectionne un tenant.',
          });
          return;
        }
        body = { tenant_id: modal.selectedTenantId };
      } else {
        const slug = modal.newSlug.trim().toLowerCase();
        const name = modal.newName.trim();
        if (!slug || !name) {
          setModal({
            ...modal,
            saving: false,
            error: 'Slug et nom requis.',
          });
          return;
        }
        if (!SLUG_RE.test(slug)) {
          setModal({
            ...modal,
            saving: false,
            error: 'Slug invalide (kebab-case).',
          });
          return;
        }
        body = { new_tenant: { slug, name } };
      }
      await mutateJson(
        `/api/admin/pending-guild-links/${modal.guild.guild_id}/claim`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      addToast('Serveur attribué.', 'success');
      closeModal();
      await fetchData();
    } catch (err) {
      setModal((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error: (err as Error)?.message ?? 'Échec de l\'attribution.',
            }
          : null
      );
    }
  };

  const handleReject = async (guild: PendingLink) => {
    const ok = await confirm({
      title: `Rejeter ${guild.guild_name ?? guild.guild_id} ?`,
      subtitle:
        'La demande sera supprimée de la file. Le bot sera ignoré tant qu\'il n\'aura pas re-demandé.',
      variant: 'danger',
      confirmLabel: 'Rejeter',
    });
    if (!ok) return;
    try {
      await mutateJson(
        `/api/admin/pending-guild-links/${guild.guild_id}`,
        { method: 'DELETE' }
      );
      addToast('Demande rejetée.', 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error)?.message || 'Rejet impossible.', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Serveurs Discord en attente</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Tenants', href: '/admin/tenants' },
              { label: 'File serveurs Discord' },
            ]}
          />

          <div className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Serveurs Discord en attente
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Quand le bot rejoint un serveur sans tenant assigné, le serveur
              attend ici qu&apos;un staff l&apos;attribue à un tenant
              existant ou crée un nouveau tenant.
            </p>
          </div>

          <AlertBanner message={error} className="mb-4" />

          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {links === null ? (
              <div className="py-16">
                <LoadingSpinner label="Chargement de la file…" />
              </div>
            ) : links.length === 0 ? (
              <EmptyState
                title="Aucun serveur en attente."
                description="Tu seras notifié·e ici dès qu'un serveur Discord aura besoin d'être attribué."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Guild</th>
                      <th className="px-4 py-3 text-left">Owner Discord ID</th>
                      <th className="px-4 py-3 text-left">Demandé le</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {links.map((g) => (
                      <tr
                        key={g.guild_id}
                        className="hover:bg-neutral-700/30 transition-colors"
                        data-testid={`pending-link-row-${g.guild_id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">
                            {g.guild_name ?? '— sans nom —'}
                          </div>
                          <div className="text-xs font-mono text-purple-300">
                            {g.guild_id}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                          {g.owner_discord_id ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-neutral-400 text-xs">
                          {formatDate(g.requested_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openClaim(g)}
                              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm transition-colors"
                              data-testid={`claim-${g.guild_id}`}
                            >
                              Attribuer…
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(g)}
                              className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                            >
                              Rejeter
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {modal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl">
              <div className="px-6 py-4 border-b border-neutral-800">
                <h2 className="text-lg font-semibold text-white">
                  Attribuer {modal.guild.guild_name ?? modal.guild.guild_id}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Choisis un tenant existant ou crée-en un nouveau.
                </p>
              </div>

              <div className="px-6 py-4 space-y-4">
                <AlertBanner message={modal.error} />

                <div className="flex gap-2">
                  {(['existing', 'new'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModal({ ...modal, mode: m })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                        modal.mode === m
                          ? 'bg-purple-600 text-white'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      {m === 'existing'
                        ? 'Tenant existant'
                        : 'Nouveau tenant'}
                    </button>
                  ))}
                </div>

                {modal.mode === 'existing' ? (
                  <div>
                    <label
                      htmlFor="claim-tenant-select"
                      className="block text-xs font-medium text-neutral-400 mb-1"
                    >
                      Tenant
                    </label>
                    <select
                      id="claim-tenant-select"
                      value={modal.selectedTenantId}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          selectedTenantId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">— sélectionner —</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.slug} — {t.name}
                          {!t.is_active ? ' (archivé)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="claim-new-slug"
                        className="block text-xs font-medium text-neutral-400 mb-1"
                      >
                        Slug (kebab-case)
                      </label>
                      <input
                        id="claim-new-slug"
                        type="text"
                        value={modal.newSlug}
                        onChange={(e) =>
                          setModal({
                            ...modal,
                            newSlug: e.target.value.toLowerCase(),
                          })
                        }
                        placeholder="mon-evenement"
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="claim-new-name"
                        className="block text-xs font-medium text-neutral-400 mb-1"
                      >
                        Nom
                      </label>
                      <input
                        id="claim-new-name"
                        type="text"
                        value={modal.newName}
                        onChange={(e) =>
                          setModal({ ...modal, newName: e.target.value })
                        }
                        placeholder="Mon événement"
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-neutral-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-neutral-600 text-sm hover:bg-neutral-800 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submitClaim}
                  disabled={modal.saving}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {modal.saving ? 'Attribution…' : 'Attribuer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {dialog}
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('manager');

export default AdminPendingGuildLinksPage;
