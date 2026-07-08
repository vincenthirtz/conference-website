// components/admin/onboarding/GuildLinksPanel.tsx
//
// "Liens Discord" tab of the merged /admin/onboarding hub (manager+).
// Extracted from the former /admin/pending-guild-links page: staff claim a
// Discord guild that invited the bot but isn't linked to a tenant yet.

import { useState } from 'react';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import AlertBanner from '@/components/admin/AlertBanner';
import Modal from '@/components/admin/Modal';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import {
  useAccessibleTenants,
  type AccessibleTenant,
} from '@/hooks/useAccessibleTenants';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

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

export default function GuildLinksPanel() {
  const t = useAdminT('adminPendingGuildLinks');
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { tenants } = useAccessibleTenants();

  const [modal, setModal] = useState<ClaimModalState | null>(null);

  // Liste non paginée (endpoint owner-only) → `includeTotal: false`.
  const {
    data: links,
    loading,
    error,
    refresh: fetchData,
  } = useAdminResource<PendingLink, PendingLinksResponse>(
    '/api/admin/pending-guild-links',
    {
      includeTotal: false,
      select: (res) => res.links || [],
    }
  );

  const openClaim = (guild: PendingLink) => {
    setModal({
      guild,
      mode: 'existing',
      selectedTenantId:
        tenants.find((t: AccessibleTenant) => t.is_active)?.id ?? '',
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
            error: t.errorSelectTenant,
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
            error: t.errorSlugNameRequired,
          });
          return;
        }
        if (!SLUG_RE.test(slug)) {
          setModal({
            ...modal,
            saving: false,
            error: t.errorSlugInvalid,
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
      addToast(t.toastAssigned, 'success');
      closeModal();
      fetchData();
    } catch (err) {
      setModal((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error: (err as Error)?.message ?? t.errorAssign,
            }
          : null
      );
    }
  };

  const handleReject = async (guild: PendingLink) => {
    const ok = await confirm({
      title: format(t.confirmRejectTitle, {
        name: guild.guild_name ?? guild.guild_id,
      }),
      subtitle: t.confirmRejectSubtitle,
      variant: 'danger',
      confirmLabel: t.reject,
    });
    if (!ok) return;
    try {
      await mutateJson(`/api/admin/pending-guild-links/${guild.guild_id}`, {
        method: 'DELETE',
      });
      addToast(t.toastRejected, 'success');
      fetchData();
    } catch (err) {
      addToast((err as Error)?.message || t.errorReject, 'error');
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          {t.heading}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">{t.subtitle}</p>
      </div>

      <AlertBanner message={error} className="mb-4" />

      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        {loading && links.length === 0 ? (
          <div className="py-16">
            <LoadingSpinner label={t.loading} />
          </div>
        ) : links.length === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">{t.colGuild}</th>
                  <th className="px-4 py-3 text-left">{t.colOwner}</th>
                  <th className="px-4 py-3 text-left">{t.colRequested}</th>
                  <th className="px-4 py-3 text-right">{t.colActions}</th>
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
                        {g.guild_name ?? t.noName}
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
                          {t.assign}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(g)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                        >
                          {t.reject}
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

      <Modal
        open={Boolean(modal)}
        onClose={closeModal}
        zIndexClassName="z-[200]"
        backdropClassName="bg-black/70"
        panelChromeClassName="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl"
        size="lg"
        title={
          <h2 className="text-lg font-semibold text-white">
            {format(t.modalTitle, {
              name: modal?.guild.guild_name ?? modal?.guild.guild_id ?? '',
            })}
          </h2>
        }
        subtitle={t.modalSubtitle}
        footer={
          <>
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 rounded-lg border border-neutral-600 text-sm hover:bg-neutral-800 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={submitClaim}
              disabled={modal?.saving}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {modal?.saving ? t.assigning : t.assignBtn}
            </button>
          </>
        }
      >
        {modal && (
          <div className="space-y-4">
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
                  {m === 'existing' ? t.modeExisting : t.modeNew}
                </button>
              ))}
            </div>

            {modal.mode === 'existing' ? (
              <div>
                <label
                  htmlFor="claim-tenant-select"
                  className="block text-xs font-medium text-neutral-400 mb-1"
                >
                  {t.tenantLabel}
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
                  <option value="">{t.selectPlaceholder}</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.slug} — {tenant.name}
                      {!tenant.is_active ? t.archivedSuffix : ''}
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
                    {t.slugLabel}
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
                    placeholder={t.slugPlaceholder}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="claim-new-name"
                    className="block text-xs font-medium text-neutral-400 mb-1"
                  >
                    {t.nameLabel}
                  </label>
                  <input
                    id="claim-new-name"
                    type="text"
                    value={modal.newName}
                    onChange={(e) =>
                      setModal({ ...modal, newName: e.target.value })
                    }
                    placeholder={t.namePlaceholder}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {dialog}
    </>
  );
}
